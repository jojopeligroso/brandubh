import { describe, expect, it } from "vitest";
import {
  BOOL_RULE_KEYS,
  ENUM_RULE_KEYS,
  FILE_EXTENSION,
  FORMAT_VERSION,
  exportFileName,
  exportGame,
  parseGame,
  resultToken,
} from "./gameFile";
import { allMoves, applyMove, initialState, isGameOver, moveName, parseMoveName } from "./rules";
import { findLegalMove } from "./replay";
import type { GameState } from "./types";
import { CUSTOM_RULE_DEFAULTS, ENUM_CHOICES, VARIANTS, rulesFor } from "./variants";

const morris = VARIANTS["morris-gasser-1"];

/** Four quiet plies, then a fifth that closes the `d` spoke and takes `a7`. */
const SHORT = ["d7", "a7", "d6", "a4"];
const MILL = [...SHORT, "d5xa7"];

function play(tokens: string[], rules = morris): GameState[] {
  const states = [initialState(rules)];
  for (const token of tokens) {
    const parsed = parseMoveName(token);
    expect(parsed, `${token} should parse`).not.toBeNull();
    const move = findLegalMove(states[states.length - 1], parsed!, rules);
    expect(move, `${token} should be legal`).not.toBeNull();
    states.push(applyMove(states[states.length - 1], move!, rules));
  }
  return states;
}

const tipOf = (tokens: string[], rules = morris): GameState => {
  const states = play(tokens, rules);
  return states[states.length - 1];
};

/**
 * Play the engine's first legal move, `plies` times or until the game ends.
 *
 * Deterministic (`allMoves` has a fixed order) and guaranteed to terminate: a
 * mill removes a stone, stones never come back, and the fifty-move rule catches
 * whatever is left. Used wherever a fixture needs a *reachable* position rather
 * than a specific one — the moving phase, and a finished game.
 */
function playOut(plies = 4000, rules = morris): GameState[] {
  const states = [initialState(rules)];
  for (let i = 0; i < plies; i++) {
    const s = states[states.length - 1];
    if (isGameOver(s.status)) break;
    states.push(applyMove(s, allMoves(s, rules)[0], rules));
  }
  return states;
}

// ── The format's own identity ─────────────────────────────────────────────────

describe("the format tag and the extension", () => {
  it("is morris-1, written to a .morris file", () => {
    // ADR-0008: not `.tafl`. A `.tafl` file asserts a tafl game and its move
    // tokens are a tafl grammar; these are neither.
    expect(FORMAT_VERSION).toBe("morris-1");
    expect(FILE_EXTENSION).toBe("morris");
    expect(exportFileName(morris, "2026.09.10")).toBe("morris-gasser-1-20260910.morris");
    expect(exportFileName(morris)).toBe("morris-gasser-1-game.morris");
  });

  it("writes the header tags this format defines, in order", () => {
    const text = exportGame(tipOf(MILL), morris, {
      event: "Nine Men's Morris",
      date: "2026.09.10",
      white: "Eoin",
      black: "Ollamh",
    });
    expect(text).toContain('[Format "morris-1"]');
    expect(text).toContain('[Event "Nine Men\'s Morris"]');
    expect(text).toContain('[Variant "morris-gasser-1"]');
    expect(text).toContain('[Date "2026.09.10"]');
    expect(text).toContain('[White "Eoin"]');
    expect(text).toContain('[Black "Ollamh"]');
    expect(text).toContain('[Result "*"]');
    // No [Rules] for a named variant, and no [Termination] for a live game.
    expect(text).not.toContain("[Rules ");
    expect(text).not.toContain("[Termination ");
    // White places first, so a numbered pair reads "White Black".
    expect(text).toContain("1. d7 a7");
    expect(text).toContain("2. d6 a4");
    expect(text).toContain("3. d5xa7");
  });

  it("derives the result from the status rather than trusting anything", () => {
    expect(resultToken("playing")).toBe("*");
    expect(resultToken("white_win_stones")).toBe("1-0");
    expect(resultToken("white_win_blocked")).toBe("1-0");
    expect(resultToken("white_win_resign")).toBe("1-0");
    expect(resultToken("black_win_time")).toBe("0-1");
    expect(resultToken("draw_repetition")).toBe("1/2-1/2");
    expect(resultToken("draw_no_mill")).toBe("1/2-1/2");
  });
});

// ── Round trip ────────────────────────────────────────────────────────────────

