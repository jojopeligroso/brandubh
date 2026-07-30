/* Offline opening-book generator for the Ollamh tier. Run:
 *   npx tsx scripts/genbook.ts [--depth 8] [--margin 13] [--keep 3] [--plies 4] [--parallel 4] [--dry]
 *
 * Deep-searches the D4-folded opening tree and emits src/game/openingBook.data.ts,
 * the compact book the app bundles (loaded by src/game/openingBook.ts and served
 * to `ollamh` via OPENING_BOOK in ai.ts). The book is *deep-search best-effort* —
 * each booked position is searched at a fixed depth at least as deep as ollamh's
 * live opening search — NOT a solve; see docs/solving.md for why the opening
 * cannot be solved, and docs/ROADMAP.md Session 6 for the measured results.
 *
 * Coverage — two interleaved "cones", because the two sides ollamh can play need
 * books at opposite plies, and only positions the book itself steers into are
 * reachable through it:
 *   attacker cone: ply 0 (the opening), and ply 2 = every defender reply to every
 *     booked ply-0 move;
 *   defender cone: ply 1 = every attacker first move, and ply 3 = every attacker
 *     reply to every booked ply-1 move.
 * Positions are canonicalised under D4 as they are discovered, so each orbit is
 * searched once; the loader unfolds entries back to all orientations at import.
 * Beyond ply 3 the frontier grows ~(keep × replies)× per two plies — thousands of
 * positions — while live-search latency at ply 4+ is already mid-game-normal, so
 * deeper coverage is not worth the bundle weight (measured in the roadmap).
 *
 * Per position, the best-`keep` moves within `margin` of the best score are kept
 * (margin ≈ a third of a material unit — see EvalWeights.material = 40); ollamh
 * randomises among them at play time for variety. Moves outside the margin are
 * never booked, so variety cannot cost measurable strength.
 *
 * Deterministic: fixed depth, no deadline, no rng. `--parallel K` shards each
 * level's scoring across K child processes (same determinism per position).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreRootMoves } from "../src/game/ai";
import { canonicalHash, transformMove } from "../src/game/d4";
import { allMoves, applyMove, hashBoard, isGameOver } from "../src/game/engine";
import { encodeMove, rulesFingerprint } from "../src/game/openingBook";
import { BOARD_SIZE, type Board, type GameState, type Move, type Piece, type Side } from "../src/game/types";
import { VARIANTS } from "../src/game/variants";

const rules = VARIANTS.wtf; // the shipping default; the book is fingerprint-gated to it

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string, def: number): number => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : def;
};
const DEPTH = flag("depth", 8);
const MARGIN = flag("margin", 13);
const KEEP = flag("keep", 3);
const PLIES = flag("plies", 4); // number of plies covered (book plies 0..PLIES-1)
const PARALLEL = flag("parallel", 1);
const DRY = argv.includes("--dry");
const OUT = join(import.meta.dirname, "../src/game/openingBook.data.ts");

// ── Canonical-hash ⇄ state plumbing ──────────────────────────────────────────
// The whole pipeline works on canonical position hashes (hashBoard format).
// Search happens directly in the canonical orientation, so kept moves need no
// transform bookkeeping; the loader's 8-way unfold restores every orientation.
const PIECE: Record<string, Piece> = { a: "attacker", d: "defender", k: "king" };

function stateFromHash(hash: string): GameState {
  const board: Board = Array.from({ length: BOARD_SIZE }, () => Array<Piece | null>(BOARD_SIZE).fill(null));
  let attackers = 0;
  let defenders = 0;
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) {
      const g = hash[1 + r * BOARD_SIZE + c];
      if (g === ".") continue;
      board[r][c] = PIECE[g];
      if (g === "a") attackers++;
      else if (g === "d") defenders++;
    }
  const turn: Side = hash[0] === "A" ? "attackers" : "defenders";
  // Bare state: empty history (repetition is a non-factor this close to the
  // opening) and captures reconstructed from the board so evaluation-adjacent
  // consumers see consistent material.
  return {
    board,
    turn,
    status: "playing",
    moveCount: 0,
    history: [],
    captured: { attackers: 8 - attackers, defenders: 4 - defenders },
  };
}

const canonOf = (s: GameState): string => canonicalHash(hashBoard(s.board, s.turn)).hash;

interface Entry {
  hash: string; // canonical
  moves: Move[]; // canonical orientation, best-first
  best: number;
  scores: number[];
  nodes: number;
}

/** Score one canonical position and keep the best-N-within-margin moves. */
function scorePosition(hash: string, depth: number, margin = MARGIN, keep = KEEP): Entry {
  const state = stateFromHash(hash);
  const { best, within, nodes } = scoreRootMoves(state, rules, depth, margin);
  const kept = within.slice(0, keep);
  return { hash, moves: kept.map((k) => k.move), best, scores: kept.map((k) => k.score), nodes };
}

