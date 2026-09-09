import { beforeEach, describe, expect, it } from "vitest";
import { loadFlipFlag, saveFlipFlag } from "./boardFlipPrefs";

/** The suites are pure logic with no jsdom (see CLAUDE.md), so storage is a
 *  map. Same stand-in `game/tablut/persist.test.ts` and `game/persist.test.ts`
 *  use, for the same reason. */
class MemoryStorage {
  private data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
  clear = (): void => this.data.clear();
  key = (i: number): string | null => [...this.data.keys()][i] ?? null;
  get length(): number {
    return this.data.size;
  }
}

beforeEach(() => {
  (globalThis as { localStorage: Storage }).localStorage = new MemoryStorage() as unknown as Storage;
});

describe("loadFlipFlag", () => {
  it("defaults to false when nothing is stored", () => {
    expect(loadFlipFlag("tablut.boardFlipped")).toBe(false);
  });

  it("takes the caller's fallback when nothing is stored", () => {
    expect(loadFlipFlag("tablut.boardFlipped", true)).toBe(true);
  });

  it("reads a stored \"1\" as true and a stored \"0\" as false, ignoring the fallback either way", () => {
    localStorage.setItem("tablut.boardFlipped", "1");
    expect(loadFlipFlag("tablut.boardFlipped", false)).toBe(true);
    localStorage.setItem("tablut.boardFlipped", "0");
    expect(loadFlipFlag("tablut.boardFlipped", true)).toBe(false);
  });

  it("reads anything else stored as false", () => {
    localStorage.setItem("tablut.boardFlipped", "yes");
    expect(loadFlipFlag("tablut.boardFlipped")).toBe(false);
  });
});

describe("saveFlipFlag", () => {
  it("writes \"1\" for true and \"0\" for false", () => {
    saveFlipFlag("tablut.boardFlipped", true);
    expect(localStorage.getItem("tablut.boardFlipped")).toBe("1");
    saveFlipFlag("tablut.boardFlipped", false);
    expect(localStorage.getItem("tablut.boardFlipped")).toBe("0");
  });

  it("round trips through loadFlipFlag", () => {
    saveFlipFlag("copenhagen.boardFlippedV", true);
    expect(loadFlipFlag("copenhagen.boardFlippedV")).toBe(true);
  });
});

describe("per-game keys", () => {
  it("keep Tablut, Copenhagen and Brandubh's own flip preference independent", () => {
    // The whole reason this module exists rather than reusing Brandubh's
    // BOARD_FLIP_H_KEY: flipping one board's picture must never flip another's.
    saveFlipFlag("tablut.boardFlipped", true);
    expect(loadFlipFlag("copenhagen.boardFlipped")).toBe(false);
    expect(loadFlipFlag("brandubh.boardFlipped")).toBe(false);
  });
});
