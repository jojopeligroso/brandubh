import { describe, expect, it } from "vitest";
import {
  aiMayReply,
  autosaveAllowed,
  boardIsInteractive,
  commitBasePly,
  controllableIn,
  snapshotFor,
} from "./analysis";
import { initialState } from "./game/engine";
import { initialClockLine } from "./game/clockLine";
import type { Side } from "./game/types";

// The live-play baseline every test below varies one field of: the computer
// holds the raiders, it is their turn, the game is live at the tip.
const LIVE = {
  analysis: false,
  atTip: true,
  gameOver: false,
  paused: false,
  aiSide: "attackers" as Side | null,
  turn: "attackers" as Side,
};

describe("analysis suppresses the computer's reply", () => {
  it("lets the computer move in live play", () => {
    expect(aiMayReply(LIVE)).toBe(true);
  });

  it("does not, in analysis — even when every other condition is met", () => {
    // This is the whole feature: exploring a line means moving both sides by
    // hand, and an engine that answered would drag the position away from
    // whatever was being looked at.
    expect(aiMayReply({ ...LIVE, analysis: true })).toBe(false);
  });

  it("does not, in analysis, on either side's turn", () => {
    for (const turn of ["attackers", "defenders"] as Side[]) {
      expect(aiMayReply({ ...LIVE, analysis: true, turn })).toBe(false);
    }
  });

  it("keeps live play's own conditions unchanged", () => {
    expect(aiMayReply({ ...LIVE, atTip: false })).toBe(false); // browsing history
    expect(aiMayReply({ ...LIVE, gameOver: true })).toBe(false);
    expect(aiMayReply({ ...LIVE, paused: true })).toBe(false);
    expect(aiMayReply({ ...LIVE, aiSide: null })).toBe(false); // over the board
    expect(aiMayReply({ ...LIVE, turn: "defenders" })).toBe(false); // not its turn
  });
});

describe("analysis guards the autosave", () => {
  it("writes during ordinary play", () => {
    expect(autosaveAllowed({ analysis: false, offeringResume: false })).toBe(true);
  });

  it("never writes while analysing — a scratch line must not overwrite the game", () => {
    // Belt and braces with the enter/exit snapshot: the page-hide autosave can
    // fire at any moment, so the mode itself has to close the door.
    expect(autosaveAllowed({ analysis: true, offeringResume: false })).toBe(false);
  });

  it("still honours the existing resume-offer guard", () => {
    expect(autosaveAllowed({ analysis: false, offeringResume: true })).toBe(false);
    expect(autosaveAllowed({ analysis: true, offeringResume: true })).toBe(false);
  });
});

describe("analysis makes both sides pickable", () => {
  it("hands the board back both sides", () => {
    expect(controllableIn(true, "defenders")).toBeNull();
    expect(controllableIn(true, "attackers")).toBeNull();
    expect(controllableIn(true, null)).toBeNull();
  });

  it("leaves the played side alone otherwise", () => {
    expect(controllableIn(false, "defenders")).toBe("defenders");
    expect(controllableIn(false, "attackers")).toBe("attackers");
    expect(controllableIn(false, null)).toBeNull(); // hotseat: both, as before
  });
});

describe("analysis opens the board up", () => {
  const BASE = {
    analysis: false,
    atTip: true,
    gameOver: false,
    thinking: false,
    paused: false,
    humanSide: "defenders" as Side | null,
    turn: "defenders" as Side,
  };

  it("behaves as before in live play", () => {
    expect(boardIsInteractive(BASE)).toBe(true);
    expect(boardIsInteractive({ ...BASE, turn: "attackers" })).toBe(false);
    expect(boardIsInteractive({ ...BASE, atTip: false })).toBe(false);
    expect(boardIsInteractive({ ...BASE, paused: true })).toBe(false);
  });

  it("accepts the opponent's move in analysis", () => {
    expect(boardIsInteractive({ ...BASE, analysis: true, turn: "attackers" })).toBe(true);
  });

  it("accepts a move from a position stepped back to", () => {
    // Live play requires the tip and offers "play from here"; analysis just
    // lets you push the line on from where you are looking.
    expect(boardIsInteractive({ ...BASE, analysis: true, atTip: false })).toBe(true);
  });

  it("ignores the manual clock hold, which analysis has made irrelevant", () => {
    expect(boardIsInteractive({ ...BASE, analysis: true, paused: true })).toBe(true);
  });

  it("still refuses a finished position and a search in flight", () => {
    expect(boardIsInteractive({ ...BASE, analysis: true, gameOver: true })).toBe(false);
    expect(boardIsInteractive({ ...BASE, analysis: true, thinking: true })).toBe(false);
  });
});

describe("where an explored move is appended", () => {
  it("appends to the tip in live play, whatever the cursor says", () => {
    expect(commitBasePly(false, 2, 7)).toBe(7);
  });

  it("branches from the viewed position in analysis, truncating the future", () => {
    // Today's single-line behaviour, kept deliberately: variation *trees* are
    // Session 7c. A move from ply 2 of a 7-ply line rewrites plies 3+.
    expect(commitBasePly(true, 2, 7)).toBe(2);
  });

  it("is the same thing at the tip — live play's cursor is always the tip", () => {
    expect(commitBasePly(true, 7, 7)).toBe(commitBasePly(false, 7, 7));
  });
});

describe("the live game is put aside, not copied over", () => {
  it("holds the timeline, the cursor and the clock line together", () => {
    // The clock line's per-ply banks are index-aligned to the timeline, so a
    // snapshot that kept one without the other would hand back another line's
    // times on the next rewind.
    const states = [initialState()];
    const line = initialClockLine({ initialSeconds: 180, incrementSeconds: 2 });
    const snap = snapshotFor(states, 0, line);
    expect(snap.states).toBe(states);
    expect(snap.cursor).toBe(0);
    expect(snap.clockLine).toBe(line);
  });
});
