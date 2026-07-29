import { describe, expect, it } from "vitest";
import {
  BOARD_ELEMENTS,
  defaultDisplay,
  isAllShown,
  isZen,
  parseDisplayShow,
  showAllPreset,
  zenPreset,
} from "./zen";

describe("display config", () => {
  it("defaults to everything shown", () => {
    const cfg = defaultDisplay();
    for (const id of BOARD_ELEMENTS) expect(cfg.show[id]).toBe(true);
    expect(isAllShown(cfg.show)).toBe(true);
    expect(isZen(cfg.show)).toBe(false);
  });

  it("zen preset hides every optional panel", () => {
    const show = zenPreset();
    for (const id of BOARD_ELEMENTS) expect(show[id]).toBe(false);
    expect(isZen(show)).toBe(true);
    expect(isAllShown(show)).toBe(false);
  });

  it("show-all preset reveals every optional panel", () => {
    expect(isAllShown(showAllPreset())).toBe(true);
  });

  it("parses a stored show map, keeping only known boolean flags", () => {
    const show = parseDisplayShow(JSON.stringify({ nav: false, resign: false, bogus: true }));
    expect(show.nav).toBe(false);
    expect(show.resign).toBe(false);
    // Missing keys default to visible.
    expect(show.captured).toBe(true);
    expect((show as Record<string, unknown>).bogus).toBeUndefined();
  });

  it("falls back to all-shown on null or malformed input", () => {
    for (const id of BOARD_ELEMENTS) {
      expect(parseDisplayShow(null)[id]).toBe(true);
      expect(parseDisplayShow("not json")[id]).toBe(true);
    }
  });
});
