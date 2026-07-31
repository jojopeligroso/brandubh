import { describe, expect, it } from "vitest";
import {
  ANNOTATE_DIFFICULTY,
  THRESHOLDS,
  classify,
  terminalScore,
  lossFor,
  markGlyph,
  marksFromScores,
  tally,
  type Mark,
  worstMoves,
} from "./annotate";
import { DECISIVE as DECISIVE_SCORE } from "./ai";
import type { Side } from "./types";

// Scores are attacker-positive throughout: high is good for the raiders, low is
// good for the king's side. Every test below states which side moved, because
// that is the one thing this module exists to get right.

describe("the sign convention", () => {
  it("counts a falling score against the raiders", () => {
    expect(lossFor(100, 40, "attackers")).toBe(60);
    expect(lossFor(40, 100, "attackers")).toBe(-60); // they gained
  });

  it("counts a rising score against the king's side", () => {
    expect(lossFor(40, 100, "defenders")).toBe(60);
    expect(lossFor(100, 40, "defenders")).toBe(-60); // they gained
  });

  it("is exactly antisymmetric between the sides", () => {
    for (const [b, a] of [
      [0, 50],
      [-120, 30],
      [77, -14],
    ]) {
      expect(lossFor(b, a, "attackers")).toBe(-lossFor(b, a, "defenders"));
    }
  });
});

describe("classifying a move", () => {
  const move = (before: number, after: number, mover: Side, onlyMove = false) =>
    classify({ before, after, mover, onlyMove });

  it("says nothing about a move that held or improved the position", () => {
    expect(move(0, 0, "attackers")).toBeNull();
    expect(move(0, 200, "attackers")).toBeNull(); // raiders gained
    expect(move(0, -200, "defenders")).toBeNull(); // king's side gained
  });

  it("says nothing about a loss under the inaccuracy band", () => {
    expect(move(0, -(THRESHOLDS.inaccuracy - 1), "attackers")).toBeNull();
  });

  it("bands a loss by size", () => {
    expect(move(0, -THRESHOLDS.inaccuracy, "attackers")).toBe("inaccuracy");
    expect(move(0, -THRESHOLDS.mistake, "attackers")).toBe("mistake");
    expect(move(0, -THRESHOLDS.blunder, "attackers")).toBe("blunder");
    expect(move(0, -500, "attackers")).toBe("blunder");
  });

  it("bands the king's side identically, in the other direction", () => {
    // A classifier that forgot the sign would mark every good defender move as
    // a blunder and miss the real ones entirely.
    expect(move(0, THRESHOLDS.inaccuracy, "defenders")).toBe("inaccuracy");
    expect(move(0, THRESHOLDS.mistake, "defenders")).toBe("mistake");
    expect(move(0, THRESHOLDS.blunder, "defenders")).toBe("blunder");
  });

  it("is symmetric: mirroring the scores and the side gives the same verdict", () => {
    for (const loss of [10, 45, 90, 150, 400]) {
      expect(move(0, -loss, "attackers")).toBe(move(0, loss, "defenders"));
    }
  });

  it("never marks a forced move", () => {
    // With one legal reply there was no decision to get wrong; the damage was
    // done earlier, and marking it here blames the wrong move.
    expect(move(0, -500, "attackers", true)).toBeNull();
    expect(move(0, 500, "defenders", true)).toBeNull();
  });
});

