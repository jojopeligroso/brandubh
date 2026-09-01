// Assert the next-game setup controls leave the screen once a game has begun,
// and that the toolbar menu carries the doors back. Run: npm run check:setup-lock
//
// Why this exists as a driven-browser script and not a unit test: `CLAUDE.md`
// pins the suites to pure logic (no jsdom, no component tests), so the predicate
// behind this — `gameSetupLocked` in src/analysis.ts — is unit-tested and the
// thing it is *for* is not. A predicate that returns true while the panels it
// governs are still rendered would pass every test in the repo. This is the
// thing that fails.
//
// The pairing it guards is the whole feature. Taking "Play as", "AI level", the
// variant picker and the clock off the screen is only safe because the menu
// leads back to every one of them; leave the panels out and let a menu row go
// missing and the setting is not hidden, it is gone. So both halves are asserted
// in one pass, over one game:
//
//   1. a fresh board still offers the setup controls — nothing is hidden early;
//   2. one move in, they are gone: not disabled, not rendered;
//   3. and the conditions card names what that game is being played under;
//   4. the menu offers "Set up a new game", and it opens the chooser, with the
//      ruleset row that is now the only way to reach the variant;
//   5. the menu offers "Export this game", and it opens the game file;
//   6. the menu offers "Analyse from here", and taking it resigns the game (the
//      post-game gate in analysis.ts is intact) and opens analysis.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const DIST = new URL("../dist/", import.meta.url).pathname;
// playwright-core ships no browser of its own, so it always needs an explicit
// executable. Prefer CHROMIUM_PATH, then the sandbox's pre-provisioned build,
// then whatever the distro installed. Same list as the other check scripts;
// keep them in step.
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

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 860, height: 1880 } });
const problems = [];
let failure = null;

/** What the settings stack is offering right now, by shape rather than by text. */
const readStack = () =>
  page.evaluate(() => {
    const labels = [...document.querySelectorAll(".choice-label")].map((n) =>
      (n.textContent ?? "").trim(),
    );
    const conditions = document.querySelector('[data-testid="game-conditions"]');
    const rows = conditions
      ? [...conditions.querySelectorAll(".flex.items-center.justify-between")].map((r) =>
          [...r.children].map((c) => (c.textContent ?? "").trim()),
        )
      : null;
    return {
      choiceLabels: labels,
      // The variant picker is the one <select> the play screen ever renders.
      selects: document.querySelectorAll("select").length,
      conditions: rows,
    };
  });

