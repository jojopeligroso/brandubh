import {
  allMoves,
  applyMove,
  CORNERS,
  findKing,
  hashBoard,
  inBounds,
  isAnvilForSoldier,
  isCorner,
  isEnemy,
  isGameOver,
  isRestricted,
  isThrone,
  movesFrom,
  sideOf,
  winnerOf,
} from "./rules";
import { BOARD_SIZE, type Board, type GameState, type Move, type Piece, type Side, type Square } from "./types";
import type { RuleSet } from "./variants";
import { SYM } from "./d4";
import { bookRulesMatch, loadOpeningBook } from "./openingBook";

/** The difficulty ladder, in order. Also the whitelist for anything restored
 *  from storage (see persist.ts) or read back out of a settings key. */
export const DIFFICULTIES = ["easy", "medium", "hard", "ollamh"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * The magnitude of a won position. Every score in this engine is
 * **attacker-positive**: `+WIN` means the attackers (raiders) win, `−WIN` means
 * the defenders (the king's side) win. Exported because the analysis UI has to
 * render a decisive score as a *result* rather than as a number, and a second
 * copy of this constant elsewhere is a copy that can drift.
 */
export const WIN = 1_000_000;
/** Scores this close to ±WIN are decisive (a forced mate); deepening can stop.
 *  Also the threshold the eval bar uses to switch from a fill to a verdict —
 *  `RECOGNIZED_WIN` (a recognizer's forced result) sits above it, so one test
 *  catches both. */
export const DECISIVE = WIN - 1000;
/** Absolute ceiling for reaching a difficulty's depth floor, so honouring the
 *  floor can never hang even on a pathological position. Far above any real
 *  floored search on the boards this game plays. */
const MIN_DEPTH_SAFETY_MS = 8000;
/** Move-ordering index at which late-move reductions begin (the first few moves —
 *  TT move, captures, killers — are searched at full depth). */
const LMR_MIN_INDEX = 4;

/** Centre of the board, derived so ordering works for any size (7×7, 9×9 Tablut…). */
const CENTER = (BOARD_SIZE - 1) / 2;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// ── Evaluation (attacker-positive) ────────────────────────────────────────────
// Every term is weighted so eval variants can be compared head-to-head via
// self-play (scripts/aibench.ts). All terms read from CORNERS / BOARD_SIZE and
// the RuleSet, so they stay variant- and board-size-agnostic (Tablut etc.).
export interface EvalWeights {
  /** Per (attackers − 2·defenders). Defenders are scarcer, so worth ~2×. */
  material: number;
  /** Per unit of king→corner distance. Positive ⇒ attackers want the king far. */
  kingCorner: number;
  /** Subtracted per open escape lane². One lane is worrying, two nearly lost. */
  escapeLane: number;
  /** Per attacker orthogonally adjacent to the king (capture pressure). */
  hug: number;
  /** Per empty orthogonal square around the king that is *not* an open lane —
   *  raw breathing room. Subtracted, so fewer liberties favour attackers. */
  liberties: number;
  /** Subtracted per defender orthogonally adjacent to the king (a shield that
   *  blocks custodial capture). */
  shield: number;
  /** Per (attacker legal moves − defender legal moves). 0 ⇒ skip (it costs a
   *  full move-gen for both sides, so only pay it when it earns its keep). */
  mobility: number;
  /** Per empty square the king can reach through open orthogonal paths (its
   *  confinement region, by flood fill). Subtracted, so a boxed-in king favours
   *  the attackers — a gradient toward the WTF encirclement win that the crude
   *  corner-distance and adjacency terms miss. Capped so an open board saturates
   *  rather than swamping material. 0 ⇒ skip the flood fill. */
  kingRegion: number;
  /** Use the blocker-aware king→corner distance (1/2/3 real king-moves) instead
   *  of the crude aligned?1:2 estimate that ignores pieces in the lane. */
  blockerAwareKingDist: boolean;
  /** Consult the exact *defender* endgame recognizers at leaf nodes (two-lane fork,
   *  corner-adjacent lane, guarded corner race): they return a *proven* defender win
   *  where a heuristic would only guess, sharpening the search's horizon. Sound
   *  (validated against the exhaustive solver) — never claims a win that isn't forced.
   *  ON by default.
   *
   *  ⚠ NOT free, despite what this comment claimed until it was measured. The old
   *  "throughput unchanged, 69k nodes/s both ways" figure came from symmetric
   *  self-play, where the escape-zone gate below bails in O(1) at nearly every leaf.
   *  In the endgame the recognizer actually exists for it does not bail: a king
   *  parked near a corner satisfies both `near(...)` and `kingCornerMoves ≤ 2`
   *  permanently, so the defender-to-move branch pays for every such leaf.
   *
   *  Measured on a b2-king Brandubh endgame at fixed depth 4: **22.9k nodes/s with
   *  it on against 107k with it off, a ~4.7× cost** — larger than the attacker
   *  twin's ~7%, which ships default-OFF for being "not free". Reproduced since by
   *  `scripts/evaltime.ts` (interleaved, min-of-N) at 4.0-4.5× on that position,
   *  and the cost scales with how often the escape-zone gate fails to bail:
   *  ~1.2× in the opening, ~1.9× at midgame, ~2.3× and ~4.2× at the two endgames.
   *
   *  ⚠ RESOLVED — the ratio was never the question. A ratio is not a verdict, and
   *  a fixed-depth gauntlet cannot supply one here: `scripts/evaltune.ts` holds
   *  depth constant *precisely* to isolate eval quality from speed, and speed is
   *  the entire cost of a recognizer, which is why fixed-depth self-play scored it
   *  neutral (24-24 at depth 3, 16-16 at depth 5). The deciding measurement is the
   *  one the app actually performs: iterative deepening against `ANALYSIS_LIMITS`'
   *  1200ms deadline.
   *
   *  Under that deadline, on the reported b2-king position (`evaltime.ts`, 23 runs
   *  over three separate invocations, unanimous): ON reaches depth 3 and returns a
   *  **proven** forced defender win. OFF reaches depth 4 — one ply deeper, bought
   *  with the saved time — and proves nothing at all. The recognizer trades a ply
   *  for a proof, and on this position the proof is the answer and the extra ply
   *  is not. That is what the cost buys, so it ships ON.
   *
   *  The apparent inconsistency with `attackerRecognizer` dissolves on the same
   *  evidence: toggling it changed no verdict at any position measured, so for
   *  *play* it is cost without a demonstrated benefit and correctly stays off —
   *  while `ANALYSIS_WEIGHTS` already turns it ON for analysis, which is the case
   *  it was kept for. The two flags are not one decision made two ways; they are
   *  two questions with different answers. */
  endgameRecognizers: boolean;
  /** Consult the *attacker* recognizer (`forcedAttackerWin`) at leaf nodes: the
   *  proven twin, an imminent king capture. Equally sound (cross-validated against an
   *  independent AND-OR oracle), but *not* free — a capture, unlike an escape, needs
   *  move generation to prove, not an O(1) geometric test, so it measures a small but
   *  real per-leaf cost. OFF by default (a per-variant / analysis knob), exactly as
   *  PVS ships off; see the note above `forcedAttackerWin`. */
  attackerRecognizer: boolean;
  /** Per corner-quadrant containing at least one attacker (0-4). Attackers'
   *  strategic plan is covering all four escape approaches, not just massing
   *  near the king — a plan none of the other terms can see: `kingRegionSize`
   *  and `clearPathToCorner` both tie (measured: 12 and 0 respectively) for
   *  four attackers bunched in one quadrant (three corners wholly unguarded)
   *  versus one attacker per quadrant (every corner covered), and `evaluate()`
   *  returned the identical 139.5 for both. 0 ⇒ skip (untuned, opt-in). */
  quadrantCoverage: number;
  /** Per non-king piece of the side *not* to move that is one enemy slide from
   *  a custodial capture: one flank already anvil-hostile
   *  (`isAnvilForSoldier`, rules.ts) and the opposite flank empty and
   *  reachable by a mover's-side soldier in one slide — a free capture this
   *  ply. Turn-relative on purpose (only the side to move can execute a
   *  capture *this* ply; scoring both sides symmetrically was tried first and
   *  measured to net to zero on the motivating case, because that position
   *  turned out to hold a genuine mutual threat — a defender could also net
   *  the exposed attacker on *its* move — which a turn-blind count cannot
   *  separate from "not a threat"). Existing terms have zero representation
   *  of this: measured, moving a defender onto the anvil square that blocks a
   *  real free capture (1 capturing attacker move ground-truthed via
   *  `allMoves`/`applyMove` vs 0) moved `evaluate()` from −107.5 to −101.5 —
   *  attacker-positive, so the *safer* defender position scored *worse* for
   *  defenders, purely from an incidental `kingRegion` difference unrelated to
   *  the capture threat. 0 ⇒ skip (untuned, opt-in). */
  anvilThreat: number;
}

/**
 * The shipping weights for Brandubh, set by A/B gauntlet (scripts/evaltune.ts).
 * The original hand-tuned terms held up: shield/liberties were worse (redundant
 * with the king-safety terms), mobility helped only at depth 2 (gone by depth 3)
 * and cost ~2× per node, and blocker-aware king distance was neutral. The one term
 * that *did* earn its keep is `kingRegion` (king confinement): at depth 4 it beat
 * the baseline 31–9 at weight 6 (24–16 at weight 8), so it ships at 6. The unused
 * terms remain as opt-in knobs for retuning on differently-balanced variants.
 */
export const DEFAULT_WEIGHTS: EvalWeights = {
  material: 40,
  kingCorner: 25,
  escapeLane: 120,
  hug: 30,
  liberties: 0,
  shield: 0,
  mobility: 0,
  kingRegion: 6,
  blockerAwareKingDist: false,
  endgameRecognizers: true,
  attackerRecognizer: false,
  quadrantCoverage: 0,
  anvilThreat: 0,
};

/** Cap on the king's flood-filled confinement region, so a wide-open board
 *  saturates the term instead of letting sheer space dominate material. */
const KING_REGION_CAP = 12;

// The three helpers below are exported because `motifs.ts` reads the same corner
// geometry the evaluation does, and two implementations of "how far is the king
// from a corner" would be two answers to one question.

/** Number of empty squares the king can reach via open orthogonal paths (walls =
 *  any piece), capped. A small region means the king is boxed in. */
export function kingRegionSize(b: Board, kr: number, kc: number): number {
  const seen = new Set<number>([kr * BOARD_SIZE + kc]);
  const stack: Array<[number, number]> = [[kr, kc]];
  let count = 0;
  while (stack.length && count < KING_REGION_CAP) {
    const [r, c] = stack.pop()!;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc) || b[nr][nc] !== null) continue;
      const id = nr * BOARD_SIZE + nc;
      if (seen.has(id)) continue;
      seen.add(id);
      count++;
      stack.push([nr, nc]);
    }
  }
  return count;
}

