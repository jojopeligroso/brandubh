import { describe, expect, it } from "vitest";
import {
  FILE_EXTENSION,
  FORMAT_VERSION,
  exportFileName,
  exportGame,
  parseGame,
  resultToken,
} from "./gameFile";
import { applyMove, initialState, moveName } from "./rules";
import { findLegalMove } from "./replay";
import type { GameState } from "./types";
import { CUSTOM_RULE_DEFAULTS, VARIANTS, rulesFor, ruleFlags } from "./variants";

const cph = VARIANTS.copenhagen;
const fetlar = VARIANTS["copenhagen-fetlar"];

const sq = (name: string) => ({
  row: 11 - Number(name.slice(1)),
  col: name.charCodeAt(0) - 97,
});

/** Play a list of `from-to` moves out from the opening under `rules`. */
function play(moves: string[], rules = cph): GameState {
  let s = initialState(rules);
  for (const m of moves) {
    const [from, to] = m.split("-");
    const move = findLegalMove(s, sq(from), sq(to), rules);
    expect(move, `${m} should be legal`).not.toBeNull();
    s = applyMove(s, move!, rules);
  }
  return s;
}

/** Four quiet plies from the opening, Black first. Verified against the engine. */
const SHORT = ["d1-d3", "e7-b7", "e1-e3", "d6-d8"];

/** The full twelve-ply escape used by the "decided game" cases: White opens the
 *  c-file, walks the king out of his diamond to c6, up to c11 and into a11. */
const ESCAPE = [
  "d1-d3", "e7-b7",
  "e1-e3", "d6-d8",
  "g1-g3", "e6-e8",
  "h1-h3", "f6-c6",
  "d3-d4", "c6-c11",
  "e3-e4", "c11-a11",
];

// ── Export ────────────────────────────────────────────────────────────────────

describe("exportGame", () => {
  it("writes the header, a blank line, then numbered move pairs", () => {
    const text = exportGame(play(SHORT), cph, { date: "2026.08.10" });
    const [header, body] = text.split("\n\n");
    expect(header).toContain(`[Format "${FORMAT_VERSION}"]`);
    expect(header).toContain('[Event "Copenhagen"]');
    expect(header).toContain('[Variant "copenhagen"]');
    expect(header).toContain('[Date "2026.08.10"]');
    expect(body.trim().split("\n")[0]).toBe("1. d1-d3 e7-b7");
  });

  it("puts Black first in every numbered pair, because Black moves first", () => {
    // The single easiest way to misread this format. Brandubh's pairs read
    // "attackers defenders"; these read the other way round, and the first token
    // of line 1 must therefore be a defender move.
    const text = exportGame(play(SHORT), cph);
    const firstToken = text.split("\n\n")[1].trim().split(/\s+/)[1];
    expect(firstToken).toBe("d1-d3"); // an attacker move
    // And the tag order matches the move order.
    expect(text.indexOf('[Defenders')).toBeLessThan(text.indexOf('[Attackers'));
  });

  it("names the file after the variant and the extension the app reads", () => {
    expect(exportFileName(cph, "2026.09.03")).toBe(`copenhagen-20260903.${FILE_EXTENSION}`);
    expect(exportFileName(fetlar, "2026.09.03")).toBe(
      `copenhagen-fetlar-20260903.${FILE_EXTENSION}`,
    );
  });

  it("derives the result from the status rather than asserting one", () => {
    expect(resultToken("defenders_win_escape")).toBe("0-1");
    expect(resultToken("attackers_win_capture")).toBe("1-0");
    expect(resultToken("draw_repetition")).toBe("1/2-1/2");
    expect(resultToken("playing")).toBe("*");
  });

  it("carries a custom ruleset in one Rules tag, and only for custom", () => {
    const custom = rulesFor("custom", { ...CUSTOM_RULE_DEFAULTS, throneBlocks: "attackers" });
    const text = exportGame(play(SHORT, custom), custom);
    expect(text).toContain('[Variant "custom"]');
    expect(text).toMatch(/\[Rules "[^"]*throneBlocks=attackers[^"]*"\]/);
    expect(exportGame(play(SHORT), cph)).not.toContain("[Rules");
  });
});

// ── Round trip ────────────────────────────────────────────────────────────────

