// Driven-browser assertions for the Copenhagen Hnefatafl surface.
//   npm run check:copenhagen
//
// Sits beside tablut-smoke.mjs and evalbar-geometry.mjs, and for the same reason:
// the test suites are pure logic, so nothing in them can fail when a third board
// draws wrong. The specific things that can only break here, and that this
// asserts:
//
//   • the board is 11x11 — `.board` reads its track count from a CSS variable,
//     and a stale `repeat(7, 1fr)` would silently letterbox eleven ranks into
//     seven;
//   • a Copenhagen corner *is* drawn as a marked square. This is the exact
//     opposite of the assertion in tablut-smoke.mjs, and that is the point: the
//     two boards disagree about what a corner is, one component draws both, and
//     only a rendered board can show that the disagreement survived;
//   • the coordinates run a-k and 11-1, with the double-digit ranks intact —
//     `i` is not skipped and `11` is not truncated to `1`;
//   • the drawer's More games section lists both other boards and opens;
//   • the engine actually replies, which is the only check that Copenhagen's own
//     Web Worker resolves at all in a real browser (three games, three worker
//     modules, three transposition tables);
//   • opening Copenhagen leaves a Brandubh game in progress byte-identical, and
//     leaves a Tablut game alone as well — the whole reason the three games have
//     separate storage keys;
//   • a Copenhagen game survives leaving the surface and coming back, resumed
//     silently with no setup sheet in the way;
//   • a full page reload lands back on the Copenhagen surface with the same game
//     — the game space is only left by the player's own back button, which is
//     what clears the surface flag;
//   • Ballinderry falls back on the 11x11 as it does on the 9x9, including the
//     inline pre-paint path in index.html, which is a *list* of surface keys and
//     so is the one place adding a board can silently go wrong.
//
// Same Chromium discovery list as screenshot.mjs and evalbar-geometry.mjs; keep
// the three in step.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const DIST = new URL("../dist/", import.meta.url).pathname;
// playwright-core ships no browser of its own, so it always needs an explicit
// executable. Prefer CHROMIUM_PATH, then the sandbox's pre-provisioned build,
// then whatever the distro installed.
//
// This used to name the sandbox path alone, unconditionally, so `npm run
// screenshot` failed on any machine that was not that sandbox — the project
// convention is a manual driven-browser pass for UI changes, and the script
// implementing it did not run. Same list as evalbar-geometry.mjs; keep the two
// in step.
const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
].filter(Boolean);
const CHROME = CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error("no Chromium found; set CHROMIUM_PATH. Tried:\n  " + CANDIDATES.join("\n  "));
  process.exit(2);
}
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/") path = "/index.html";
    const file = normalize(join(DIST, path));
    if (!file.startsWith(DIST)) throw new Error("escape");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    // SPA fallback: serve index.html for unknown routes.
    try {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(await readFile(join(DIST, "index.html")));
    } catch {
      res.writeHead(404);
      res.end();
    }
  }
});

await new Promise((r) => server.listen(0, r));
const { port } = server.address();

const fails = [];
const check = (ok, what, detail = "") => {
  if (ok) console.log(`ok   ${what}`);
  else {
    console.error(`FAIL ${what}${detail ? ` — ${detail}` : ""}`);
    fails.push(what);
  }
};

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 860, height: 1400 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
await page.addInitScript(() => {
  try {
    localStorage.setItem("brandubh.theme", "everforest");
    // Mark the first-visit board-preset step (src/boardPresets.ts) seen. A bare
    // Chromium context has no localStorage at all, which is exactly what that
    // step is gated on, so without this it opens over everything and swallows
    // the click below meant for the mode step — and this whole check times out
    // on its first `waitFor` without ever reaching an assertion. screenshot.mjs
    // carries the same line for the same reason; keep the two in step.
    localStorage.setItem("brandubh.boardPresetSeen", "1");
    // WP-4.2, feature 2: seeded rather than played out — an AI game to a real
    // conclusion on this board's slower engine is not cheap in a smoke check,
    // and the module's own recording logic already has pure-test coverage
    // (src/game/aiResults.test.ts). This only has to prove the setup sheet
    // *reads* what is stored, under Copenhagen's own key.
    localStorage.setItem(
      "copenhagen.aiResults.v1",
      JSON.stringify([
        { rulesetId: "copenhagen-2", difficulty: "easy", humanSide: "attackers", result: "win", endedAt: 1 },
        { rulesetId: "copenhagen-2", difficulty: "easy", humanSide: "attackers", result: "win", endedAt: 1 },
        { rulesetId: "copenhagen-2", difficulty: "easy", humanSide: "attackers", result: "loss", endedAt: 1 },
      ]),
    );
  } catch {
    /* localStorage unavailable */
  }
});
await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });

// ── A Brandubh game in progress, so there is a real save to protect ──────────
const otb = page.getByRole("button", { name: /with a friend in person/ });
await otb.waitFor();
await otb.click();
const start = page.getByRole("button", { name: "Start game" });
await start.waitFor();
await start.click();
const bboard = page.getByRole("grid", { name: "Brandubh board" });
await bboard.locator('[role=gridcell][aria-label^="d1"]').click();
await bboard.locator('[role=gridcell][aria-label^="c1"]').click();
await page.waitForTimeout(600);
const savedBefore = await page.evaluate(() => localStorage.getItem("brandubh.game.v1"));
check(savedBefore !== null, "a Brandubh game in progress is autosaved");

// ── The drawer's More games section ──────────────────────────────────────────
await page.getByTestId("menu-toggle").click();
await page.waitForSelector('[data-testid="app-drawer"]');
const more = page.getByTestId("drawer-more-games");
await more.waitFor();
check(await more.evaluate((el) => !el.open), "More games starts collapsed");
await more.locator("summary").click();
check(await more.evaluate((el) => el.open), "More games opens when clicked");
check(
  (await page.getByTestId("drawer-tablut").count()) === 1 &&
    (await page.getByTestId("drawer-copenhagen").count()) === 1,
  "More games lists both other boards",
);
await page.getByTestId("drawer-copenhagen").click();

// ── The Custom rule editor must render (WP-0.1 regression) ──────────────────
// Selecting Custom used to throw `undefined.map` for two Copenhagen-only enums
// (`kingStrength`, `strongKingEdgeRule`) whose choices were missing from the
// editor's table — see `ENUM_CHOICES` in game/copenhagen/variants.ts. A thrown
// render leaves the sheet showing nothing rather than crashing visibly, so the
// check counts the seven enum controls rather than only watching for an error.
const setupDialog = page.getByRole("dialog");
await setupDialog.locator("select").first().selectOption("custom");
const ruleEditor = setupDialog.locator(".rounded-lg.bg-black\\/20.p-3");
check(
  (await ruleEditor.locator(".seg").count()) === 7,
  "the Custom editor renders all seven enum controls",
);
// Custom's defaults equal the Copenhagen preset flag for flag, so the game
// started below plays exactly as Copenhagen would — nothing after this point
// needs the variant switched back.

// ── WP-4.2, feature 1: Hard and Ollamh are capped on this board ──────────────
// Owner decision 2026-09-09: the 11×11 search is too slow to run in the
// browser at those tiers — see game/copenhagen/difficultyCap.ts. Tablut is
// unaffected (see tablut-smoke.mjs, which has no equivalent check).
const hardTier = page.getByRole("button", { name: "Hard", exact: true });
const ollamhTier = page.getByRole("button", { name: "Ollamh", exact: true });
check(await hardTier.isDisabled(), "the Hard tier button is disabled");
check(await ollamhTier.isDisabled(), "the Ollamh tier button is disabled");
check(
  (await hardTier.getAttribute("aria-disabled")) === "true",
  "the Hard tier button carries aria-disabled",
);
check(
  (await ollamhTier.getAttribute("aria-disabled")) === "true",
  "the Ollamh tier button carries aria-disabled",
);
check(
  (await setupDialog.getByText(/not offered on the 11×11 board/).count()) > 0,
  "the tier-cap explanation is shown on the setup sheet",
);
// A real click is refused by a disabled control before it ever reaches our
// handler; force one through anyway, so this also proves the handler's own
// `if (offered)` guard, not just the browser's disabled semantics.
await hardTier.click({ force: true }).catch(() => {});
check(
  !(await hardTier.evaluate((el) => el.classList.contains("on"))),
  "clicking the disabled Hard tier does not select it",
);