export function clearPathToCorner(b: Board, kr: number, kc: number): number {
  // Count corners the king could slide to *right now* with an unobstructed
  // straight path. Two or more open paths is a near-certain escape.
  let open = 0;
  for (const corner of CORNERS) {
    if (corner.row !== kr && corner.col !== kc) continue; // not aligned
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

/** All squares strictly between the two aligned points are empty. */
function lineClear(b: Board, r0: number, c0: number, r1: number, c1: number): boolean {
  if (r0 === r1) {
    const step = c1 > c0 ? 1 : -1;
    for (let c = c0 + step; c !== c1; c += step) if (b[r0][c] !== null) return false;
    return true;
  }
  const step = r1 > r0 ? 1 : -1;
  for (let r = r0 + step; r !== r1; r += step) if (b[r][c0] !== null) return false;
  return true;
}

/** Real king-moves to the nearest corner, honouring blockers: 1 (aligned, clear
 *  lane), 2 (one clear L-path via a pivot), else 3 (capped). A rook needs ≤2
 *  moves to any square, via one of two pivots — so this is exact for 1 and 2. */
export function kingCornerMoves(b: Board, kr: number, kc: number): number {
  let best = 3;
  for (const corner of CORNERS) {
    const { row: cr, col: cc } = corner;
    if ((kr === cr || kc === cc) && lineClear(b, kr, kc, cr, cc)) return 1;
    for (const [pr, pc] of [
      [kr, cc],
      [cr, kc],
    ] as const) {
      if (b[pr][pc] !== null) continue; // pivot must be empty to stop on
      if ((pr === kr || pc === kc) && lineClear(b, kr, kc, pr, pc) && lineClear(b, pr, pc, cr, cc))
        best = Math.min(best, 2);
    }
  }
  return best;
}

/** The quarter of the board a corner owns, inclusive of the middle rank/file
 *  so no square falls outside every quadrant (mirrors `motifs.ts`'s private
 *  `inQuadrant`/`MID`, which tags a *played line* for the puzzle bank rather
 *  than scoring a live board — two readers of the same corner geometry, kept
 *  here per the convention above: engine.ts is canonical, motifs.ts consults
 *  it for `kingCornerMoves`/`clearPathToCorner` already). */
const QUADRANT_MID = Math.floor(BOARD_SIZE / 2);
function inQuadrant(r: number, c: number, corner: Square): boolean {
  const rowOk = corner.row === 0 ? r <= QUADRANT_MID : r >= QUADRANT_MID;
  const colOk = corner.col === 0 ? c <= QUADRANT_MID : c >= QUADRANT_MID;
  return rowOk && colOk;
}

/** How many of the four corner-quadrants contain at least one attacker
 *  (0-4). A coarse coverage count, not a distance gradient: one attacker deep
 *  in a quadrant counts the same as three, because the question this answers
 *  is "are all four corner approaches contested at all", which `hug` (king-
 *  local) and `escapeLane` (open-lane count, not attacker position) cannot
 *  answer — see the `quadrantCoverage` doc on `EvalWeights` for the measured
 *  blind spot. */
export function quadrantCoverage(b: Board): number {
  const seen = [false, false, false, false];
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (b[r][c] !== "attacker") continue;
      for (let i = 0; i < CORNERS.length; i++) if (!seen[i] && inQuadrant(r, c, CORNERS[i])) seen[i] = true;
    }
  return seen.filter(Boolean).length;
}

// ── Exact endgame recognizers (proven defender wins) ──────────────────────────
// These return a *proof*, not a heuristic: they only ever report a forced defender
// win, and only when the win is genuinely forced. Each is a shallow, fully-verified
// lookahead (2–3 plies) gated behind a cheap precondition so it stays cheap in the
// common case. Validated exhaustively against the sound solver (solver.test-style).
//
// The escape value returned by the caller is just below a literal terminal escape,
// so the search still prefers an *immediate* escape (a faster win) when it has one.
//
// Measured neutral in symmetric self-play (24-24 at depth 3, 16-16 at depth 5):
// quiescence already chases king escapes and the deep search resolves these ≤3-ply
// patterns unaided, so two equal engines gain nothing on average. Kept ON for the
// horizon-correctness guarantee self-play can't show — the AI treats a two-lane
// fork as lost even when its horizon is one ply short, which is what a human trying
// to set one up would exploit. NOT for being free: the "69k nodes/s both ways"
// figure was measured where the escape-zone gate bails, and in a real corner endgame
// the cost is ~4.7×. See the ⚠ on `endgameRecognizers` in EvalWeights.
const RECOGNIZED_WIN = WIN - 2;

/** The king is orthogonally adjacent to a corner. Such a lane has no squares between
 *  king and corner, so it is the one lane an attacker move cannot block: the corner
 *  itself is unenterable by a soldier, and there is nothing in between to stand on. */
function kingTouchesCorner(kr: number, kc: number): boolean {
  return CORNERS.some((c) => Math.abs(c.row - kr) + Math.abs(c.col - kc) === 1);
}

/** Every attacker move that lands on `(tr, tc)`, appended to `out`.
 *
 *  Found by scanning outward from the destination rather than by generating every
 *  attacker move and keeping the few that land here. `allMoves` walks all 49
 *  squares and allocates the whole reply list; this walks four rays from one
 *  square and allocates only the moves it returns, which is what makes the
 *  restricted loop in `forkWinAttackerToMove` worth having — filtering the full
 *  list still pays for building it.
 *
 *  Mirrors `movesFrom` exactly, in the opposite direction: a soldier may never
 *  stop on a corner or the throne, the first piece on a ray blocks it, and an
 *  empty throne bars the slide unless the ruleset lets soldiers cross it. */
function attackerMovesInto(b: Board, tr: number, tc: number, rules: RuleSet, out: Move[]): void {
  if (b[tr][tc] !== null) return; // occupied — nothing can land here
  if (isCorner(tr, tc) || isThrone(tr, tc)) return; // never a legal soldier landing
  for (const [dr, dc] of DIRS) {
    let r = tr + dr;
    let c = tc + dc;
    while (inBounds(r, c)) {
      const p = b[r][c];
      if (p !== null) {
        if (p === "attacker") out.push({ from: { row: r, col: c }, to: { row: tr, col: tc } });
        break; // the first piece on the ray blocks it either way
      }
      if (isThrone(r, c) && !rules.soldiersPassThroughThrone) break;
      r += dr;
      c += dc;
    }
  }
}

/** Attacker to move, but the king's escape cannot be shut. Two shapes qualify, and
 *  the *only* thing the precondition does is keep the per-reply loop rare — the loop
 *  below is what actually proves the win, so neither shape is trusted on its own:
 *
 *   - **≥2 clear straight lanes to distinct corners.** One attacker move blocks at
 *     most one lane and cannot occupy two squares, so a lane survives.
 *   - **One lane, with the king already touching that corner.** Adjacency is what
 *     makes a single lane sufficient: there is no square between king and corner to
 *     interpose on, and no soldier may ever land on the corner itself, so the lane
 *     cannot be blocked at all. Only a capture can save the attackers.
 *
 * The second shape is the commonest forced escape there is, and requiring two lanes
 * missed all of it: a king on b1 with a1 open and g1 blocked is winning, and was
 * scored as an ordinary position. Adjacency holds it to 8 squares of the board, so
 * it costs about what the ≥2-lane gate costs.
 *
 * Verified move-by-move (no assumption is trusted): every attacker reply must leave
 * the king a clear lane and must not end the game in the attackers' favour.
 *
 * ## Which replies have to be built
 *
 * Building a child is the whole cost of this function — `applyMove` clones the
 * board, resolves captures and runs `computeStatus`, and it ran once per reply
 * for ~46 replies at every leaf that got this far. Nearly all of it is provably
 * wasted: once either precondition holds, **only a reply landing orthogonally
 * beside the king can change the answer.** `computeStatus` has exactly five ways
 * to end a game, and for any other reply four of them are unreachable.
 *
 *  - **King captured.** `kingIsCaptured` opens with an explicit "the moved piece
 *    must be adjacent to the king" and returns false otherwise. So this is
 *    precisely the case the restricted loop keeps, and the only one it keeps.
 *  - **Encirclement.** `isEncircled` returns false whenever the king stands on a
 *    board edge — and a king with a clear lane is always on one. A straight lane
 *    to a corner means sharing that corner's row or column, and the corners'
 *    rows and columns are exactly 0 and 6, which are the edges. Both
 *    preconditions require at least one lane, so both put the king on an edge,
 *    and an attacker reply cannot move it off.
 *  - **Defenders have no move.** A lane survives every single reply, and a
 *    surviving lane is a king move. With ≥2 lanes it survives by counting: a
 *    soldier occupies one square, two lanes leave the king in different
 *    directions and so share only the king's own square, and one blocker cannot
 *    close two. With the corner-adjacent lane it survives absolutely: there is
 *    no square between king and corner to interpose on, and no soldier may ever
 *    stop on a corner (`movesFrom`), so that lane cannot be closed at all.
 *  - **Defender escape.** Needs a defender to have moved; the mover is the
 *    attackers.
 *
 * That leaves **repetition**, which is the one that stopped this being obvious.
 * It is handled by counting rather than by geometry: a repetition needs eight
 * plies since the last capture (`computeStatus` in `rules.ts` carries the
 * argument), so when the child cannot reach eight the branch is dead and the
 * reply is safe to skip. Above that the loop simply runs in full — rare, and
 * correct.
 *
 * The same reasoning retires the surviving-lane check for a skipped reply, since
 * a lane provably survives it. A skipped reply is one this function would have
 * built, examined and passed. */
function forkWinAttackerToMove(state: GameState, rules: RuleSet): boolean {
  const b = state.board;
  const k = findKing(b);
  if (!k) return false;
  const lanes = clearPathToCorner(b, k.row, k.col);
  const touchesCorner = kingTouchesCorner(k.row, k.col);
  if (lanes < 2 && !(lanes === 1 && touchesCorner)) return false;

  // The one branch the geometry above cannot rule out. A capture resets the
  // count, so a reply that captures cannot repeat either; this only has to bound
  // the quiet case. The `??` fallback overestimates (it assumes no capture ever
  // happened), which errs towards running the full loop.
  const captureOnly =
    rules.repetitionResult === "none" || (state.sinceCapture ?? state.history.length) + 1 < 8;

  let replies: Move[];
  if (captureOnly) {
    replies = [];
    for (const [dr, dc] of DIRS) {
      const tr = k.row + dr;
      const tc = k.col + dc;
      if (inBounds(tr, tc)) attackerMovesInto(b, tr, tc, rules, replies);
    }
  } else {
    replies = allMoves(b, "attackers", rules);
  }

  for (const m of replies) {
    const child = applyMove(state, m, rules);
    if (isGameOver(child.status)) {
      if (winnerOf(child.status) !== "defenders") return false; // a saving/winning attacker reply
      continue;
    }
    const kk = findKing(child.board);
    if (!kk || clearPathToCorner(child.board, kk.row, kk.col) < 1) return false; // escape sealed
  }
  return true; // every reply leaves an escape ⇒ defender wins next move
}

/** Is `state` a proven defender win via immediate escape, a two-lane fork, or the
 *  king stepping into such a fork (a guarded corner race)? Sound subset — a false
 *  result just means "not proven", never a missed loss. Exported for validation
 *  against the exhaustive solver. */
export function forcedDefenderWin(state: GameState, rules: RuleSet): boolean {
  const b = state.board;
  const k = findKing(b);
  if (!k) return false;

  // Cheap escape-zone gate: a ≤3-ply forced escape needs the king on or one step
  // from an edge (an immediate lane or a two-lane fork square both lie on rows/cols
  // 0-1 or 5-6). Deep-centre kings bail here in O(1); a rarer centre-king race is
  // left to the main search to find. Keeps the recognizer near-free at most leaves.
  const near = (x: number) => x <= 1 || x >= BOARD_SIZE - 2;
  if (!near(k.row) && !near(k.col)) return false;

  if (state.turn === "attackers") return forkWinAttackerToMove(state, rules);

  // Defender to move: escape now if a lane is already open …
  if (clearPathToCorner(b, k.row, k.col) >= 1) return true;
  // … else the guarded corner race: the king is close enough to step onto a square
  // from which it forks two corners the attacker can't both stop. Gate on real
  // king-distance ≤2 so central positions don't pay for the king-move loop.
  if (kingCornerMoves(b, k.row, k.col) > 2) return false;
  // Only the king's own moves matter, so generate only those. `allMoves` here meant
  // scanning all 49 squares and generating for every defender at every leaf that got
  // this far, then throwing all but the king's away — the single largest slice of the
  // recognizer's cost, and pure waste. Same squares, same order, same semantics.
  for (const to of movesFrom(b, k.row, k.col, rules)) {
    // A two-lane fork square is always on an edge (only rows/cols 0 and 6 hold
    // corners), so only king moves that land on an edge can create one. Skipping
    // interior destinations keeps this loop to a handful of squares.
    const onEdge = to.row === 0 || to.row === BOARD_SIZE - 1 || to.col === 0 || to.col === BOARD_SIZE - 1;
    if (!onEdge) continue;
    const child = applyMove(state, { from: { row: k.row, col: k.col }, to }, rules);
    if (winnerOf(child.status) === "defenders") return true; // stepped straight out
    if (!isGameOver(child.status) && forkWinAttackerToMove(child, rules)) return true; // stepped into a fork
  }
  return false;
}

// ── Exact endgame recognizer (proven attacker win) ────────────────────────────
// The attacker twin of the defender recognizers: a proven *imminent king capture*.
// Attacker on move ⇒ a capture in hand; defender on move ⇒ the king is netted, every
// reply losing it (the mirror of forkWinAttackerToMove). Same soundness discipline —
// every terminal is read from the engine (applyMove → status), so capture, block and
// a losing repetition are honoured without re-deriving a rule; a false result only
// ever means "not proven".
//
// Why it rides a *default-off* flag while the defender pair ships on: a capture,
// unlike an escape, is not pure geometry. The active-capture rule needs the *moving*
// attacker beside the king, so proving one needs move generation, not a
// `clearPathToCorner`-style O(1) test. It is trimmed hard to stay cheap — an O(1)
// king-pressure gate (a hostile flank present, ≤2 liberties), a bounded defender-move
// loop, and a capture check restricted to attacker moves that land *beside* the king
// (the only squares an active capture can come from). Even so it is not free: an
// isolated A/B (defender-recognizer baseline vs +attacker) measured ~7% fewer nodes/s
// on an endgame-heavy position sample (a naïve ≤3-ply version measured ~150× worse,
// hence the trimming). And the upside is small: a capture, unlike an escape, is what
// the search + quiescence already chase hardest, so a fixed-depth self-play gauntlet
// with it on measured no win-rate change — strength-neutral, like the defender twin.
// Neutral-and-not-free ⇒ off by default, a per-variant / analysis knob, exactly as
// PVS ships off. Returns +RECOGNIZED_WIN from evaluate, mirroring the defender
// −RECOGNIZED_WIN. Kept (not dropped) because it is a proven, cross-validated tool
// the analysis UI and pressure-testing can switch on deliberately.

/** A genuine net has few defender replies (an endgame). Beyond this the loop bails
 *  rather than pay O(D·A) at a leaf where a forced capture is implausible anyway. */
const NET_MAX_DEFENDER_MOVES = 14;

/** Attackers to move: can some attacker move capture the king right now? Only moves
 *  landing orthogonally beside the king can actively capture, so the loop skips the
 *  rest — keeping this near the cost of the defender twin's per-reply check. The
 *  engine decides the terminal, so the capture rule is never re-derived. */
function attackerCapturesKingNow(state: GameState, rules: RuleSet, kr: number, kc: number): boolean {
  for (const m of allMoves(state.board, "attackers", rules)) {
    if (Math.abs(m.to.row - kr) + Math.abs(m.to.col - kc) !== 1) continue; // not a flank ⇒ no active capture
    const child = applyMove(state, m, rules);
    if (isGameOver(child.status) && winnerOf(child.status) === "attackers") return true;
  }
  return false;
}

/** Defender on move but netted: every defender reply leaves the attacker an
 *  immediate king capture. The mirror of `forkWinAttackerToMove` — a 2-ply proof
 *  the defender cannot save the king. Bounded: a genuine net has few replies (an
 *  endgame), so a wide move list bails rather than pay O(D·A). */
function defenderNetted(state: GameState, rules: RuleSet): boolean {
  const moves = allMoves(state.board, "defenders", rules);
  if (moves.length === 0 || moves.length > NET_MAX_DEFENDER_MOVES) return false;
  for (const m of moves) {
    const child = applyMove(state, m, rules);
    if (isGameOver(child.status)) {
      if (winnerOf(child.status) === "attackers") continue; // this reply loses too
      return false; // a corner / draw / saving capture ⇒ not netted
    }
    const kk = findKing(child.board);
    if (!kk || !attackerCapturesKingNow(child, rules, kk.row, kk.col)) return false; // a reply left unpunished
  }
  return true; // every defender reply loses the king ⇒ attacker wins next move
}

/** Is `state` a proven *attacker* win — an imminent king capture (the twin of
 *  `forcedDefenderWin`)? Attacker on move: a capture in hand. Defender on move: the
 *  king is netted, every reply losing it. Sound subset: a false result only ever
 *  means "not proven", never a missed win. Scope is imminent king capture; the
 *  pure-encirclement/block cases are left to the search (see the note above on why a
 *  capture can't be an O(1) geometric test). Exported for cross-validation against an
 *  independent AND-OR oracle. */
export function forcedAttackerWin(state: GameState, rules: RuleSet): boolean {
  const b = state.board;
  const k = findKing(b);
  if (!k) return false;

  // O(1) gate: the king must be under real capture pressure — a hostile flank
  // already beside it (an attacker, or an empty throne/corner that walls it) and at
  // most two empty liberties. A king with room to run cannot be force-captured next
  // move, so it bails here and the recognizer stays near-free at most leaves. Tighter
  // than strictly necessary — the trim only ever costs completeness, never soundness.
  let liberties = 0;
  let anchor = false;
  for (const [dr, dc] of DIRS) {
    const nr = k.row + dr;
    const nc = k.col + dc;
    if (!inBounds(nr, nc)) continue; // the board edge is not hostile in Brandubh
    const p = b[nr][nc];
    if (p === null) {
      liberties++;
      if (isThrone(nr, nc) && rules.throneHostileToKing) anchor = true; // empty hostile throne flank
    } else if (p === "attacker") {
      anchor = true;
    }
    if (isCorner(nr, nc) && rules.cornersHostile) anchor = true;
  }
  if (liberties > 2 || !anchor) return false;

  return state.turn === "attackers"
    ? attackerCapturesKingNow(state, rules, k.row, k.col) // a capture in hand
    : defenderNetted(state, rules); // the king is netted, every reply loses it
}

// ── Anvil-threat term (hanging non-king pieces) ────────────────────────────────
// A piece is "hanging" when a custodial capture against it is one enemy slide
// away: one flank is already an anvil (`isAnvilForSoldier`, rules.ts — reused
// verbatim, not re-derived) and the opposite flank is empty, landable, and
// reachable by some enemy soldier's rook-slide this ply. Heuristic, not a
// proof (unlike the recognizers above): it does not check whether the enemy
// move is otherwise legal-and-not-losing, only that the geometry is there —
// same spirit as `hug`/`shield`, which also count adjacency without proving a
// capture follows.

/** Can some soldier of `side` reach the empty, landable square (tr, tc) in one
 *  rook-slide this ply? Mirrors `attackerMovesInto`'s reverse ray-scan (scan
 *  outward from the target, not every piece's move list — the same reasoning
 *  that made the recognizer's per-reply loop cheap applies here), generalised
 *  to either side and short-circuited to a boolean since this only needs
 *  existence, not the move. A weaponless king cannot initiate a capture by
 *  sliding onto the anvil square, matching `previewCaptureCount`'s guard. */
function soldierCanReach(b: Board, tr: number, tc: number, side: Side, rules: RuleSet): boolean {
  for (const [dr, dc] of DIRS) {
    let r = tr + dr;
    let c = tc + dc;
    while (inBounds(r, c)) {
      const p = b[r][c];
      if (p !== null) {
        if (sideOf(p) === side && (p !== "king" || rules.armedKing)) return true;
        break; // the first piece on the ray blocks it either way
      }
      if (isThrone(r, c) && !rules.soldiersPassThroughThrone) break;
      r += dr;
      c += dc;
    }
  }
  return false;
}

/** Opposite-direction pairs, so each axis is checked with the anchor on
 *  either end (the pre-existing enemy piece can be on the near or far side). */
const AXIS_PAIRS: ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]> = [
  [DIRS[0], DIRS[1]],
  [DIRS[2], DIRS[3]],
];

