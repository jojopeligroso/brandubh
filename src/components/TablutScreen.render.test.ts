// ── Board-flip render checks for TablutScreen (WP-4.1a, feature 2) ──────────
//
// This project's suites are pure logic with no jsdom (see CLAUDE.md) — there is
// no fireEvent, no click, no fixture DOM. But `react-dom/server`'s
// `renderToStaticMarkup` runs a component's render body in plain Node with no
// browser globals at all, which is enough to check that a stored flip flag
// changes what gets drawn: the cells are rendered in `fromView` order (see
// `src/components/Board.tsx`), so a flip changes *which* board square lands
// first in the DOM, not just a CSS transform. It cannot fire a click, so the
// interactive half — the flip button in the toolbar menu actually toggling the
// stored flag — is asserted by the driven-browser `npm run check:tablut`
// instead. See TablutScreen.menuToggle.test.ts for the sibling check on the
// hamburger this file no longer covers.
import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TablutScreen from "./TablutScreen";
import { translations } from "../i18n";
import { defaultZenConfig } from "../zen";
import { ATTACKER_EMBLEMS } from "../emblems";
import { DEFENDER_EMBLEMS } from "../defenderEmblems";
import { KING_EMBLEMS } from "../kingEmblems";
import { CORNER_EMBLEMS } from "../cornerEmblems";

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

function renderScreen() {
  return renderToStaticMarkup(
    createElement(TablutScreen, {
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

/** The label on the very first gridcell in DOM order — `fromView` maps view
 *  position (0, 0) back to whichever board square is drawn there, so this is
 *  the same thing `scripts/tablut-smoke.mjs` reads off the real board. */
function firstCellLabel(html: string): string | null {
  const m = html.match(/role="gridcell"[^>]*aria-label="([^"]+)"/);
  return m ? m[1] : null;
}

describe("TablutScreen render", () => {
  it("draws the board unflipped by default: the top-left square is a9", () => {
    const html = renderScreen();
    expect(firstCellLabel(html)).toBe("a9");
  });

  it("flips the rendered grid when tablut.boardFlipped is stored", () => {
    localStorage.setItem("tablut.boardFlipped", "1");
    const html = renderScreen();
    // East–west flip: the top-left square is now the far end of the top rank.
    expect(firstCellLabel(html)).toBe("i9");
  });

  it("flips the rendered grid the other way when tablut.boardFlippedV is stored", () => {
    localStorage.setItem("tablut.boardFlippedV", "1");
    const html = renderScreen();
    // North–south flip: the top-left square is now the far end of the left file.
    expect(firstCellLabel(html)).toBe("a1");
  });

  it("keeps Tablut's flip preference independent of a Brandubh flip flag", () => {
    localStorage.setItem("brandubh.boardFlipped", "1");
    const html = renderScreen();
    expect(firstCellLabel(html)).toBe("a9");
  });
});
