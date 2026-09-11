// ── Render checks for MorrisScreen ────────────────────────────────────────────
// The Morris twin of CopenhagenScreen.render.test.ts — same SSR technique, same
// reason: no jsdom in this project (see CLAUDE.md), so `react-dom/server`'s
// `renderToStaticMarkup` is what stands in for a component test here. It can
// prove what the first render *contains*; it cannot fire a click, which is why
// `npm run check:morris` carries the interactive half (placing a stone, the
// removal step, the engine's reply).
//
// What is worth asserting here rather than there, because it is cheap and
// because a driven-browser failure is a worse way to find it out:
//
//   • the board draws twenty-four point targets and no twenty-fifth;
//   • a stored flip flag changes which point is drawn left-most — under its own
//     key, not Brandubh's or either tafl board's;
//   • all four difficulty tiers are offered, with none of Copenhagen's
//     `disabled` attributes: the tier cap is that board's and not this one's;
//   • the variant picker offers Custom at all (the editor behind it is component
//     state away and so is a `npm run check:morris` assertion, not this file's).
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

/** The suites are pure logic with no jsdom (see CLAUDE.md), so storage is a map.
 *  Same stand-in `game/morris/persist.test.ts` uses. */
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

/** Zen is **on** by default (see src/zen.ts), which hides the stats strip — so a
 *  test about the strip has to turn it off, exactly as a player would. */
