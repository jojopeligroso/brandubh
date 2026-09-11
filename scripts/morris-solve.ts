/* Offline endgame-database generator for Nine Men's Morris. Run:
 *   npx tsx scripts/morris-solve.ts --max-stones 8 [--out public/morris/db]
 *                                   [--budget-bytes 1500000] [--no-verify] [--dry]
 *
 * Computes one table per ordered stone-count pair (m = stones of the side to move,
 * o = the other side's) for every m, o ≥ 3 with m + o ≤ --max-stones, by the
 * retrograde analysis in src/game/morris/db/retrograde.ts — Gasser's method, scaled
 * down to what a 2 MB static site can ship. "Solving Nine Men's Morris"
 * (Computational Intelligence 12(1):24–41, 1996) solved 28 tables of ≈10¹⁰ states
 * this way; --max-stones 8 is six tables and ~12 M states, which is the part that
 * fits in a download (⚠ UNVERIFIED (excerpt): the paper's full text is unreachable
 * from this environment — see docs/morris-rules.md).
 *
 * Order is forced, not chosen: a level is a *total* (6 = {3-3}, 7 = {3-4, 4-3},
 * 8 = {4-4} and {3-5, 5-3}), the pair {(m,o), (o,m)} is one problem because a plain
 * step swaps the two, and a capture drops to a lower total that must already be
 * solved. Each table is then run through the verifier — every entry re-derived from
 * freshly generated successors, as Gasser's separate verifier program did — and a
 * table that does not verify is not written.
 *
 * ## What it prints, and the one number that is advice rather than result
 *
 * Per table: entries, win/loss/draw, the deepest forced win, raw bytes, gzip bytes,
 * and solve/verify seconds. Then, for information only, the gzip size of the same
 * table with the *depths thrown away* (2 bits per position, four per byte). Shipping
 * depths is what lets the engine pick the fastest win instead of shuffling inside a
 * won position, and the difference between those two columns is what that costs in
 * download — a number the owner asked to see rather than be argued at.
 *
 * ## Shipping
 *
 * --budget-bytes (default 1.5 MB) is a cumulative cap on the *compressed* total.
 * Tables are offered smallest-gzip-first and written while they fit; the rest are
 * still generated, verified and reported, just not written, and the manifest lists
 * only what was written. That ordering is deliberate: the small tables are the deep
 * endgames a game actually reaches, and a half-shipped set is not a correctness
 * problem — a missing table is a `null` probe and the engine searches instead.
 *
 * Writes <out>/<m>-<o>.bin.gz (gzip level 9) and <out>/manifest.json. Deterministic:
 * same flags, same bytes, same hashes — there is no rng anywhere in a retrograde
 * analysis.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { GASSER_DB_RULES } from "../src/game/morris/db/generate";
import { DB_FORMAT, type Manifest, type ManifestTable } from "../src/game/morris/db/loader";
import {
  type SolvedTable,
  levelOrder,
  solveLevel,
  verifyTable,
} from "../src/game/morris/db/retrograde";

interface Flags {
  maxStones: number;
  out: string;
  budgetBytes: number;
  verify: boolean;
  dry: boolean;
}

function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = {
    maxStones: 8,
    out: "public/morris/db",
    budgetBytes: 1_500_000,
    verify: true,
    dry: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${arg}`);
      return v;
    };
    if (arg === "--max-stones") flags.maxStones = Number(next());
    else if (arg === "--out") flags.out = next();
    else if (arg === "--budget-bytes") flags.budgetBytes = Number(next());
    else if (arg === "--no-verify") flags.verify = false;
    else if (arg === "--dry") flags.dry = true;
    else throw new Error(`unknown flag ${arg}`);
  }
  if (!Number.isInteger(flags.maxStones) || flags.maxStones < 6 || flags.maxStones > 18) {
    throw new Error("--max-stones must be an integer from 6 to 18");
  }
  return flags;
}

/** The same table with the depths thrown away: two bits per position, four per
 *  byte, low bits first. Measurement only — nothing reads this encoding. */
