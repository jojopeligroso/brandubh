// Assert the eval bar fills from the BOTTOM. Run: npm run check:evalbar
//
// Why this exists as a driven-browser script and not a unit test: the bug it
// guards was pure CSS. `src/index.css` carried two `.evalbar-fill` blocks, and
// the stale one — anchored `top: 0` — won on source order, so the bar drained
// downwards from the top and read as the mirror image of the truth. It shipped
// in 05c187e and survived, because `CLAUDE.md` pins the suites to pure logic (no
// jsdom, no component tests) and `screenshot.mjs` deliberately does not frame the
// bar. Nothing in the repo could fail. This is the thing that fails.
//
// It asserts geometry rather than appearance: the fill's bottom edge sits on the
// track's bottom edge, and its top edge is `height` above it. A screenshot diff
// would also catch an inverted bar, but it catches every other pixel too and so
// needs regenerating whenever the palette moves; this only ever fails for the one
// reason. No score is asserted — that is the engine's business, and pinning a
// number here would make an evaluation change look like a layout regression.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const DIST = new URL("../dist/", import.meta.url).pathname;
// playwright-core ships no browser of its own, so it always needs an explicit
// executable. Prefer CHROMIUM_PATH, then the sandbox's pre-provisioned build,
// then whatever the distro installed.
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

// The bar is gated on a *finished* game (`analysisAvailable` in src/analysis.ts),
// so the fixture is a completed one seeded straight into the save slot. Playing
// one through the UI would take twenty clicks and make this a test of the board
// rather than of the stylesheet. The moves are a real WTF game ending in a king
// escape; the cursor sits mid-game, which is where a person reads the bar.
const SAVED = {
  v: 1,
  id: "evalbar-geometry",
  variantId: "wtf",
  playMode: "hotseat",
  difficulty: "easy",
  moves: [
    [3, 6, 2, 6], [3, 4, 2, 4], [3, 0, 2, 0], [4, 3, 4, 6], [2, 0, 2, 2],
    [3, 2, 4, 2], [5, 3, 5, 6], [3, 3, 5, 3], [1, 3, 1, 0], [4, 6, 3, 6],
    [3, 5, 4, 5], [5, 3, 5, 4], [4, 5, 5, 5], [5, 4, 5, 1], [0, 3, 0, 4],
    [4, 2, 6, 2], [2, 6, 1, 6], [5, 1, 6, 1], [0, 4, 0, 5], [6, 1, 6, 0],
  ],
  status: "defenders_win_escape",
  cursor: 14,
  recorded: false,
  clock: null,
  match: null,
  gamesPerSet: 1,
  names: { p1: "King", p2: "Raiders" },
};

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 860, height: 1880 } });
let failure = null;
try {
  // `savedAt` has to be stamped in the page: the loader rejects a save that is
  // stale or clock-skewed against the browser's own clock.
  await page.addInitScript((saved) => {
    try {
      localStorage.setItem(
        "brandubh.game.v1",
        JSON.stringify({ ...saved, createdAt: Date.now() - 60000, savedAt: Date.now() }),
      );
      localStorage.setItem("brandubh.theme", "everforest");
      // Pin the preferences this flow depends on, for the reason screenshot.mjs
      // pins the theme: an unset default is free to change, and this check must
      // fail for the geometry and never for a preference having moved.
      localStorage.setItem("brandubh.zen.enabled", "0");
      localStorage.setItem("brandubh.evalBar", "1");
    } catch {
      /* storage unavailable — the resume prompt simply won't appear and we fail below */
    }
  }, SAVED);
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });

  const resume = page.getByRole("button", { name: /Resume game/ });
  await resume.waitFor({ timeout: 15000 });
  await resume.click();

  // Icon-only button in the move navigator — addressed by its aria-label, which
  // is the only text it carries.
  const analysis = page.locator('button[aria-label="Analysis"]');
  await analysis.waitFor({ timeout: 15000 });
  await analysis.click();

  await page.waitForSelector(".evalbar-fill", { timeout: 15000 });
  // The fill animates its height over 260ms; settle before measuring.
  await page.waitForTimeout(800);

  const geom = await page.evaluate(() => {
    const track = document.querySelector(".evalbar-track");
    const fill = document.querySelector(".evalbar-fill");
    if (!track || !fill) return null;
    const t = track.getBoundingClientRect();
    const f = fill.getBoundingClientRect();
    return {
      trackBottom: t.bottom,
      trackTop: t.top,
      trackHeight: t.height,
      fillTop: f.top,
      fillBottom: f.bottom,
      fillHeight: f.height,
      cssBottom: getComputedStyle(fill).bottom,
    };
  });
  if (!geom) throw new Error("eval bar did not render");

  // One tolerance for both checks: a 1px border and sub-pixel layout, no more.
  const EPS = 1.5;
  const problems = [];
  if (Math.abs(geom.fillBottom - geom.trackBottom) > EPS)
    problems.push(
      `fill is not anchored to the track's bottom: fill.bottom ${geom.fillBottom.toFixed(1)} vs track.bottom ${geom.trackBottom.toFixed(1)}`,
    );
  if (Math.abs(geom.fillTop - (geom.trackBottom - geom.fillHeight)) > EPS)
    problems.push(
      `fill.top ${geom.fillTop.toFixed(1)} is not track.bottom - fill.height (${(geom.trackBottom - geom.fillHeight).toFixed(1)})`,
    );
  // A fill pinned to the top of a full-height track satisfies neither above, but
  // say so explicitly — it is the exact shape of the bug, and naming it turns a
  // failure into a diagnosis.
  if (Math.abs(geom.fillTop - geom.trackTop) < EPS && geom.fillHeight < geom.trackHeight - EPS)
    problems.push("fill hangs from the TOP of the track — the 05c187e inversion is back");

  if (problems.length) {
    failure = problems.join("\n  ");
    console.error("FAIL eval bar geometry:\n  " + failure);
    console.error("  measured:", JSON.stringify(geom));
  } else {
    console.log(
      `ok eval bar fills from the bottom (track ${geom.trackHeight.toFixed(0)}px, fill ${geom.fillHeight.toFixed(0)}px, css bottom ${geom.cssBottom})`,
    );
  }
} catch (err) {
  failure = String(err && err.message ? err.message : err);
  console.error("FAIL could not reach the eval bar:", failure);
} finally {
  await browser.close();
  server.close();
}
process.exit(failure ? 1 : 0);