describe("export then import", () => {
  it("round-trips a played game to the same states", () => {
    const states = play(MILL);
    const result = parseGame(exportGame(states[states.length - 1], morris));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.states).toEqual(states);
    expect(result.game.variantId).toBe("morris-gasser-1");
    expect(result.game.warnings).toEqual([]);
  });

  it("round-trips a custom ruleset through the Rules tag", () => {
    const flags = {
      ...CUSTOM_RULE_DEFAULTS,
      flying: "none" as const,
      removeFromMillsWhenAllInMills: false,
      repetitionResult: "none" as const,
    };
    const custom = rulesFor("custom", flags);
    const states = play(MILL, custom);
    const text = exportGame(states[states.length - 1], custom);
    expect(text).toContain("[Rules ");
    const result = parseGame(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.variantId).toBe("custom");
    expect(result.game.rules.flying).toBe("none");
    expect(result.game.rules.removeFromMillsWhenAllInMills).toBe(false);
    expect(result.game.rules.repetitionResult).toBe("none");
    expect(result.game.states).toEqual(states);
  });

  it("restores a resignation from the Termination tag, onto an unfinished game", () => {
    const tip = { ...tipOf(SHORT), status: "black_win_resign" as const };
    const text = exportGame(tip, morris);
    expect(text).toContain('[Termination "black_win_resign"]');
    expect(text).toContain("[Result \"0-1\"]");
    const result = parseGame(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.states[result.game.states.length - 1].status).toBe("black_win_resign");
  });

  it("ignores a Termination the moves cannot be talked out of", () => {
    const text = exportGame(tipOf(SHORT), morris).replace(
      '[Result "*"]',
      '[Result "1-0"]\n[Termination "white_win_stones"]',
    );
    const result = parseGame(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.states[result.game.states.length - 1].status).toBe("playing");
    expect(result.game.warnings.join(" ")).toContain("Termination");
    expect(result.game.warnings.join(" ")).toContain("Result");
  });
});

// ── Tolerance ─────────────────────────────────────────────────────────────────

describe("the parser shrugs off how files actually arrive", () => {
  it("reads a hand-written file with comments, CRLF, capitals and odd numbering", () => {
    const text =
      '[Variant "Nine Men\'s Morris"]\r\n' +
      "% a whole-line comment\r\n" +
      "{ and a block one\r\n  spanning lines }\r\n" +
      "1.D7 A7 ; trailing comment\r\n" +
      "2... d6  a4\r\n" +
      "3) D5XA7!?\r\n" +
      "*\r\n";
    const result = parseGame(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.states).toEqual(play(MILL));
  });

  it("reads the dashes people actually type", () => {
    // An exported step is `a7-a4`; a pasted one may carry an en or em dash. A
    // step only exists once both hands are empty, so the placing phase is played
    // out first — by the engine's own move list rather than by hand, because
    // eighteen hand-written placements is eighteen chances to write an
    // accidental mill and assert nothing.
    const states = playOut(18);
    const tip = states[states.length - 1];
    expect(tip.inHand.white).toBe(0);
    expect(tip.inHand.black).toBe(0);
    const step = allMoves(tip, morris).find((m) => m.from !== null && m.remove === null);
    expect(step).toBeDefined();
    const moved = applyMove(tip, step!, morris);
    const token = moveName(step!);
    expect(token).toMatch(/^[a-g][1-7]-[a-g][1-7]$/);
    const withStep = exportGame(moved, morris);
    expect(withStep).toContain(token);
    const dashed = withStep.replace(token, token.replace("-", "\u2013"));
    const result = parseGame(dashed);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.states).toEqual([...states, moved]);
  });

  it("assumes the shipped preset, with a warning, when no Variant tag is given", () => {
    const result = parseGame("1. d7 a7\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.variantId).toBe("morris-gasser-1");
    expect(result.game.warnings.join(" ")).toContain("No [Variant] tag");
  });

  it("warns rather than fails when the Format tag is something else", () => {
    const result = parseGame('[Format "morris-7"]\n[Variant "morris-gasser-1"]\n\n1. d7 a7\n');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.warnings.join(" ")).toContain("morris-7");
  });
});

// ── Refusals ──────────────────────────────────────────────────────────────────

