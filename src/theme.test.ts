import { describe, expect, it } from "vitest";
import { OFF_BOARD_FALLBACK, THEMES, isThemeId, resolveTheme } from "./theme";

describe("board-specific themes", () => {
  it("keeps Ballinderry on the Brandubh board", () => {
    expect(resolveTheme("ballinderry", false)).toBe("ballinderry");
  });

  it("falls back to Gokstad on the Tablut surface", () => {
    // Ballinderry is a 7×7 board of 49 drilled holes traced back to a real
    // object (docs/ballinderry-board.md), not a palette. Painting it on the 9×9
    // would draw an 81-hole board that never existed.
    expect(resolveTheme("ballinderry", true)).toBe(OFF_BOARD_FALLBACK);
    expect(OFF_BOARD_FALLBACK).toBe("gokstad");
  });

  it("leaves every other theme alone on both surfaces", () => {
    // The fallback is a rule about one theme, not a licence to repaint Tablut:
    // anything that is only colours belongs on both boards equally.
    for (const { id } of THEMES) {
      if (id === "ballinderry") continue;
      expect(resolveTheme(id, true)).toBe(id);
      expect(resolveTheme(id, false)).toBe(id);
    }
  });

  it("resolves to a theme that exists", () => {
    // A fallback naming a theme index.css has no block for would paint nothing
    // and take the app's tokens with it.
    expect(isThemeId(OFF_BOARD_FALLBACK)).toBe(true);
    expect(THEMES.some((t) => t.id === OFF_BOARD_FALLBACK)).toBe(true);
  });
});
