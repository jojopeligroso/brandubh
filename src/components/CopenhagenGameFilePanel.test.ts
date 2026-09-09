import { describe, expect, it } from "vitest";
import { reasonFor } from "./CopenhagenGameFilePanel";
import { translations } from "../i18n";
import { exportGame, parseGame, type ParseErrorCode } from "../game/copenhagen/gameFile";
import { applyMove, initialState } from "../game/copenhagen/rules";
import { findLegalMove } from "../game/copenhagen/replay";
import type { GameState } from "../game/copenhagen/types";
import { VARIANTS } from "../game/copenhagen/variants";

// Same wiring check as TablutGameFilePanel.test.ts, for the Copenhagen twin:
// this is CopenhagenGameFilePanel's bolt onto game/copenhagen/gameFile's own
// codec (files a–k, ranks 1–11, "copenhagen-1"), not a re-test of that
// module's own 22 tests. No jsdom in this project (see CLAUDE.md), so the
// panel's chrome is exercised by `npm run check:copenhagen` instead.

const t = translations.en;
const cph = VARIANTS.copenhagen;

const sq = (name: string) => ({
  row: 11 - Number(name.slice(1)),
  col: name.charCodeAt(0) - 97,
});

/** Four quiet plies from the opening, Black first — the same line
 *  `game/copenhagen/persist.test.ts` uses, verified there against the engine. */
const SHORT = ["d1-d3", "e7-b7", "e1-e3", "d6-d8"];

function play(moves: string[], rules = cph): GameState[] {
  const states = [initialState(rules)];
  for (const m of moves) {
    const [from, to] = m.split("-");
    const move = findLegalMove(states[states.length - 1], sq(from), sq(to), rules);
    expect(move, `${m} should be legal`).not.toBeNull();
    states.push(applyMove(states[states.length - 1], move!, rules));
  }
  return states;
}

describe("Copenhagen game file round trip (the panel's own codec)", () => {
  it("exports a played game and imports it back to the same states", () => {
    const states = play(SHORT);
    const tip = states[states.length - 1];
    const text = exportGame(tip, cph, {
      event: "Copenhagen",
      attackers: "Ollamh",
      defenders: "Eoin",
    });
    const result = parseGame(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.states).toEqual(states);
    expect(result.game.variantId).toBe(cph.id);
    expect(result.game.warnings).toEqual([]);
  });

  it("refuses a malformed file with a located, quoted reason", () => {
    const result = parseGame("[Format \"copenhagen-1\"]\n\n1. z9-z9 z9-z9\n");
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
    expect(reasonFor(t, "no_moves")).toBe(t.importErrNoMoves);
    expect(reasonFor(t, "illegal_move")).toBe(t.importErrIllegalMove);
    expect(reasonFor(t, "capture_mismatch")).toBe(t.importErrCaptureMismatch);
  });
});
