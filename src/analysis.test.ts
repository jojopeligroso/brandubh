import { describe, expect, it } from "vitest";
import {
  aiMayReply,
  analysisAvailable,
  autosaveAllowed,
  boardIsInteractive,
  controllableIn,
  inlineToolVisible,
  settingsStackVisible,
} from "./analysis";
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
    // What the autosave reads is the *derived* line, which in analysis is a
    // variation from the tree rather than the game; the page-hide autosave can
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

describe("analysis hides the settings stack", () => {
  it("shows the stack in ordinary play, when Zen allows it", () => {
    expect(settingsStackVisible({ analysis: false, settingsExtra: true })).toBe(true);
  });

  it("hides it while analysing — analysis reads the past game, not the next one", () => {
    // "Play as", "AI level" and the variant picker configure a future game;
    // analysis is about the one just played. The new game keeps its own doors:
    // the toolbar's new-game action, the mode overlay, the settings modal.
    expect(settingsStackVisible({ analysis: true, settingsExtra: true })).toBe(false);
  });

  it("still honours Zen's hiding of the same stack", () => {
    expect(settingsStackVisible({ analysis: false, settingsExtra: false })).toBe(false);
    expect(settingsStackVisible({ analysis: true, settingsExtra: false })).toBe(false);
  });
});

describe("analysis moves the tool cards into the toolbar menu", () => {
  it("shows a tool card inline outside analysis, when Zen allows it", () => {
    expect(inlineToolVisible({ analysis: false, extra: true })).toBe(true);
  });

  it("hides it while analysing — the action lives in the menu instead", () => {
    // Lichess-fashion: the analysis page keeps the board, the review, the log
    // and the variations; "play from here", position setup and the game file
    // become rows of the bottom toolbar's menu.
    expect(inlineToolVisible({ analysis: true, extra: true })).toBe(false);
  });

  it("still honours Zen's hiding of the same card", () => {
    expect(inlineToolVisible({ analysis: false, extra: false })).toBe(false);
    expect(inlineToolVisible({ analysis: true, extra: false })).toBe(false);
  });
});

describe("analysisAvailable — the door to the room", () => {
  it("is locked while the game is still being played", () => {
    // Everything analysis offers is help with a position: moving both sides by
    // hand, the eval bar, the best-move arrow, the annotation pass, a pasted
    // position. Offered mid-game that is not analysis, it is assistance.
    expect(analysisAvailable({ liveGameOver: false })).toBe(false);
  });

  it("opens once the game has concluded, however it concluded", () => {
    // Escape, capture, resignation, a draw, a flag — all of them mean the game
    // is no longer being decided by the players, so all of them unlock it. The
    // caller passes `isGameOver(...)`, which is already that whole set.
    expect(analysisAvailable({ liveGameOver: true })).toBe(true);
  });

  it("gates the room, so nothing inside needs a second gate", () => {
    // The eval bar is not gated separately — it is part of analysis and shows
    // when you are in analysis. This is the property that makes that safe: one
    // predicate, one door, nothing to forget to lock.
    const duringPlay = { liveGameOver: false };
    const afterPlay = { liveGameOver: true };
    expect(analysisAvailable(duringPlay)).toBe(false);
    expect(analysisAvailable(afterPlay)).toBe(true);
  });

  it("reads the LIVE result, so a variation cannot lock the door behind you", () => {
    // Once inside, exploring makes the displayed line unfinished again. The
    // game being asked about is still the one that ended, so the caller passes
    // the live game's status and the room stays open.
    expect(analysisAvailable({ liveGameOver: true })).toBe(true);
  });
});
