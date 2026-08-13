// Regenerate the Ballinderry board's ornament panels.
//   node scripts/gen-ballinderry-ornament.mjs
//
// Writes src/ballinderry/*.svg, which src/index.css pulls in as mask layers on
// the Ballinderry board's frame (see the theme block there). The files are
// checked in — this script exists so the geometry is adjustable and reviewable,
// not because the build runs it.
//
// ⚠ These are RECONSTRUCTIONS FROM PUBLISHED DESCRIPTIONS, not traces of the
// object. See docs/ballinderry-board.md for exactly what is attested and what
// is filled in. If you get to the NMI photographs or the Discovery Programme's
// 3D model, replace the files wholesale — nothing else in the CSS needs to
// change, the panels are just masks.
//
// The shapes are strokes, not fills, because the ornament on the board is
// incised: what you see is the kerf, and a stroked outline is the honest
// primitive for it. The masks are alpha-only; index.css supplies the ink.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const OUT_DIR = new URL("../src/ballinderry/", import.meta.url).pathname;

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
  `<g fill="none" stroke="#fff" stroke-linecap="round">${body}</g></svg>\n`;

const r2 = (n) => Number(n.toFixed(3));

// ── Plain plait ──────────────────────────────────────────────────────────────
// A plait panel is the two families of 45° lines, spaced `s` apart, clipped to
// the band. `n` is the strand count in the ordinary sense — the number of
// ribbons a cut straight across the band passes through — and the two families
// contribute half each, so s = 2H / n. (n = 2 lands on the plain two-strand
// twist, which is the check that the definition is the usual one.)
//
// Over-and-under comes from breaking one line at every *other* crossing. Along
// a +1 line the crossings fall every s/2 in x — arc length s/√2 — so alternate
// ones are s·√2 apart, and that is the dash period. The two families break on
// the complementary halves of that alternation, half a period apart, and it is
// the alternation that reads as interlace rather than as a lattice.
//
// The phase matters and is not free: measured from where a line meets the top
// of the band, the first crossing sits at (H/2)·√2 along it, which is *not*
// generally a whole number of dash periods. Getting this wrong is what a wrong
// version of this file looked like — dashes ending in mid-air between the
// crossings, with the round caps reading as loose blobs.
//
// The band is closed top and bottom with a framing line, which is also how the
// ribbons' turns at the panel edge read once the panel is a few pixels tall.
function plait({ n, H = 24, weight = 1.4 }) {
  const s = (2 * H) / n;
  const W = 2 * H; // whole multiple of s, so the tile repeats seamlessly
  const period = s * Math.SQRT2; // arc length between alternate crossings
  const gap = Math.min(weight * 2.4, period * 0.4);
  const dash = `${r2(period - gap)} ${r2(gap)}`;
  // Arc length from a line's start to its first crossing with the other family.
  const firstCrossing = (H / 2) * Math.SQRT2;
  // A dash pattern starting at arc 0 puts its gap centre at dash + gap/2, and
  // dashoffset δ shifts arc a to pattern position a + δ. Solving for a gap
  // centred on the crossings gives δ = dash + gap/2 − firstCrossing, and the
  // second family takes the complementary crossings, half a period on.
  const phase = (extra) => {
    const d = period - gap + gap / 2 - firstCrossing + extra;
    return r2(((d % period) + period) % period);
  };
  const lines = [];

  // Both families run the full diagonal extent of the tile; the viewBox crops.
  for (let c = -H; c <= W + H; c += s) {
    // slope +1: from the line's entry on the top edge to its exit on the bottom
    lines.push(
      `<path d="M${r2(c)},0 L${r2(c + H)},${H}" stroke-width="${weight}" ` +
        `stroke-dasharray="${dash}" stroke-dashoffset="${phase(0)}"/>`,
    );
    // slope −1, breaking on the crossings the other family passes over
    lines.push(
      `<path d="M${r2(c)},${H} L${r2(c + H)},0" stroke-width="${weight}" ` +
        `stroke-dasharray="${dash}" stroke-dashoffset="${phase(period / 2)}"/>`,
    );
  }

  const frame =
    `<path d="M0,${r2(weight / 2)} H${W}" stroke-width="${weight}"/>` +
    `<path d="M0,${r2(H - weight / 2)} H${W}" stroke-width="${weight}"/>`;

  // No clip path: the lines already stay inside the band vertically, and the
  // viewBox crops the horizontal overhang when the file is used as a tile.
  return svg(W, H, lines.join("") + frame);
}