/** Is the non-king soldier at (r, c) one enemy slide from being custodially
 *  captured? Checks both axes, both anchor orientations: one flank already an
 *  anvil for the enemy (`isAnvilForSoldier`), the other flank empty, not a
 *  restricted landing square (corner/throne — soldiers may never stop there),
 *  and reachable (`soldierCanReach`). */
function isHangingSoldier(b: Board, r: number, c: number, side: Side, rules: RuleSet): boolean {
  const enemy: Side = side === "attackers" ? "defenders" : "attackers";
  for (const [d1, d2] of AXIS_PAIRS) {
    const aR = r + d1[0], aC = c + d1[1];
    const bR = r + d2[0], bC = c + d2[1];
    for (const [anchorR, anchorC, farR, farC] of [
      [aR, aC, bR, bC],
      [bR, bC, aR, aC],
    ] as const) {
      if (!isAnvilForSoldier(b, anchorR, anchorC, enemy, rules)) continue;
      if (!inBounds(farR, farC) || b[farR][farC] !== null || isRestricted(farR, farC)) continue;
      if (soldierCanReach(b, farR, farC, enemy, rules)) return true;
    }
  }
  return false;
}

/** Count of `victimSide`'s non-king pieces hanging to the *other* side, one
 *  board pass. Deliberately one-sided (see the `anvilThreat` doc on
 *  `EvalWeights`): the caller always asks about the side not to move, since
 *  only the side to move can execute a capture this ply. */