function renderScreen(zen = defaultZenConfig()) {
  return renderToStaticMarkup(
    createElement(MorrisScreen, {
      t: translations.en,
      zen,
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

/** Every point target's `data-point`, in the order they are drawn. */
function pointNames(html: string): string[] {
  return [...html.matchAll(/data-point="([^"]+)"/g)].map((m) => m[1]);
}

/** The setup sheet's rows are plain `<button>…text…</button>` elements (no
 *  aria-label), so the button carrying one exact label is found by its inner
 *  text — `getByRole` needs a live DOM, which this technique does not have. */
function buttonHtmlByText(html: string, text: string): string | null {
  const matches = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  return matches.find((b) => b.includes(`>${text}<`)) ?? null;
}

describe("MorrisScreen render — the board", () => {
  it("draws exactly twenty-four point targets", () => {
    const html = renderScreen();
    expect(pointNames(html)).toHaveLength(24);
    expect(new Set(pointNames(html)).size).toBe(24);
  });

  it("names them a7…a1 per the fixed indexing, starting at the outer ring", () => {
    // The indexing in game/morris/rules.ts: ring*8 + k, k clockwise from each
    // ring's top-left. The first three are the outer ring's top line, which is
    // also a mill.
    expect(pointNames(renderScreen()).slice(0, 8)).toEqual([
      "a7",
      "d7",
      "g7",
      "g4",
      "g1",
      "d1",
      "a1",
      "a4",
    ]);
  });

  it("draws the board unflipped by default: a7 is at the top left", () => {
    const html = renderScreen();
    // The SVG is drawn in board order, so "left-most" is a coordinate rather than
    // a position in the markup — a7 is at x=50 when nothing is flipped.
    expect(html).toMatch(/data-point="a7"[\s\S]{0,400}?cx="50"/);
  });

  it("mirrors where a point is drawn when morris.boardFlipped is stored, never its name", () => {
    localStorage.setItem("morris.boardFlipped", "1");
    const html = renderScreen();
    expect(pointNames(html)).toContain("a7");
    // East–west flip: a7 is now drawn at the right-hand end of the top rank.
    expect(html).toMatch(/data-point="a7"[\s\S]{0,400}?cx="650"/);
  });

  it("mirrors the other way when morris.boardFlippedV is stored", () => {
    localStorage.setItem("morris.boardFlippedV", "1");
    const html = renderScreen();
    expect(html).toMatch(/data-point="a7"[\s\S]{0,400}?cy="650"/);
  });

  it("keeps Morris's flip preference independent of the other three boards'", () => {
    localStorage.setItem("tablut.boardFlipped", "1");
    localStorage.setItem("copenhagen.boardFlipped", "1");
    localStorage.setItem("brandubh.boardFlipped", "1");
    const html = renderScreen();
    expect(html).toMatch(/data-point="a7"[\s\S]{0,400}?cx="50"/);
  });

  it("carries the twenty-four drilled holes the Ballinderry theme shows", () => {
    // Drawn always and hidden by CSS, so switching theme repaints without a
    // re-render — `npm run check:morris` is what checks they are *visible* under
    // that theme and invisible under any other.
    const html = renderScreen();
    expect(html.match(/data-testid="morris-hole"/g) ?? []).toHaveLength(24);
  });
});

describe("MorrisScreen render — the setup sheet", () => {
  it("offers all four difficulty tiers, none of them disabled", () => {
    // The inverse of CopenhagenScreen.render.test.ts's tier-cap assertion, and
    // the reason that one exists: the cap belongs to the 11×11 board's search,
    // not to the ladder (see game/copenhagen/difficultyCap.ts).
    const html = renderScreen();
    for (const tier of ["Easy", "Medium", "Hard", "Ollamh"]) {
      expect(buttonHtmlByText(html, tier), tier).not.toBeNull();
      expect(buttonHtmlByText(html, tier), tier).not.toContain('disabled=""');
      expect(buttonHtmlByText(html, tier), tier).not.toContain("aria-disabled");
    }
  });

  it("states both halves of what Ollamh is", () => {
    // "Perfect once play reaches a shipped table, deep search before that" —
    // docs/solving.md's bar, which neither half may travel without.
    expect(renderScreen()).toContain(translations.en.morrisTablesNote);
  });

  it("offers White, Black and two players as the seats", () => {
    const html = renderScreen();
    expect(buttonHtmlByText(html, "White")).not.toBeNull();
    expect(buttonHtmlByText(html, "Black")).not.toBeNull();
    expect(buttonHtmlByText(html, translations.en.taflHotseat)).not.toBeNull();
  });

  it("opens on the setup sheet on a first visit", () => {
    expect(renderScreen()).toContain(translations.en.morrisBlurb);
  });
});

describe("MorrisScreen render — the AI results line", () => {
  it("shows nothing with no games recorded", () => {
    expect(renderScreen()).not.toContain(translations.en.aiResultsLabel);
  });

  it("reads the record stored under Morris's own key", () => {
    const win = {
      rulesetId: "morris-gasser-1",
      difficulty: "ollamh",
      humanSide: "white",
      result: "win",
      endedAt: 1,
    };
    localStorage.setItem(
      "morris.aiResults.v1",
      JSON.stringify([win, win, { ...win, result: "draw" }]),
    );
    const html = renderScreen();
    expect(html).toContain(translations.en.aiResultsLabel);
    expect(html).toContain("Ollamh 2-0-1");
  });
});

describe("MorrisScreen render — a resumed game", () => {
  /** Three placements and a mill that takes a stone: `d7`, `a7`, `d6`, `a4`,
   *  `d5xa7`, as `[from, to, remove]` triples with −1 for "none" (see
   *  game/morris/persist.ts). Verified legal in persist.test.ts. */
  const SAVE = {
    v: 1,
    id: "g1",
    createdAt: Date.now(),
    savedAt: Date.now(),
    variantId: "morris-gasser-1",
    customRules: {},
    playMode: "white",
    difficulty: "hard",
    moves: [
      [-1, 1, -1],
      [-1, 0, -1],
      [-1, 9, -1],
      [-1, 7, -1],
      [-1, 17, 0],
    ],
    status: "playing",
    cursor: 5,
    recorded: false,
    clock: null,
    match: null,
    gamesPerSet: 1,
    names: { p1: "", p2: "" },
  };

  it("resumes silently, with no setup sheet in the way", () => {
    localStorage.setItem("morris.game.v1", JSON.stringify(SAVE));
    const html = renderScreen();
    expect(html).not.toContain(translations.en.morrisBlurb);
    // The mill took a7, so that point is empty again and `d5` holds a white stone.
    expect(html).toContain('aria-label="d5 white"');
    expect(html).toContain('aria-label="a7"');
  });

  it("shows the stones in hand, the phase and the move count with Zen off", () => {
    localStorage.setItem("morris.game.v1", JSON.stringify(SAVE));
    const html = renderScreen({ ...defaultZenConfig(), enabled: false });
    expect(html).toContain(translations.en.morrisInHand);
    // Three white stones placed and two black, so six and seven left in hand,
    // still in the placing phase five plies in.
    expect(html).toContain("White 6");
    expect(html).toContain("Black 7");
    expect(html).toContain(`${translations.en.morrisMoves}: 5`);
    expect(html).toContain(translations.en.morrisPhasePlacing);
  });

  it("resumes at the difficulty it was saved at — nothing is clamped here", () => {
    // Observed rather than inferred: the engine's seat is labelled with its tier
    // ("Ollamh / White"), so the restored difficulty is on screen and a clamp would
    // show up as the wrong word rather than as a test that passes either way. The
    // save above is `hard`, which is the other half of the assertion — Copenhagen
    // would have turned both of these into `medium` (difficultyCap.ts).
    for (const tier of ["ollamh", "hard", "easy"] as const) {
      localStorage.setItem("morris.game.v1", JSON.stringify({ ...SAVE, difficulty: tier }));
      const html = renderScreen();
      expect(html, tier).toContain(translations.en.taflDifficulties[tier]);
      expect(html, tier).not.toContain(translations.en.taflDifficulties.medium);
      // …and no setup sheet: Copenhagen opens it precisely *because* it clamped.
      expect(html, tier).not.toContain(translations.en.morrisBlurb);
    }
  });

  it("logs the mill's removal in the move log, victim named", () => {
    localStorage.setItem("morris.game.v1", JSON.stringify(SAVE));
    expect(renderScreen()).toContain("d5xa7");
  });
});

describe("MorrisScreen render — the variant picker", () => {
  it("offers Custom, which is the only way into the rule editor", () => {
    // Retitled in review: this test cannot see a segmented control. The sheet's
    // `variantId` is component state and SSR cannot switch it to "custom", so the
    // editor is never rendered here — the rendered editor is a `npm run
    // check:morris` assertion, and the table behind it is asserted by
    // `game/morris/ruleChoices.test.ts` (one entry per enum flag) and
    // `i18n.test.ts` (copy for every flag and value). What is left for this file,
    // and is genuinely its own, is that the picker offers the option at all.
    expect(renderScreen()).toContain('value="custom"');
  });
});