// ── WP-4.2, feature 2: the human-vs-computer results line ────────────────────
// Seeded above, at page load — see the addInitScript block.
check(
  (await setupDialog.getByText("Your record vs the computer:").count()) > 0,
  "the AI results label is shown",
);
check(
  (await setupDialog.getByText("Easy 2-1-0").count()) > 0,
  "the seeded Easy record renders as 2-1-0",
);

// ── Into a game against the engine, as Black ─────────────────────────────────
// Black, not White: Copenhagen gives the attackers the first move (rule 2), so
// taking that seat is what puts the human on move and makes "two plies" mean
// "the human moved and the engine answered".
await page.getByRole("button", { name: "Black (the attackers)" }).click();
await page.getByRole("button", { name: "Medium" }).click();
await page.getByRole("button", { name: "Play", exact: true }).click();
const cb = page.getByRole("grid", { name: "Copenhagen Hnefatafl board" });
await cb.waitFor();

check((await cb.locator("[role=gridcell]").count()) === 121, "the board has 121 squares");
const cols = await cb.evaluate(
  (el) => getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
);
check(cols === 11, "the CSS grid is 11 columns wide", `saw ${cols}`);
check(
  (await cb.locator("[role=gridcell]").nth(60).getAttribute("aria-label")) === "f6 king",
  "the king starts on the throne at f6",
);
// a1 and a11 are different squares — the bottom-left rim square and the top-left
// corner. Checked as whole first tokens rather than with a prefix selector,
// because `[aria-label^="a1"]` matches both, which is exactly the mistake a
// double-digit rank invites everywhere else in the codebase too.
const squareNames = new Set(
  (await cb.locator("[role=gridcell]").evaluateAll((els) =>
    els.map((el) => (el.getAttribute("aria-label") ?? "").split(" ")[0]),
  )),
);
check(
  squareNames.has("a1") && squareNames.has("a11") && squareNames.size === 121,
  "a1 and a11 are distinct squares, and all 121 are named",
  `${squareNames.size} distinct names`,
);

const topLeft = cb.locator("[role=gridcell]").first();
check((await topLeft.getAttribute("aria-label")) === "a11", "the top-left square is a11");
// The inverse of tablut-smoke.mjs's corner assertion, deliberately. One `Board`
// draws both games, and only its `isSpecialCorner` closure separates them.
check(
  await topLeft.evaluate((el) => el.classList.contains("corner")),
  "a Copenhagen corner is drawn as a marked square",
);

const files = (await cb.locator(".coord-file").allTextContents()).join("");
const ranks = await cb.locator(".coord-rank").allTextContents();
check(files === "abcdefghijk", "the files run a-k, with i included", files);
check(
  ranks.join(",") === "11,10,9,8,7,6,5,4,3,2,1",
  "the ranks run 11 down to 1, double digits intact",
  ranks.join(","),
);

// ── A move, and the engine's reply ───────────────────────────────────────────
const movedTwice = () =>
  page
    .waitForFunction(
      () =>
        (document.querySelector(".copenhagen-screen .playerbar-movecount")?.textContent ?? "") ===
        "2",
      undefined,
      { timeout: 60000 },
    )
    .then(() => true)
    .catch(() => false);
await cb.locator('[role=gridcell][aria-label^="d1 "]').click();
const dots = await cb.locator(".dot").count();
check(dots > 0, "selecting an attacker offers legal destinations", `saw ${dots}`);
await cb.locator('[role=gridcell][aria-label^="d3"]').click();
check(await movedTwice(), "the engine replies from its worker (bottom seat shows 2 moves)");
check(
  (await page.locator(".copenhagen-screen .playerbar").count()) === 2,
  "both PlayerBar seats render on the Copenhagen surface",
);
check(
  (await page.locator('.copenhagen-screen [data-testid="toolbar-menu"]').count()) === 1,
  "the shell's bottom toolbar renders on the Copenhagen surface",
);