export function countHangingSide(b: Board, victimSide: Side, rules: RuleSet): number {
  const piece: Piece = victimSide === "attackers" ? "attacker" : "defender";
  let n = 0;
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (b[r][c] === piece && isHangingSoldier(b, r, c, victimSide, rules)) n++;
  return n;
}

export function evaluate(state: GameState, w: EvalWeights = DEFAULT_WEIGHTS, rules?: RuleSet): number {
  if (isGameOver(state.status)) {
    const winner = winnerOf(state.status);
    if (winner === "attackers") return WIN;
    if (winner === "defenders") return -WIN;
    return 0; // draw
  }

  // Exact endgame recognizers: a proven forced escape is worth (−)a decisive score.
  // The defender pair is free and ships on; its attacker twin needs move generation
  // to prove a capture, so it rides its own (default-off) flag. Mutually exclusive —
  // only one side can have a forced win — so consulting both is safe.
  if (rules) {
    if (w.endgameRecognizers && forcedDefenderWin(state, rules)) return -RECOGNIZED_WIN;
    if (w.attackerRecognizer && forcedAttackerWin(state, rules)) return RECOGNIZED_WIN;
  }

  const b = state.board;
  let attackers = 0;
  let defenders = 0;
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = b[r][c];
      if (p === "attacker") attackers++;
      else if (p === "defender") defenders++;
    }

  let score = (attackers - defenders * 2) * w.material;

  const k = findKing(b);
  if (k) {
    // King→corner distance. Attackers want it far, defenders near.
    if (w.blockerAwareKingDist) {
      score += kingCornerMoves(b, k.row, k.col) * w.kingCorner;
    } else {
      let best = 99;
      for (const corner of CORNERS) {
        const d =
          (k.row === corner.row || k.col === corner.col ? 1 : 2) +
          (Math.abs(k.row - corner.row) + Math.abs(k.col - corner.col)) / 100;
        best = Math.min(best, d);
      }
      score += best * w.kingCorner;
    }

    const open = clearPathToCorner(b, k.row, k.col);
    score -= open * open * w.escapeLane;

    // Piece structure around the king: attacker pressure, defender shield, and
    // raw breathing room.
    let hug = 0;
    let shield = 0;
    let liberties = 0;
    for (const [dr, dc] of DIRS) {
      const nr = k.row + dr;
      const nc = k.col + dc;
      if (!inBounds(nr, nc)) continue;
      const p = b[nr][nc];
      if (p === "attacker") hug++;
      else if (p === "defender") shield++;
      else if (p === null) liberties++;
    }
    score += hug * w.hug;
    score -= shield * w.shield;
    score -= liberties * w.liberties;

    // Confinement: a king with little reachable space is being encircled.
    if (w.kingRegion !== 0) score -= kingRegionSize(b, k.row, k.col) * w.kingRegion;
  }

  if (w.mobility !== 0 && rules) {
    const am = allMoves(b, "attackers", rules).length;
    const dm = allMoves(b, "defenders", rules).length;
    score += (am - dm) * w.mobility;
  }

  // Perimeter/corner-approach coverage: attackers want every quadrant contested.
  if (w.quadrantCoverage !== 0) score += quadrantCoverage(b) * w.quadrantCoverage;

  // Hanging non-king pieces: the side *not* to move, one enemy (the mover's)
  // slide from a free custodial capture this ply.
  if (w.anvilThreat !== 0 && rules) {
    const victim: Side = state.turn === "attackers" ? "defenders" : "attackers";
    const hanging = countHangingSide(b, victim, rules);
    score += (victim === "defenders" ? 1 : -1) * hanging * w.anvilThreat;
  }

  return score;
}

// ── Cheap capture preview ─────────────────────────────────────────────────────
// A soldier's custodial-capture rule, evaluated for a *hypothetical* move without
// cloning the board. Used only for move ordering and quiescence filtering — the
// authoritative capture resolution still happens inside engine.applyMove — so an
// occasional approximation here never corrupts the actual game/eval. Mirrors
// engine.isAnvilForSoldier, but treats the mover's origin as already vacated and
// its destination as occupied.
function previewAnvil(
  b: Board,
  r: number,
  c: number,
  from: Move["from"],
  side: Side,
  rules: RuleSet,
): boolean {
  if (!inBounds(r, c)) return false;
  if (isCorner(r, c) && rules.cornersHostile) return true;
  let occ = b[r][c];
  if (r === from.row && c === from.col) occ = null; // mover has left this square
  if (isThrone(r, c)) {
    if (occ === null) return rules.throneHostileToSoldiers;
    return sideOf(occ) === side; // an occupied throne backs whoever stands on it
  }
  return sideOf(occ) === side;
}

/** How many enemy soldiers the piece would custodially capture landing on `to`. */
function previewCaptureCount(
  b: Board,
  from: Move["from"],
  to: Move["to"],
  piece: Piece | null,
  side: Side,
  rules: RuleSet,
): number {
  if (piece === "king" && !rules.armedKing) return 0; // a weaponless king captures nothing
  let n = 0;
  for (const [dr, dc] of DIRS) {
    const mr = to.row + dr;
    const mc = to.col + dc; // square pinned against the anvil
    if (!inBounds(mr, mc)) continue;
    let victim = b[mr][mc];
    if (mr === from.row && mc === from.col) victim = null; // vacated by the mover
    if (victim === null || victim === "king") continue; // king capture handled by search
    if (!isEnemy(victim, side)) continue;
    if (previewAnvil(b, mr + dr, mc + dc, from, side, rules)) n++;
  }
  return n;
}

// ── Search configuration (lets self-play compare old vs new cleanly) ───────────
export type Ordering = "smart" | "legacy" | "none";

