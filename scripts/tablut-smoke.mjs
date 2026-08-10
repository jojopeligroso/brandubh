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
//     the whole reason the two games have separate storage keys.
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

// ── Into a game against the engine, as White ─────────────────────────────────
await page.getByRole("button", { name: "White (the king)" }).click();
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
await tb.locator('[role=gridcell][aria-label^="e7"]').click();
const dots = await tb.locator(".dot").count();
check(dots > 0, "selecting a defender offers legal destinations", `saw ${dots}`);
await tb.locator('[role=gridcell][aria-label^="b7"]').click();
const replied = await page
  .waitForFunction(() => /Moves:\s*2/.test(document.body.innerText), undefined, { timeout: 40000 })
  .then(() => true)
  .catch(() => false);
check(replied, "the engine replies from its worker");

// ── Back out; the Brandubh game must be exactly as it was ────────────────────
await page.getByRole("button", { name: "Back", exact: true }).click();
await bboard.waitFor();
const bcols = await bboard.evaluate(
  (el) => getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
);
check(bcols === 7, "the Brandubh board is 7 columns again", `saw ${bcols}`);
const savedAfter = await page.evaluate(() => localStorage.getItem("brandubh.game.v1"));
check(savedAfter === savedBefore, "the Brandubh save is untouched by the Tablut visit");

check(pageErrors.length === 0, "no uncaught page errors", pageErrors.join(" | "));

await browser.close();
server.close();
if (fails.length) {
  console.error(`\n${fails.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall Tablut checks passed");