describe("a decided game is not blundered", () => {
  it("says nothing once best play has already settled the result", () => {
    // Without this the tail of every finished game becomes a wall of ??, which
    // is exactly how an annotation feature stops being read.
    expect(classify({ before: DECISIVE_SCORE, after: DECISIVE_SCORE - 400, mover: "attackers" }))
      .toBeNull();
    expect(classify({ before: -DECISIVE_SCORE, after: -DECISIVE_SCORE + 400, mover: "defenders" }))
      .toBeNull();
  });

  it("says nothing about winning more slowly", () => {
    expect(classify({ before: DECISIVE_SCORE + 500, after: DECISIVE_SCORE, mover: "attackers" }))
      .toBeNull();
  });

  it("DOES mark the move that walked from a live position into a forced loss", () => {
    // That move is the one that threw it, whatever the arithmetic says.
    expect(classify({ before: 0, after: -DECISIVE_SCORE, mover: "attackers" })).toBe("blunder");
    expect(classify({ before: 0, after: DECISIVE_SCORE, mover: "defenders" })).toBe("blunder");
  });

  it("does not mark a move that walked into a forced WIN for the mover", () => {
    expect(classify({ before: 0, after: DECISIVE_SCORE, mover: "attackers" })).toBeNull();
    expect(classify({ before: 0, after: -DECISIVE_SCORE, mover: "defenders" })).toBeNull();
  });
});

describe("walking a whole game", () => {
  // Raiders move first in Brandubh, so the movers alternate from "attackers".
  const movers: Side[] = ["attackers", "defenders", "attackers", "defenders"];

  it("judges each move by the position before it against the one after", () => {
    // Ply 1: the raiders drop the score to −120, which is a blunder by them.
    // Ply 2: the king's side holds it there, which is not an error by anyone.
    // Ply 3: the raiders recover it to 0 — a gain for them, still unmarked.
    const scores = [0, -THRESHOLDS.blunder, -THRESHOLDS.blunder, 0, 0];
    const marks = marksFromScores(scores, movers);
    expect(marks).toHaveLength(4);
    expect(marks[0]).toBe("blunder");
    expect(marks[1]).toBeNull();
    expect(marks[2]).toBeNull();
  });

  it("marks the side that gave an advantage back", () => {
    // −120 is a won position for the king's side; letting it return to level is
    // their error, not the raiders'.
    const scores = [0, -THRESHOLDS.blunder, 0];
    const marks = marksFromScores(scores, movers);
    expect(marks[0]).toBe("blunder"); // raiders conceded it
    expect(marks[1]).toBe("blunder"); // king's side handed it straight back
  });

  it("produces one mark per move, never one per position", () => {
    const scores = [0, 0, 0, 0, 0];
    expect(marksFromScores(scores, movers)).toHaveLength(scores.length - 1);
  });

  it("returns nothing for a game with no moves", () => {
    expect(marksFromScores([0], [])).toEqual([]);
  });

  it("honours a forced move inside the walk", () => {
    const scores = [0, -500, 0, 0, 0];
    expect(marksFromScores(scores, movers, [true])[0]).toBeNull();
    expect(marksFromScores(scores, movers, [false])[0]).toBe("blunder");
  });
});

describe("the summary", () => {
  it("counts each side's marks separately", () => {
    const marks: (Mark | null)[] = ["blunder", "inaccuracy", null, "mistake"];
    const movers: Side[] = ["attackers", "defenders", "attackers", "defenders"];
    const t = tally(marks, movers);
    expect(t.attackers).toEqual({ inaccuracy: 0, mistake: 0, blunder: 1 });
    expect(t.defenders).toEqual({ inaccuracy: 1, mistake: 1, blunder: 0 });
  });

  it("counts nothing for a clean game", () => {
    const t = tally([null, null], ["attackers", "defenders"]);
    expect(t.attackers).toEqual({ inaccuracy: 0, mistake: 0, blunder: 0 });
    expect(t.defenders).toEqual({ inaccuracy: 0, mistake: 0, blunder: 0 });
  });
});

describe("a finished position is read from the result, not searched", () => {
  it("scores a decided game decisively", () => {
    // With no legal moves the search reports 0, which would read as "level" in
    // the very place the game was decided.
    expect(terminalScore("attackers_win_capture")).toBeGreaterThan(0);
    expect(terminalScore("defenders_win_escape")).toBeLessThan(0);
    expect(terminalScore("attackers_win_time")).toBeGreaterThan(0);
    expect(terminalScore("defenders_win_resign")).toBeLessThan(0);
  });

  it("scores a draw level, and still calls it over", () => {
    expect(terminalScore("draw_repetition")).toBe(0);
  });

  it("returns null while the game is still being played", () => {
    expect(terminalScore("playing")).toBeNull();
  });

  it("searches at the depth the bands were calibrated at", () => {
    // Scores from a different depth are not comparable to bands measured at
    // this one — see THRESHOLDS.
    expect(ANNOTATE_DIFFICULTY).toBe("medium");
  });
});

