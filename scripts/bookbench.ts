/* Opening-book measurements for the Ollamh tier. Run: npx tsx scripts/bookbench.ts
 *   [--games 24] [--depth 5] [--skip-gauntlet]
 *
 * Reports the three numbers the roadmap requires before the book may ship:
 *   (a) opening latency — booked reply vs ollamh's live budgeted search;
 *   (b) opening variety — distinct openings over seeded games, book vs none;
 *   (c) a strength gauntlet — same engine at a fixed depth, with the book vs
 *       without, both colours — the book must measure ≥ neutral.
 * Deterministic where it matters: seeded rng, fixed-depth self-play; only the
 * latency section runs ollamh's real wall-clock budget.
 */
import { chooseMoveDetailed, FULL_CONFIG, OPENING_BOOK, pickMove, resetTT } from "../src/game/ai";
import { allMoves, applyMove, hashBoard, initialState, isGameOver, moveName, winnerOf } from "../src/game/engine";
import type { GameState, Move, Side } from "../src/game/types";
import { VARIANTS } from "../src/game/variants";

const rules = VARIANTS.wtf;
const argv = process.argv.slice(2);
const flag = (name: string, def: number): number => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : def;
};
const GAMES = flag("games", 24);
const DEPTH = flag("depth", 5);

/** Deterministic PRNG (mulberry32), as in aibench. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The book side's move: a legal booked candidate (seeded pick) or null.
 *  Mirrors bookMove in ai.ts (which is internal by design). */
function bookPick(s: GameState, rng: () => number): Move | null {
  const hits = OPENING_BOOK[hashBoard(s.board, s.turn)];
  if (!hits || hits.length === 0) return null;
  const legal = allMoves(s.board, s.turn, rules);
  const candidates = hits.filter((h) =>
    legal.some((m) => m.from.row === h.from.row && m.from.col === h.from.col && m.to.row === h.to.row && m.to.col === h.to.col),
  );
  return candidates.length ? candidates[Math.floor(rng() * candidates.length)] : null;
}

// ── (a) Opening latency: booked vs live ollamh search ─────────────────────────
console.log("── Opening latency: book vs ollamh live search ──");
{
  // The opening (ollamh as attackers) and a ply-1 reply (ollamh as defenders).
  const positions: Array<[string, GameState]> = [["opening (attackers)", initialState()]];
  const s1 = applyMove(initialState(), allMoves(initialState().board, "attackers", rules)[7], rules);
  positions.push(["after 1 attacker move (defenders)", s1]);
  for (const [label, s] of positions) {
    const t0 = performance.now();
    const booked = chooseMoveDetailed(s, "ollamh", rules, mulberry32(1));
    const tBook = performance.now() - t0;
    resetTT();
    const t1 = performance.now();
    const live = pickMove(s, rules, { maxDepth: 12, deadlineMs: 8000, minDepth: 5 }, FULL_CONFIG, mulberry32(1));
    const tLive = performance.now() - t1;
    console.log(
      `  ${label}: book ${moveName(booked.move!)} in ${tBook.toFixed(1)}ms (depth ${booked.depth}) · ` +
        `live ${moveName(live.move!)} in ${(tLive / 1000).toFixed(1)}s (depth ${live.depth})`,
    );
  }
}

// ── (b) Opening variety over the booked plies ─────────────────────────────────
console.log("\n── Opening variety (first 4 plies, both sides ollamh) ──");
{
  const sequences = new Set<string>();
  const firsts = new Set<string>();
  const SEEDS = 24;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const rng = mulberry32(seed);
    let s = initialState();
    const line: string[] = [];
    for (let ply = 0; ply < 4 && !isGameOver(s.status); ply++) {
      const r = chooseMoveDetailed(s, "ollamh", rules, rng);
      if (!r.move || r.depth !== -1) throw new Error(`unexpected book miss at ply ${ply} — booked lines should cover plies 0–3`);
      line.push(moveName(r.move));
      s = applyMove(s, r.move, rules);
    }
    firsts.add(line[0]);
    sequences.add(line.join(" "));
  }
  console.log(`  with book: ${sequences.size} distinct 4-ply openings, ${firsts.size} distinct first moves (${SEEDS} seeds)`);

  // Without the book: ollamh's search at its typical opening depth (8), where
  // variety can only come from exact-tie randomization.
  const noBookSeqs = new Set<string>();
  const noBookFirsts = new Set<string>();
  const NB_SEEDS = 8;
  for (let seed = 1; seed <= NB_SEEDS; seed++) {
    const rng = mulberry32(seed);
    let s = initialState();
    const line: string[] = [];
    for (let ply = 0; ply < 4 && !isGameOver(s.status); ply++) {
      resetTT();
      const r = pickMove(s, rules, { maxDepth: 8 }, FULL_CONFIG, rng);
      line.push(moveName(r.move!));
      s = applyMove(s, r.move!, rules);
    }
    noBookFirsts.add(line[0]);
    noBookSeqs.add(line.join(" "));
  }
  console.log(`  without:   ${noBookSeqs.size} distinct 4-ply openings, ${noBookFirsts.size} distinct first moves (${NB_SEEDS} seeds, fixed depth 8)`);
}

// ── (c) Strength gauntlet: with book vs without, fixed depth ──────────────────
if (!argv.includes("--skip-gauntlet")) {
  console.log(`\n── Gauntlet: book vs no-book at fixed depth ${DEPTH}, ${GAMES} games ──`);
  const playGame = (bookSide: Side, seed: number): Side | "draw" | null => {
    const rngA = mulberry32(seed * 2 + 1);
    const rngD = mulberry32(seed * 2 + 2);
    let s: GameState = initialState();
    let plies = 0;
    while (!isGameOver(s.status) && plies < 200) {
      const rng = s.turn === "attackers" ? rngA : rngD;
      let move: Move | null = s.turn === bookSide ? bookPick(s, rng) : null;
      if (!move) {
        resetTT();
        move = pickMove(s, rules, { maxDepth: DEPTH }, FULL_CONFIG, rng).move;
      }
      if (!move) break;
      s = applyMove(s, move, rules);
      plies++;
    }
    return isGameOver(s.status) ? winnerOf(s.status) : null;
  };

  let bookWins = 0;
  let plainWins = 0;
  let other = 0;
  const t0 = performance.now();
  for (let i = 0; i < GAMES; i++) {
    const bookSide: Side = i % 2 === 0 ? "attackers" : "defenders";
    const w = playGame(bookSide, 100 + (i >> 1));
    if (w === bookSide) bookWins++;
    else if (w === "attackers" || w === "defenders") plainWins++;
    else other++;
    console.log(`  game ${i + 1}/${GAMES}: book as ${bookSide} → ${w ?? "unfinished"} (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
  }
  console.log(`\n  book ${bookWins} — no-book ${plainWins} — draw/none ${other}  (of ${GAMES})`);
  console.log("  ship bar: book wins ≥ no-book wins (never ship a measured regression).");
}
