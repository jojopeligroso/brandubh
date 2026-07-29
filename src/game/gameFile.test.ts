import { describe, expect, it } from "vitest";
import { allMoves, applyMove, initialState, isGameOver, moveName } from "./engine";
import {
  customRuleSet,
  exportFileName,
  exportGame,
  parseGame,
  resultToken,
  type ParseResult,
} from "./gameFile";
import { replayPlies } from "./replay";
import type { GameState } from "./types";
import { CUSTOM_RULE_DEFAULTS, VARIANTS, type RuleSet } from "./variants";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deterministic LCG — random games have to be reproducible or a failure here
 *  is a bug report nobody can act on. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Play a random legal game and return the full state timeline. */
function randomTimeline(seed: number, rules: RuleSet, maxPlies = 80): GameState[] {
  const rand = rng(seed);
  const states: GameState[] = [initialState()];
  while (states.length - 1 < maxPlies) {
    const state = states[states.length - 1];
    if (isGameOver(state.status)) break;
    const moves = allMoves(state.board, state.turn, rules);
    if (moves.length === 0) break;
    states.push(applyMove(state, moves[Math.floor(rand() * moves.length)], rules));
  }
  return states;
}

const ok = (r: ParseResult) => {
  if (!r.ok) throw new Error(`expected a parse, got ${r.error.code}: ${r.error.detail}`);
  return r.game;
};
const failed = (r: ParseResult) => {
  if (r.ok) throw new Error("expected a rejection, but the file parsed");
  return r.error;
};

// ── Export shape ──────────────────────────────────────────────────────────────

describe("export: PGN-style shape", () => {
  it("writes a tag header, a blank line, then numbered move pairs", () => {
    const states = randomTimeline(7, VARIANTS.wtf, 5);
    const text = exportGame(states[states.length - 1], VARIANTS.wtf, {
      event: "Brandubh — Ollamh",
      date: "2026.07.29",
      attackers: "Ollamh",
      defenders: "Eoin",
    });
    const [header, ...rest] = text.split("\n\n");

    expect(header.split("\n")).toEqual([
      '[Format "brandubh-1"]',
      '[Event "Brandubh — Ollamh"]',
      '[Variant "wtf"]',
      '[Date "2026.07.29"]',
      '[Attackers "Ollamh"]',
      '[Defenders "Eoin"]',
      '[Result "*"]',
    ]);

    const moveLines = rest.join("\n\n").trim().split("\n");
    // 5 plies → 3 numbered lines (the last holding a single move) + the result.
    expect(moveLines).toHaveLength(4);
    expect(moveLines[0]).toMatch(/^1\. [a-g][1-7]-[a-g][1-7](x\d)? [a-g][1-7]-[a-g][1-7](x\d)?$/);
    expect(moveLines[2].startsWith("3. ")).toBe(true);
    expect(moveLines[3]).toBe("*");
  });

  it("uses the app's own notation for every move, captures included", () => {
    const states = randomTimeline(11, VARIANTS.wtf, 30);
    const tip = states[states.length - 1];
    const text = exportGame(tip, VARIANTS.wtf);
    for (const h of tip.history) expect(text).toContain(moveName(h.move));
  });

  it("names a downloaded file after the variant and date", () => {
    expect(exportFileName(VARIANTS.walker, "2026.07.29")).toBe("brandubh-walker-20260729.tafl");
    expect(exportFileName(VARIANTS.wtf)).toBe("brandubh-wtf-game.tafl");
  });

  it("maps every terminal status onto a PGN result token", () => {
    expect(resultToken("playing")).toBe("*");
    expect(resultToken("defenders_win_escape")).toBe("0-1");
    expect(resultToken("attackers_win_capture")).toBe("1-0");
    expect(resultToken("draw_repetition")).toBe("1/2-1/2");
  });
});

// ── Round trip ────────────────────────────────────────────────────────────────

