// ── The menu-toggle hamburger on TablutScreen (WP-4.1a, feature 4) ──────────
//
// commit 90c3cad added a hamburger (data-testid="menu-toggle") to the Tablut
// and Copenhagen screens, wired to the shared `onOpenDrawer` prop. Untested
// until now. This project's suites are pure logic with no jsdom (see
// CLAUDE.md), so there is no fireEvent to prove a click *calls* the prop —
// `react-dom/server`'s `renderToStaticMarkup` (see the module doc on
// TablutScreen.render.test.ts for how this works without a browser) can only
// prove the control *exists* and is wired to the right prop's presence
// (`aria-expanded` tracking `drawerOpen`). That the click actually invokes
// `onOpenDrawer` is asserted by the driven-browser `npm run check:tablut`,
// which is this project's real mechanism for anything that needs an event to
// fire.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TablutScreen from "./TablutScreen";
import { translations } from "../i18n";
import { defaultZenConfig } from "../zen";
import { ATTACKER_EMBLEMS } from "../emblems";
import { DEFENDER_EMBLEMS } from "../defenderEmblems";
import { KING_EMBLEMS } from "../kingEmblems";
import { CORNER_EMBLEMS } from "../cornerEmblems";

function renderScreen(drawerOpen: boolean) {
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

describe("TablutScreen menu-toggle", () => {
  it("carries the shared app-drawer hamburger with the menu-toggle testid", () => {
    expect(menuToggleTag(renderScreen(false))).not.toBeNull();
  });

  it("tracks the drawer's own open state via aria-expanded, not a state of its own", () => {
    // App owns `drawerOpen`; this screen only reports it and asks to open it —
    // see the prop doc at TablutScreen's own parameter list.
    expect(menuToggleTag(renderScreen(false))).toContain('aria-expanded="false"');
    expect(menuToggleTag(renderScreen(true))).toContain('aria-expanded="true"');
  });
});
