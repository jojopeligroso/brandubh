import { describe, expect, it } from "vitest";
import { completionNote, dominantTerm, type CompletionNote } from "./completionNote";
import type { Puzzle, PuzzleGoal } from "./puzzleBank";
import { parseRows } from "./tutorials";
import type { GameState, Side } from "./types";

/** A board written the way `tutorials.ts` writes them: rows[0] is rank 7. */
const state = (rows: string[], turn: Side = "attackers"): GameState => ({
  board: parseRows(rows),
  turn,
  status: "playing",
  moveCount: 0,
  history: [],
  captured: { attackers: 0, defenders: 0 },
});

/** Only the two fields the note reads. Nothing here decodes a puzzle. */
const puz = (goal: PuzzleGoal, motif: string | null = null): Puzzle =>
  ({ goal, motif }) as unknown as Puzzle;

// ── Positions, each differing from OPEN in exactly one term ──────────────────
//
// The king sits on d4 (the throne) in every one of them, so the corner-distance
// term is pinned unless a position deliberately moves him. Every board is
// legal-looking rather than legal: the note reads a position, it never plays.

const OPEN = [
  ".......",
  "..a....",
  ".......",
  "...k...",
  ".......",
  "....a..",
  ".......",
];

/** A raider fewer: the material term alone moves, toward the king's side. */
const ONE_RAIDER_DOWN = [
  ".......",
  "..a....",
  ".......",
  "...k...",
  ".......",
  ".......",
  ".......",
];

/** Two defenders added: material moves the other way, hard, toward the king. */
const TWO_GUARDS_UP = [
  ".......",
  "..a....",
  "...d...",
  "...k...",
  "...d...",
  "....a..",
  ".......",
];

/** The king on g4: two clear straight lanes to corners open at once. */
const TWO_LANES = [
  ".......",
  "..a....",
  ".......",
  "......k",
  ".......",
  "....a..",
  ".......",
];

/** The same two raiders, now pressed against the king on d4. Nothing is added,
 *  so material is pinned and the hug term moves alone. */
const HUGGED = [
  ".......",
  ".......",
  "...a...",
  "...k...",
  "...a...",
  ".......",
  ".......",
];

/** The king walked one square off the throne — nothing else changes, and the
 *  corner term moves by less than a soldier is worth. */
const NUDGED = [
  ".......",
  "..a....",
  ".......",
  "..k....",
  ".......",
  "....a..",
  ".......",
];

describe("the layers, in order of specificity", () => {
  it("names the motif when one is known, whatever the board did", () => {
    // The most useful thing anyone can be told, and the only line a learner can
    // carry to another board. It outranks every measurement.
    const note = completionNote(puz("crushing", "guillotine"), state(OPEN), state(TWO_LANES), "defenders");
    expect(note).toEqual<CompletionNote>({ layer: "motif", key: "guillotine" });
  });

  it("falls to the dominant term when no motif was recognised", () => {
    const note = completionNote(puz("crushing"), state(OPEN), state(ONE_RAIDER_DOWN), "defenders");
    expect(note).toEqual<CompletionNote>({ layer: "term", key: "material:defenders" });
  });

  it("falls to the plain banded line when nothing moved far enough to name", () => {
    // The king takes a step and the position is otherwise identical: something
    // changed, nothing happened. Saying "the king closed on a corner" over a
    // sub-soldier shift would be naming noise.
    const note = completionNote(puz("advantage"), state(OPEN), state(NUDGED), "defenders");
    expect(note).toEqual<CompletionNote>({ layer: "goal", key: "advantage:defenders" });
  });

  it("falls to the plain banded line when the position did not move at all", () => {
    const note = completionNote(puz("crushing"), state(OPEN), state(OPEN), "attackers");
    expect(note).toEqual<CompletionNote>({ layer: "goal", key: "crushing:attackers" });
  });
});

