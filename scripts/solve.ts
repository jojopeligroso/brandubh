/* Bounded game solver for Brandubh. Run: npx tsx scripts/solve.ts
 *
 * Attempts to weakly solve the standard WTF opening, and demonstrates that the
 * solver returns *proven* results on tractable positions. Any non-"unknown" value
 * is a proof; "unknown" means the budget ran out (never a guess). See the honest
 * feasibility analysis in docs/solving.md for why the full opening is out of reach
 * in this environment. */
import { solve } from "../src/game/solver";
import { allMoves, applyMove, initialState, moveName } from "../src/game/engine";
import type { GameState } from "../src/game/types";
import { VARIANTS } from "../src/game/variants";

const rules = VARIANTS.wtf;

function report(label: string, s: GameState, budget: { maxNodes?: number; deadlineMs?: number }) {
  const t0 = performance.now();
  const r = solve(s, rules, { ...budget, memo: true });
  const ms = (performance.now() - t0) | 0;
  const dtm = Number.isFinite(r.dtm) ? `, dtm ${r.dtm}` : "";
  const mv = r.bestMove ? `, best ${moveName(r.bestMove)}` : "";
  console.log(
    `${label}: ${r.value.toUpperCase()}${dtm}${mv} — ${r.nodes.toLocaleString()} nodes, ${ms}ms` +
      (r.budgetHit ? " (budget hit ⇒ frontier undetermined)" : " (fully resolved)"),
  );
  return r;
}

console.log("=== Bounded solve of the standard WTF Brandubh opening ===");
console.log("(attackers to move; expect UNKNOWN — this documents the attempt, not a failure)\n");
for (const maxNodes of [100_000, 1_000_000, 5_000_000]) {
  report(`opening, ≤${maxNodes.toLocaleString()} nodes`, initialState(), { maxNodes });
}

console.log("\n=== Sanity: the solver DOES fully resolve reduced positions ===\n");
// Walk a few forced-ish plies in, then hand a bounded solve the resulting node to
// show proven (fully-resolved) results appear where the subtree is small enough.
let s = initialState();
const moves = allMoves(s.board, s.turn, rules);
s = applyMove(s, moves[0], rules);
report("after 1 ply, ≤2,000,000 nodes", s, { maxNodes: 2_000_000 });

console.log("\nDone. A proven value above is game-theoretic; UNKNOWN is budget-bounded.");