try {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("brandubh.theme", "everforest");
      // The first-visit board-preset step would otherwise intercept the clicks
      // below (it is gated on an empty localStorage, which a bare context is).
      localStorage.setItem("brandubh.boardPresetSeen", "1");
      // Zen hides the settings stack wholesale, which would make step 1 pass
      // for the wrong reason. This check must fail for the lock and never for
      // a preference having moved.
      localStorage.setItem("brandubh.zen.enabled", "0");
    } catch {
      /* storage unavailable — the assertions below will say so */
    }
  });
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });

  // Over the board, so no engine reply has to be waited on and the side that
  // moves first is the one whose click we control.
  const otb = page.getByRole("button", { name: /with a friend in person/ });
  await otb.waitFor({ timeout: 15000 });
  await otb.click();
  const start = page.getByRole("button", { name: "Start game" });
  await start.waitFor({ timeout: 15000 });
  await start.click();
  await page.waitForSelector("text=Choose a time control", { state: "detached" });
  await page.waitForTimeout(300);

  // ── 1. A fresh board still offers the setup controls ────────────────────────
  const fresh = await readStack();
  for (const label of ["Play as", "Clock"]) {
    if (!fresh.choiceLabels.includes(label))
      problems.push(`a fresh board should still offer "${label}" — it is not on the screen`);
  }
  if (fresh.selects < 1)
    problems.push("a fresh board should still offer the variant picker — no <select> on the page");
  if (fresh.conditions)
    problems.push("the conditions card is up before a move has been played");

  // ── 2. One move in, they are gone ───────────────────────────────────────────
  // a4 is an attacker in the opening and attackers move first; a3 is empty.
  await page.locator('[aria-label^="a4"]').click();
  await page.locator('[aria-label^="a3"]').click();
  await page.waitForSelector('[data-testid="game-conditions"]', { timeout: 15000 });

  const played = await readStack();
  for (const label of ["Play as", "AI level", "Clock"]) {
    if (played.choiceLabels.includes(label))
      problems.push(`"${label}" is still on the screen a move into the game`);
  }
  if (played.selects > 0)
    problems.push(
      `the variant picker is still on the screen a move into the game (${played.selects} <select>)`,
    );

  // ── 3. …and the conditions card says what is being played ───────────────────
  const conditions = Object.fromEntries((played.conditions ?? []).map((r) => [r[0], r[1]]));
  const expected = { "Play as": "Over the board", Clock: "Off" };
  for (const [label, value] of Object.entries(expected)) {
    if (conditions[label] !== value)
      problems.push(
        `the conditions card should read "${label}: ${value}", reads ${JSON.stringify(conditions[label])}`,
      );
  }
  if (!conditions["Variant"])
    problems.push("the conditions card names no ruleset");
  // Over the board there is no computer, so naming its strength would be a lie.
  if ("AI level" in conditions)
    problems.push("the conditions card names an AI level in an over-the-board game");

  // ── 4. The menu's door back to all of it ────────────────────────────────────
  const openMenu = async () => {
    await page.locator('[data-testid="toolbar-menu"]').click();
    await page.waitForSelector('[data-testid="game-menu"]', { timeout: 15000 });
  };
  await openMenu();
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="game-menu"] [role="menuitem"]')].map((b) =>
      (b.textContent ?? "").trim(),
    ),
  );
  for (const row of ["Set up a new game", "Export this game", "Analyse from here"]) {
    if (!rows.includes(row)) problems.push(`the menu has no "${row}" row (has: ${rows.join(", ")})`);
  }

  if (rows.includes("Set up a new game")) {
    await page.getByRole("menuitem", { name: "Set up a new game" }).click();
    const ruleset = page.locator('[data-testid="overlay-ruleset"]');
    await ruleset.waitFor({ timeout: 15000 }).catch(() => {});
    if (!(await ruleset.count()))
      problems.push(
        "the chooser opened without the ruleset row — the variant is now unreachable",
      );
    // Back out: nothing is committed until a game is chosen, so the game below
    // must still be the one we played a move in.
    await page.locator('[data-testid="mode-overlay-close"]').click();
    await page.waitForSelector('[data-testid="game-conditions"]', { timeout: 15000 });
  }

  // ── 5. Export, without leaving the board to find it ─────────────────────────
  if (rows.includes("Export this game")) {
    await openMenu();
    await page.getByRole("menuitem", { name: "Export this game" }).click();
    const file = page.locator('[data-testid="gamefile-modal"]');
    await file.waitFor({ timeout: 15000 }).catch(() => {});
    if (!(await file.count())) problems.push('"Export this game" did not open the game file');
    else await page.locator('[data-testid="gamefile-modal"] button[aria-label="Close"]').click();
    await page.waitForTimeout(200);
  }

  // ── 6. Analysis is still bought with a resignation ──────────────────────────
  if (rows.includes("Analyse from here")) {
    await openMenu();
    await page.getByRole("menuitem", { name: "Analyse from here" }).click();
    const confirm = page.getByRole("button", { name: "Resign" });
    await confirm.waitFor({ timeout: 15000 }).catch(() => {});
    if (!(await confirm.count()))
      problems.push(
        '"Analyse from here" opened analysis without asking for the resignation — the post-game gate is being walked past',
      );
    else {
      await confirm.click();
      // The toolbar's analysis button reads "Leave analysis" once inside.
      const inside = page.locator('[data-testid="toolbar-analysis"][aria-label="Leave analysis"]');
      await inside.waitFor({ timeout: 15000 }).catch(() => {});
      if (!(await inside.count()))
        problems.push("the game was resigned but analysis did not open");
      // `enterAnalysis` re-reads the gate before it opens anything, so analysis
      // being open is itself the proof that the resignation landed on the live
      // game. The result on the screen is the other half: the game the player
      // was in is over, and says so.
      const decided = await page.evaluate(() => /\bwins?\b/i.test(document.body.innerText));
      if (!decided) problems.push("the game was not decided by the resignation it charged for");
    }
  }

  if (problems.length) {
    failure = problems.join("\n  ");
    console.error("FAIL setup lock:\n  " + failure);
  } else {
    console.log(
      "ok the setup controls leave the screen once a game has begun, the conditions card " +
        `names it (${JSON.stringify(conditions)}), and the menu leads back to all of it`,
    );
  }
} catch (err) {
  failure = String(err && err.message ? err.message : err);
  console.error("FAIL could not drive the setup lock:", failure);
} finally {
  await browser.close();
  server.close();
}
process.exit(failure ? 1 : 0);
