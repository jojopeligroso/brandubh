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

check(pageErrors.length === 0, "no uncaught page errors", pageErrors.join(" | "));

await browser.close();
server.close();
if (fails.length) {
  console.error(`\n${fails.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall Copenhagen checks passed");