export interface SearchConfig {
  ordering: Ordering;
  useTT: boolean;
  useKillers: boolean;
  useQuiescence: boolean;
  /** Max extra plies the quiescence search may extend. */
  maxQuiescencePly: number;
  /** Late-move reductions: search late, quiet, well-ordered moves shallower first
   *  and only re-search at full depth if one beats the current best. Buys depth on
   *  the lines that matter. Captures, king moves and early (promising) moves are
   *  never reduced, so tactics are unaffected. */
  useLMR: boolean;
  /** Principal-variation search: after the first move, scout each move with a
   *  null window and only re-search in full when the scout beats the bound. Same
   *  values as plain alpha–beta, fewer nodes when move ordering is good. */
  usePVS: boolean;
  /** Decay decisive scores by ply (mate-in-2 outscores mate-in-20) instead of the
   *  flat ±WIN every terminal returned before this flag existed. See the note on
   *  `mateToTT`/`mateFromTT` for the mechanism and, importantly, for why it ships
   *  OFF. Sound in isolation (a mate-distance-adjusted TT is the standard
   *  technique, and it is unit-tested — see `engine.test.ts`'s "mate distance"
   *  suite) but not a demonstrated win: measured no win-rate change over a 96-game
   *  balance matrix and an 8-series depth-scaling gauntlet, and measured **25%
   *  slower** conversion of already-won positions over 10 self-play seeds (mean
   *  3.20 → 4.00 plies from first-proven-decisive to termination) — the opposite
   *  of what it exists to buy. Root-level iterative deepening stops at the first
   *  depth where *any* move is decisive, before a slower-to-prove alternative is
   *  even recognised as decisive, so the decay mostly cannot act where a root
   *  choice between two known forced wins would matter most. Same idiom as
   *  `attackerRecognizer`: sound, cross-validated, no measured strength gain, an
   *  analysis-only knob rather than a play default. */
  useMateDistance: boolean;
}

export const FULL_CONFIG: SearchConfig = {
  ordering: "smart",
  useTT: true,
  useKillers: true,
  useQuiescence: true,
  maxQuiescencePly: 6,
  useLMR: true,
  // PVS ships OFF: measured neutral for Brandubh (±1% nodes, identical scores at
  // depths 5-7) because smart ordering + the TT + LMR already tighten the search
  // windows, leaving nothing for null-window scouting to save — the re-searches
  // cost as much as they save. Kept as a knob for wider-branching variants (Tablut)
  // where ordering dominates less. Aspiration windows were skipped for the same
  // reason: the root already searches the PV move full-window and the rest narrow.
  usePVS: false,
  useMateDistance: false,
};

/** The original engine's behaviour — a fixed-depth searcher with legacy ordering
 *  and none of the new machinery. Used as the self-play baseline. */
export const LEGACY_CONFIG: SearchConfig = {
  ordering: "legacy",
  useTT: false,
  useKillers: false,
  useQuiescence: false,
  maxQuiescencePly: 0,
  useLMR: false,
  usePVS: false,
  useMateDistance: false,
};

export interface SearchLimits {
  /** Hard cap on iterative-deepening depth. */
  maxDepth: number;
  /** Wall-clock budget in ms. Omit for a pure fixed-depth (deterministic) search. */
  deadlineMs?: number;
  /** Depth the search always completes before the clock is allowed to stop it, so
   *  slow devices never fall below a floor. The budget is honoured as a *soft*
   *  limit up to this depth (a generous absolute safety cap still prevents a true
   *  hang) and as the real limit beyond it. Omit for no floor. */
  minDepth?: number;
}

// ── Transposition table (persists across moves) ───────────────────────────────
const enum Flag {
  Exact = 0,
  Lower = 1,
  Upper = 2,
}
interface TTEntry {
  depth: number;
  value: number;
  flag: Flag;
  move: Move | null;
  gen: number;
}
const TT = new Map<string, TTEntry>();
const TT_MAX = 400_000;
let TT_GEN = 0;

/**
 * Mate-distance adjustment ── gated behind `SearchConfig.useMateDistance`
 * (default OFF; see the comment on that field for why). When on, every
 * decisive score this engine produces is *decayed by ply* the moment it
 * leaves `evaluate` inside the search: a terminal reached at ply `p` from
 * the current search's root scores `WIN - p` (or `-WIN + p`), never a flat
 * `±WIN`. That is what lets the search prefer mate-in-2 over mate-in-20
 * instead of treating every forced win as identical — see `evaluateAtPly`
 * below, which is the one place the decay is applied, and its doc comment
 * for why `evaluate` itself stays flat. When off, every call site below
 * that would otherwise apply this pair short-circuits to the raw value, so
 * behaviour is identical to the engine before this pair existed.
 *
 * The TT interaction this buys is the subtle part. A search value is always
 * *root-relative* — "mate in N plies from where this whole search started" —
 * but the same board position can be reached at a different ply in a later
 * search (a different move sequence, or the next move's fresh search reusing
 * the same table). A root-relative mate score stored as-is and reused at a
 * different ply is simply wrong: replayed verbatim it either claims a mate
 * that is now further away than the search re-derived, or throws away a mate
 * that is now closer. Standard fix (the one every alpha-beta engine with a
 * shared TT uses): store *node-relative* — normalise out the storing search's
 * root by adding back the ply at which the value was found, so the number in
 * the table means "mate in N plies from this node", independent of any root.
 * On probe, re-express it relative to the *current* search's root by
 * subtracting the probing ply. `mateToTT`/`mateFromTT` are exactly that pair,
 * and they are exact inverses of each other for any ply. Non-decisive scores
 * (the overwhelming majority) are untouched either way — `|v| < DECISIVE`
 * short-circuits both functions to the identity.
 *
 * Ordinary (non-mate) scores were always safe to share across ply/root this
 * way — a positional score doesn't depend on how far from the root it is
 * found, only a mate does — which is why only the two branches above touch
 * anything.
 */
function mateToTT(v: number, ply: number): number {
  if (v >= DECISIVE) return v + ply;
  if (v <= -DECISIVE) return v - ply;
  return v;
}
function mateFromTT(v: number, ply: number): number {
  if (v >= DECISIVE) return v - ply;
  if (v <= -DECISIVE) return v + ply;
  return v;
}

/** Position value is (almost entirely) determined by board + side to move, so the
 *  table is safe to reuse move-to-move. The lone caveat is repetition-sensitive
 *  lines whose value depends on history; this is the standard, negligible TT
 *  unsoundness that real engines accept. Terminal nodes are never stored. */
function ttStore(key: string, depth: number, value: number, flag: Flag, move: Move | null): void {
  const prev = TT.get(key);
  if (prev && prev.gen === TT_GEN && prev.depth > depth) return; // keep the deeper current-gen entry
  TT.set(key, { depth, value, flag, move, gen: TT_GEN });
}

/** Exposed for tests/benchmarks that want a clean slate. */
export function resetTT(): void {
  TT.clear();
  TT_GEN = 0;
}

// ── Search context ────────────────────────────────────────────────────────────
const ABORT = Symbol("search-aborted");

interface Ctx {
  rules: RuleSet;
  cfg: SearchConfig;
  weights: EvalWeights;
  deadline: number; // Infinity ⇒ no time limit (fixed-depth, deterministic)
  now: () => number;
  nodes: number;
  killers: Array<[Move | null, Move | null]>;
}

const sameMove = (a: Move | null, b: Move | null): boolean =>
  a != null &&
  b != null &&
  a.from.row === b.from.row &&
  a.from.col === b.from.col &&
  a.to.row === b.to.row &&
  a.to.col === b.to.col;

function recordKiller(ctx: Ctx, ply: number, m: Move): void {
  const slot = (ctx.killers[ply] ??= [null, null]);
  if (sameMove(slot[0], m)) return;
  slot[1] = slot[0];
  slot[0] = m;
}

/**
 * `evaluate`, decayed by ply when `useMateDistance` is on (the raw value
 * otherwise). The one call site every terminal/leaf return in `search`/
 * `quiesce` goes through — see the mate-distance note above `mateToTT`.
 *
 * The transform is exactly `mateFromTT`: a fresh `evaluate()` result *is*
 * already node-relative (the node in question is the terminal itself, so its
 * distance to its own mate is 0 — `evaluate` returning a flat `±WIN` is
 * precisely "mate in 0 plies from here"), which is the same shape a TT probe
 * hands back. Reusing one function for both keeps the two decays from ever
 * drifting apart into two slightly different conventions.
 */
function evaluateAtPly(state: GameState, ply: number, ctx: Ctx): number {
  const raw = evaluate(state, ctx.weights, ctx.rules);
  return ctx.cfg.useMateDistance ? mateFromTT(raw, ply) : raw;
}

// ── Move ordering ─────────────────────────────────────────────────────────────
function orderMoves(state: GameState, moves: Move[], ttMove: Move | null, ply: number, ctx: Ctx): Move[] {
  if (ctx.cfg.ordering === "none") return moves;
  const b = state.board;
  const side = state.turn;
  const rules = ctx.rules;
  const killers = ctx.cfg.useKillers ? ctx.killers[ply] : undefined;
  const king = ctx.cfg.ordering === "smart" && side === "attackers" ? findKing(b) : null;

  const scored = moves.map((m) => {
    let s = 0;
    const piece = b[m.from.row][m.from.col];

    if (ctx.cfg.ordering === "smart") {
      if (sameMove(m, ttMove)) s += 1_000_000_000; // principal-variation move first
      // Immediate king escape (defenders) is decisive.
      if (piece === "king" && side === "defenders" && isCorner(m.to.row, m.to.col)) s += 500_000_000;
      const caps = previewCaptureCount(b, m.from, m.to, piece, side, rules);
      if (caps > 0) s += 1_000_000 + caps * 1000;
      // Attacker landing next to the king may complete a capture — search it early.
      if (king && Math.abs(m.to.row - king.row) + Math.abs(m.to.col - king.col) === 1) s += 200_000;
      if (killers) {
        if (sameMove(m, killers[0])) s += 90_000;
        else if (sameMove(m, killers[1])) s += 80_000;
      }
    } else {
      // Legacy: nudge defenders toward corners, everyone toward the centre.
      if (side === "defenders" && isCorner(m.to.row, m.to.col)) s += 10_000;
    }

    s -= Math.abs(m.to.row - CENTER) + Math.abs(m.to.col - CENTER);
    return { m, s };
  });

  scored.sort((a, b2) => b2.s - a.s);
  return scored.map((x) => x.m);
}

