// ── The Copenhagen AI-level cap (WP-4.2, feature 1) ──────────────────────────
// Pure tests for difficultyCap.ts. The engine's own DIFFICULTIES/DIFFICULTY
// stay untouched by this file — see engine.test.ts for those; this only tests
// the UI/persistence cap layered on top.
import { describe, expect, it } from "vitest";
import { DIFFICULTIES } from "./engine";
import {
  COPENHAGEN_MAX_DIFFICULTY,
  clampDifficulty,
  isDifficultyOffered,
  offeredDifficulties,
} from "./difficultyCap";

describe("difficultyCap", () => {
  it("caps at medium", () => {
    expect(COPENHAGEN_MAX_DIFFICULTY).toBe("medium");
  });

  it("offers easy and medium, and no others", () => {
    expect(offeredDifficulties()).toEqual(["easy", "medium"]);
  });

  it("reports easy and medium as offered", () => {
    expect(isDifficultyOffered("easy")).toBe(true);
    expect(isDifficultyOffered("medium")).toBe(true);
  });

  it("reports hard and ollamh as not offered", () => {
    expect(isDifficultyOffered("hard")).toBe(false);
    expect(isDifficultyOffered("ollamh")).toBe(false);
  });

  it("never disagrees with the engine's own ladder about what a difficulty is", () => {
    // offeredDifficulties() must be a subset of DIFFICULTIES in the same order —
    // it filters the ladder, it never invents one of its own.
    const offered = offeredDifficulties();
    expect(DIFFICULTIES.filter((d) => offered.includes(d))).toEqual(offered);
  });

  it("clamps hard and ollamh down to medium", () => {
    expect(clampDifficulty("hard")).toBe("medium");
    expect(clampDifficulty("ollamh")).toBe("medium");
  });

  it("leaves easy and medium alone", () => {
    expect(clampDifficulty("easy")).toBe("easy");
    expect(clampDifficulty("medium")).toBe("medium");
  });
});
