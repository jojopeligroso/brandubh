import { describe, expect, it } from "vitest";
import { reasonFor } from "./TablutGameFilePanel";
import { translations } from "../i18n";
import { exportGame, parseGame, type ParseErrorCode } from "../game/tablut/gameFile";
import { applyMove, initialState } from "../game/tablut/rules";
import { findLegalMove } from "../game/tablut/replay";
import type { GameState } from "../game/tablut/types";
import { VARIANTS } from "../game/tablut/variants";

// This is the panel's *wiring* under test, not gameFile.ts's own round trip
// (already covered by its 22 tests): that TablutGameFilePanel is bolted to
// Tablut's own codec — files a–i, ranks 1–9, White-moves-first pairing — and
// not, say, Brandubh's by a stray import. There is no jsdom in this project
// (see CLAUDE.md), so the panel's chrome itself is exercised by
// `npm run check:tablut` instead; this covers everything the panel does that
// does not require a DOM.

const t = translations.en;
const baseline = VARIANTS.tablut;

const sq = (name: string) => ({
  row: 9 - Number(name.slice(1)),
  col: name.charCodeAt(0) - 97,
});

/** Four quiet plies from the opening, White first — the same line
 *  `game/tablut/persist.test.ts` uses, verified there against the engine. */
const SHORT = ["e3-d3", "e8-a8", "d3-d4", "i6-i8"];

function play(moves: string[], rules = baseline): GameState[] {
  const states = [initialState(rules)];
  for (const m of moves) {
    const [from, to] = m.split("-");
    const move = findLegalMove(states[states.length - 1], sq(from), sq(to), rules);
    expect(move, `${m} should be legal`).not.toBeNull();
    states.push(applyMove(states[states.length - 1], move!, rules));
  }
  return states;
}

describe("Tablut game file round trip (the panel's own codec)", () => {
  it("exports a played game and imports it back to the same states", () => {
    const states = play(SHORT);
    const tip = states[states.length - 1];
    const text = exportGame(tip, baseline, { event: "Tablut", attackers: "Ollamh", defenders: "Eoin" });
    const result = parseGame(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.states).toEqual(states);
    expect(result.game.variantId).toBe(baseline.id);
    expect(result.game.warnings).toEqual([]);
  });

  it("refuses a malformed file with a located, quoted reason", () => {
    const result = parseGame("[Format \"tablut-1\"]\n\n1. z9-z9 z9-z9\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("bad_token");
  });
});

describe("reasonFor (the panel's error copy)", () => {
  const codes: ParseErrorCode[] = [
    "no_moves",
    "bad_tag",
    "unknown_variant",
    "missing_custom_rules",
    "bad_token",
    "illegal_move",
    "moves_after_end",
    "capture_mismatch",
  ];

  it("maps every ParseErrorCode to the shared import-error copy, never a blank string", () => {
    for (const code of codes) {
      const reason = reasonFor(t, code);
      expect(typeof reason).toBe("string");
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  it("uses the same generic tafl* error strings the shell's own panel uses", () => {
    // These are shared, board-agnostic i18n keys (see ADR-0007's i18n
    // finding) — Tablut's panel must show the identical sentence as
    // Brandubh's for the same failure, not a Tablut-specific fork of it.
    expect(reasonFor(t, "no_moves")).toBe(t.importErrNoMoves);
    expect(reasonFor(t, "illegal_move")).toBe(t.importErrIllegalMove);
    expect(reasonFor(t, "capture_mismatch")).toBe(t.importErrCaptureMismatch);
  });
});