// ── Quiescence: only tactical replies, so the search never stops mid-exchange ──
/** Captures, immediate king escapes, and attacker moves adjacent to the king. */
function tacticalMoves(state: GameState, ctx: Ctx): Move[] {
  const b = state.board;
  const side = state.turn;
  const rules = ctx.rules;
  const king = side === "attackers" ? findKing(b) : null;
  const out: Move[] = [];
  for (const m of allMoves(b, side, rules)) {
    const piece = b[m.from.row][m.from.col];
    if (previewCaptureCount(b, m.from, m.to, piece, side, rules) > 0) {
      out.push(m);
    } else if (piece === "king" && isCorner(m.to.row, m.to.col)) {
      out.push(m); // defender escape
    } else if (king && Math.abs(m.to.row - king.row) + Math.abs(m.to.col - king.col) === 1) {
      out.push(m); // attacker pressing the king (may be a capture the preview can't see)
    }
  }
  return out;
}

/** `ply` is the absolute distance from the search's root (not the remaining
 *  quiescence budget `qply`) — needed so a terminal or a recognizer's decisive
 *  score found mid-quiescence decays by its *real* distance from the root, the
 *  same as one found by the main search. Threaded through the recursion one
 *  hop at a time, exactly like `search`'s own `ply`. */
function quiesce(state: GameState, alpha: number, beta: number, qply: number, ply: number, ctx: Ctx): number {
  ctx.nodes++;
  if (ctx.deadline < Infinity && (ctx.nodes & 2047) === 0 && ctx.now() > ctx.deadline) throw ABORT;
  if (isGameOver(state.status)) return evaluateAtPly(state, ply, ctx);

  const standPat = evaluateAtPly(state, ply, ctx);
  const maximizing = state.turn === "attackers";
  if (maximizing) {
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return standPat;
    if (standPat < beta) beta = standPat;
  }
  if (qply <= 0) return standPat;

  const tactical = tacticalMoves(state, ctx);
  if (tactical.length === 0) return standPat;
  const ordered = orderMoves(state, tactical, null, 0, ctx);

  let best = standPat;
  for (const m of ordered) {
    const child = applyMove(state, m, ctx.rules);
    const v = quiesce(child, alpha, beta, qply - 1, ply + 1, ctx);
    if (maximizing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

// ── Alpha–beta minimax (attacker-positive, fail-soft) ─────────────────────────
function search(state: GameState, depth: number, ply: number, alpha: number, beta: number, ctx: Ctx): number {
  ctx.nodes++;
  if (ctx.deadline < Infinity && (ctx.nodes & 2047) === 0 && ctx.now() > ctx.deadline) throw ABORT;
  if (isGameOver(state.status)) return evaluateAtPly(state, ply, ctx);
  if (depth <= 0)
    return ctx.cfg.useQuiescence
      ? quiesce(state, alpha, beta, ctx.cfg.maxQuiescencePly, ply, ctx)
      : evaluateAtPly(state, ply, ctx);

  const alpha0 = alpha;
  const beta0 = beta;
  const key = ctx.cfg.useTT ? hashBoard(state.board, state.turn) : "";
  let ttMove: Move | null = null;
  if (ctx.cfg.useTT) {
    const e = TT.get(key);
    if (e) {
      ttMove = e.move;
      if (e.depth >= depth) {
        // e.value is node-relative when useMateDistance stored it that way (see
        // mateToTT/mateFromTT above the TT); this node's own ply re-expresses it
        // relative to *this* search's root before it touches alpha/beta or gets
        // returned — a raw e.value here would be a mate distance measured from
        // whatever root originally stored it. Flag off ⇒ identity, matching
        // pre-flag storage exactly.
        const v = ctx.cfg.useMateDistance ? mateFromTT(e.value, ply) : e.value;
        if (e.flag === Flag.Exact) return v;
        if (e.flag === Flag.Lower && v > alpha) alpha = v;
        else if (e.flag === Flag.Upper && v < beta) beta = v;
        if (alpha >= beta) return v;
      }
    }
  }

  const maximizing = state.turn === "attackers";
  const moves = orderMoves(state, allMoves(state.board, state.turn, ctx.rules), ttMove, ply, ctx);
  if (moves.length === 0) return evaluateAtPly(state, ply, ctx); // no legal move ⇒ status is already terminal

  let best = maximizing ? -Infinity : Infinity;
  let bestMove: Move | null = null;
  let i = 0;
  for (const m of moves) {
    const child = applyMove(state, m, ctx.rules);
    // Late-move reduction: search late, quiet, non-terminal moves a ply (or two)
    // shallower; if the shallow result would improve the bound, re-search full depth.
    // Never reduce captures, king moves, or an early (well-ordered) move — tactics
    // stay exact because those are exactly what move ordering surfaces first.
    let d2 = depth - 1;
    if (
      ctx.cfg.useLMR &&
      depth >= 3 &&
      i >= LMR_MIN_INDEX &&
      !isGameOver(child.status) &&
      state.board[m.from.row][m.from.col] !== "king" &&
      previewCaptureCount(state.board, m.from, m.to, state.board[m.from.row][m.from.col], state.turn, ctx.rules) === 0
    ) {
      d2 = Math.max(1, depth - 2 - (i >= LMR_MIN_INDEX + 6 ? 1 : 0));
    }
    let v: number;
    if (!ctx.cfg.usePVS || i === 0) {
      // First move (the PV candidate) — or PVS off — gets a full window.
      v = search(child, d2, ply + 1, alpha, beta, ctx);
      if (d2 < depth - 1 && (maximizing ? v > alpha : v < beta))
        v = search(child, depth - 1, ply + 1, alpha, beta, ctx); // LMR promise ⇒ verify full depth
    } else if (maximizing) {
      // Scout with a null window at (possibly LMR-reduced) depth; re-search in full
      // only if it beats alpha. Same value as alpha–beta, far fewer nodes.
      v = search(child, d2, ply + 1, alpha, alpha + 1, ctx);
      if (v > alpha) v = search(child, depth - 1, ply + 1, alpha, beta, ctx);
    } else {
      v = search(child, d2, ply + 1, beta - 1, beta, ctx);
      if (v < beta) v = search(child, depth - 1, ply + 1, alpha, beta, ctx);
    }
    i++;
    if (maximizing) {
      if (v > best) {
        best = v;
        bestMove = m;
      }
      if (best > alpha) alpha = best;
    } else {
      if (v < best) {
        best = v;
        bestMove = m;
      }
      if (best < beta) beta = best;
    }
    if (alpha >= beta) {
      if (ctx.cfg.useKillers && previewCaptureCount(state.board, m.from, m.to, state.board[m.from.row][m.from.col], state.turn, ctx.rules) === 0)
        recordKiller(ctx, ply, m);
      break;
    }
  }

  if (ctx.cfg.useTT) {
    const flag = best <= alpha0 ? Flag.Upper : best >= beta0 ? Flag.Lower : Flag.Exact;
    // best is root-relative (this search's root); store node-relative so a
    // later probe at a different ply/root re-derives the right distance. Flag
    // off ⇒ store the raw value, matching pre-flag storage exactly.
    ttStore(key, depth, ctx.cfg.useMateDistance ? mateToTT(best, ply) : best, flag, bestMove);
  }
  return best;
}

// ── D4 board symmetry (root-move folding) ─────────────────────────────────────
// The board, throne and corners are symmetric under the 8 dihedral transforms of
// the square. At a *symmetric* position (its whole stabiliser subgroup is > 1 — the
// opening has all 8), symmetric root moves are game-identical, so we search only one
// representative per orbit. The opening's 40 legal first moves collapse to 5, buying
// roughly a ply. Symmetry breaks within a move or two, so this is opening-focused and
// costs only a handful of board serialisations at the root (never per interior node).
// The transform group itself lives in d4.ts, shared with the opening-book
// loader and the offline book generator so all three agree on the geometry.
const N = BOARD_SIZE;

function serializeUnder(board: Board, t: (r: number, c: number) => [number, number]): string {
  const out = new Array<string>(N * N).fill(".");
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const p = board[r][c];
      if (p === null) continue;
      const [nr, nc] = t(r, c);
      out[nr * N + nc] = p === "attacker" ? "a" : p === "defender" ? "d" : "k";
    }
  return out.join("");
}

/** The transforms under which the position (board only — turn is symmetric too) is
 *  unchanged: its stabiliser subgroup. Length 1 ⇒ no usable symmetry.
 *  Exported for the offline book generator (scripts/genbook.ts). */
export function stabilizer(board: Board): Array<(r: number, c: number) => [number, number]> {
  const id = serializeUnder(board, SYM[0]);
  return SYM.filter((t) => serializeUnder(board, t) === id);
}

/** Collapse root moves into one representative per orbit under `group`.
 *  Exported for the offline book generator (scripts/genbook.ts). */
export function foldRootMoves(moves: Move[], group: ReadonlyArray<(r: number, c: number) => [number, number]>): Move[] {
  if (group.length <= 1) return moves;
  const seen = new Set<string>();
  const reps: Move[] = [];
  for (const m of moves) {
    let canon: string | null = null;
    for (const t of group) {
      const [fr, fc] = t(m.from.row, m.from.col);
      const [tr, tc] = t(m.to.row, m.to.col);
      const s = `${fr},${fc},${tr},${tc}`;
      if (canon === null || s < canon) canon = s;
    }
    if (!seen.has(canon!)) {
      seen.add(canon!);
      reps.push(m);
    }
  }
  return reps;
}

// ── Root: iterative deepening, tie-collection for a little randomness ──────────
export interface SearchResult {
  move: Move | null;
  score: number;
  /**
   * Every root move that scored *exactly* the best score — the equal-best set.
   *
   * The root already collects this to randomise between equal moves, so it is
   * free to report. It is exact rather than approximate: the shared root bound
   * is `best ∓ 1`, so a move that ties or beats the best still returns its true
   * score, and only strictly-worse moves fail low. That precision is the whole
   * point for the analysis UI — "these three are the same" is a claim worth
   * making only when it is true, and a near-miss dressed up as a tie would
   * teach a learner the wrong thing.
   *
   * One element when the best move is genuinely best; `chosen` is always in it.
   */
  bestMoves: Move[];
  depth: number;
  nodes: number;
}

export const defaultNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

/**
 * Choose a move via iterative-deepening alpha–beta. Deterministic when `limits`
 * carries no `deadlineMs` (fixed depth) and `rng` is seeded — which is exactly
 * how the tests drive it.
 */
export function pickMove(
  state: GameState,
  rules: RuleSet,
  limits: SearchLimits,
  config: SearchConfig = FULL_CONFIG,
  rng: () => number = Math.random,
  weights: EvalWeights = DEFAULT_WEIGHTS,
  now: () => number = defaultNow,
): SearchResult {
  const rootMoves = allMoves(state.board, state.turn, rules);
  if (rootMoves.length === 0)
    return { move: null, score: evaluate(state, weights, rules), bestMoves: [], depth: 0, nodes: 0 };

  TT_GEN++;
  if (TT.size > TT_MAX) TT.clear();

  const t0 = now();
  // The real budget stops the search beyond the depth floor; below it, a generous
  // absolute safety deadline applies instead so a floored depth always completes
  // on slow devices (without ever risking a true hang on a pathological node).
  const floorDepth = limits.minDepth ?? 0;
  const hardDeadline = limits.deadlineMs != null ? t0 + limits.deadlineMs : Infinity;
  const floorDeadline =
    limits.deadlineMs != null ? t0 + Math.max(limits.deadlineMs, MIN_DEPTH_SAFETY_MS) : Infinity;
  const ctx: Ctx = {
    rules,
    cfg: config,
    weights,
    deadline: hardDeadline,
    now,
    nodes: 0,
    killers: [],
  };
  const maximizing = state.turn === "attackers";
  const rootKey = config.useTT ? hashBoard(state.board, state.turn) : "";

  // Fold symmetric first moves at symmetric positions (opening: 40 → 5). Sound: a
  // move and its D4 image have identical value, so searching one representative per
  // orbit loses nothing and deepens the iteration.
  const foldedRoots = foldRootMoves(rootMoves, stabilizer(state.board));

  let bestMove: Move = foldedRoots[0];
  let bestTies: Move[] = [foldedRoots[0]];
  let bestScore = maximizing ? -Infinity : Infinity;
  let reached = 0;
  let prevIterMs = 0;

  for (let d = 1; d <= limits.maxDepth; d++) {
    // Protect depths up to the floor from the clock; use the real budget past it.
    ctx.deadline = d <= floorDepth ? floorDeadline : hardDeadline;
    const iterStart = now();
    try {
      const ttMove = config.useTT ? (TT.get(rootKey)?.move ?? null) : null;
      const ordered = orderMoves(state, foldedRoots, ttMove, 0, ctx);
      // Share the best-so-far bound across root moves so strictly-worse moves get
      // pruned (fail-low), while any move that ties or beats the best still returns
      // its exact score — so the set of equal-best moves stays exact and we can
      // still randomise among them. (Scores are integers, so `best ∓ 1` is a tight
      // but tie-preserving window.)
      let localBest = maximizing ? -Infinity : Infinity;
      let ties: Move[] = [];
      for (const m of ordered) {
        const alpha = maximizing && localBest !== -Infinity ? localBest - 1 : -Infinity;
        const beta = !maximizing && localBest !== Infinity ? localBest + 1 : Infinity;
        const v = search(applyMove(state, m, rules), d - 1, 1, alpha, beta, ctx);
        if (maximizing ? v > localBest : v < localBest) {
          localBest = v;
          ties = [m];
        } else if (v === localBest) {
          ties.push(m);
        }
      }
      bestScore = localBest;
      bestTies = ties;
      bestMove = ties[0];
      reached = d;
      if (config.useTT) ttStore(rootKey, d, localBest, Flag.Exact, ties[0]);
      if (Math.abs(localBest) >= DECISIVE) break; // forced result found — no need to go deeper
    } catch (e) {
      if (e === ABORT) break; // keep the last fully-completed depth
      throw e;
    }
    // Predictive time management: don't *start* a depth we can't finish, so a
    // generous budget never means waiting the full time for a shallower result.
    // Estimate the next iteration from the observed effective branching factor.
    // Never stop before the depth floor — the floor is honoured regardless of clock.
    const iterMs = now() - iterStart;
    if (hardDeadline < Infinity && d >= floorDepth) {
      const ebf = prevIterMs > 0 ? Math.max(2, iterMs / prevIterMs) : 5;
      if (now() - t0 + iterMs * ebf > hardDeadline - t0) break;
    }
    prevIterMs = iterMs;
  }

  const chosen = bestTies[Math.floor(rng() * bestTies.length)] ?? bestMove;
  return {
    move: chosen,
    score: bestScore,
    bestMoves: bestTies.length ? bestTies : [bestMove],
    depth: reached,
    nodes: ctx.nodes,
  };
}

// ── Multi-PV root scoring (offline book generation) ───────────────────────────
export interface RootMoveScore {
  move: Move;
  score: number;
}

/**
 * Exact scores for every root move within `margin` of the best, at a fixed
 * depth — the multi-PV query the offline book generator (scripts/genbook.ts)
 * needs to keep best-N moves per position. A tight-window iterative-deepening
 * pass (identical to pickMove's root loop) finds the best score cheaply; a
 * second pass at the final depth re-searches each remaining move with the
 * window widened by `margin`, so near-best moves come back with exact scores
 * while clearly-worse moves still fail low almost for free. Deterministic (no
 * deadline). Root moves are D4-folded, so at symmetric positions the result is
 * one representative per orbit.
 */
export function scoreRootMoves(
  state: GameState,
  rules: RuleSet,
  depth: number,
  margin: number,
  config: SearchConfig = FULL_CONFIG,
  weights: EvalWeights = DEFAULT_WEIGHTS,
): { best: number; within: RootMoveScore[]; nodes: number } {
  const rootMoves = allMoves(state.board, state.turn, rules);
  if (rootMoves.length === 0) return { best: evaluate(state, weights, rules), within: [], nodes: 0 };

  TT_GEN++;
  if (TT.size > TT_MAX) TT.clear();

  const ctx: Ctx = { rules, cfg: config, weights, deadline: Infinity, now: defaultNow, nodes: 0, killers: [] };
  const maximizing = state.turn === "attackers";
  const rootKey = config.useTT ? hashBoard(state.board, state.turn) : "";
  const foldedRoots = foldRootMoves(rootMoves, stabilizer(state.board));

  // Pass 1: tight-window iterative deepening, exactly pickMove's root loop —
  // finds the best score (and exact ties) while warming the TT and ordering.
  let best = maximizing ? -Infinity : Infinity;
  let ties: Move[] = [];
  let ordered: Move[] = foldedRoots;
  for (let d = 1; d <= depth; d++) {
    const ttMove = config.useTT ? (TT.get(rootKey)?.move ?? null) : null;
    ordered = orderMoves(state, foldedRoots, ttMove, 0, ctx);
    let localBest = maximizing ? -Infinity : Infinity;
    let localTies: Move[] = [];
    for (const m of ordered) {
      const alpha = maximizing && localBest !== -Infinity ? localBest - 1 : -Infinity;
      const beta = !maximizing && localBest !== Infinity ? localBest + 1 : Infinity;
      const v = search(applyMove(state, m, rules), d - 1, 1, alpha, beta, ctx);
      if (maximizing ? v > localBest : v < localBest) {
        localBest = v;
        localTies = [m];
      } else if (v === localBest) {
        localTies.push(m);
      }
    }
    best = localBest;
    ties = localTies;
    if (config.useTT) ttStore(rootKey, d, localBest, Flag.Exact, localTies[0]);
    if (Math.abs(localBest) >= DECISIVE) break;
  }

  // Pass 2: exact scores for the near-best. Ties are already exact, and at
  // margin 0 they are the whole answer — the extra pass would only re-search
  // moves through a TT warmed by pass 1's tight windows, and values reproduced
  // through foreign bound entries can drift (ordinary alpha–beta search
  // instability). A drifted value that sneaks a strictly-worse move into an
  // "exact ties" book is precisely the corruption the offline generator must
  // not ship, so the margin-0 path stops here. For margin > 0, each remaining
  // move gets a margin-widened window at full depth — fail-soft, so a value
  // inside the window is exact — and the accept test compares against the
  // margin itself, never the (integer-widened) window bound: evaluation scores
  // are fractional, and accepting everything inside the window would admit
  // moves up to a point worse than the margin promises.
  const within: RootMoveScore[] = ties.map((m) => ({ move: m, score: best }));
  if (margin > 0) {
    for (const m of ordered) {
      if (ties.some((t) => sameMove(t, m))) continue;
      const child = applyMove(state, m, rules);
      if (maximizing) {
        const v = search(child, depth - 1, 1, best - margin - 1, best, ctx);
        if (v >= best - margin) within.push({ move: m, score: Math.min(v, best) });
      } else {
        const v = search(child, depth - 1, 1, best, best + margin + 1, ctx);
        if (v <= best + margin) within.push({ move: m, score: Math.max(v, best) });
      }
    }
    within.sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score));
  }
  return { best, within, nodes: ctx.nodes };
}

