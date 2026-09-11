// The review-cursor deadlock, as a pure test.
//
// What shipped: asking the engine recorded the position's key, and the effect's
// cleanup — which runs when the review cursor moves off the tip — discarded the
// worker's reply without clearing either `thinking` or the key. Back at the tip the
// key was unchanged, so "already asked" was true, nothing was asked again, and the
// board sat with the engine apparently thinking until Undo or Restart.
//
// There is no jsdom in this project (see CLAUDE.md), so the decision lives in
// `morrisEngineTurn.ts` and this tests it directly; the other half of the invariant
// — that the cleanup also clears `thinking` — is asserted in the browser by
// `npm run check:morris` ("the engine still answers after the cursor is stepped
// mid-think"), because it is React state and not a value.

import { describe, expect, it } from "vitest";

import { NOT_ASKED, askKey, nextAskKey, type EngineTurnGate } from "./morrisEngineTurn";

/** The engine is White's opponent and it is the engine's move at the tip. */
const ENGINE_TO_MOVE: EngineTurnGate = {
  gameId: "g1",
  plies: 4,
  turn: "black",
  aiSide: "black",
  gameOver: false,
  showSetup: false,
  atTip: true,
};

describe("when the engine is asked", () => {
  it("asks once for a position and not twice", () => {
    const key = nextAskKey(ENGINE_TO_MOVE, NOT_ASKED);
    expect(key).toBe(askKey("g1", 4, "black"));
    expect(nextAskKey(ENGINE_TO_MOVE, key!)).toBeNull();
  });

  it("does not ask when it is not the engine's move, or not the engine's board", () => {
    const no = (patch: Partial<EngineTurnGate>) =>
      nextAskKey({ ...ENGINE_TO_MOVE, ...patch }, NOT_ASKED);
    expect(no({ turn: "white" })).toBeNull(); // the human's move
    expect(no({ aiSide: null })).toBeNull(); // hotseat
    expect(no({ gameOver: true })).toBeNull();
    expect(no({ showSetup: true })).toBeNull();
    expect(no({ atTip: false })).toBeNull(); // never under a reviewer's feet
  });

  it("asks again about the same position once a discarded request has been forgotten", () => {
    // 1. Asked about the tip.
    const key = nextAskKey(ENGINE_TO_MOVE, NOT_ASKED)!;
    // 2. The player steps the review cursor: off the tip, nothing is asked, and the
    //    reply in flight is discarded by the effect's cleanup.
    const reviewing = { ...ENGINE_TO_MOVE, atTip: false };
    expect(nextAskKey(reviewing, key)).toBeNull();
    // 3. The deadlock, exactly: still holding the old key, the return to the tip
    //    asks nothing — and the `thinking` flag the discarded reply never cleared
    //    has nothing left to clear it.
    expect(nextAskKey(ENGINE_TO_MOVE, key)).toBeNull();
    // 4. The fix: an abandoned question is not an asked one, so the cleanup forgets
    //    the key and the same position is asked again on the way back.
    expect(nextAskKey(ENGINE_TO_MOVE, NOT_ASKED)).toBe(key);
  });

  it("keys on the game, the position and the side, so a new game is never the old answer", () => {
    const key = askKey("g1", 4, "black");
    expect(nextAskKey({ ...ENGINE_TO_MOVE, gameId: "g2" }, key)).toBe(askKey("g2", 4, "black"));
    expect(nextAskKey({ ...ENGINE_TO_MOVE, plies: 5 }, key)).toBe(askKey("g1", 5, "black"));
    // An undo back onto the engine's turn is a different number of plies, which is
    // why stepping back and forward again does ask — and why `plies`, not a move
    // counter, is the thing in the key.
    expect(nextAskKey({ ...ENGINE_TO_MOVE, plies: 2 }, key)).toBe(askKey("g1", 2, "black"));
  });
});
