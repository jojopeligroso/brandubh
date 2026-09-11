import { describe, expect, it } from "vitest";
import { reasonFor } from "./MorrisGameFilePanel";
import { translations } from "../i18n";
import { exportGame, parseGame, type ParseErrorCode } from "../game/morris/gameFile";
import { applyMove, initialState, parseMoveName } from "../game/morris/rules";
import { findLegalMove } from "../game/morris/replay";
import type { GameState } from "../game/morris/types";
import { VARIANTS } from "../game/morris/variants";

// Same wiring check as CopenhagenGameFilePanel.test.ts, for the Morris twin: this
// is the panel's bolt onto `game/morris/gameFile`'s own codec (`morris-1`, a
// `.morris` file, move tokens with a removal suffix), not a re-test of that
// module's own tests. No jsdom in this project (see CLAUDE.md), so the panel's
// chrome — the buttons, the paste box, the error card — is exercised by
// `npm run check:morris` instead.
//
// The error-copy list is one case shorter than every other panel's, and that is
// the assertion worth having: a Morris move carries its own removal, so there is
// no claimed capture count to disagree with and no `capture_mismatch` to explain.

const t = translations.en;
const morris = VARIANTS["morris-gasser-1"];

/** Four quiet plies and a mill that takes a stone — the same fixture the codec's
 *  own tests use, verified legal there against the engine. */
const MILL = ["d7", "a7", "d6", "a4", "d5xa7"];

function play(tokens: string[]): GameState[] {
  const states = [initialState(morris)];
  for (const token of tokens) {
    const parsed = parseMoveName(token);
    expect(parsed, `${token} should parse`).not.toBeNull();
    const move = findLegalMove(states[states.length - 1], parsed!, morris);
    expect(move, `${token} should be legal`).not.toBeNull();
    states.push(applyMove(states[states.length - 1], move!, morris));
  }
  return states;
}

describe("Morris game file round trip (the panel's own codec)", () => {
  it("exports a played game and imports it back to the same states", () => {
    const states = play(MILL);
    const text = exportGame(states[states.length - 1], morris, {
      event: "Nine Men's Morris",
      white: "Eoin",
      black: "Ollamh",
    });
    const result = parseGame(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.states).toEqual(states);
    expect(result.game.variantId).toBe(morris.id);
    expect(result.game.warnings).toEqual([]);
  });

  it("refuses a malformed file with a located, quoted reason", () => {
    const result = parseGame('[Format "morris-1"]\n\n1. z9 z9\n');
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
  ];

  it("maps every ParseErrorCode to the shared import-error copy, never a blank string", () => {
    for (const code of codes) {
      const reason = reasonFor(t, code);
      expect(typeof reason).toBe("string");
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  it("uses the same generic import-error strings every other panel uses", () => {
    // The strings are shell copy, not game copy: "something in the move list is
    // not a move" is true on any board, which is why these four panels share them
    // while each keeps its own codec.
    expect(reasonFor(t, "no_moves")).toBe(t.importErrNoMoves);
    expect(reasonFor(t, "bad_token")).toBe(t.importErrBadToken);
    expect(reasonFor(t, "illegal_move")).toBe(t.importErrIllegalMove);
    expect(reasonFor(t, "moves_after_end")).toBe(t.importErrMovesAfterEnd);
  });

  it("has no case for a capture-count mismatch, because this format cannot have one", () => {
    // `capture_mismatch` is a tafl code: a move there is two squares and the
    // captures are the engine's to work out, so a file can claim a number that
    // does not add up. A Morris move carries the stone it takes, so the same
    // mistake is simply an illegal move. If the codec ever grows the code back,
    // `reasonFor`'s switch has no `default` and `tsc` will say so.
    expect(codes).not.toContain("capture_mismatch" as ParseErrorCode);
  });
});
