// ── App's boardgame-surface mutual exclusion (WP-4.1a, feature 4) ───────────
//
// commit 90c3cad added a hamburger to both Tablut and Copenhagen (see
// TablutScreen.render.test.ts / CopenhagenScreen.render.test.ts for that half)
// and a mutual-exclusion rule in App: opening one boardgame surface closes the
// other, and opening the setup overlay closes both. None of it was tested.
//
// The interactive half — clicking the drawer's "Tablut" row while Copenhagen is
// open, or "New game" while a boardgame surface is open — needs a real click
// event, which this project's suites cannot fire (no jsdom; see CLAUDE.md).
// That half is asserted by the driven-browser `npm run check:tablut` /
// `check:copenhagen` instead. What *is* testable here, with `react-dom/server`
// (see TablutScreen.render.test.ts for why this works without jsdom), is the
// guard `App.tsx` itself documents at its `showTablut`/`showCopenhagen`
// `useState` calls: "if a hand-edited localStorage ever said otherwise, the
// render order below picks one rather than stacking them." A corrupted
// surface-flag pair is exactly the state the drawer's mutual exclusion exists
// to prevent, so seeding it directly is the way to observe the guard without a
// click.
import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";

/** The suites are pure logic with no jsdom (see CLAUDE.md), so storage is a
 *  map. Same stand-in `game/tablut/persist.test.ts` uses. */
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

const hasTablutScreen = (html: string) => html.includes('class="tablut-screen');
const hasCopenhagenScreen = (html: string) => html.includes('class="copenhagen-screen');

describe("boardgame surface mutual exclusion", () => {
  it("mounts neither boardgame surface when neither was left open", () => {
    const html = renderToStaticMarkup(createElement(App));
    expect(hasTablutScreen(html)).toBe(false);
    expect(hasCopenhagenScreen(html)).toBe(false);
  });

  it("mounts only Tablut when tablut.surface.v1 alone was left open", () => {
    localStorage.setItem("tablut.surface.v1", "1");
    const html = renderToStaticMarkup(createElement(App));
    expect(hasTablutScreen(html)).toBe(true);
    expect(hasCopenhagenScreen(html)).toBe(false);
  });

  it("mounts only Copenhagen when copenhagen.surface.v1 alone was left open", () => {
    localStorage.setItem("copenhagen.surface.v1", "1");
    const html = renderToStaticMarkup(createElement(App));
    expect(hasTablutScreen(html)).toBe(false);
    expect(hasCopenhagenScreen(html)).toBe(true);
  });

  it("picks one rather than stacking them when both surface flags are set", () => {
    // The two flags are written by independent modules that know nothing of
    // each other (see the comment at App's own useState calls), so nothing
    // stops a hand-edited or racily-written localStorage saying both are
    // open. The render order must still show exactly one boardgame surface.
    localStorage.setItem("tablut.surface.v1", "1");
    localStorage.setItem("copenhagen.surface.v1", "1");
    const html = renderToStaticMarkup(createElement(App));
    expect(hasTablutScreen(html)).toBe(true);
    expect(hasCopenhagenScreen(html)).toBe(false);
  });
});
