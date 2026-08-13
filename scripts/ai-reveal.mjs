// Assert the engine's move is SHOWN, not teleported. Run: npm run check:ai-reveal
//
// Why this exists as a driven-browser script and not a unit test: what it
// guards is a CSS keyframe and a pair of JS timers, and `CLAUDE.md` pins the
// suites to pure logic (no jsdom, no component tests). Nothing in the repo can
// see a stone move. A `.ai-mover` that renders but never translates — a typo in
// a custom property, a `--n` that never reaches the layer, a keyframe shadowed
// by a later rule — would look exactly like the old teleport and fail nothing.
// This is the thing that fails.
//
// It asserts, over a real engine reply on a real board:
//   1. the travelling stone exists at all;
//   2. it occupies several distinct positions (it travels; it does not jump);
//   3. it ends on the square the move landed on, not merely somewhere else;
//   4. the real stone underneath stays hidden while the copy is in flight, so
//      the two are never on the board at once;
//   5. the square the stone left stays lit after the stone has landed — the
//      whole point of the origin highlight is that it answers a question asked
//      *after* the eye has followed the move;
//   6. both marks expire on their own.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const DIST = new URL("../dist/", import.meta.url).pathname;
// playwright-core ships no browser of its own, so it always needs an explicit
// executable. Same list as evalbar-geometry.mjs and screenshot.mjs; keep them
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