describe("round trip: export → import → identical timeline", () => {
  for (const variantId of Object.keys(VARIANTS)) {
    it(`reproduces the whole timeline deep-equal (${variantId}, 12 random games)`, () => {
      const rules = VARIANTS[variantId];
      for (let seed = 1; seed <= 12; seed++) {
        const states = randomTimeline(seed * 37, rules);
        const text = exportGame(states[states.length - 1], rules, { date: "2026.07.29" });
        const game = ok(parseGame(text));
        expect(game.variantId).toBe(variantId);
        expect(game.rules).toEqual(rules);
        expect(game.warnings).toEqual([]);
        // Every position, not just the final one — the timeline is what the
        // replay UI steps and branches through.
        expect(game.states).toEqual(states);
      }
    });
  }

  it("survives a custom ruleset (rules travel with the game)", () => {
    const rules = customRuleSet({
      ...CUSTOM_RULE_DEFAULTS,
      armedKing: false,
      throneHostileToSoldiers: false,
      throneHostileToKing: false,
      strongKingOnThrone: false,
      strongKingAdjacentToThrone: false,
      encirclementWin: false,
      repetitionResult: "draw",
    });
    const states = randomTimeline(4242, rules);
    const text = exportGame(states[states.length - 1], rules);
    expect(text).toContain('[Rules "');

    const game = ok(parseGame(text));
    expect(game.variantId).toBe("custom");
    expect(game.rules).toEqual(rules);
    expect(game.states).toEqual(states);
  });

  it("restores a resignation and a flag — the two results moves cannot show", () => {
    for (const status of [
      "attackers_win_resign",
      "defenders_win_resign",
      "attackers_win_time",
      "defenders_win_time",
    ] as const) {
      const states = randomTimeline(9, VARIANTS.wtf, 10);
      const tip = { ...states[states.length - 1], status };
      const text = exportGame(tip, VARIANTS.wtf);
      expect(text).toContain(`[Termination "${status}"]`);

      const game = ok(parseGame(text));
      expect(game.states[game.states.length - 1].status).toBe(status);
      expect(game.states).toEqual([...states.slice(0, -1), tip]);
    }
  });

  it("round-trips an in-progress game as unfinished", () => {
    const states = randomTimeline(3, VARIANTS.wtf, 9);
    const tip = states[states.length - 1];
    expect(isGameOver(tip.status)).toBe(false);
    const game = ok(parseGame(exportGame(tip, VARIANTS.wtf)));
    expect(game.states[game.states.length - 1].status).toBe("playing");
    expect(game.states).toEqual(states);
  });
});

// ── Tolerant parsing ──────────────────────────────────────────────────────────