// ── Worker mode: score a shard of a level ─────────────────────────────────────
// All parameters ride in the shard file, never on argv — a worker must search
// exactly what the parent asked, not this file's flag defaults.
interface Shard {
  depth: number;
  margin: number;
  keep: number;
  hashes: string[];
}
if (argv[0] === "--worker") {
  const [, inFile, outFile] = argv;
  const shard: Shard = JSON.parse(readFileSync(inFile, "utf8"));
  const out = shard.hashes.map((h) => scorePosition(h, shard.depth, shard.margin, shard.keep));
  writeFileSync(outFile, JSON.stringify(out));
  process.exit(0);
}

// ── Level scoring (optionally sharded across child processes) ─────────────────
async function scoreLevel(label: string, hashes: string[], depth: number): Promise<Entry[]> {
  const t0 = performance.now();
  let entries: Entry[];
  if (PARALLEL <= 1 || hashes.length < PARALLEL * 4) {
    entries = [];
    for (const [i, h] of hashes.entries()) {
      const e = scorePosition(h, depth);
      entries.push(e);
      if ((i + 1) % 25 === 0 || i + 1 === hashes.length)
        console.log(`  ${label}: ${i + 1}/${hashes.length} (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
    }
  } else {
    const dir = mkdtempSync(join(tmpdir(), "genbook-"));
    const shards: string[][] = Array.from({ length: PARALLEL }, () => []);
    hashes.forEach((h, i) => shards[i % PARALLEL].push(h));
    await Promise.all(
      shards.map((shard, i) => {
        const inFile = join(dir, `in-${i}.json`);
        const outFile = join(dir, `out-${i}.json`);
        writeFileSync(inFile, JSON.stringify({ depth, margin: MARGIN, keep: KEEP, hashes: shard } satisfies Shard));
        return new Promise<void>((resolve, reject) => {
          const child = spawn(process.execPath, [...process.execArgv, process.argv[1], "--worker", inFile, outFile], {
            stdio: ["ignore", "inherit", "inherit"],
          });
          child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} exited ${code}`))));
          child.on("error", reject);
        });
      }),
    );
    entries = shards.flatMap((_, i) => JSON.parse(readFileSync(join(dir, `out-${i}.json`), "utf8")) as Entry[]);
    const byHash = new Map(entries.map((e) => [e.hash, e]));
    entries = hashes.map((h) => byHash.get(h)!);
  }
  const nodes = entries.reduce((n, e) => n + e.nodes, 0);
  console.log(
    `  ${label}: ${entries.length} positions, ${nodes.toLocaleString()} nodes, ${((performance.now() - t0) / 1000).toFixed(0)}s`,
  );
  return entries;
}

// ── Tree expansion ────────────────────────────────────────────────────────────
/** Positions after the *booked* moves of `entries` — the opponent-to-move layer. */
function afterBookMoves(entries: Entry[]): GameState[] {
  const out: GameState[] = [];
  for (const e of entries) {
    const state = stateFromHash(e.hash);
    for (const m of e.moves) {
      const child = applyMove(state, m, rules);
      if (!isGameOver(child.status)) out.push(child);
    }
  }
  return out;
}

/** Canonical hashes of every position after any legal reply from `states`,
 *  deduplicated (and excluding anything already booked). */
