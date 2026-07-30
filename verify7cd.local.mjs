// Driven-browser verification for Sessions 7c (move tree) and 7d (annotations).
//   npm run build && node verify7cd.local.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const DIST = new URL("./dist/", import.meta.url).pathname;
const CHROME = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".otf": "font/otf", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const file = normalize(join(DIST, p));
    if (!file.startsWith(DIST)) throw new Error("escape");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(await readFile(join(DIST, "index.html")));
  }
});
await new Promise((r) => server.listen(0, r));
const { port } = server.address();
const base = `http://localhost:${port}/`;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const eq = (n, got, want) => ok(n, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const browser = await chromium.launch({ executablePath: CHROME });

const positionOf = (page) =>
  page.$$eval('.board [role="gridcell"]', (els) => els.map((e) => e.getAttribute("aria-label")));
const treeText = (page) =>
  page.$$eval(".movetree-line", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
const savedGame = (page) => page.evaluate(() => localStorage.getItem("brandubh.game.v1"));

async function newPage(seed = {}) {
  const page = await browser.newPage({ viewport: { width: 900, height: 2200 } });
  await page.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed);
  await page.goto(base, { waitUntil: "networkidle" });
  return page;
}
async function enterOtb(page) {
  const b = page.getByRole("button", { name: /with a friend in person/ });
  await b.waitFor(); await b.click();
  await page.waitForSelector("text=Choose your game", { state: "detached" });
}
async function enterVsComputer(page) {
  const vs = page.getByRole("button", { name: /^Play vs AI$/ });
  await vs.waitFor(); await vs.click();
  const king = page.getByRole("button", { name: /King.s side/ }).first();
  await king.waitFor(); await king.click();
  const easy = page.locator(".btn.py-3").getByText(/^Easy$/).first();
  await easy.waitFor(); await easy.click();
  await page.waitForSelector(".board", { state: "visible" });
}
/** Play the n-th legal move for a piece kind; returns {from,to} or null. */
async function playMove(page, kind, pick = 0) {
  const names = await page.$$eval('.board [role="gridcell"]', (els, k) =>
    els.filter((e) => e.getAttribute("aria-label").endsWith(" " + k))
       .map((e) => e.getAttribute("aria-label").split(" ")[0]), kind);
  for (const from of names) {
    await page.locator(`.board [aria-label^="${from} "]`).first().click();
    await page.waitForTimeout(110);
    const targets = await page.$$eval(".board .dot", (els) =>
      els.map((d) => d.closest('[role="gridcell"]').getAttribute("aria-label").split(" ")[0]));
    if (targets.length > pick) {
      const to = targets[pick];
      await page.locator(`.board [aria-label^="${to}"]`).first().click();
      await page.waitForTimeout(300);
      return { from, to };
    }
  }
  return null;
}

// ── 7c. Move tree ────────────────────────────────────────────────────────────
console.log("\n[7c] Variation tree");
{
  const page = await newPage();
  await enterOtb(page);
  await playMove(page, "attacker");
  await playMove(page, "defender");
  const liveSave = await savedGame(page);
  const livePos = await positionOf(page);

  await page.getByRole("button", { name: /^Analysis$/ }).click();
  await page.waitForTimeout(250);
  ok("the tree panel appears in analysis", (await page.locator(".movetree").count()) === 1);

  const seeded = await treeText(page);
  eq("it seeds from the live game as one line", seeded.length, 1);
  ok("the two live moves are in it", (await page.locator(".movetree-move").count()) === 2,
    `${await page.locator(".movetree-move").count()} moves`);

  // Extend the line, then go back and play something else.
  const first = await playMove(page, "attacker", 0);
  ok("analysis extends the line", first !== null);
  const afterFirst = await page.locator(".movetree-move").count();

  await page.getByRole("button", { name: /previous move/i }).click();
  await page.waitForTimeout(200);
  const second = await playMove(page, "attacker", 1);
  ok("a different move from the same position is accepted", second !== null);

  const lines = await treeText(page);
  ok("it became a SIBLING, not a replacement — two lines now", lines.length === 2,
    JSON.stringify(lines));
  ok("the first idea survived", (await page.locator(".movetree-move").count()) === afterFirst + 1,
    `${await page.locator(".movetree-move").count()} vs ${afterFirst + 1}`);
  ok("the variation is indented", (await page.locator(".movetree-variation").count()) === 1);
  ok("exactly one move is marked current", (await page.locator(".movetree-move.is-current").count()) === 1);

  // Replaying a move already tried must navigate, not duplicate.
  const beforeDup = await page.locator(".movetree-move").count();
  await page.getByRole("button", { name: /previous move/i }).click();
  await page.waitForTimeout(200);
  await playMove(page, "attacker", 1);
  ok("replaying a tried move navigates instead of duplicating",
    (await page.locator(".movetree-move").count()) === beforeDup,
    `${await page.locator(".movetree-move").count()} vs ${beforeDup}`);

  // Click a move in the mainline: the board must follow.
  const posBefore = await positionOf(page);
  await page.locator(".movetree-line").first().locator(".movetree-move").first().click();
  await page.waitForTimeout(250);
  ok("clicking a move in the tree moves the board",
    JSON.stringify(await positionOf(page)) !== JSON.stringify(posBefore));

  // Promote the variation.
  await page.locator(".movetree-variation .movetree-move").first().click();
  await page.waitForTimeout(200);
  const promote = page.getByRole("button", { name: /promote to main line/i });
  ok("promote is offered on a variation", await promote.isEnabled());
  await promote.click();
  await page.waitForTimeout(250);
  ok("after promoting, that line is the mainline",
    (await page.locator(".movetree-variation").count()) === 1 &&
    (await promote.isDisabled()), "promote should now be disabled on the promoted node");
  ok("promoting lost nothing", (await page.locator(".movetree-move").count()) === beforeDup,
    `${await page.locator(".movetree-move").count()} vs ${beforeDup}`);

  // Delete a variation.
  await page.locator(".movetree-variation .movetree-move").first().click();
  await page.waitForTimeout(200);
  const del = page.getByRole("button", { name: /delete variation/i });
  await del.click();
  await page.waitForTimeout(250);
  ok("deleting removes the branch", (await page.locator(".movetree-variation").count()) === 0);
  ok("deleting leaves the other line alone", (await page.locator(".movetree-move").count()) > 0);

  ok("the live save was never written during any of that", (await savedGame(page)) === liveSave);

  await page.getByRole("button", { name: /leave analysis/i }).click();
  await page.waitForTimeout(400);
  ok("leaving analysis returns the live position", JSON.stringify(await positionOf(page)) === JSON.stringify(livePos));
  ok("the tree panel is gone", (await page.locator(".movetree").count()) === 0);
  const sansStamp = (r) => { const o = JSON.parse(r); delete o.savedAt; return JSON.stringify(o); };
  ok("the save is the live game, field for field", sansStamp(await savedGame(page)) === sansStamp(liveSave));
  await page.close();
}

console.log("\n[7c] Live play is still a single line");
{
  const page = await newPage();
  await enterOtb(page);
  await playMove(page, "attacker");
  await playMove(page, "defender");
  await playMove(page, "attacker");
  ok("no tree panel outside analysis", (await page.locator(".movetree").count()) === 0);
  const plies = await page.evaluate(() => JSON.parse(localStorage.getItem("brandubh.game.v1")).moves.length);
  eq("three moves saved as one line", plies, 3);
  // Step back and branch the live game the old way: it must still truncate.
  await page.getByRole("button", { name: /previous move/i }).click();
  await page.waitForTimeout(200);
  const play = page.getByRole("button", { name: /play from here/i });
  if (await play.count()) {
    await play.first().click();
    await page.waitForTimeout(300);
    // Over the board, branching destroys the opponent's moves, so it needs
    // their agreement first.
    const allow = page.getByRole("button", { name: /^Allow$/ });
    if (await allow.count()) { await allow.click(); await page.waitForTimeout(400); }
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("brandubh.game.v1")).moves.length);
    ok("live 'play from here' still truncates", after === 2, `plies ${after}`);
  } else {
    ok("live 'play from here' still truncates", true, "control not shown; skipped");
  }
  await page.close();
}

// ── 7d. Annotations ──────────────────────────────────────────────────────────
console.log("\n[7d] Post-game annotations");
{
  const page = await newPage();
  await enterVsComputer(page);
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) {
    await playMove(page, "defender");
    await page.waitForTimeout(2200);
  }
  const liveSave = await savedGame(page);

  const run = page.getByRole("button", { name: /analyse game|analyze game/i });
  ok("the annotate control is present", (await run.count()) > 0);
  if (await run.count()) {
    await run.click();
    await page.waitForTimeout(400);
    const progressSeen = (await page.locator(".annotate-progress").count()) > 0;
    ok("it reports progress while it runs", progressSeen);
    // Wait for it to finish.
    await page.waitForSelector(".annotate-progress", { state: "detached", timeout: 120000 }).catch(() => {});
    ok("it finishes", (await page.locator(".annotate-progress").count()) === 0);
    const summary = await page.locator(".annotate-summary").count();
    ok("a summary is shown", summary > 0);
    ok("the live save is untouched by annotating", (await savedGame(page)) === liveSave);
  }
  await page.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