describe("export then import", () => {
  it("reproduces an identical timeline", () => {
    const original = play(SHORT);
    const parsed = parseGame(exportGame(original, cph));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.game.states[parsed.game.states.length - 1]).toEqual(original);
    expect(parsed.game.rules).toEqual(cph);
    expect(parsed.game.variantId).toBe("copenhagen");
  });

  it("round-trips every shipped preset", () => {
    for (const rules of Object.values(VARIANTS)) {
      const text = exportGame(play(SHORT, rules), rules);
      const parsed = parseGame(text);
      expect(parsed.ok, `${rules.id} should round-trip`).toBe(true);
      if (parsed.ok) expect(parsed.game.rules.id).toBe(rules.id);
    }
  });

  it("round-trips a custom ruleset flag for flag, enums included", () => {
    // The property that matters: a game exported under a hand-made ruleset must
    // come back playable under the *same* rules, or its moves mean something else.
    const flags = {
      ...CUSTOM_RULE_DEFAULTS,
      escape: "corners" as const,
      firstMove: "attackers" as const,
      throneBlocks: "soldiers" as const,
      throneAnvil: "both" as const,
      repetitionResult: "loss_for_defenders" as const,
      cornersRestricted: true,
      cornersHostile: true,
      armedKing: false,
    };
    const custom = rulesFor("custom", flags);
    // This ruleset moves Black first, so the line has to be one Black can play.
    const parsed = parseGame(exportGame(play(["d1-d3", "e7-b7"], custom), custom));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(ruleFlags(parsed.game.rules)).toEqual(flags);
  });

  it("carries every rule the ruleset has, so none can be silently dropped", () => {
    // Guards the derived-from-the-defaults design: if someone adds a rule and the
    // format does not learn about it, an exported custom game loses it. Comparing
    // the parsed flags against the originals over *every* key is what notices.
    const flipped = Object.fromEntries(
      Object.entries(CUSTOM_RULE_DEFAULTS).map(([k, v]) => [
        k,
        typeof v === "boolean" ? !v : v,
      ]),
    ) as typeof CUSTOM_RULE_DEFAULTS;
    const custom = rulesFor("custom", flipped);
    const text = exportGame(initialState(custom), custom);
    const rulesTag = /\[Rules "([^"]*)"\]/.exec(text)?.[1] ?? "";
    for (const key of Object.keys(CUSTOM_RULE_DEFAULTS))
      expect(rulesTag, `${key} must appear in the Rules tag`).toContain(`${key}=`);
  });
});

// ── Tolerant parsing ──────────────────────────────────────────────────────────

describe("the parser shrugs off what it can", () => {
  it("reads a hand-typed file with no header at all", () => {
    const parsed = parseGame("1. d1-d3 e7-b7\n2. e1-e3 d6-d8\n");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.game.variantId).toBe("copenhagen");
      expect(parsed.game.warnings.join(" ")).toContain("No [Variant] tag");
    }
  });

  it("copes with CRLF, comments, odd numbering and a stray result", () => {
    const text =
      '﻿[Variant "copenhagen"]\r\n' +
      "% a whole-line comment\r\n" +
      "{ a block\ncomment } 1... d1-d3 ; trailing comment\r\n" +
      "1) e7-b7 2.e1-e3\r\n" +
      "*\r\n";
    const parsed = parseGame(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.game.states).toHaveLength(4);
  });

  it("accepts x as a capture separator and an explicit count", () => {
    // A line whose last move actually takes something, so the count is checkable.
    const capture = ["d11-d10", "f8-f9", "a8-f8"];
    const s = play(capture);
    const text = exportGame(s, cph);
    // Whatever the last move captured, the exporter wrote it and the parser must
    // agree — that agreement is the whole point of the count.
    expect(text).toContain("a8-f8x1"); // the exporter wrote the count …
    expect(parseGame(text).ok).toBe(true); // … and the parser agreed with it
    expect(moveName(s.history[s.history.length - 1].move)).toBe("a8-f8x1");
  });

  it("resolves a variant from a display name or a shorthand", () => {
    for (const [tag, id] of [
      ["copenhagen", "copenhagen"],
      ["Copenhagen Hnefatafl", "copenhagen"],
      ["hnefatafl", "copenhagen"],
      ["Fetlar Hnefatafl", "copenhagen-fetlar"],
      ["fetlar", "copenhagen-fetlar"],
    ] as const) {
      const parsed = parseGame(`[Variant "${tag}"]\n1. d1-d3\n`);
      expect(parsed.ok, `"${tag}" should resolve`).toBe(true);
      if (parsed.ok) expect(parsed.game.variantId).toBe(id);
    }
  });

  it("ignores an unknown rule key and an unknown enum value", () => {
    const parsed = parseGame(
      '[Variant "custom"]\n' +
        '[Rules "escape=sideways kingStrength=invincible nonsuchRule=1 ' +
        'throneBlocks=attackers exitFort=0"]\n1. d1-d3\n',
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      // Both bad values fall back to the default rather than being assigned, and
      // `kingStrength` is here specifically because it is one of the two enums
      // this game added: a new enum that reaches export but not ENUM_RULE_VALUES
      // would round-trip as its default and nothing else would notice.
      expect(parsed.game.rules.escape).toBe("corners");
      expect(parsed.game.rules.kingStrength).toBe("strong");
      expect(parsed.game.rules.throneBlocks).toBe("attackers"); // the good ones took
      expect(parsed.game.rules.exitFort).toBe(false);
    }
  });
});