function packWdlOnly(values: Uint8Array): Uint8Array {
  const out = new Uint8Array((values.length + 3) >> 2);
  for (let i = 0; i < values.length; i++) {
    out[i >> 2] |= (values[i] & 3) << ((i & 3) * 2);
  }
  return out;
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const pad = (s: string, n: number): string => (s.length >= n ? s : " ".repeat(n - s.length) + s);
const kb = (n: number): string => `${(n / 1024).toFixed(1)}K`;

interface Measured {
  table: SolvedTable;
  gz: Uint8Array;
  wdlGzBytes: number;
  solveMs: number;
  verifyMs: number;
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2));
  const started = Date.now();
  console.log(
    `morris-solve: max-stones=${flags.maxStones} rules=${JSON.stringify(GASSER_DB_RULES)}`,
  );

  const solved = new Map<string, Uint8Array>();
  const measured: Measured[] = [];

  for (const [a, b] of levelOrder(flags.maxStones)) {
    const levelStart = Date.now();
    const tables = solveLevel(a, b, GASSER_DB_RULES, solved, { log: (l) => console.log(l) });
    const solveMs = Date.now() - levelStart;
    const level = new Map(tables.map((t) => [t.key, t.values] as const));
    for (const t of tables) solved.set(t.key, t.values);
    for (const t of tables) {
      let verifyMs = 0;
      if (flags.verify) {
        const v0 = Date.now();
        const report = verifyTable(t, GASSER_DB_RULES, level, solved);
        verifyMs = Date.now() - v0;
        if (report.valueErrors > 0 || report.depthErrors > 0) {
          for (const problem of report.problems) console.error(`  ✗ ${problem}`);
          throw new Error(
            `verify ${t.key}: ${report.valueErrors} value and ${report.depthErrors} depth` +
              ` disagreements over ${report.checked} entries — not written`,
          );
        }
        console.log(`  verified ${t.key}: ${report.checked} entries, 0 disagreements`);
      }
      if (t.stats.depthOverflow > 0) {
        console.warn(
          `  ! ${t.key}: ${t.stats.depthOverflow} entries deeper than the 6-bit depth field`,
        );
      }
      const gz = gzipSync(t.values, { level: 9 });
      const wdlGz = gzipSync(packWdlOnly(t.values), { level: 9 });
      measured.push({ table: t, gz, wdlGzBytes: wdlGz.length, solveMs, verifyMs });
    }
  }

  // ── Ship smallest-first while the compressed total fits ────────────────────
  const order = [...measured].sort((x, y) => x.gz.length - y.gz.length);
  const shipped: Measured[] = [];
  let total = 0;
  for (const m of order) {
    if (total + m.gz.length > flags.budgetBytes) continue;
    shipped.push(m);
    total += m.gz.length;
  }

  console.log("");
  console.log(
    `${pad("table", 6)} ${pad("entries", 10)} ${pad("win", 10)} ${pad("loss", 10)} ` +
      `${pad("draw", 10)} ${pad("depth", 6)} ${pad("raw", 9)} ${pad("gzip", 9)} ` +
      `${pad("wdl-gz", 9)} ${pad("solve", 8)} ${pad("verify", 8)} ship`,
  );
  for (const m of measured) {
    const s = m.table.stats;
    console.log(
      `${pad(s.key, 6)} ${pad(String(s.entries), 10)} ${pad(String(s.win), 10)} ` +
        `${pad(String(s.loss), 10)} ${pad(String(s.draw), 10)} ${pad(String(s.maxDepth), 6)} ` +
        `${pad(kb(s.entries), 9)} ${pad(kb(m.gz.length), 9)} ${pad(kb(m.wdlGzBytes), 9)} ` +
        `${pad(`${(m.solveMs / 1000).toFixed(1)}s`, 8)} ` +
        `${pad(`${(m.verifyMs / 1000).toFixed(1)}s`, 8)} ` +
        `${shipped.includes(m) ? "yes" : "no"}`,
    );
  }
  const rawTotal = measured.reduce((n, m) => n + m.table.stats.entries, 0);
  const gzTotal = measured.reduce((n, m) => n + m.gz.length, 0);
  const wdlTotal = measured.reduce((n, m) => n + m.wdlGzBytes, 0);
  console.log(
    `all ${measured.length} tables: ${rawTotal} entries, ${kb(gzTotal)} gzip` +
      ` (${kb(wdlTotal)} without depths — ${(((gzTotal - wdlTotal) / gzTotal) * 100).toFixed(0)}%` +
      ` of the download is depth)`,
  );
  console.log(
    `shipping ${shipped.length}/${measured.length}: ${shipped
      .map((m) => m.table.key)
      .join(", ")} = ${kb(total)} of a ${kb(flags.budgetBytes)} budget`,
  );

  if (flags.dry) {
    console.log(`dry run: nothing written (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    return;
  }

  if (!existsSync(flags.out)) mkdirSync(flags.out, { recursive: true });
  const entries: ManifestTable[] = [];
  for (const m of shipped) {
    const s = m.table.stats;
    writeFileSync(`${flags.out}/${s.key}.bin.gz`, m.gz);
    entries.push({
      key: s.key,
      m: s.m,
      o: s.o,
      entries: s.entries,
      bytes: s.entries,
      gzipBytes: m.gz.length,
      sha256: sha256(m.table.values),
      win: s.win,
      loss: s.loss,
      draw: s.draw,
      maxDepth: s.maxDepth,
    });
  }
  entries.sort((x, y) => (x.key < y.key ? -1 : 1));
  const manifest: Manifest = {
    format: DB_FORMAT,
    variant: "morris-gasser-1",
    rules: GASSER_DB_RULES,
    generated: `npx tsx scripts/morris-solve.ts --max-stones ${flags.maxStones}`,
    tables: entries,
  };
  writeFileSync(`${flags.out}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `wrote ${entries.length} tables + manifest.json to ${flags.out}` +
      ` in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

main();