// ── Borre ring-chain ─────────────────────────────────────────────────────────
// The ring-chain alternates ring, lozenge, ring, lozenge along a line. This is
// a *tile*, one ring wide, with the lozenge split across the two vertical
// edges: repeat it and the halves meet, so any width of chain is available and
// the corner blocks are just two or three tiles of it.
//
// The lozenge passes over the ring — the ring is what gets broken. Real Borre
// alternates over and under around the ring; holding one choice throughout is
// the simplification a 26px panel can carry, and it is recorded as such in
// docs/ballinderry-board.md.
function ringChain({ B = 24, weight = 1.6, units = 1, vertical = false }) {
  const c = B / 2;
  // The ring wants as much of the tile as it can have and the breaks in it want
  // to be as small as they can be: a band is only ~20px on a phone, and at that
  // size a thin ring with generous gaps stops reading as a ring at all — it
  // reads as two loose arcs. This is the whole reason these numbers are tuned
  // rather than eyeballed once.
  const r = B * 0.36;
  const halfW = B * 0.32; // lozenge half-width; it straddles the tile edges
  const halfH = B * 0.3;

  // A lozenge centred on x, drawn with the hooked terminals at its points that
  // are what separate Borre from a plain chain of diamonds.
  const lozenge = (x) =>
    `<path d="M${r2(x - halfW)},${r2(c)} L${r2(x)},${r2(c - halfH)} ` +
    `L${r2(x + halfW)},${r2(c)} L${r2(x)},${r2(c + halfH)} Z" stroke-width="${weight}"/>` +
    `<path d="M${r2(x)},${r2(c - halfH)} q${r2(B * 0.11)},${r2(-B * 0.05)} ${r2(B * 0.13)},${r2(B * 0.07)}" stroke-width="${weight}"/>` +
    `<path d="M${r2(x)},${r2(c + halfH)} q${r2(-B * 0.11)},${r2(B * 0.05)} ${r2(-B * 0.13)},${r2(-B * 0.07)}" stroke-width="${weight}"/>`;

  // Two gaps in the ring, left and right, where the lozenges cross it.
  const circumference = 2 * Math.PI * r;
  const gap = weight * 2.1;
  const seg = circumference / 2 - gap;

  const W = B * units;
  let body = "";
  for (let k = 0; k < units; k++) {
    const cx = k * B + c;
    body +=
      `<circle cx="${r2(cx)}" cy="${r2(c)}" r="${r2(r)}" stroke-width="${weight}" ` +
      `stroke-dasharray="${r2(seg)} ${r2(gap)}" stroke-dashoffset="${r2(seg / 2 + gap / 2)}"/>` +
      lozenge(k * B);
  }
  body += lozenge(W); // closes the last ring; also makes a 1-unit tile repeat

  // The vertical variant is the same chain turned a quarter turn, so the two
  // orientations cannot drift apart. rotate(90) sends (x,y) to (−y,x), so the
  // translate puts it back inside a viewBox with the dimensions swapped.
  return vertical
    ? svg(B, W, `<g transform="translate(${B},0) rotate(90)">${body}</g>`)
    : svg(W, B, body);
}

const FILES = {
  // Attested: "two panels have plain five- and six-strand interlace".
  "plait-6.svg": plait({ n: 6 }),
  "plait-5.svg": plait({ n: 5 }),
  // Attested: "two at opposite corners have ring-chain interlace in the
  // Scandinavian Borre style". Three units running down the side band is about
  // the most the corner of a board this size has room for.
  "ring-chain-v.svg": ringChain({ units: 3, vertical: true }),
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, body] of Object.entries(FILES)) {
  const path = OUT_DIR + name;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  console.log("wrote", path, `(${body.length} bytes)`);
}