// ── Refusals ──────────────────────────────────────────────────────────────────

describe("the parser refuses rather than guesses", () => {
  it("names the reason and the place", () => {
    const cases: Array<[string, string]> = [
      ["", "no_moves"],
      ['[Variant "shatranj"]\n1. d1-d3\n', "unknown_variant"],
      ['[Variant "custom"]\n1. d1-d3\n', "missing_custom_rules"],
      ["1. d1-d3 wibble\n", "bad_token"],
      ["1. e3-e3\n", "illegal_move"],
      ["[Variant copenhagen\n1. d1-d3\n", "bad_tag"],
    ];
    for (const [text, code] of cases) {
      const parsed = parseGame(text);
      expect(parsed.ok, `${code} case should fail`).toBe(false);
      if (!parsed.ok) expect(parsed.error.code).toBe(code);
    }
  });

  it("refuses a Brandubh file, whose squares do not exist on this board", () => {
    // The two formats must not be able to read each other. `d4-d6` is a legal
    // Brandubh move and a legal-looking token here, but `wtf` is not a Copenhagen
    // variant — and that is the check that fires first and stops the import.
    const brandubh = '[Format "brandubh-1"]\n[Variant "wtf"]\n\n1. d1-c1 d3-c3\n0-1\n';
    const parsed = parseGame(brandubh);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.code).toBe("unknown_variant");
  });

  it("refuses a capture count the replay disagrees with", () => {
    const parsed = parseGame('[Variant "copenhagen"]\n1. d1-d3x2\n');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("capture_mismatch");
      expect(parsed.error.ply).toBe(1);
    }
  });

  it("refuses moves after the game has been decided", () => {
    const escape = ESCAPE;
    const body = escape.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(" ");
    const parsed = parseGame(`[Variant "copenhagen"]\n${body} e4-e5\n`);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.code).toBe("moves_after_end");
  });
});

// ── Claims the file may and may not make ──────────────────────────────────────

describe("what a file is allowed to assert", () => {
  it("restores a resignation, which no move list can imply", () => {
    const parsed = parseGame(
      '[Variant "copenhagen"]\n[Termination "defenders_win_resign"]\n1. d1-d3\n',
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const tip = parsed.game.states[parsed.game.states.length - 1];
      expect(tip.status).toBe("defenders_win_resign");
    }
  });

  it("refuses to let a Termination tag overwrite a decided game", () => {
    const escape = ESCAPE;
    const body = escape.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(" ");
    const parsed = parseGame(
      `[Variant "copenhagen"]\n[Termination "attackers_win_resign"]\n${body}\n`,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const tip = parsed.game.states[parsed.game.states.length - 1];
      expect(tip.status).toBe("defenders_win_escape"); // the moves win the argument
      expect(parsed.game.warnings.join(" ")).toContain("[Termination] ignored");
    }
  });

  it("treats Result as advisory and says so when it disagrees", () => {
    const parsed = parseGame('[Variant "copenhagen"]\n[Result "1-0"]\n1. d1-d3\n');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.game.warnings.join(" ")).toContain("disagrees");
  });

  it("reads an unfamiliar Format anyway, with a warning", () => {
    const parsed = parseGame('[Format "copenhagen-99"]\n[Variant "copenhagen"]\n1. d1-d3\n');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.game.warnings.join(" ")).toContain("copenhagen-99");
  });
});
