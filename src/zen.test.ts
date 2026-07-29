import { describe, expect, it } from "vitest";
import { ZEN_ELEMENTS, defaultZenConfig, parseZenShow } from "./zen";

describe("zen config", () => {
  it("defaults to off with every optional panel hidden", () => {
    const cfg = defaultZenConfig();
    expect(cfg.enabled).toBe(false);
    for (const id of ZEN_ELEMENTS) expect(cfg.show[id]).toBe(false);
  });

  it("parses a stored show map, keeping only known boolean flags", () => {
    const show = parseZenShow(JSON.stringify({ nav: true, resign: true, bogus: true }));
    expect(show.nav).toBe(true);
    expect(show.resign).toBe(true);
    expect(show.captured).toBe(false);
    expect((show as Record<string, unknown>).bogus).toBeUndefined();
  });

  it("falls back to all-hidden on null or malformed input", () => {
    for (const id of ZEN_ELEMENTS) {
      expect(parseZenShow(null)[id]).toBe(false);
      expect(parseZenShow("not json")[id]).toBe(false);
    }
  });
});