describe("import: tolerant parsing", () => {
  // A short, legal WTF opening used as the baseline for the tolerance cases.
  const MOVES = ["d1-c1", "d3-c3", "d7-e7", "d5-e5"];
  const canonical = () => {
    const r = replayPlies(
      MOVES.map((m) => ({
        from: { row: 7 - Number(m[1]), col: m.charCodeAt(0) - 97 },
        to: { row: 7 - Number(m[4]), col: m.charCodeAt(3) - 97 },
      })),
      VARIANTS.wtf,
    );
    if (!r.ok) throw new Error("fixture moves must be legal");
    return r.states;
  };

  const cases: Array<[string, string]> = [
    ["a bare move list with no header at all", "1. d1-c1 d3-c3\n2. d7-e7 d5-e5"],
    ["no move numbers whatsoever", "d1-c1 d3-c3 d7-e7 d5-e5"],
    ["one number per ply (1-based numbering quirk)", "1. d1-c1 2. d3-c3 3. d7-e7 4. d5-e5"],
    ["numbering starting from 0", "0. d1-c1 d3-c3\n1. d7-e7 d5-e5"],
    ["black-move ellipses and bracket numbering", "1. d1-c1 1... d3-c3\n2) d7-e7 2) d5-e5"],
    ["no space after the move number", "1.d1-c1 d3-c3\n2.d7-e7 d5-e5"],
    ["one move per line", "1.\nd1-c1\nd3-c3\nd7-e7\nd5-e5"],
    ["ragged whitespace and tabs", "  1.\td1-c1     d3-c3  \n\n\n 2.  d7-e7\td5-e5   \n"],
    ["CRLF line endings", "[Variant \"wtf\"]\r\n\r\n1. d1-c1 d3-c3\r\n2. d7-e7 d5-e5\r\n*\r\n"],
    ["a UTF-8 BOM", "﻿1. d1-c1 d3-c3 d7-e7 d5-e5"],
    ["semicolon comments", "; a game from the forum\n1. d1-c1 d3-c3 ; opening pair\n2. d7-e7 d5-e5"],
    ["brace comments, even across lines", "1. d1-c1 {a solid\nreply} d3-c3\n2. d7-e7 d5-e5"],
    ["percent-escaped lines", "%this line is not for us\n1. d1-c1 d3-c3 d7-e7 d5-e5"],
    ["uppercase files", "1. D1-C1 D3-C3\n2. D7-E7 D5-E5"],
    ["en-dash and no separator at all", "1. d1–c1 d3c3\n2. d7—e7 d5-e5"],
    ["a trailing result token", "1. d1-c1 d3-c3\n2. d7-e7 d5-e5\n*"],
    ["annotation glyphs on moves", "1. d1-c1! d3-c3?\n2. d7-e7!? d5-e5+"],
    ["unquoted and unknown tags", "[Variant wtf]\n[Site aagenielsen.dk]\n\n1. d1-c1 d3-c3 d7-e7 d5-e5"],
    ["tags trailing after the moves", "1. d1-c1 d3-c3 d7-e7 d5-e5\n[Variant \"wtf\"]\n"],
  ];

  for (const [label, text] of cases) {
    it(`shrugs off ${label}`, () => {
      const game = ok(parseGame(text));
      expect(game.states).toEqual(canonical());
    });
  }

  it("accepts the display name or a shorthand in the Variant tag", () => {
    for (const tag of ["wtf", "WTF", "Brandubh · World Tafl Federation", "world tafl federation"])
      expect(ok(parseGame(`[Variant "${tag}"]\n\n1. d1-c1 d3-c3`)).variantId).toBe("wtf");
    for (const tag of ["walker", "Brandubh · Walker", "Cyningstan"])
      expect(ok(parseGame(`[Variant "${tag}"]\n\n1. d1-c1 d3-c3`)).variantId).toBe("walker");
  });

  it("keeps the header metadata it was given", () => {
    const game = ok(
      parseGame(
        '[Event "Brandubh — Ollamh"]\n[Date "2026.07.29"]\n[Attackers "Ollamh"]\n' +
          '[Defenders "Eoin"]\n\n1. d1-c1 d3-c3',
      ),
    );
    expect(game.meta).toEqual({
      event: "Brandubh — Ollamh",
      date: "2026.07.29",
      attackers: "Ollamh",
      defenders: "Eoin",
    });
  });

  it("treats a capture-marked separator as an unstated capture claim", () => {
    // d5xe5 is not actually a capture; written with an 'x' separator it must
    // still load, because the 'x' asserts no particular count.
    const game = ok(parseGame("1. d1-c1 d3-c3\n2. d7-e7 d5xe5"));
    expect(game.states).toEqual(canonical());
  });
});

// ── Warnings (loaded, but say something) ──────────────────────────────────────

describe("import: non-fatal oddities are reported, not hidden", () => {
  it("warns when there is no Variant tag to go on", () => {
    const game = ok(parseGame("1. d1-c1 d3-c3"));
    expect(game.variantId).toBe("wtf");
    expect(game.warnings.join(" ")).toMatch(/No \[Variant\] tag/);
  });

  it("warns when the stated Result disagrees with the replayed game", () => {
    const game = ok(parseGame('[Variant "wtf"]\n[Result "1-0"]\n\n1. d1-c1 d3-c3'));
    expect(game.warnings.join(" ")).toMatch(/disagrees with the replayed game \(\*\)/);
  });

  it("never lets a doctored Termination tag invent a result", () => {
    // A two-move game is nowhere near over; claiming an escape must be refused
    // as a claim yet still load the moves that are actually there.
    const game = ok(
      parseGame('[Variant "wtf"]\n[Termination "defenders_win_escape"]\n\n1. d1-c1 d3-c3'),
    );
    expect(game.states[game.states.length - 1].status).toBe("playing");
    expect(game.warnings.join(" ")).toMatch(/recomputed from the moves/);
  });

  it("warns on an unfamiliar format version but still reads the game", () => {
    const game = ok(parseGame('[Format "brandubh-99"]\n[Variant "wtf"]\n\n1. d1-c1 d3-c3'));
    expect(game.warnings.join(" ")).toMatch(/brandubh-99/);
  });

  it("warns that a Rules tag on a named variant is ignored", () => {
    const game = ok(parseGame('[Variant "wtf"]\n[Rules "armedKing=0"]\n\n1. d1-c1 d3-c3'));
    expect(game.rules).toEqual(VARIANTS.wtf);
    expect(game.warnings.join(" ")).toMatch(/\[Rules\] ignored/);
  });
});

// ── Rejections (graceful, with a reason) ──────────────────────────────────────