function expandReplies(states: GameState[], booked: Set<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of states) {
    for (const m of allMoves(s.board, s.turn, rules)) {
      const child = applyMove(s, m, rules);
      if (isGameOver(child.status)) continue;
      const h = canonOf(child);
      if (seen.has(h) || booked.has(h)) continue;
      seen.add(h);
      out.push(h);
    }
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`genbook: depth ${DEPTH}, margin ${MARGIN}, keep ${KEEP}, plies ${PLIES}, parallel ${PARALLEL}`);
  const t0 = performance.now();
  const book: Entry[] = [];
  const booked = new Set<string>();
  const record = (entries: Entry[]): Entry[] => {
    for (const e of entries)
      if (e.moves.length > 0 && !booked.has(e.hash)) {
        booked.add(e.hash);
        book.push(e);
      }
    return entries;
  };

  // Plies 0–1 are the most-played positions and the cheapest levels (1 + 5
  // positions), so they get an extra ply of depth for the same handful of
  // seconds. Deeper levels use the base depth.
  const rootDepth = DEPTH + 1;

  // Ply 0 — the opening, attackers to move (attacker cone root).
  const init = canonicalHash(openingHash()).hash;
  const e0 = PLIES > 0 ? record(await scoreLevel("ply 0", [init], rootDepth)) : [];

  // Ply 1 — every attacker first move (defender cone root).
  const e1 = PLIES > 1 ? record(await scoreLevel("ply 1", expandReplies([stateFromHash(init)], booked), rootDepth)) : [];

  // Ply 2 — every defender reply to the booked ply-0 moves (attacker cone).
  if (PLIES > 2) record(await scoreLevel("ply 2", expandReplies(afterBookMoves(e0), booked), DEPTH));

  // Ply 3 — every attacker reply to the booked ply-1 moves (defender cone).
  if (PLIES > 3) record(await scoreLevel("ply 3", expandReplies(afterBookMoves(e1), booked), DEPTH));

  // ── Emit ────────────────────────────────────────────────────────────────────
  const lines = book
    .map((e) => `${e.hash}:${e.moves.map(encodeMove).join(",")}`)
    .sort()
    .join("\n");
  const multi = book.filter((e) => e.moves.length > 1).length;
  const summary =
    `${book.length} folded entries (` +
    `${book.filter((e) => e.moves.length === 1).length}×1, ` +
    `${book.filter((e) => e.moves.length === 2).length}×2, ` +
    `${book.filter((e) => e.moves.length === 3).length}×3 moves), ` +
    `${multi} with variety`;
  console.log(`\n${summary}`);
  console.log(`total: ${((performance.now() - t0) / 1000 / 60).toFixed(1)} min`);

  if (DRY) {
    console.log("(--dry: not writing)");
    return;
  }
  const file = `// AUTO-GENERATED by scripts/genbook.ts — do not edit by hand.
// Regenerate: npx tsx scripts/genbook.ts --depth ${DEPTH} --margin ${MARGIN} --keep ${KEEP} --plies ${PLIES}
// ${summary}.
// Format: one line per canonical D4 position, \`<hashBoard>:<frfctrtc>,...\`
// — see src/game/openingBook.ts for the exact contract.

/** Gameplay-flag fingerprint of the ruleset the book was generated under
 *  (empty ⇒ no book). The book is only consulted when the live ruleset
 *  matches exactly. Typed \`string\` (not the literal) so the loader's
 *  empty-book guard stays a real comparison. */
export const BOOK_RULES_FINGERPRINT: string =
  ${JSON.stringify(rulesFingerprint(rules))};

export const BOOK_DATA: string = \`${lines}\`;
`;
  writeFileSync(OUT, file);
  console.log(`wrote ${OUT} (${(file.length / 1024).toFixed(1)} KB raw)`);
}

/** The standard opening in hashBoard format (attackers to move). */
function openingHash(): string {
  const b: string[] = Array(49).fill(".");
  const put = (r: number, c: number, g: string) => (b[r * 7 + c] = g);
  put(3, 3, "k");
  put(2, 3, "d");
  put(4, 3, "d");
  put(3, 2, "d");
  put(3, 4, "d");
  for (const [r, c] of [[0, 3], [1, 3], [5, 3], [6, 3], [3, 0], [3, 1], [3, 5], [3, 6]]) put(r, c, "a");
  return "A" + b.join("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
