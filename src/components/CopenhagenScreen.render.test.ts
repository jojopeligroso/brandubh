// ── Board-flip render checks for CopenhagenScreen (WP-4.1a, feature 2) ──────
// The Copenhagen twin of TablutScreen.render.test.ts — same SSR technique, same
// reason: no jsdom in this project (see CLAUDE.md), so `react-dom/server`'s
// `renderToStaticMarkup` is what stands in for a component test here. It
// proves a stored flip flag changes which square is drawn first; it cannot
// fire a click, which is why `npm run check:copenhagen` carries the
// interactive half. See CopenhagenScreen.menuToggle.test.ts for the sibling
// check on the hamburger this file no longer covers.
import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CopenhagenScreen from "./CopenhagenScreen";
import { translations } from "../i18n";
import { defaultZenConfig } from "../zen";
import { ATTACKER_EMBLEMS } from "../emblems";
import { DEFENDER_EMBLEMS } from "../defenderEmblems";
import { KING_EMBLEMS } from "../kingEmblems";
import { CORNER_EMBLEMS } from "../cornerEmblems";

/** The suites are pure logic with no jsdom (see CLAUDE.md), so storage is a
 *  map. Same stand-in `game/copenhagen/persist.test.ts` uses. */
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

function renderScreen() {
  return renderToStaticMarkup(
    createElement(CopenhagenScreen, {
      t: translations.en,
      zen: defaultZenConfig(),
      onZenEnabled: () => {},
      attackerEmblem: ATTACKER_EMBLEMS[0],
      kingEmblem: KING_EMBLEMS[0],
      defenderEmblem: DEFENDER_EMBLEMS[0],
      cornerEmblem: CORNER_EMBLEMS[0],
      onClose: () => {},
      drawerOpen: false,
      onOpenDrawer: () => {},
    }),
  );
}

function firstCellLabel(html: string): string | null {
  const m = html.match(/role="gridcell"[^>]*aria-label="([^"]+)"/);
  return m ? m[1] : null;
}

describe("CopenhagenScreen render", () => {
  it("draws the board unflipped by default: the top-left square is a11", () => {
    const html = renderScreen();
    expect(firstCellLabel(html)).toBe("a11");
  });

  it("flips the rendered grid when copenhagen.boardFlipped is stored", () => {
    localStorage.setItem("copenhagen.boardFlipped", "1");
    const html = renderScreen();
    // East–west flip: the top-left square is now the far end of the top rank.
    expect(firstCellLabel(html)).toBe("k11");
  });

  it("flips the rendered grid the other way when copenhagen.boardFlippedV is stored", () => {
    localStorage.setItem("copenhagen.boardFlippedV", "1");
    const html = renderScreen();
    // North–south flip: the top-left square is now the far end of the left file.
    expect(firstCellLabel(html)).toBe("a1");
  });

  it("keeps Copenhagen's flip preference independent of Tablut's and Brandubh's", () => {
    localStorage.setItem("tablut.boardFlipped", "1");
    localStorage.setItem("brandubh.boardFlipped", "1");
    const html = renderScreen();
    expect(firstCellLabel(html)).toBe("a11");
  });
});
