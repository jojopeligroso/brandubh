// ── The menu-toggle hamburger on CopenhagenScreen (WP-4.1a, feature 4) ──────
// The Copenhagen twin of TablutScreen.menuToggle.test.ts — same SSR technique
// (see that file's module doc for why this works without jsdom), same reason:
// commit 90c3cad added this hamburger and nothing tested it. This proves the
// control exists and is wired to `drawerOpen` via `aria-expanded`; that a
// click actually calls `onOpenDrawer` is asserted by the driven-browser
// `npm run check:copenhagen`.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CopenhagenScreen from "./CopenhagenScreen";
import { translations } from "../i18n";
import { defaultZenConfig } from "../zen";
import { ATTACKER_EMBLEMS } from "../emblems";
import { DEFENDER_EMBLEMS } from "../defenderEmblems";
import { KING_EMBLEMS } from "../kingEmblems";
import { CORNER_EMBLEMS } from "../cornerEmblems";

function renderScreen(drawerOpen: boolean) {
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
      drawerOpen,
      onOpenDrawer: () => {},
    }),
  );
}

/** The whole opening tag of the hamburger button, attributes in whatever
 *  order React chose to serialize them in. */
function menuToggleTag(html: string): string | null {
  const m = html.match(/<button[^>]*data-testid="menu-toggle"[^>]*>/);
  return m ? m[0] : null;
}

describe("CopenhagenScreen menu-toggle", () => {
  it("carries the shared app-drawer hamburger with the menu-toggle testid", () => {
    expect(menuToggleTag(renderScreen(false))).not.toBeNull();
  });

  it("tracks the drawer's own open state via aria-expanded, not a state of its own", () => {
    expect(menuToggleTag(renderScreen(false))).toContain('aria-expanded="false"');
    expect(menuToggleTag(renderScreen(true))).toContain('aria-expanded="true"');
  });
});