// ── Opening book (deep-search, offline-generated) ─────────────────────────────
// A map from a position's `hashBoard(board, turn)` to the strong moves to play
// there, generated offline by scripts/genbook.ts: a fixed-depth search at
// exactly the depth ollamh's live opening search measures (deliberately never
// deeper — a deeper book measurably hurt the shallower follow-up engine; see
// genbook.ts), keeping the exact-tie best moves per position. These moves are
// *deep-search best-effort*, NOT proven — the Brandubh opening is not solved
// (see docs/solving.md), so the book claims "as strong as ollamh searching,
// instant", never "perfect". What IS guaranteed: a book move is only served
// when the live ruleset matches the one the book was generated under, and it is
// re-validated against the live legal moves before it is trusted — so a stale
// or corrupt book can never produce an illegal move, only a silent fallthrough
// to the normal search.
export const OPENING_BOOK: Record<string, Move[]> = loadOpeningBook();

function bookMove(state: GameState, rules: RuleSet, rng: () => number): Move | null {
  if (!bookRulesMatch(rules)) return null;
  const hits = OPENING_BOOK[hashBoard(state.board, state.turn)];
  if (!hits || hits.length === 0) return null;
  const legal = allMoves(state.board, state.turn, rules);
  const candidates = hits.filter((h) => legal.some((m) => sameMove(m, h)));
  if (candidates.length === 0) return null;
  // Light randomization among the booked moves (all within the generation
  // margin of best) — this is what varies ollamh's openings game to game.
  return candidates[Math.floor(rng() * candidates.length)];
}

