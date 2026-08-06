import { describe, expect, it } from "vitest";
import {
  ZEN_DEFAULT_EXTRAS,
  ZEN_EXTRAS,
  ZEN_EXTRAS_VERSION,
  defaultZenConfig,
  parseZenExtras,
  upgradeZenExtras,
} from "./zen";

describe("zen config", () => {
  it("defaults to on, hiding every extra bar the ones Zen ships with", () => {
    // The calm board is what a new player is shown, rather than a mode they
    // have to find first. The extras keep their own defaults either way.
    const cfg = defaultZenConfig();
    expect(cfg.enabled).toBe(true);
    for (const id of ZEN_EXTRAS) {
      expect(cfg.extras[id]).toBe(ZEN_DEFAULT_EXTRAS.includes(id));
    }
  });

  it("keeps the move navigator on by default", () => {
    // Stepping back through the moves just played is part of reading the board,
    // and with everything else stripped away it is the only route back to a
    // position already left behind. Still an extra, so it can be switched off.
    expect(ZEN_DEFAULT_EXTRAS).toContain("nav");
    expect(ZEN_EXTRAS).toContain("nav");
    expect(defaultZenConfig().extras.nav).toBe(true);
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
    const extras = parseZenExtras(JSON.stringify({ nav: false, resign: true, bogus: true }));
    // A stored flag wins over the default, off as readily as on.
    expect(extras.nav).toBe(false);
    expect(extras.resign).toBe(true);
    expect(extras.captured).toBe(false);
    expect((extras as Record<string, unknown>).bogus).toBeUndefined();
  });

  it("falls back to the defaults on null or malformed input", () => {
    for (const id of ZEN_EXTRAS) {
      const expected = ZEN_DEFAULT_EXTRAS.includes(id);
      expect(parseZenExtras(null)[id]).toBe(expected);
      expect(parseZenExtras("not json")[id]).toBe(expected);
    }
  });

  it("switches newly-defaulted extras on for a map written before they existed", () => {
    // Old builds spelled out `false` for every extra they knew about, so without
    // this a new default would never reach anyone who had already opened Zen.
    const stored = parseZenExtras(JSON.stringify({ nav: false, resign: true }));
    const upgraded = upgradeZenExtras(stored, null);
    expect(upgraded.nav).toBe(true);
    expect(upgraded.resign).toBe(true);
    expect(upgraded.captured).toBe(false);
  });

  it("leaves a map already stamped with the current version alone", () => {
    const stored = parseZenExtras(JSON.stringify({ nav: false }));
    const kept = upgradeZenExtras(stored, String(ZEN_EXTRAS_VERSION));
    expect(kept.nav).toBe(false);
  });
});