// A two-move game seeded straight into the save slot, so resuming it lands on
// the *engine's* turn and the reply comes without a single click on the board.
// The human takes the defenders, so the engine is the raiders, who move first
// and are therefore to move again after one move each. Both moves are plain
// soldier slides, legal under every ruleset — this check must fail for the
// reveal and never for a rules change. Moves are [fromRow, fromCol, toRow, toCol].
const SAVED = {
  v: 1,
  id: "ai-reveal",
  variantId: "wtf",
  playMode: "defenders",
  difficulty: "easy",
  moves: [
    [1, 3, 1, 1], // raider slides along the second rank
    [3, 2, 2, 2], // defender steps up the c-file
  ],
  status: "playing",
  cursor: 2,
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
  await page.addInitScript((saved) => {
    try {
      // `savedAt` has to be stamped in the page: the loader rejects a save that
      // is stale or clock-skewed against the browser's own clock.
      localStorage.setItem(
        "brandubh.game.v1",
        JSON.stringify({ ...saved, createdAt: Date.now() - 60000, savedAt: Date.now() }),
      );
      // Pin the preferences this flow depends on, for the reason screenshot.mjs
      // pins the theme: an unset default is free to change, and this check must
      // fail for the reveal and never for a preference having moved.
      localStorage.setItem("brandubh.theme", "everforest");
      localStorage.setItem("brandubh.boardPresetSeen", "1");
      localStorage.setItem("brandubh.zen.enabled", "0");
    } catch {
      /* storage unavailable — the resume prompt simply won't appear and we fail below */
    }
  }, SAVED);
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });

  const resume = page.getByRole("button", { name: /Resume game/ });
  await resume.waitFor({ timeout: 15000 });
  await resume.click();
  await page.waitForSelector(".board", { timeout: 15000 });

  // Sampled per animation frame inside the page rather than over CDP: the whole
  // flight is about half a second, and a round trip per measurement would time
  // the harness rather than the animation.
  const trace = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const out = {
          frames: [],
          sawMover: false,
          moverGoneAt: null,
          originGoneAt: null,
          originLitAfterLanding: null,
          inFlightVisibility: null,
          inFlightSeen: false,
          cell: null,
          lastMoveCentres: null,
        };
        const centre = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
        };
        // Lit, not merely present. The highlight is removed from the DOM by a
        // timer but faded out by a keyframe, and a keyframe that finishes early
        // leaves an element nobody can see still sitting in the markup — which
        // is exactly how an earlier version of this check passed a 200ms fade
        // it was written to reject.
        const lit = () => {
          const el = document.querySelector(".cell.ai-from .ai-origin");
          if (!el) return false;
          const s = getComputedStyle(el);
          return s.visibility !== "hidden" && Number(s.opacity) > 0.05;
        };
        const t0 = performance.now();
        const step = () => {
          const now = performance.now() - t0;
          const mover = document.querySelector(".ai-mover");
          const origin = lit();
          if (mover) {
            const c = centre(mover);
            out.sawMover = true;
            out.cell = c.w;
            out.frames.push({ t: now, x: c.x, y: c.y });
            const held = document.querySelector(".piece.in-flight");
            if (held) {
              out.inFlightSeen = true;
              out.inFlightVisibility = getComputedStyle(held).visibility;
            }
          } else if (out.sawMover && out.moverGoneAt === null) {
            out.moverGoneAt = now;
            // The stone has landed. Both ends of the move are still marked
            // `.lastmove`; the destination is the one that is not the origin.
            out.originLitAfterLanding = origin;
            out.lastMoveCentres = [...document.querySelectorAll(".cell.lastmove")].map((el) => ({
              ...centre(el),
              aiFrom: el.classList.contains("ai-from"),
            }));
          }
          if (!origin && out.sawMover && out.moverGoneAt !== null && out.originGoneAt === null)
            out.originGoneAt = now;
          const done = out.moverGoneAt !== null && out.originGoneAt !== null;
          if (done || now > 12000) resolve(out);
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );

  const problems = [];
  if (!trace.sawMover) {
    problems.push(
      "the engine's stone never appeared: no `.ai-mover` in twelve seconds — the move is teleporting again",
    );
  } else {
    const first = trace.frames[0];
    const last = trace.frames[trace.frames.length - 1];
    const travelled = Math.hypot(last.x - first.x, last.y - first.y);
    const distinct = new Set(trace.frames.map((f) => `${f.x.toFixed(1)},${f.y.toFixed(1)}`)).size;
    // A move is at least one square, and the sampler starts within a frame or
    // two of the flight beginning, so anything under half a cell means the
    // stone was drawn but never actually translated.
    if (travelled < trace.cell * 0.5)
      problems.push(
        `the stone was drawn but did not travel: ${travelled.toFixed(1)}px over ${trace.frames.length} frames, cell is ${trace.cell.toFixed(1)}px`,
      );
    // Two positions is a jump cut. Real travel is sampled many times.
    if (distinct < 5)
      problems.push(
        `the stone jumped rather than travelled: only ${distinct} distinct positions in ${trace.frames.length} frames`,
      );
    if (!trace.inFlightSeen)
      problems.push(
        "no `.piece.in-flight`: the real stone on the destination was never held back, so it and the travelling copy were both on the board",
      );
    else if (trace.inFlightVisibility !== "hidden")
      problems.push(
        `the held stone is visible (visibility: ${trace.inFlightVisibility}) while its copy is in flight — two stones, one move`,
      );
    const dest = (trace.lastMoveCentres ?? []).find((c) => !c.aiFrom);
    if (!dest) problems.push("the move's destination square is not marked `.lastmove` on landing");
    else {
      const off = Math.hypot(last.x - dest.x, last.y - dest.y);
      // Sub-cell tolerance: the last sampled frame may be a frame short of the
      // keyframe's end, but it must be plainly *on* the destination square.
      if (off > trace.cell * 0.35)
        problems.push(
          `the stone did not land on the square the move went to: ${off.toFixed(1)}px off centre, cell is ${trace.cell.toFixed(1)}px`,
        );
    }
    if (trace.originLitAfterLanding !== true)
      problems.push(
        "the square the stone left went dark the moment it landed — the origin highlight is meant to outlast the flight",
      );
    if (trace.originGoneAt === null) problems.push("the origin highlight never expired");
    else if (trace.moverGoneAt !== null && trace.originGoneAt <= trace.moverGoneAt)
      problems.push(
        `the origin highlight expired at ${trace.originGoneAt.toFixed(0)}ms, no later than the flight itself (${trace.moverGoneAt.toFixed(0)}ms)`,
      );
  }

  if (problems.length) {
    failure = problems.join("\n  ");
    console.error("FAIL engine move reveal:\n  " + failure);
  } else {
    const first = trace.frames[0];
    const last = trace.frames[trace.frames.length - 1];
    console.log(
      `ok the engine's stone travels ${Math.hypot(last.x - first.x, last.y - first.y).toFixed(0)}px ` +
        `over ${trace.frames.length} frames (${trace.moverGoneAt.toFixed(0)}ms), lands on its square, ` +
        `and the square it left stays lit to ${trace.originGoneAt.toFixed(0)}ms`,
    );
  }
} catch (err) {
  failure = String(err && err.message ? err.message : err);
  console.error("FAIL could not reach the engine's move:", failure);
} finally {
  await browser.close();
  server.close();
}
process.exit(failure ? 1 : 0);