describe("import: malformed input is refused with a reason", () => {
  it("rejects an empty or move-less file", () => {
    for (const text of ["", "   \n\n\t\n", "; just a comment\n", '[Variant "wtf"]\n\n*\n'])
      expect(failed(parseGame(text)).code).toBe("no_moves");
  });

  it("rejects an illegal move, naming the ply", () => {
    // d1-c1 is legal; a1-a7 is not (a1 is a corner, empty at move 2).
    const e = failed(parseGame('[Variant "wtf"]\n\n1. d1-c1 a1-a7'));
    expect(e.code).toBe("illegal_move");
    expect(e.ply).toBe(2);
    expect(e.detail).toContain("a1-a7");
  });

  it("rejects a diagonal move (a plausible hand-edit)", () => {
    const e = failed(parseGame('[Variant "wtf"]\n\n1. d1-c2'));
    expect(e.code).toBe("illegal_move");
    expect(e.ply).toBe(1);
  });

  it("rejects moves that continue past the end of the game", () => {
    // A defender escape: open the d-file, walk the king out to g5, then home.
    const escape = "1. a4-a3 d5-c5\n2. a3-a2 d4-d5\n3. a2-b2 d5-g5\n4. b2-c2 g5-g7";
    const won = ok(parseGame(`[Variant "wtf"]\n\n${escape}`));
    expect(won.states[won.states.length - 1].status).toBe("defenders_win_escape");

    const e = failed(parseGame(`[Variant "wtf"]\n\n${escape}\n5. c2-c3 c5-c4`));
    expect(e.code).toBe("moves_after_end");
    expect(e.ply).toBe(9);
  });

  it("rejects a capture count that the ruleset cannot produce", () => {
    const e = failed(parseGame('[Variant "wtf"]\n\n1. d1-c1x3'));
    expect(e.code).toBe("capture_mismatch");
    expect(e.detail).toMatch(/claims 3 capture\(s\) but 0 occur/);
    expect(e.detail).toMatch(/\[Variant\] tag/);
  });

  it("rejects an unreadable token, quoting it with its line", () => {
    const e = failed(parseGame('[Variant "wtf"]\n\n1. d1-c1 d3-c3\n2. h9-z0 d7-e7'));
    expect(e.code).toBe("bad_token");
    expect(e.token).toBe("h9-z0");
    expect(e.line).toBe(4);
  });

  it("rejects an off-board rank (the board is 7x7)", () => {
    expect(failed(parseGame("1. d1-c1 d8-c8")).code).toBe("bad_token");
  });

  it("rejects a malformed header line", () => {
    const e = failed(parseGame('[Variant "wtf"\n\n1. d1-c1'));
    expect(e.code).toBe("bad_tag");
    expect(e.line).toBe(1);
  });

  it("rejects an unknown variant rather than guessing a ruleset", () => {
    const e = failed(parseGame('[Variant "fetlar-11x11"]\n\n1. d1-c1'));
    expect(e.code).toBe("unknown_variant");
    expect(e.token).toBe("fetlar-11x11");
  });

  it("rejects a custom game with no ruleset attached", () => {
    expect(failed(parseGame('[Variant "custom"]\n\n1. d1-c1')).code).toBe("missing_custom_rules");
  });

  it("never throws, whatever it is handed", () => {
    const junk = [
      " ",
      "[".repeat(500),
      "}".repeat(500),
      "{".repeat(500),
      "1. ".repeat(5000),
      "d1-c1 ".repeat(5000),
      '[Variant "wtf"] [Result "0-1"] 1. d1-c1',
      "🏰🗡️",
      JSON.stringify({ brandubh: "game.v1", moves: ["d1-c1"] }),
    ];
    for (const text of junk) expect(() => parseGame(text)).not.toThrow();
  });
});

// ── The storage/interchange boundary ──────────────────────────────────────────

describe("format independence", () => {
  it("carries no localStorage schema — the export is self-describing text", () => {
    const states = randomTimeline(5, VARIANTS.wtf, 8);
    const text = exportGame(states[states.length - 1], VARIANTS.wtf);
    // A change to any local storage key must not be able to break a saved file,
    // so nothing about one may appear in the other.
    expect(text).not.toMatch(/brandubh\.[a-z]/);
    expect(text).not.toMatch(/[{}[\]]"?(states|cursor|board|turn)"?/);
    expect(() => JSON.parse(text)).toThrow();
  });
});