// ── WP-4.1a: board flip ───────────────────────────────────────────────────────
// The flip control lives behind the bottom toolbar's menu (GameMenuSheet),
// alongside restart/undo/resign — this screen has no analysis mode to gate it
// behind the way the Brandubh shell's own flip buttons are gated. Same shape
// as the Tablut twin of this check (scripts/tablut-smoke.mjs); only the
// expected labels differ, for the 11×11 board's a–k / 1–11 coordinates. It is
// still a Zen extra (off by default, like every extra bar the move
// navigator), so Zen comes off first — the same thing a player would do to
// reach it.
await page.locator('.copenhagen-screen [data-testid="copenhagen-zen-toggle"]').click();
const firstCellLabel = () => cb.locator("[role=gridcell]").first().getAttribute("aria-label");
const openGameMenu = async () => {
  // Scoped to the surface: the Brandubh shell's own bottom toolbar is still in
  // the DOM behind this overlay, and shares the same testid.
  await page.locator('.copenhagen-screen [data-testid="toolbar-menu"]').click();
  await page.waitForSelector('[data-testid="game-menu"]');
};
await openGameMenu();
await page.getByRole("menuitem", { name: "Flip board left-right" }).click();
check((await firstCellLabel()) === "k11", "flip left-right mirrors the board — the top-left square is now k11");
await openGameMenu();
await page.getByRole("menuitem", { name: "Flip board left-right" }).click();
check((await firstCellLabel()) === "a11", "flip left-right toggles back — the top-left square is a11 again");
await openGameMenu();
await page.getByRole("menuitem", { name: "Flip board top-bottom" }).click();
check((await firstCellLabel()) === "a1", "flip top-bottom mirrors the board — the top-left square is now a1");
await openGameMenu();
await page.getByRole("menuitem", { name: "Flip board top-bottom" }).click();
check((await firstCellLabel()) === "a11", "flip top-bottom toggles back — the top-left square is a11 again");
const flipStored = await page.evaluate(() => [
  localStorage.getItem("copenhagen.boardFlipped"),
  localStorage.getItem("copenhagen.boardFlippedV"),
]);
check(
  flipStored[0] === "0" && flipStored[1] === "0",
  "the flip preference persists under Copenhagen's own keys",
  JSON.stringify(flipStored),
);