describe("glyphs", () => {
  it("uses the notation everyone already knows", () => {
    expect(markGlyph("inaccuracy")).toBe("?!");
    expect(markGlyph("mistake")).toBe("?");
    expect(markGlyph("blunder")).toBe("??");
  });

  it("orders the bands from least to most severe", () => {
    expect(THRESHOLDS.inaccuracy).toBeLessThan(THRESHOLDS.mistake);
    expect(THRESHOLDS.mistake).toBeLessThan(THRESHOLDS.blunder);
  });
});

describe("worstMoves — the 'where did I go wrong' ranking", () => {
  // A five-move game (attackers move first, so movers alternate a, d, a, d, a).
  // Scores are attacker-positive; a drop is a loss for the defenders, a rise a
  // loss for the attackers.
  const movers: Side[] = ["attackers", "defenders", "attackers", "defenders", "attackers"];
  //             ply:  0    1     2     3     4     5
  const scores = [0, -200, 100, 90, -60, -70];
  const marks = marksFromScores(scores, movers);

  it("ranks a blunder above a mistake even when the mistake lost more raw points", () => {
    // Bands first, magnitude second: a blunder is a different kind of statement
    // about a move than a mistake, and sorting purely by loss would let a big
    // mistake bury a smaller blunder.
    const ranked = worstMoves(scores, movers, marks);
    const bands = ranked.map((w) => w.mark);
    const firstMistake = bands.indexOf("mistake");
    const lastBlunder = bands.lastIndexOf("blunder");
    if (firstMistake !== -1 && lastBlunder !== -1) expect(lastBlunder).toBeLessThan(firstMistake);
  });

  it("orders by how much was given up inside a band", () => {
    const ranked = worstMoves(scores, movers, marks);
    for (let i = 1; i < ranked.length; i++) {
      if (ranked[i].mark === ranked[i - 1].mark) {
        expect(ranked[i - 1].loss).toBeGreaterThanOrEqual(ranked[i].loss);
      }
    }
  });

  it("reports a ply that jumps to the position the move produced", () => {
    for (const w of worstMoves(scores, movers, marks)) {
      expect(w.ply).toBe(w.index + 1);
      expect(w.ply).toBeGreaterThan(0);
      expect(w.ply).toBeLessThan(scores.length);
      expect(w.mover).toBe(movers[w.index]);
    }
  });

  it("reports a positive loss — the amount the mover actually gave up", () => {
    for (const w of worstMoves(scores, movers, marks)) expect(w.loss).toBeGreaterThan(0);
  });

  it("can be narrowed to one player's own moves", () => {
    const mine = worstMoves(scores, movers, marks, { side: "defenders" });
    expect(mine.length).toBeGreaterThan(0);
    for (const w of mine) expect(w.mover).toBe("defenders");
  });

  it("returns nothing for a clean game rather than inventing a worst move", () => {
    // Every move perfect: no marks, so no ranking. A learner shown "your worst
    // move" for a flawless game learns something false.
    const flat = [0, 0, 0, 0];
    const cleanMovers: Side[] = ["attackers", "defenders", "attackers"];
    expect(worstMoves(flat, cleanMovers, marksFromScores(flat, cleanMovers))).toEqual([]);
  });

  it("honours a limit, keeping the worst", () => {
    const all = worstMoves(scores, movers, marks);
    const top = worstMoves(scores, movers, marks, { limit: 2 });
    expect(top).toEqual(all.slice(0, 2));
  });
});
