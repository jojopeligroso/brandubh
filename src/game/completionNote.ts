// ── The completion note: one line, after a puzzle is done ────────────────────
//
// What the learner is told once a **Puzzle** is solved or revealed. A single
// line, chosen from fixed templates and never generated: this file picks a
// *template id*, the component looks it up in `i18n.ts`, and the test checks the
// choice rather than the prose. Copy that is assembled at runtime cannot be
// translated, cannot be reviewed, and cannot be tested for what it says.
//
// ## Three layers, most specific first
//
//   1. **The motif.** If a recogniser named the tactic (8c), say the name. It is
//      the most useful thing anyone can be told about a position, and it is the
//      only layer whose copy the learner can carry to another board.
//   2. **The dominant evaluation term.** No motif, but something specific moved:
//      soldiers, an escape lane, the king's road to a corner, the raiders' grip.
//      Naming the term that moved says *what the move did* without claiming a
//      pattern nobody recognised.
//   3. **The plain banded line.** Nothing specific: "Correct", plus what the
//      position is now — "Raiders have a crushing advantage".
//
// ## Two things this file must never say, and why
//
// **No distance to mate, ever.** `Puzzle.dtm` exists so the truncation claim can
// be re-checked and for no other reason.
//
// **Never "the game is over".** A **Truncated** line stops before the game does,
// and ADR-0002's whole intent is that a truncated line reads *exactly* like a
// short decisive one. A note that said "the game is over" would be false on a
// truncated line and — worse — its absence would tell the learner the line had
// been cut, which is the one thing the truncation is hiding.
//
// That second rule is also why layer 2 is skipped entirely for the proof goals.
// `regicide` and `escape` are the goals whose lines get truncated, and the board
// terms are exactly what would differ between a line that ran to the capture and
// one that stopped three moves short. A proven outcome gets the proven outcome
// as its note, from layer 3, and the board is not consulted.

import { DEFAULT_WEIGHTS } from "./ai";
import { CORNERS, findKing, inBounds } from "./engine";
import { isProof, type Puzzle } from "./puzzleBank";
import { BOARD_SIZE, type Board, type GameState, type Side } from "./types";

/**
 * The layers, named. `layer` says which i18n table to look the note up in;
 * `key` is the row within it.
 *
 * Splitting the two is what keeps the lookup a lookup: the component indexes
 * `t.puzzleNoteMotifs` / `t.puzzleNoteTerms` / `t.puzzleNoteGoals` by `key` and
 * makes no decision of its own, and the test asserts the pair without ever
 * reading a string of copy.
 *
 * A compound key joins on `:` and not on `.`, because `i18n.test.ts` walks the
 * translation tables into dotted paths to prove every locale is complete — a
 * dot inside a key makes a nested table out of a flat one and the completeness
 * check stops being able to read it.
 */
export type NoteLayer = "motif" | "term" | "goal";

export interface CompletionNote {
  layer: NoteLayer;
  key: string;
}

/**
 * The evaluation terms this file is willing to name.
 *
 * A deliberate subset of `EvalWeights`. Each of these is something a person can
 * see on the board after the fact — a soldier gone, a lane open, the king nearer
 * a corner, another raider against him. `kingRegion`, `mobility` and the rest
 * are real terms and say nothing a learner can act on, so they are not offered.
 */
export type EvalTerm = "material" | "escapeLane" | "kingCorner" | "hug";

const TERMS: readonly EvalTerm[] = ["material", "escapeLane", "kingCorner", "hug"];

/**
 * How far a term must move before it is worth naming: one soldier, in the
 * evaluation's own units.
 *
 * Borrowed rather than invented — it is `DEFAULT_WEIGHTS.material`, the same
 * anchor `EVAL_CUTS` is reasoned against in `puzzleBank.ts`. Below it, the line
 * shifted the position without doing any one nameable thing, and layer 3's plain
 * statement of where the position stands is the honest answer.
 */
const TERM_CUT = DEFAULT_WEIGHTS.material;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * The four terms, attacker-positive, in the evaluation's own weights.
 *
 * Computed here rather than imported because `ai.ts`'s copies are private search
 * internals that return one summed number: `evaluate` cannot say *which* term
 * moved, which is the only question this file asks. What is duplicated is a
 * little geometry, not the evaluation — there is no second opinion about the
 * position here, only a decomposition of the first one.
 */
