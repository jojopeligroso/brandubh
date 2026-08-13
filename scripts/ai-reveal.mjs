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

// Once per board theme. The overlay the stone flies in is inset by `.board`'s
// own padding, and Ballinderry widens that padding into an ornament band
// (`--board-pad`, added with that theme) — so a literal inset would put the
// flight off its grid on that board and nowhere else. One theme cannot see
// that; two can. Everforest stands for every board whose margin is the shared
// 10px.
const THEMES = ["everforest", "ballinderry"];
const browser = await chromium.launch({ executablePath: CHROME });
const failures = [];
for (const theme of THEMES) {
const page = await browser.newPage({ viewport: { width: 860, height: 1880 } });
let failure = null;
try {
  await page.addInitScript(([saved, theme]) => {
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
      localStorage.setItem("brandubh.theme", theme);
      localStorage.setItem("brandubh.boardPresetSeen", "1");
      localStorage.setItem("brandubh.zen.enabled", "0");
    } catch {
      /* storage unavailable — the resume prompt simply won't appear and we fail below */
    }
  }, [SAVED, theme]);
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
          landing: null,
          // Every animation the board runs while the reveal is on screen, so a
          // failure can say what it saw instead of only what it wanted.
          animations: [],
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
            if (!out.sawMover) {
              // Where the stone *finishes* is read off the animation itself, not
              // off whichever sampled frame happened to be the last one. A
              // headless browser drops frames freely — an eighth of a second
              // between rAFs is normal here — so the final sample can easily be
              // mid-flight, and asserting the landing against it fails for the
              // frame rate rather than for the geometry.
              const board = document.querySelector(".board");
              const note = (e) =>
                out.animations.push(`${e.type.replace("animation", "")}:${e.animationName}@${Math.round(performance.now())}`);
              board.addEventListener("animationstart", note);
              board.addEventListener("animationend", note);
              board.addEventListener("animationcancel", note);
              out.moverSeenAt = Math.round(performance.now());
              // Not `{ once: true }`: the stone's travel and its lift are two
              // animations on nested elements that end at the same instant, and
              // the child's `ai-lift` bubbles to this same node — a one-shot
              // listener is eaten by whichever arrives first.
              mover.addEventListener("animationend", (e) => {
                if (e.animationName === "ai-slide") out.landing = centre(mover);
              });
            }
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
    const cells = trace.lastMoveCentres ?? [];
    const from = cells.find((c) => c.aiFrom);
    const dest = cells.find((c) => !c.aiFrom);
    const distinct = new Set(trace.frames.map((f) => `${f.x.toFixed(1)},${f.y.toFixed(1)}`)).size;

    // ── It travelled, rather than jumping ──────────────────────────────────
    // Sampled positions only have to separate "moved" from "did not move": a
    // headless run drops frames freely, so nothing here may depend on catching
    // any particular one.
    if (distinct < 3)
      problems.push(
        `the stone jumped rather than travelled: only ${distinct} distinct positions in ${trace.frames.length} frames`,
      );
    if (trace.landing && from) {
      // Genuinely in between at some point — not merely drawn at one end and
      // then the other.
      const between = trace.frames.some(
        (f) =>
          Math.hypot(f.x - from.x, f.y - from.y) > 8 &&
          Math.hypot(f.x - trace.landing.x, f.y - trace.landing.y) > 8,
      );
      if (!between)
        problems.push(
          "the stone was never caught between the two squares — it was drawn at each end, not travelling",
        );
    }

    // ── It ended on the right square ───────────────────────────────────────
    // Measured at the keyframe's end, not at a sampled frame.
    if (!trace.landing)
      problems.push(
        "the flight never ended: no `ai-slide` animationend. Stone first seen at " +
          `${trace.moverSeenAt}ms; animations on the board: ${trace.animations.filter((a) => a.includes("ai-")).join(", ") || "none"}`,
      );
    else if (!dest) problems.push("the move's destination square is not marked `.lastmove` on landing");
    else {
      const off = Math.hypot(trace.landing.x - dest.x, trace.landing.y - dest.y);
      // Tight, because a stone that stops even a tenth of a square off its own
      // grid is a misaligned overlay — which is exactly what a hardcoded inset
      // does on a board whose margin is not the shared one.
      if (off > trace.cell * 0.12)
        problems.push(
          `the stone did not land on the square the move went to: ${off.toFixed(1)}px off centre, cell is ${trace.cell.toFixed(1)}px`,
        );
      if (from) {
        const crossed = Math.hypot(trace.landing.x - from.x, trace.landing.y - from.y);
        if (crossed < trace.cell * 0.8)
          problems.push(
            `the stone did not cross a square: ${crossed.toFixed(1)}px from its origin, cell is ${trace.cell.toFixed(1)}px`,
          );
      }
    }

    // ── One stone, not two ─────────────────────────────────────────────────
    if (!trace.inFlightSeen)
      problems.push(
        "no `.piece.in-flight`: the real stone on the destination was never held back, so it and the travelling copy were both on the board",
      );
    else if (trace.inFlightVisibility !== "hidden")
      problems.push(
        `the held stone is visible (visibility: ${trace.inFlightVisibility}) while its copy is in flight — two stones, one move`,
      );

    // ── The square it left outlasts the flight ─────────────────────────────
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
    console.error(`FAIL engine move reveal [${theme}]:\n  ` + failure);
  } else {
    const from = (trace.lastMoveCentres ?? []).find((c) => c.aiFrom);
    const crossed = Math.hypot(trace.landing.x - from.x, trace.landing.y - from.y);
    console.log(
      `ok [${theme}] the engine's stone crosses ${crossed.toFixed(0)}px (${(crossed / trace.cell).toFixed(1)} squares) ` +
        `to land on its square, seen in flight over ${trace.frames.length} frames, ` +
        `and the square it left stays lit to ${trace.originGoneAt.toFixed(0)}ms`,
    );
  }
} catch (err) {
  failure = String(err && err.message ? err.message : err);
  console.error(`FAIL [${theme}] could not reach the engine's move:`, failure);
} finally {
  await page.close();
}
if (failure) failures.push(theme);
}
await browser.close();
server.close();
process.exit(failures.length ? 1 : 0);
