// ── App's boardgame-surface mutual exclusion ─────────────────────────────────
//
// commit 90c3cad added a hamburger to both Tablut and Copenhagen (see
// TablutScreen.render.test.ts / CopenhagenScreen.render.test.ts for that half)
// and a mutual-exclusion rule in App: opening one boardgame surface closes the
// others, and opening the setup overlay closes all of them. None of it was
// tested. Morris made it a **three**-way rule (ADR-0008), which is the thing
// this file now has to keep honest: the conditions grow quadratically in the
// flags, so the pairs to check grow with them — one pair for two surfaces,
// three for three — and every one of them is written out in `App.tsx` by hand.
//
// The interactive half — clicking the drawer's "Tablut" row while Copenhagen is
// open, or "New game" while a boardgame surface is open — needs a real click
// event, which this project's suites cannot fire (no jsdom; see CLAUDE.md).
// That half is asserted by the driven-browser `npm run check:tablut` /
// `check:copenhagen` / `check:morris` instead. What *is* testable here, with
// `react-dom/server` (see TablutScreen.render.test.ts for why this works
// without jsdom), is the guard `App.tsx` itself documents at its
// `showTablut`/`showCopenhagen`/`showMorris` `useState` calls: "if a
// hand-edited localStorage ever said otherwise, the render order below picks
// one rather than stacking them." A corrupted surface-flag pair is exactly the
// state the drawer's mutual exclusion exists to prevent, so seeding it directly
// is the way to observe the guard without a click.
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

/** The three surface keys, and the class each one's screen renders with. */
const SURFACES = [
  { key: "tablut.surface.v1", cls: "tablut-screen" },
  { key: "copenhagen.surface.v1", cls: "copenhagen-screen" },
  { key: "morris.surface.v1", cls: "morris-screen" },
] as const;

const mounted = (html: string): string[] =>
  SURFACES.filter((s) => html.includes(`class="${s.cls}`)).map((s) => s.cls);

const render = () => renderToStaticMarkup(createElement(App));

describe("boardgame surface mutual exclusion", () => {
  it("mounts no boardgame surface when none was left open", () => {
    expect(mounted(render())).toEqual([]);
  });

  it.each(SURFACES)("mounts only $cls when $key alone was left open", ({ key, cls }) => {
    localStorage.setItem(key, "1");
    expect(mounted(render())).toEqual([cls]);
  });

  it("picks exactly one for every pair of flags that could be set at once", () => {
    // The flags are written by independent modules that know nothing of each
    // other (see the comment at App's own useState calls), so nothing stops a
    // hand-edited or racily-written localStorage saying two are open. The render
    // order must still show exactly one boardgame surface — for every pair, which
    // is the count that grew when the fourth board arrived.
    for (const a of SURFACES) {
      for (const b of SURFACES) {
        if (a === b) continue;
        localStorage.clear();
        localStorage.setItem(a.key, "1");
        localStorage.setItem(b.key, "1");
        expect(mounted(render()), `${a.key} + ${b.key}`).toHaveLength(1);
      }
    }
  });

  it("picks exactly one even with all three flags set", () => {
    for (const s of SURFACES) localStorage.setItem(s.key, "1");
    expect(mounted(render())).toEqual(["tablut-screen"]);
  });

  it("keeps the priority order the mount gates spell out", () => {
    // Not an accident of JSX order: `showCopenhagen && !showTablut` and
    // `showMorris && !showTablut && !showCopenhagen` say it outright, so Tablut
    // wins over Copenhagen and Copenhagen over Morris. Pinned because the
    // *resolution* is what stops two surfaces stacking, and any future
    // `surface`-enum refactor has to preserve it or a corrupted pair changes
    // which board a reload lands on.
    localStorage.setItem("copenhagen.surface.v1", "1");
    localStorage.setItem("morris.surface.v1", "1");
    expect(mounted(render())).toEqual(["copenhagen-screen"]);
  });
});
