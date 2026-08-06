// Regenerate docs/screenshot.png from the production build.
//   npm run build && node scripts/screenshot.mjs
// Serves dist/ statically, drives past the opening overlay into a board, and
// captures the board view. Uses the environment's pre-installed Chromium.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const DIST = new URL("../dist/", import.meta.url).pathname;
const OUT = new URL("../docs/screenshot.png", import.meta.url).pathname;
// Override with CHROMIUM_PATH when Chromium lives elsewhere; the default is the
// pre-provisioned browser in the CI/web sandbox. playwright-core ships no
// browser of its own, so it always needs an explicit executable.
const CHROME =
  process.env.CHROMIUM_PATH ??
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
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

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({
  viewport: { width: 860, height: 1880 },
  deviceScaleFactor: 1,
});
// Pin the theme before the app's first paint. `pickDefaultTheme()` picks
// Everforest only 66% of the time and Carved Wood the rest (src/theme.ts), so
// without this the cover image re-rolls its entire palette on every
// regeneration and the diff is never just the UI change you made. Everforest is
// DEFAULT_THEME and the majority roll, so it is what this pins.
await page.addInitScript(() => {
  try {
    localStorage.setItem("brandubh.theme", "everforest");
  } catch {
    /* localStorage unavailable — fall back to whatever the app picks */
  }
});
await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });

// Past the opening overlay into a fresh over-the-board game (no AI turn to wait
// on), then let the board settle before capturing.
// Enter a fresh over-the-board game (no AI turn to wait on). force:true clicks
// through the overlay's animated backdrop, which otherwise intercepts the click.
// The overlay's button is the one carrying "with a friend in person" — distinct
// from the settings-panel play-mode toggle that also reads "Over the board".
const otb = page.getByRole("button", { name: /with a friend in person/ });
await otb.waitFor();
await otb.click();
// Over the board now asks for a time control before it starts the game. The
// step opens on whatever is stored (clock off by default), so accepting it
// unchanged gives the same untimed board this shot has always captured.
const start = page.getByRole("button", { name: "Start game" });
await start.waitFor();
await start.click();
await page.waitForSelector("text=Choose a time control", { state: "detached" });
await page.waitForTimeout(500);

await page.screenshot({ path: OUT });
await browser.close();
server.close();
console.log("wrote", OUT);
