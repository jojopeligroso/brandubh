// Driven-browser assertions for the Tablut surface.
//   npm run check:tablut
//
// Sits beside evalbar-geometry.mjs and for the same reason: the test suites are
// pure logic, so nothing in them can fail when a second board draws wrong. The
// specific things that can only break here, and that this asserts:
//
//   • the board is 9x9 — `.board` reads its track count from a CSS variable, and
//     a stale `repeat(7, 1fr)` would silently letterbox nine ranks into seven;
//   • a baseline Tablut corner is *not* drawn as a marked square, because it is
//     ordinary ground under edge escape;
//   • the coordinates run a-i and 1-9, not Brandubh's a-g / 1-7;
//   • the drawer's More games section starts collapsed and opens;
//   • the engine actually replies, which is the only check that the Tablut Web
//     Worker resolves at all in a real browser;
//   • opening Tablut leaves a Brandubh game in progress byte-identical, which is
//     the whole reason the two games have separate storage keys;
//   • a Tablut game survives leaving the surface and coming back, resumed
//     silently with no setup sheet in the way;
//   • a full page reload lands back on the Tablut surface with the same game —
//     the game space is only left by the player's own back button, which is
//     what clears the surface flag.
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
    // WP-4.2, feature 2: seeded rather than played out — playing an AI game to
    // a real conclusion is not cheap in a smoke check, and the module's own
    // recording logic already has pure-test coverage
    // (src/game/aiResults.test.ts). This only has to prove the setup sheet
    // *reads* what is stored, under Tablut's own key.
    localStorage.setItem(
      "tablut.aiResults.v1",
      JSON.stringify([
        { rulesetId: "tablut-linnaeus-2", difficulty: "easy", humanSide: "attackers", result: "win", endedAt: 1 },
        { rulesetId: "tablut-linnaeus-2", difficulty: "easy", humanSide: "attackers", result: "win", endedAt: 1 },
        { rulesetId: "tablut-linnaeus-2", difficulty: "easy", humanSide: "attackers", result: "loss", endedAt: 1 },
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
await page.getByTestId("drawer-tablut").click();

// ── The Custom rule editor must render (WP-0.1 twin of the Copenhagen check) ─
// Tablut's own table was never wrong the way Copenhagen's stale copy of it
// was, but the two editors are now structurally identical (`ENUM_CHOICES` in
// game/tablut/variants.ts), so this is the same regression guard on this
// board too.
const setupDialog = page.getByRole("dialog");
await setupDialog.locator("select").first().selectOption("custom");
const ruleEditor = setupDialog.locator(".rounded-lg.bg-black\\/20.p-3");
check(
  (await ruleEditor.locator(".seg").count()) === 5,
  "the Custom editor renders all five enum controls",
);

// ── WP-4.2, feature 1: Tablut keeps all four AI levels ───────────────────────
// The opposite assertion to copenhagen-smoke.mjs's own tier-cap check: this
// board is unaffected by Copenhagen's Hard/Ollamh cap.
for (const label of ["Easy", "Medium", "Hard", "Ollamh"]) {
  const tier = page.getByRole("button", { name: label, exact: true });
  check(!(await tier.isDisabled()), `the ${label} tier button is not disabled`);
}
check(
  (await setupDialog.getByText(/not offered on the 11×11 board/).count()) === 0,
  "Copenhagen's tier-cap explanation is never shown here",
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
// Black, not White: `tablut-linnaeus-2` gives the attackers the first move
// (rule 2, corrected 2026-09-09 — see variants.ts), so taking that seat is
// what puts the human on move and makes "two plies" mean "the human moved and
// the engine answered". Same reasoning as copenhagen-smoke.mjs, which already
// gives Copenhagen's attackers the same seat for the same reason.
await page.getByRole("button", { name: "Black (the attackers)" }).click();
await page.getByRole("button", { name: "Medium" }).click();
await page.getByRole("button", { name: "Play", exact: true }).click();
const tb = page.getByRole("grid", { name: "Tablut board" });
await tb.waitFor();

check((await tb.locator("[role=gridcell]").count()) === 81, "the board has 81 squares");
const cols = await tb.evaluate(
  (el) => getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
);
check(cols === 9, "the CSS grid is 9 columns wide", `saw ${cols}`);
check(
  (await tb.locator("[role=gridcell]").nth(40).getAttribute("aria-label")) === "e5 king",
  "the king starts on the throne at e5",
);

const topLeft = tb.locator("[role=gridcell]").first();
check((await topLeft.getAttribute("aria-label")) === "a9", "the top-left square is a9");
check(
  !(await topLeft.evaluate((el) => el.classList.contains("corner"))),
  "a baseline corner is drawn as an ordinary square",
);

const files = (await tb.locator(".coord-file").allTextContents()).join("");
const ranks = (await tb.locator(".coord-rank").allTextContents()).join("");
check(files === "abcdefghi", "the files run a-i", files);
check(ranks === "987654321", "the ranks run 9-1", ranks);

// ── A move, and the engine's reply ───────────────────────────────────────────
// The move count lives on the bottom PlayerBar (the shell's own seat bar),
// which renders in Zen and out of it — the old "Moves: n" stats line is a
// non-Zen extra now.
const movedTwice = () =>
  page
    .waitForFunction(
      () =>
        (document.querySelector(".tablut-screen .playerbar-movecount")?.textContent ?? "") === "2",
      undefined,
      { timeout: 40000 },
    )
    .then(() => true)
    .catch(() => false);
await tb.locator('[role=gridcell][aria-label^="d1"]').click();
const dots = await tb.locator(".dot").count();
check(dots > 0, "selecting an attacker offers legal destinations", `saw ${dots}`);
await tb.locator('[role=gridcell][aria-label^="d3"]').click();
check(await movedTwice(), "the engine replies from its worker (bottom seat shows 2 moves)");
// The shell furniture is actually on the surface: seats and the bottom toolbar.
check(
  (await page.locator(".tablut-screen .playerbar").count()) === 2,
  "both PlayerBar seats render on the Tablut surface",
);
check(
  (await page.locator('.tablut-screen [data-testid="toolbar-menu"]').count()) === 1,
  "the shell's bottom toolbar renders on the Tablut surface",
);

// ── WP-4.1a: board flip ───────────────────────────────────────────────────────
// The flip control lives behind the bottom toolbar's menu (GameMenuSheet),
// alongside restart/undo/resign — this screen has no analysis mode to gate it
// behind the way the Brandubh shell's own flip buttons are gated. It is still
// a Zen extra (off by default, like every extra bar the move navigator), so
// Zen comes off first — the same thing a player would do to reach it.
await page.locator('.tablut-screen [data-testid="tablut-zen-toggle"]').click();
const firstCellLabel = () => tb.locator("[role=gridcell]").first().getAttribute("aria-label");
const openGameMenu = async () => {
  // Scoped to the surface: the Brandubh shell's own bottom toolbar is still in
  // the DOM behind this overlay, and shares the same testid.
  await page.locator('.tablut-screen [data-testid="toolbar-menu"]').click();
  await page.waitForSelector('[data-testid="game-menu"]');
};
await openGameMenu();
await page.getByRole("menuitem", { name: "Flip board left-right" }).click();
check((await firstCellLabel()) === "i9", "flip left-right mirrors the board — the top-left square is now i9");
await openGameMenu();
await page.getByRole("menuitem", { name: "Flip board left-right" }).click();
check((await firstCellLabel()) === "a9", "flip left-right toggles back — the top-left square is a9 again");
await openGameMenu();
await page.getByRole("menuitem", { name: "Flip board top-bottom" }).click();
check((await firstCellLabel()) === "a1", "flip top-bottom mirrors the board — the top-left square is now a1");
await openGameMenu();
await page.getByRole("menuitem", { name: "Flip board top-bottom" }).click();
check((await firstCellLabel()) === "a9", "flip top-bottom toggles back — the top-left square is a9 again");
const flipStored = await page.evaluate(() => [
  localStorage.getItem("tablut.boardFlipped"),
  localStorage.getItem("tablut.boardFlippedV"),
]);
check(
  flipStored[0] === "0" && flipStored[1] === "0",
  "the flip preference persists under Tablut's own keys",
  JSON.stringify(flipStored),
);

// ── WP-4.1a: game file import / export ────────────────────────────────────────
await openGameMenu();
await page.getByRole("menuitem", { name: "Game file (.tafl)" }).click();
const gfModal = page.getByTestId("tablut-gamefile-modal");
await gfModal.waitFor();
const [download] = await Promise.all([
  page.waitForEvent("download"),
  gfModal.getByRole("button", { name: "Download" }).click(),
]);
const downloadPath = await download.path();
const exported = downloadPath ? await readFile(downloadPath, "utf8") : "";
check(exported.includes('[Format "tablut-1"]'), "the exported file carries the Tablut format tag");
check(/\[Variant "/.test(exported), "the exported file carries a Variant tag");

const gameIdBefore = await page.evaluate(
  () => JSON.parse(localStorage.getItem("tablut.game.v1") ?? "{}").id,
);
// Paste the same export straight back in — a round trip, not a different game.
await gfModal.getByLabel("Open a game file").fill(exported);
await gfModal.getByRole("button", { name: "Load game" }).click();
await gfModal.waitFor({ state: "detached" });
check(await movedTwice(), "importing the exported file round-trips the game (2 moves)");
const gameIdAfter = await page.evaluate(
  () => JSON.parse(localStorage.getItem("tablut.game.v1") ?? "{}").id,
);
check(
  typeof gameIdAfter === "string" && gameIdAfter !== gameIdBefore,
  "the imported game gets a fresh identity rather than continuing the old one",
);

// A malformed file must show the same error copy the shell's own panel shows.
await openGameMenu();
await page.getByRole("menuitem", { name: "Game file (.tafl)" }).click();
await gfModal.waitFor();
await gfModal.getByLabel("Open a game file").fill('[Format "tablut-1"]\n\n1. z9-z9 z9-z9\n');
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
check(savedAfter === savedBefore, "the Brandubh save is untouched by the Tablut visit");

// ── Back in: the Tablut game must have survived the visit out ────────────────
await page.getByTestId("menu-toggle").click();
await page.waitForSelector('[data-testid="app-drawer"]');
await page.getByTestId("drawer-more-games").locator("summary").click();
await page.getByTestId("drawer-tablut").click();
await tb.waitFor();
check(
  (await page.getByRole("button", { name: "Play", exact: true }).count()) === 0,
  "re-entry resumes the saved game with no setup sheet in the way",
);
check(await movedTwice(), "the two moves survived leaving the surface");

// ── Reload: the surface itself persists, and so does the game ────────────────
await page.reload({ waitUntil: "networkidle" });
const tbAfterReload = page.getByRole("grid", { name: "Tablut board" });
const surfaceSurvived = await tbAfterReload
  .waitFor({ timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check(surfaceSurvived, "a reload lands back on the Tablut surface");
if (surfaceSurvived) {
  check(await movedTwice(), "the game survived the reload");
  // ── And leaving is the player's own choice, which clears the flag ──────────
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await bboard.waitFor();
  check(
    (await page.evaluate(() => localStorage.getItem("tablut.surface.v1"))) === null,
    "the back button clears the surface flag",
  );
}

// ── Ballinderry is a Brandubh board and must not follow the player here ──────
// Ballinderry draws 49 drilled holes on a 7×7 grid, traced back to a real
// object (docs/ballinderry-board.md); painted on the 9×9 it would draw an
// 81-hole board that never existed. resolveTheme in src/theme.ts falls it back
// to Gokstad on this surface, and theme.test.ts pins that function — but only
// this check can see whether the *document* actually ends up wearing it, which
// is the half that shipped wrong before (see the eval-bar note in CLAUDE.md).
const paintedTheme = () => page.evaluate(() => document.documentElement.dataset.theme);
const storedTheme = () => page.evaluate(() => localStorage.getItem("brandubh.theme"));

// Registered as a second init script rather than written with `evaluate`: the
// one at the top of this file runs on *every* navigation and would put the
// theme back to everforest on the next reload. Init scripts run in order, so
// this one lands after it and wins.
await page.addInitScript(() => {
  try {
    localStorage.setItem("brandubh.theme", "ballinderry");
  } catch {
    /* localStorage unavailable */
  }
});
await page.reload({ waitUntil: "networkidle" });
// Any reload landing on Brandubh with a save offers to resume it first.
await page.getByRole("button", { name: "Resume game" }).click();
await bboard.waitFor();
check((await paintedTheme()) === "ballinderry", "Ballinderry paints on the Brandubh board");

await page.getByTestId("menu-toggle").click();
await page.waitForSelector('[data-testid="app-drawer"]');
await page.getByTestId("drawer-more-games").locator("summary").click();
await page.getByTestId("drawer-tablut").click();
await tb.waitFor();
const onSurface = await paintedTheme();
check(onSurface === "gokstad", "Ballinderry falls back to Gokstad on Tablut", `saw ${onSurface}`);
// The fallback is a paint, not a preference: the player still chose Ballinderry.
check(
  (await storedTheme()) === "ballinderry",
  "the stored theme choice is left alone by the fallback",
);

// A reload mid-Tablut is the case the inline pre-paint script in index.html
// has to handle by itself, before any module runs.
await page.reload({ waitUntil: "networkidle" });
await tb.waitFor();
const afterReload = await paintedTheme();
check(afterReload === "gokstad", "the fallback survives a reload onto Tablut", `saw ${afterReload}`);

await page.getByRole("button", { name: "Back", exact: true }).click();
await bboard.waitFor();
const backOnBrandubh = await paintedTheme();
check(
  backOnBrandubh === "ballinderry",
  "Ballinderry comes back on leaving Tablut",
  `saw ${backOnBrandubh}`,
);

// ── WP-4.1a: menu-toggle + boardgame-surface mutual exclusion ────────────────
// commit 90c3cad added the hamburger to both boardgame screens and a mutual
// exclusion rule in App: opening one boardgame surface closes the other, and
// opening the setup overlay closes both. See also src/App.mutualExclusion.
// test.ts for the non-interactive half of this (a corrupted surface-flag
// pair) — this is the half that needs a real click to observe.
//
// A reload while on a boardgame surface also resets App's own showModeOverlay
// state to its default (on) — that state knows nothing about which surface is
// showing — so the Ballinderry section's reload-while-on-Tablut left a resume
// prompt quietly stacked *underneath* the Tablut screen (DOM order, not
// visibility, decided who was on top). Backing out just now revealed it.
// Resolve it the way a real player would before using the hamburger beneath.
const staleResume = page.getByRole("button", { name: "Resume game" });
if (await staleResume.isVisible().catch(() => false)) {
  await staleResume.click();
  await bboard.waitFor();
}
await page.getByTestId("menu-toggle").click();
await page.waitForSelector('[data-testid="app-drawer"]');
check(true, "the header hamburger (menu-toggle) opens the app drawer");
await page.getByTestId("drawer-more-games").locator("summary").click();
await page.getByTestId("drawer-tablut").click();
await tb.waitFor();
check((await page.locator(".tablut-screen").count()) === 1, "Tablut is open again");
check((await page.locator(".copenhagen-screen").count()) === 0, "Copenhagen is not mounted alongside it");

// Scoped to the surface — the Brandubh shell's own hamburger is still in the
// DOM behind this overlay and shares the same testid.
await page.locator('.tablut-screen [data-testid="menu-toggle"]').click();
await page.waitForSelector('[data-testid="app-drawer"]');
check(true, "the hamburger reopens the drawer from inside Tablut");
await page.getByTestId("drawer-more-games").locator("summary").click();
await page.getByTestId("drawer-copenhagen").click();
const cphFromTablut = page.getByRole("grid", { name: "Copenhagen Hnefatafl board" });
await cphFromTablut.waitFor();
check(
  (await page.locator(".copenhagen-screen").count()) === 1,
  "opening Copenhagen from inside Tablut opens it",
);
check(
  (await page.locator(".tablut-screen").count()) === 0,
  "…and closes Tablut — the two boardgame surfaces never stack",
);

// Copenhagen has no game yet from this script, so it opened on its own setup
// sheet — like the shared mode overlay on first boot, it has no cancel while
// there is nothing behind it, and its backdrop blocks its own header
// underneath. Play it "Two players" (no AI, no worker wait) purely to get
// past the sheet and reach the drawer again.
await page.getByRole("button", { name: "Two players" }).click();
await page.getByRole("button", { name: "Play", exact: true }).click();

await page.locator('.copenhagen-screen [data-testid="menu-toggle"]').click();
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
console.log("\nall Tablut checks passed");
