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

/** The setup sheet's tier row is a run of plain `<button>…text…</button>`
 *  elements (no aria-label), so the button carrying one exact label is found
 *  by its inner text rather than by role/name — `getByRole` needs a live DOM,
 *  which this SSR technique does not have (see CLAUDE.md). */
function buttonHtmlByText(html: string, text: string): string | null {
  const matches = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  return matches.find((b) => b.includes(`>${text}<`)) ?? null;
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

// ── WP-4.2, feature 1: the Hard/Ollamh tier cap ──────────────────────────────

describe("CopenhagenScreen render — the tier cap", () => {
  it("renders Hard and Ollamh disabled, and Easy and Medium enabled", () => {
    // Checked against the native `disabled=""` React renders for a true
    // boolean prop specifically — `aria-disabled="true"` also contains the
    // substring "disabled", so a bare `.toContain("disabled")` would pass
    // even if the real `disabled` attribute were missing entirely.
    const html = renderScreen();
    expect(buttonHtmlByText(html, "Hard")).toContain('disabled=""');
    expect(buttonHtmlByText(html, "Ollamh")).toContain('disabled=""');
    expect(buttonHtmlByText(html, "Easy")).not.toContain('disabled=""');
    expect(buttonHtmlByText(html, "Medium")).not.toContain('disabled=""');
  });

  it("marks the disabled tiers aria-disabled", () => {
    const html = renderScreen();
    expect(buttonHtmlByText(html, "Hard")).toContain('aria-disabled="true"');
    expect(buttonHtmlByText(html, "Ollamh")).toContain('aria-disabled="true"');
    expect(buttonHtmlByText(html, "Easy")).not.toContain("aria-disabled");
    expect(buttonHtmlByText(html, "Medium")).not.toContain("aria-disabled");
  });

  it("explains the cap on the setup sheet", () => {
    const html = renderScreen();
    expect(html).toContain(translations.en.copenhagenTierCapNotice);
  });

  it("also says so when a resumed save was clamped down from ollamh", () => {
    // A save at ollamh with no match progress would be treated as "nothing to
    // resume" (see loadResumableGame's own guard), so this needs one real ply
    // before the difficulty is what gets clamped.
    localStorage.setItem(
      "copenhagen.game.v1",
      JSON.stringify({
        v: 1,
        id: "g1",
        // The screen's own restore call has no injected clock, so this has to
        // be genuinely recent or the save reads as stale and is discarded —
        // see MAX_SAVE_AGE_MS in game/copenhagen/persist.ts.
        createdAt: Date.now(),
        savedAt: Date.now(),
        variantId: "copenhagen",
        customRules: {},
        playMode: "attackers",
        difficulty: "ollamh",
        // d1-d3: the same first ply persist.test.ts's SHORT sequence opens
        // with, verified legal there against the real engine.
        moves: [[10, 3, 8, 3, 0]],
        status: "playing",
        cursor: 1,
        recorded: false,
        clock: null,
        match: null,
        gamesPerSet: 2,
        names: { p1: "", p2: "" },
      }),
    );
    const html = renderScreen();
    // The clamp opens the sheet itself, rather than leaving the explanation
    // reachable only if the player happens to revisit Strength later.
    expect(html).toContain(translations.en.copenhagenTierCapClamped);
  });
});

// ── WP-4.2, feature 2: the human-vs-computer results line ────────────────────

describe("CopenhagenScreen render — the AI results line", () => {
  it("shows nothing with no games recorded", () => {
    const html = renderScreen();
    expect(html).not.toContain(translations.en.aiResultsLabel);
  });

  it("shows the compact per-tier record with seeded storage", () => {
    const win = { rulesetId: "copenhagen", difficulty: "easy", humanSide: "defenders", result: "win", endedAt: 1 };
    const loss = { rulesetId: "copenhagen", difficulty: "medium", humanSide: "defenders", result: "loss", endedAt: 1 };
    localStorage.setItem(
      "copenhagen.aiResults.v1",
      JSON.stringify([win, win, win, { ...win, result: "loss" }, loss, loss, loss, loss]),
    );
    const html = renderScreen();
    expect(html).toContain(translations.en.aiResultsLabel);
    expect(html).toContain("Easy 3-1-0");
    expect(html).toContain("Medium 0-4-0");
  });
});