function terms(state: GameState): Record<EvalTerm, number> | null {
  const b = state.board;
  const w = DEFAULT_WEIGHTS;
  const k = findKing(b);
  // No king on the board means the position is past the end of a proof, and
  // three of the four terms are undefined. Proof goals never reach here.
  if (!k) return null;

  let attackers = 0;
  let defenders = 0;
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = b[r][c];
      if (p === "attacker") attackers++;
      else if (p === "defender") defenders++;
    }

  let best = 99;
  for (const corner of CORNERS) {
    const d =
      (k.row === corner.row || k.col === corner.col ? 1 : 2) +
      (Math.abs(k.row - corner.row) + Math.abs(k.col - corner.col)) / 100;
    best = Math.min(best, d);
  }

  const open = openLanes(b, k.row, k.col);

  let hug = 0;
  for (const [dr, dc] of DIRS) {
    const nr = k.row + dr;
    const nc = k.col + dc;
    if (inBounds(nr, nc) && b[nr][nc] === "attacker") hug++;
  }

  return {
    material: (attackers - defenders * 2) * w.material,
    kingCorner: best * w.kingCorner,
    escapeLane: -(open * open) * w.escapeLane,
    hug: hug * w.hug,
  };
}

/** Corners the king could slide to right now down an unobstructed straight
 *  path. The `escapeLane` term's input, and nothing else. */
function openLanes(b: Board, kr: number, kc: number): number {
  let open = 0;
  for (const corner of CORNERS) {
    if (corner.row !== kr && corner.col !== kc) continue;
    let blocked = false;
    if (corner.row === kr) {
      const step = corner.col > kc ? 1 : -1;
      for (let c = kc + step; c !== corner.col; c += step)
        if (b[kr][c] !== null) {
          blocked = true;
          break;
        }
    } else {
      const step = corner.row > kr ? 1 : -1;
      for (let r = kr + step; r !== corner.row; r += step)
        if (b[r][kc] !== null) {
          blocked = true;
          break;
        }
    }
    if (!blocked) open++;
  }
  return open;
}

/**
 * The term that moved furthest in the solver's favour, or null if none moved
 * far enough to be worth a sentence.
 *
 * Exported for the test, which is the only way to check layer 2 chose the right
 * term rather than merely chose layer 2.
 */
export function dominantTerm(start: GameState, end: GameState, side: Side): EvalTerm | null {
  const a = terms(start);
  const b = terms(end);
  if (!a || !b) return null;
  let bestTerm: EvalTerm | null = null;
  let bestGain = 0;
  for (const term of TERMS) {
    // Every term is attacker-positive, as everything from `evaluate` is.
    const delta = b[term] - a[term];
    const gain = side === "attackers" ? delta : -delta;
    if (gain >= TERM_CUT && gain > bestGain) {
      bestGain = gain;
      bestTerm = term;
    }
  }
  return bestTerm;
}

/**
 * The note for a finished puzzle.
 *
 * `start` is the position the learner was shown — the stored position with the
 * lead-in played — and `end` is the position after the whole **Line**. The
 * caller holds both because it holds the board; nothing is re-derived here.
 *
 * `side` is the solver's side. Passed rather than taken from the puzzle so this
 * stays a pure function of two positions and a side, which is what makes the
 * test able to hand it hand-built boards.
 */
export function completionNote(
  puzzle: Puzzle,
  start: GameState,
  end: GameState,
  side: Side,
): CompletionNote {
  if (puzzle.motif) return { layer: "motif", key: puzzle.motif };
  if (!isProof(puzzle.goal)) {
    const term = dominantTerm(start, end, side);
    if (term) return { layer: "term", key: `${term}:${side}` };
  }
  // A proof goal's note is its goal: `regicide` is always the attackers' and
  // `escape` always the defenders', so neither takes a side in its key.
  return { layer: "goal", key: isProof(puzzle.goal) ? puzzle.goal : `${puzzle.goal}:${side}` };
}