// ── WP-4.1a: game file import / export ────────────────────────────────────────
await openGameMenu();
await page.getByRole("menuitem", { name: "Game file (.tafl)" }).click();
const gfModal = page.getByTestId("copenhagen-gamefile-modal");
await gfModal.waitFor();
const [download] = await Promise.all([
  page.waitForEvent("download"),
  gfModal.getByRole("button", { name: "Download" }).click(),
]);
const downloadPath = await download.path();
const exported = downloadPath ? await readFile(downloadPath, "utf8") : "";
check(exported.includes('[Format "copenhagen-1"]'), "the exported file carries the Copenhagen format tag");
check(/\[Variant "/.test(exported), "the exported file carries a Variant tag");

const gameIdBefore = await page.evaluate(
  () => JSON.parse(localStorage.getItem("copenhagen.game.v1") ?? "{}").id,
);
// Paste the same export straight back in — a round trip, not a different game.
await gfModal.getByLabel("Open a game file").fill(exported);
await gfModal.getByRole("button", { name: "Load game" }).click();
await gfModal.waitFor({ state: "detached" });
check(await movedTwice(), "importing the exported file round-trips the game (2 moves)");
const gameIdAfter = await page.evaluate(
  () => JSON.parse(localStorage.getItem("copenhagen.game.v1") ?? "{}").id,
);
check(
  typeof gameIdAfter === "string" && gameIdAfter !== gameIdBefore,
  "the imported game gets a fresh identity rather than continuing the old one",
);

// A malformed file must show the same error copy the shell's own panel shows.
await openGameMenu();
await page.getByRole("menuitem", { name: "Game file (.tafl)" }).click();
await gfModal.waitFor();
await gfModal.getByLabel("Open a game file").fill('[Format "copenhagen-1"]\n\n1. z9-z9 z9-z9\n');
await gfModal.getByRole("button", { name: "Load game" }).click();
const gfError = gfModal.getByTestId("import-error");
check(await gfError.isVisible(), "a malformed file shows the existing error copy");
check(
  (await gfError.innerText()).includes("something in the move list is not a move"),
  "the error copy names what was wrong",
);
await gfModal.getByRole("button", { name: "Close" }).click();
await gfModal.waitFor({ state: "detached" });

// ── Back out; the Brandubh game must be exactly as it was ────────────────────
await page.getByRole("button", { name: "Back", exact: true }).click();
await bboard.waitFor();
const bcols = await bboard.evaluate(
  (el) => getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
);
check(bcols === 7, "the Brandubh board is 7 columns again", `saw ${bcols}`);
const savedAfter = await page.evaluate(() => localStorage.getItem("brandubh.game.v1"));
check(savedAfter === savedBefore, "the Brandubh save is untouched by the Copenhagen visit");
check(
  (await page.evaluate(() => localStorage.getItem("tablut.game.v1"))) === null,
  "the Copenhagen game did not land in Tablut's key",
);
check(
  (await page.evaluate(() => localStorage.getItem("copenhagen.game.v1"))) !== null,
  "the Copenhagen game landed in its own key",
);

// ── Back in: the Copenhagen game must have survived the visit out ────────────
await page.getByTestId("menu-toggle").click();
await page.waitForSelector('[data-testid="app-drawer"]');
await page.getByTestId("drawer-more-games").locator("summary").click();
await page.getByTestId("drawer-copenhagen").click();
await cb.waitFor();
check(
  (await page.getByRole("button", { name: "Play", exact: true }).count()) === 0,
  "re-entry resumes the saved game with no setup sheet in the way",
);
check(await movedTwice(), "the two moves survived leaving the surface");

// ── Reload: the surface itself persists, and so does the game ────────────────
await page.reload({ waitUntil: "networkidle" });
const cbAfterReload = page.getByRole("grid", { name: "Copenhagen Hnefatafl board" });
const surfaceSurvived = await cbAfterReload
  .waitFor({ timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check(surfaceSurvived, "a reload lands back on the Copenhagen surface");
if (surfaceSurvived) {
  check(await movedTwice(), "the game survived the reload");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await bboard.waitFor();
  check(
    (await page.evaluate(() => localStorage.getItem("copenhagen.surface.v1"))) === null,
    "the back button clears the surface flag",
  );
}

// ── Ballinderry is a Brandubh board and must not follow the player here ──────
// Ballinderry draws 49 drilled holes on a 7×7 grid, traced back to a real object
// (docs/ballinderry-board.md); painted on the 11×11 it would draw a 121-hole
// board that never existed. resolveTheme in src/theme.ts falls it back to Gokstad
// away from the 7×7, and theme.test.ts pins that function — but only this check
// can see whether the *document* ends up wearing it. The reload case below is the
// one that matters most for a third board: index.html's pre-paint copy checks a
// hand-written *list* of surface keys, so a new board is exactly the kind of
// thing that can be forgotten there and nowhere else.
const paintedTheme = () => page.evaluate(() => document.documentElement.dataset.theme);
const storedTheme = () => page.evaluate(() => localStorage.getItem("brandubh.theme"));

await page.addInitScript(() => {
  try {
    localStorage.setItem("brandubh.theme", "ballinderry");
  } catch {
    /* localStorage unavailable */
  }
});
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "Resume game" }).click();
await bboard.waitFor();
check((await paintedTheme()) === "ballinderry", "Ballinderry paints on the Brandubh board");

await page.getByTestId("menu-toggle").click();
await page.waitForSelector('[data-testid="app-drawer"]');
await page.getByTestId("drawer-more-games").locator("summary").click();
await page.getByTestId("drawer-copenhagen").click();
await cb.waitFor();
const onSurface = await paintedTheme();
check(
  onSurface === "gokstad",
  "Ballinderry falls back to Gokstad on Copenhagen",
  `saw ${onSurface}`,
);
check(
  (await storedTheme()) === "ballinderry",
  "the stored theme choice is left alone by the fallback",
);

await page.reload({ waitUntil: "networkidle" });
await cb.waitFor();
const afterReload = await paintedTheme();
check(
  afterReload === "gokstad",
  "the pre-paint script knows the Copenhagen surface key too",
  `saw ${afterReload}`,
);

await page.getByRole("button", { name: "Back", exact: true }).click();
await bboard.waitFor();
const backOnBrandubh = await paintedTheme();
check(
  backOnBrandubh === "ballinderry",
  "Ballinderry comes back on leaving Copenhagen",
  `saw ${backOnBrandubh}`,
);

// ── WP-4.1a: menu-toggle + boardgame-surface mutual exclusion ────────────────
// commit 90c3cad added the hamburger to both boardgame screens and a mutual
// exclusion rule in App: opening one boardgame surface closes the other, and
// opening the setup overlay closes both. The Tablut twin of this check
// (scripts/tablut-smoke.mjs) goes Tablut → Copenhagen → setup overlay; this one
// goes the other way, so between the two scripts both directions are covered.
// See also src/App.mutualExclusion.test.ts for the non-interactive half (a
// corrupted surface-flag pair) — this is the half that needs a real click.
//
// A reload while on a boardgame surface also resets App's own showModeOverlay
// state to its default (on) — that state knows nothing about which surface is
// showing — so the Ballinderry section's reload-while-on-Copenhagen left a
// resume prompt quietly stacked *underneath* the Copenhagen screen (DOM
// order, not visibility, decided who was on top). Backing out just now
// revealed it. Resolve it the way a real player would before using the
// hamburger beneath.
const staleResume = page.getByRole("button", { name: "Resume game" });
if (await staleResume.isVisible().catch(() => false)) {
  await staleResume.click();
  await bboard.waitFor();
}
await page.getByTestId("menu-toggle").click();
await page.waitForSelector('[data-testid="app-drawer"]');
check(true, "the header hamburger (menu-toggle) opens the app drawer");
await page.getByTestId("drawer-more-games").locator("summary").click();
await page.getByTestId("drawer-copenhagen").click();
await cb.waitFor();
check((await page.locator(".copenhagen-screen").count()) === 1, "Copenhagen is open again");
check((await page.locator(".tablut-screen").count()) === 0, "Tablut is not mounted alongside it");

// Scoped to the surface — the Brandubh shell's own hamburger is still in the
// DOM behind this overlay and shares the same testid.
await page.locator('.copenhagen-screen [data-testid="menu-toggle"]').click();
await page.waitForSelector('[data-testid="app-drawer"]');
check(true, "the hamburger reopens the drawer from inside Copenhagen");
await page.getByTestId("drawer-more-games").locator("summary").click();
await page.getByTestId("drawer-tablut").click();
const tbFromCopenhagen = page.getByRole("grid", { name: "Tablut board" });
await tbFromCopenhagen.waitFor();
check(
  (await page.locator(".tablut-screen").count()) === 1,
  "opening Tablut from inside Copenhagen opens it",
);
check(
  (await page.locator(".copenhagen-screen").count()) === 0,
  "…and closes Copenhagen — the two boardgame surfaces never stack",
);

// Tablut has no game yet from this script, so it opened on its own setup
// sheet — like the shared mode overlay on first boot, it has no cancel while
// there is nothing behind it, and its backdrop blocks its own header
// underneath. Play it "Two players" (no AI, no worker wait) purely to get
// past the sheet and reach the drawer again.
await page.getByRole("button", { name: "Two players" }).click();
await page.getByRole("button", { name: "Play", exact: true }).click();

await page.locator('.tablut-screen [data-testid="menu-toggle"]').click();
await page.waitForSelector('[data-testid="app-drawer"]');
await page.getByTestId("drawer-new-game").click();
await page.waitForSelector('[data-testid="mode-overlay-close"]');
check(
  (await page.locator(".tablut-screen").count()) === 0 &&
    (await page.locator(".copenhagen-screen").count()) === 0,
  "opening the setup overlay from the drawer closes both boardgame surfaces",
);
await page.getByTestId("mode-overlay-close").click();
await bboard.waitFor();
check(
  (await page.locator(".tablut-screen").count()) === 0 &&
    (await page.locator(".copenhagen-screen").count()) === 0,
  "cancelling the setup overlay leaves neither boardgame surface open",
);

check(pageErrors.length === 0, "no uncaught page errors", pageErrors.join(" | "));

await browser.close();
server.close();
if (fails.length) {
  console.error(`\n${fails.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall Copenhagen checks passed");