describe("what it refuses, and why", () => {
  it("refuses a file with no moves", () => {
    const result = parseGame('[Format "morris-1"]\n[Variant "morris-gasser-1"]\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("no_moves");
  });

  it("refuses an unreadable tag line, and locates it", () => {
    const result = parseGame('[Format "morris-1"]\n[Variant "morris-gasser-1"\n\n1. d7 a7\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("bad_tag");
      expect(result.error.line).toBe(2);
    }
  });

  it("refuses an unknown variant", () => {
    const result = parseGame('[Variant "copenhagen-2"]\n\n1. d7 a7\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_variant");
  });

  it("refuses custom with no Rules tag", () => {
    const result = parseGame('[Variant "custom"]\n\n1. d7 a7\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("missing_custom_rules");
  });

  it("refuses a token that is not a move", () => {
    for (const bad of ["z9", "d8", "h7", "d7-", "d7xx", "d7-a4xb2xc3xd4"]) {
      const result = parseGame(`[Variant "morris-gasser-1"]\n\n1. ${bad}\n`);
      expect(result.ok, bad).toBe(false);
      if (!result.ok) {
        expect(result.error.code, bad).toBe("bad_token");
        expect(result.error.token, bad).toBe(bad);
        expect(result.error.line, bad).toBe(3);
      }
    }
  });

  it("refuses a tafl file outright rather than reading half of it", () => {
    // `f1-c1` is a Copenhagen ply. The refusal comes from the *grammar* rather
    // than from the `[Variant]` tag, because tokens are read before the ruleset
    // is resolved — which is the order that matters here: a file whose moves this
    // board cannot even spell is refused whatever its header claims, and the
    // message names the token rather than the variant.
    const result = parseGame(
      '[Format "copenhagen-1"]\n[Variant "copenhagen-2"]\n\n1. f1-c1 f4-c4\n',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("bad_token");
      expect(result.error.token).toBe("f1-c1");
    }
  });

  it("refuses an illegal move, naming the ply", () => {
    const result = parseGame('[Variant "morris-gasser-1"]\n\n1. d7 d7\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("illegal_move");
      expect(result.error.ply).toBe(2);
      expect(result.error.token).toBe("d7");
    }
  });

  it("refuses moves after the game has ended", () => {
    // Played out to a real ending, for the reason replay.test.ts gives: a Morris
    // game needs eighteen placements before anything can even be blocked, so
    // there is no short hand-written finish to paste here.
    const states = playOut();
    const tip = states[states.length - 1];
    expect(tip.status).not.toBe("playing");
    const text = exportGame(tip, morris);
    expect(parseGame(text).ok).toBe(true);
    const result = parseGame(`${text}${states.length}. a7\n`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("moves_after_end");
      expect(result.error.ply).toBe(states.length);
    }
  });
});

// ── Parity with the rule editor ───────────────────────────────────────────────

describe("the Rules tag covers the whole ruleset", () => {
  it("carries every flag in CUSTOM_RULE_DEFAULTS, booleans and enums alike", () => {
    const keys = [...BOOL_RULE_KEYS, ...ENUM_RULE_KEYS].sort();
    expect(keys).toEqual(Object.keys(CUSTOM_RULE_DEFAULTS).sort());
  });

  it("accepts every value ENUM_CHOICES offers, and refuses anything else", () => {
    for (const key of ENUM_RULE_KEYS) {
      for (const value of ENUM_CHOICES[key]) {
        const result = parseGame(
          `[Variant "custom"]\n[Rules "${key}=${value}"]\n\n1. d7 a7\n`,
        );
        expect(result.ok, `${key}=${value}`).toBe(true);
        if (result.ok) expect(result.game.rules[key]).toBe(value);
      }
      const nonsense = parseGame(`[Variant "custom"]\n[Rules "${key}=sideways"]\n\n1. d7 a7\n`);
      expect(nonsense.ok).toBe(true);
      // An unreadable value keeps the baseline rather than being assigned.
      if (nonsense.ok) expect(nonsense.game.rules[key]).toBe(CUSTOM_RULE_DEFAULTS[key]);
    }
  });

  it("reads a boolean flag in every spelling people write it in", () => {
    for (const [text, expected] of [
      ["1", true],
      ["true", true],
      ["yes", true],
      ["on", true],
      ["0", false],
      ["no", false],
    ] as const) {
      const result = parseGame(
        `[Variant "custom"]\n[Rules "removeFromMillsWhenAllInMills=${text}"]\n\n1. d7 a7\n`,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.game.rules.removeFromMillsWhenAllInMills).toBe(expected);
    }
  });

  it("ignores a Rules tag on a named variant, with a warning", () => {
    const result = parseGame(
      '[Variant "morris-gasser-1"]\n[Rules "flying=none"]\n\n1. d7 a7\n',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.rules.flying).toBe("three");
    expect(result.game.warnings.join(" ")).toContain("[Rules] ignored");
  });
});