// ── Difficulty ladder ─────────────────────────────────────────────────────────
// easy/medium are fixed-depth (instant on any board); hard is time-budgeted and
// deepens as far as the clock allows. Budgets are intentionally conservative and
// tuned against the benchmark; they scale gracefully to larger variants because
// the search deepens to whatever the time allows rather than a fixed ply count.
const DIFFICULTY: Record<Difficulty, { limits: SearchLimits; config: SearchConfig; blunder: number }> = {
  // easy: shallow, no quiescence, and a chunky blunder rate so it stays beatable.
  easy: { limits: { maxDepth: 2 }, config: { ...FULL_CONFIG, useQuiescence: false }, blunder: 0.35 },
  // medium: fixed depth 3 with the full machinery — already stronger than the old
  // hard (depth 3, no quiescence/ordering/TT), and effectively instant (~50ms).
  medium: { limits: { maxDepth: 3 }, config: FULL_CONFIG, blunder: 0 },
  // hard: time-budgeted iterative deepening in a Web Worker so the budget never
  // freezes the UI. `minDepth` guarantees a 4-ply floor even on slow phones. Root
  // D4-folding + late-move reductions make the search ~6× leaner than before, so the
  // opening now reaches this depth-6 cap in well under a second on desktop (a phone
  // uses more of the 3s budget); the floor still catches the worst-case slow device.
  // Quiescence extends tactical lines further still.
  hard: { limits: { maxDepth: 6, deadlineMs: 3000, minDepth: 4 }, config: FULL_CONFIG, blunder: 0 },
  // ollamh ("master sage"): the strongest tier. A depth-5 floor plus an 8s budget,
  // with folding + LMR, reaches depth ~8–9 in the opening where the clock allows —
  // deep enough to see the king's corner races several moves out. The deep-search
  // opening book skips the slowest early moves: booked replies were searched
  // offline at exactly this tier's measured live opening depth, so they arrive
  // instantly at no measured strength cost (see docs/ROADMAP.md Session 6) —
  // strong, not proven. Named for the highest rank of Gaelic filí.
  ollamh: { limits: { maxDepth: 12, deadlineMs: 8000, minDepth: 5 }, config: FULL_CONFIG, blunder: 0 },
};

/** A chosen move plus what the search actually did to find it — surfaced to the
 *  UI so the depth/nodes reached on the real device (not just the benchmark) are
 *  observable. `depth`/`nodes` are 0 for a "no move" or a random blunder. */
export interface MoveInfo {
  move: Move | null;
  /**
   * The position's value, **attacker-positive** (`+` favours the raiders, `−`
   * the king's side) and on the same scale as {@link evaluate} — so `material`
   * (40) is roughly one piece. This is the search's backed-up score when a
   * search ran; when one did not (no legal move, an `easy` blunder, a book
   * move) it is the static evaluation of the position handed in, which the
   * `depth` beside it already distinguishes (0 = unsearched, −1 = from book).
   */
  score: number;
  /** The equal-best set — see `SearchResult.bestMoves`. Analysis draws these as
   *  candidate arrows; play ignores them. */
  bestMoves: Move[];
  depth: number;
  nodes: number;
  elapsedMs: number;
}

/**
 * Choose the AI's move for whichever side is to move, reporting the search stats.
 * `rng` (0..1) breaks ties and injects a little blunder chance on easy so it feels
 * human. Strength comes from iterative deepening + a transposition table +
 * quiescence rather than a single shallow fixed-depth pass.
 */
export function chooseMoveDetailed(
  state: GameState,
  difficulty: Difficulty,
  rules: RuleSet,
  rng: () => number = Math.random,
): MoveInfo {
  const moves = allMoves(state.board, state.turn, rules);
  // The unsearched paths below still report a score, because a caller that has
  // an eval to show would otherwise have nothing at all on an `easy` blunder or
  // a book move. It is the *static* evaluation, and `depth` says so.
  if (moves.length === 0)
    return {
      move: null,
      score: evaluate(state, DEFAULT_WEIGHTS, rules),
      bestMoves: [],
      depth: 0,
      nodes: 0,
      elapsedMs: 0,
    };

  const { limits, config, blunder } = DIFFICULTY[difficulty];
  if (blunder > 0 && rng() < blunder)
    return {
      move: moves[Math.floor(rng() * moves.length)],
      score: evaluate(state, DEFAULT_WEIGHTS, rules),
      bestMoves: [],
      depth: 0,
      nodes: 0,
      elapsedMs: 0,
    };

  // ollamh plays deep-search book moves instantly (depth -1 flags "from book").
  if (difficulty === "ollamh") {
    const booked = bookMove(state, rules, rng);
    if (booked)
      return {
        move: booked,
        score: evaluate(state, DEFAULT_WEIGHTS, rules),
        bestMoves: [booked],
        depth: -1,
        nodes: 0,
        elapsedMs: 0,
      };
  }

  const t0 = defaultNow();
  const r = pickMove(state, rules, limits, config, rng);
  return {
    move: r.move,
    score: r.score,
    bestMoves: r.bestMoves,
    depth: r.depth,
    nodes: r.nodes,
    elapsedMs: defaultNow() - t0,
  };
}

// ── Analysis search (the eval bar / best-move arrow, Session 7a) ──────────────
//
// Analysis is a *different question* from play: it asks "what is this position
// worth and what is the best reply", for a position the user is looking at,
// while the game may be waiting on the AI to move somewhere else entirely. So
// it gets its own entry point, its own (shallow) limits and its own weights,
// and — see `useAnalysisWorker` — its own worker thread.
//
// It must never make a move on anyone's behalf, so there is deliberately no
// blunder roll and no opening-book shortcut here: those exist to shape how the
// AI *plays*, and would put a move on screen that is not the engine's best.

/**
 * Shallow by design. Depth 3 with the full machinery is the `medium` tier's
 * search — measured "effectively instant (~50ms)" — which is what makes it
 * usable as a background job that re-runs on every cursor step. The deadline is
 * a safety valve for a pathological position on a slow phone, not the budget:
 * with no `minDepth` floor it is free to return a shallower result rather than
 * make the user wait.
 */
export const ANALYSIS_LIMITS: SearchLimits = { maxDepth: 4, deadlineMs: 1200 };

/**
 * What "think harder" spends.
 *
 * Depth 8 with a 4s ceiling, on demand and never automatically. The split is
 * deliberate and it is about batteries: the shallow pass above re-runs on every
 * cursor step, so it has to be cheap enough to be invisible, while this one runs
 * because somebody asked a question about *one* position and is willing to wait
 * for the answer. A depth-8 search on every step would flatten a phone.
 *
 * `minDepth` guarantees 5 plies even on a slow device, so the deep answer is
 * always meaningfully deeper than the shallow one it replaces — otherwise on a
 * bad phone the button could appear to do nothing.
 */
export const ANALYSIS_DEEP_LIMITS: SearchLimits = { maxDepth: 8, deadlineMs: 4000, minDepth: 5 };

/**
 * Analysis turns the attacker endgame recognizer ON.
 *
 * Session 4 shipped `attackerRecognizer` default-OFF for play: it is a proven,
 * cross-validated tool but it is not free, and self-play measured it neutral,
 * so the playing engine does not pay for it. Analysis is the case it was kept
 * for — one search, on demand, where naming a forced attacker win exactly
 * beats guessing at it with a heuristic. See the note above `RECOGNIZED_WIN`.
 */
export const ANALYSIS_WEIGHTS: EvalWeights = { ...DEFAULT_WEIGHTS, attackerRecognizer: true };

/**
 * Evaluate a position for the analysis UI: the best move found and its score.
 *
 * **Deterministic in the position alone** — the same position always draws the
 * same arrow, no matter what was analysed before it. Two things buy that, and
 * both are needed:
 *
 *  - the tie-break `rng` is pinned, so an equal-best set resolves the same way;
 *  - the transposition table is cleared first, because it feeds move *ordering*
 *    and so decides which of several equally-best moves comes out first.
 *    Without it, stepping back to a position you had already passed through
 *    could draw a different (equally good) arrow than it drew the first time —
 *    which reads as the engine changing its mind when nothing has changed.
 *    Caught in the driven-browser pass, not by reasoning. Cheap to give up:
 *    this is a depth-3 search, and consecutive analyses are of *different*
 *    positions anyway, so there was little cross-call reuse to lose.
 *
 * Clearing the table is safe precisely because analysis owns its worker thread
 * (see `useAnalysisWorker`) — `TT` is module state, so this is never the
 * playing engine's table.
 */
export function analysePosition(
  state: GameState,
  rules: RuleSet,
  limits: SearchLimits = ANALYSIS_LIMITS,
  weights: EvalWeights = ANALYSIS_WEIGHTS,
): MoveInfo {
  const t0 = defaultNow();
  resetTT();
  const r = pickMove(state, rules, limits, FULL_CONFIG, () => 0, weights);
  return {
    move: r.move,
    score: r.score,
    bestMoves: r.bestMoves,
    depth: r.depth,
    nodes: r.nodes,
    elapsedMs: defaultNow() - t0,
  };
}

/** Back-compatible thin wrapper: the move only (used by tests and any caller that
 *  doesn't care about search stats). */
export function chooseMove(
  state: GameState,
  difficulty: Difficulty,
  rules: RuleSet,
  rng: () => number = Math.random,
): Move | null {
  return chooseMoveDetailed(state, difficulty, rules, rng).move;
}
