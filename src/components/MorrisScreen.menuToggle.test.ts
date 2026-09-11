// ── The menu-toggle hamburger on MorrisScreen ─────────────────────────────────
// The Morris twin of CopenhagenScreen.menuToggle.test.ts — same SSR technique
// (see MorrisScreen.render.test.ts for why this works without jsdom), same
// reason: every full-screen surface carries the app drawer's hamburger, and the
// drawer is the only way between the four boards. This proves the control exists
// and is wired to `drawerOpen` via `aria-expanded`; that a click actually calls
// `onOpenDrawer` — and that opening another board from in here closes this one —
// is asserted by the driven-browser `npm run check:morris`.
import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MorrisScreen from "./MorrisScreen";
import { translations } from "../i18n";
import { defaultZenConfig } from "../zen";
import { ATTACKER_EMBLEMS } from "../emblems";
import { DEFENDER_EMBLEMS } from "../defenderEmblems";
import { KING_EMBLEMS } from "../kingEmblems";
import { CORNER_EMBLEMS } from "../cornerEmblems";

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

function renderScreen(drawerOpen: boolean) {
  return renderToStaticMarkup(
    createElement(MorrisScreen, {
      t: translations.en,
      zen: defaultZenConfig(),
      onZenEnabled: () => {},
      attackerEmblem: ATTACKER_EMBLEMS[0],
      kingEmblem: KING_EMBLEMS[0],
      defenderEmblem: DEFENDER_EMBLEMS[0],
      cornerEmblem: CORNER_EMBLEMS[0],
      onClose: () => {},
      drawerOpen,
      onOpenDrawer: () => {},
    }),
  );
}

/** The whole opening tag of the hamburger button, attributes in whatever order
 *  React chose to serialize them in. */
function menuToggleTag(html: string): string | null {
  const m = html.match(/<button[^>]*data-testid="menu-toggle"[^>]*>/);
  return m ? m[0] : null;
}

describe("MorrisScreen menu-toggle", () => {
  it("carries the shared app-drawer hamburger with the menu-toggle testid", () => {
    expect(menuToggleTag(renderScreen(false))).not.toBeNull();
  });

  it("tracks the drawer's own open state via aria-expanded, not a state of its own", () => {
    expect(menuToggleTag(renderScreen(false))).toContain('aria-expanded="false"');
    expect(menuToggleTag(renderScreen(true))).toContain('aria-expanded="true"');
  });

  it("carries the Zen switch under this surface's own test id", () => {
    // One Zen preference across every board (App owns it), four places it can be
    // switched — so the ids have to differ or a driven browser cannot tell which
    // surface it just clicked.
    expect(renderScreen(false)).toContain('data-testid="morris-zen-toggle"');
  });
});
