import { describe, expect, it } from "vitest";
import { ZEN_EXTRAS, defaultZenConfig, parseZenExtras } from "./zen";

describe("zen config", () => {
  it("defaults to off with every optional extra hidden", () => {
    const cfg = defaultZenConfig();
    expect(cfg.enabled).toBe(false);
    for (const id of ZEN_EXTRAS) expect(cfg.extras[id]).toBe(false);
  });

  it("treats the engine eval as an opt-in extra, so Zen hides it by default", () => {
    // The eval bar + best-move arrow tell you who is winning before you have
    // worked it out, which is the opposite of what Zen is for. The blanket
    // default above already proves it starts hidden; this pins that it is in
    // the list at all, and so is reachable from the settings picker.
    expect(ZEN_EXTRAS).toContain("eval");
    expect(defaultZenConfig().extras.eval).toBe(false);
  });

  it("does not treat game-flow controls as an extra", () => {
    // Progression (New game / Next set / New match) is contextual, never a
    // toggle, so it must not appear in the opt-in extras list.
    expect(ZEN_EXTRAS).not.toContain("controls");
  });

  it("parses a stored extras map, keeping only known boolean flags", () => {
    const extras = parseZenExtras(JSON.stringify({ nav: true, resign: true, bogus: true }));
    expect(extras.nav).toBe(true);
    expect(extras.resign).toBe(true);
    expect(extras.captured).toBe(false);
    expect((extras as Record<string, unknown>).bogus).toBeUndefined();
  });

  it("falls back to all-hidden on null or malformed input", () => {
    for (const id of ZEN_EXTRAS) {
      expect(parseZenExtras(null)[id]).toBe(false);
      expect(parseZenExtras("not json")[id]).toBe(false);
    }
  });
});