describe("which term is called dominant", () => {
  it("is the one that moved furthest in the solver's favour", () => {
    // Two guards appear *and* the raider count is untouched: material moves by
    // 80 while every other term stands still.
    expect(dominantTerm(state(OPEN), state(TWO_GUARDS_UP), "defenders")).toBe("material");
  });

  it("prefers a lane over a soldier when the lane is worth more", () => {
    // Two open lanes is 4 × 120 = 480 against a corner-distance move worth 25.
    expect(dominantTerm(state(OPEN), state(TWO_LANES), "defenders")).toBe("escapeLane");
  });

  it("names the raiders' grip closing, on the raiders' own account", () => {
    expect(dominantTerm(state(OPEN), state(HUGGED), "attackers")).toBe("hug");
  });

  it("reads the same movement in the other direction for the other side", () => {
    // Three raiders let go of the king: the same term, now the king's gain.
    expect(dominantTerm(state(HUGGED), state(OPEN), "defenders")).toBe("hug");
  });

  it("names nothing when the term moved against the solver", () => {
    // A raider is gone; that is not something to congratulate the raiders on.
    expect(dominantTerm(state(OPEN), state(ONE_RAIDER_DOWN), "attackers")).toBeNull();
  });

  it("names nothing when there is no king to measure against", () => {
    const kingless = [".......", "..a....", ".......", ".......", ".......", "....a..", "......."];
    expect(dominantTerm(state(OPEN), state(kingless), "attackers")).toBeNull();
    expect(dominantTerm(state(kingless), state(OPEN), "attackers")).toBeNull();
  });
});

describe("what a proof goal is told, and why the board is not consulted", () => {
  // ADR-0002: a Truncated line must read *exactly* like a short decisive one.
  // The board terms are precisely what would differ between a line that ran to
  // the capture and one that stopped three moves short, so for `regicide` and
  // `escape` the note is the proven outcome and layer 2 is skipped entirely.

  it("gives a regicide the same note however far the line ran", () => {
    const ranToTheEnd = completionNote(puz("regicide"), state(OPEN), state(HUGGED), "attackers");
    const stoppedEarly = completionNote(puz("regicide"), state(OPEN), state(OPEN), "attackers");
    expect(ranToTheEnd).toEqual(stoppedEarly);
    expect(ranToTheEnd).toEqual<CompletionNote>({ layer: "goal", key: "regicide" });
  });

  it("gives an escape the same note however far the line ran", () => {
    const ranToTheEnd = completionNote(puz("escape"), state(OPEN), state(TWO_LANES), "defenders");
    const stoppedEarly = completionNote(puz("escape"), state(OPEN), state(OPEN), "defenders");
    expect(ranToTheEnd).toEqual(stoppedEarly);
    expect(ranToTheEnd).toEqual<CompletionNote>({ layer: "goal", key: "escape" });
  });

  it("keys a proof goal without a side, because the goal already fixes one", () => {
    // `regicide` is always the attackers' and `escape` always the defenders'.
    expect(completionNote(puz("regicide"), state(OPEN), state(OPEN), "attackers").key).toBe(
      "regicide",
    );
    expect(completionNote(puz("escape"), state(OPEN), state(OPEN), "defenders").key).toBe("escape");
  });

  it("still lets a motif speak over a proof goal", () => {
    // The motif layer is above the truncation concern rather than caught by it:
    // a **Guillotine** is an `escape` whose line *is* truncated, and naming it is
    // the one thing worth saying about such a puzzle.
    expect(completionNote(puz("escape", "guillotine"), state(OPEN), state(OPEN), "defenders")).toEqual<
      CompletionNote
    >({ layer: "motif", key: "guillotine" });
  });
});

describe("what no note may ever say", () => {
  it("never carries a ply count, because it never sees one", () => {
    // `dtm` is metadata for re-checking the truncation claim and is not an input
    // here: the note is a function of two positions, a goal and a side. This is
    // the structural version of "no dtm" — there is nothing to leak.
    const withDtm = { goal: "regicide", motif: null, dtm: 7 } as unknown as Puzzle;
    const withoutDtm = { goal: "regicide", motif: null, dtm: Infinity } as unknown as Puzzle;
    expect(completionNote(withDtm, state(OPEN), state(OPEN), "attackers")).toEqual(
      completionNote(withoutDtm, state(OPEN), state(OPEN), "attackers"),
    );
  });

  it("never varies with the truncation flag", () => {
    const cut = { goal: "escape", motif: null, truncated: true } as unknown as Puzzle;
    const whole = { goal: "escape", motif: null, truncated: false } as unknown as Puzzle;
    expect(completionNote(cut, state(OPEN), state(TWO_LANES), "defenders")).toEqual(
      completionNote(whole, state(OPEN), state(TWO_LANES), "defenders"),
    );
  });
});
