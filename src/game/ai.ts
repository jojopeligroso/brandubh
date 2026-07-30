import {
  allMoves,
  applyMove,
  CORNERS,
  findKing,
  hashBoard,
  inBounds,
  isCorner,
  isEnemy,
  isGameOver,
  isThrone,
  sideOf,
  winnerOf,
} from "./engine";
import { BOARD_SIZE, type Board, type GameState, type Move, type Piece, type Side } from "./types";
import type { RuleSet } from "./variants";

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
   *  guarded corner race): they return a *proven* defender win where a heuristic
   *  would only guess, sharpening the search's horizon. Sound (validated against the
   *  exhaustive solver) — never claims a win that isn't forced. Free (throughput
   *  unchanged), so ON by default. */
  endgameRecognizers: boolean;
  /** Consult the *attacker* recognizer (`forcedAttackerWin`) at leaf nodes: the
   *  proven twin, an imminent king capture. Equally sound (cross-validated against an
   *  independent AND-OR oracle), but *not* free — a capture, unlike an escape, needs
   *  move generation to prove, not an O(1) geometric test, so it measures a small but
   *  real per-leaf cost. OFF by default (a per-variant / analysis knob), exactly as
   *  PVS ships off; see the note above `forcedAttackerWin`. */
  attackerRecognizer: boolean;
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
};

/** Cap on the king's flood-filled confinement region, so a wide-open board
 *  saturates the term instead of letting sheer space dominate material. */
const KING_REGION_CAP = 12;

/** Number of empty squares the king can reach via open orthogonal paths (walls =
 *  any piece), capped. A small region means the king is boxed in. */
function kingRegionSize(b: Board, kr: number, kc: number): number {
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

function clearPathToCorner(b: Board, kr: number, kc: number): number {
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
function kingCornerMoves(b: Board, kr: number, kc: number): number {
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
// patterns unaided, so two equal engines gain nothing on average. Kept ON anyway
// because they are *free* (throughput unchanged, 69k nodes/s both ways) and give a
// horizon-correctness guarantee self-play can't show — the AI treats a two-lane
// fork as lost even when its horizon is one ply short, which is what a human trying
// to set one up would exploit.
const RECOGNIZED_WIN = WIN - 2;

/** Attacker to move, but the king already has ≥2 clear straight lanes to distinct
 *  corners. A single attacker move can block at most one lane and cannot occupy two
 *  squares, so unless some attacker move captures the king outright, the defender
 *  escapes through a still-open lane next move. Verified move-by-move (no assumption
 *  is trusted): every attacker reply must leave the king a clear lane and must not
 *  end the game in the attackers' favour. Cheap precondition (≥2 lanes) makes the
 *  per-reply loop rare. */
function forkWinAttackerToMove(state: GameState, rules: RuleSet): boolean {
  const b = state.board;
  const k = findKing(b);
  if (!k || clearPathToCorner(b, k.row, k.col) < 2) return false;
  for (const m of allMoves(b, "attackers", rules)) {
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
  for (const m of allMoves(b, "defenders", rules)) {
    if (b[m.from.row][m.from.col] !== "king") continue; // the race is about the king
    // A two-lane fork square is always on an edge (only rows/cols 0 and 6 hold
    // corners), so only king moves that land on an edge can create one. Skipping
    // interior destinations keeps this loop to a handful of squares.
    const onEdge = m.to.row === 0 || m.to.row === BOARD_SIZE - 1 || m.to.col === 0 || m.to.col === BOARD_SIZE - 1;
    if (!onEdge) continue;
    const child = applyMove(state, m, rules);
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

function quiesce(state: GameState, alpha: number, beta: number, qply: number, ctx: Ctx): number {
  ctx.nodes++;
  if (ctx.deadline < Infinity && (ctx.nodes & 2047) === 0 && ctx.now() > ctx.deadline) throw ABORT;
  if (isGameOver(state.status)) return evaluate(state, ctx.weights, ctx.rules);

  const standPat = evaluate(state, ctx.weights, ctx.rules);
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
    const v = quiesce(child, alpha, beta, qply - 1, ctx);
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
  if (isGameOver(state.status)) return evaluate(state, ctx.weights, ctx.rules);
  if (depth <= 0) return ctx.cfg.useQuiescence ? quiesce(state, alpha, beta, ctx.cfg.maxQuiescencePly, ctx) : evaluate(state, ctx.weights, ctx.rules);

  const alpha0 = alpha;
  const beta0 = beta;
  const key = ctx.cfg.useTT ? hashBoard(state.board, state.turn) : "";
  let ttMove: Move | null = null;
  if (ctx.cfg.useTT) {
    const e = TT.get(key);
    if (e) {
      ttMove = e.move;
      if (e.depth >= depth) {
        if (e.flag === Flag.Exact) return e.value;
        if (e.flag === Flag.Lower && e.value > alpha) alpha = e.value;
        else if (e.flag === Flag.Upper && e.value < beta) beta = e.value;
        if (alpha >= beta) return e.value;
      }
    }
  }

  const maximizing = state.turn === "attackers";
  const moves = orderMoves(state, allMoves(state.board, state.turn, ctx.rules), ttMove, ply, ctx);
  if (moves.length === 0) return evaluate(state, ctx.weights, ctx.rules); // no legal move ⇒ status is already terminal

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
    ttStore(key, depth, best, flag, bestMove);
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
const N = BOARD_SIZE;
const SYM: Array<(r: number, c: number) => [number, number]> = [
  (r, c) => [r, c],
  (r, c) => [c, N - 1 - r],
  (r, c) => [N - 1 - r, N - 1 - c],
  (r, c) => [N - 1 - c, r],
  (r, c) => [r, N - 1 - c],
  (r, c) => [N - 1 - r, c],
  (r, c) => [c, r],
  (r, c) => [N - 1 - c, N - 1 - r],
];

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
 *  unchanged: its stabiliser subgroup. Length 1 ⇒ no usable symmetry. */
function stabilizer(board: Board): Array<(r: number, c: number) => [number, number]> {
  const id = serializeUnder(board, SYM[0]);
  return SYM.filter((t) => serializeUnder(board, t) === id);
}

/** Collapse root moves into one representative per orbit under `group`. */
function foldRootMoves(moves: Move[], group: Array<(r: number, c: number) => [number, number]>): Move[] {
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
  if (rootMoves.length === 0) return { move: null, score: evaluate(state, weights, rules), depth: 0, nodes: 0 };

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
  return { move: chosen, score: bestScore, depth: reached, nodes: ctx.nodes };
}

// ── Opening book (solver-fed) ─────────────────────────────────────────────────
// The integration point for the offline solver (scripts/solve.ts): a map from a
// position's board hash to the move to play there. It is intentionally EMPTY —
// only *proven* (game-theoretically optimal, dtm-minimal) moves belong here, and
// the full Brandubh opening is not solved (see docs/solving.md). When the solver
// proves a line, its moves drop straight in and `ollamh` plays them instantly and
// perfectly, skipping the slow search. Keyed by `hashBoard(board, turn)`; a book
// move is always re-validated against the live legal moves before it is trusted.
export const OPENING_BOOK: Record<string, Move> = {};

function bookMove(state: GameState, rules: RuleSet): Move | null {
  const hit = OPENING_BOOK[hashBoard(state.board, state.turn)];
  if (!hit) return null;
  const legal = allMoves(state.board, state.turn, rules).some(
    (m) =>
      m.from.row === hit.from.row &&
      m.from.col === hit.from.col &&
      m.to.row === hit.to.row &&
      m.to.col === hit.to.col,
  );
  return legal ? hit : null;
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
  // deep enough to see the king's corner races several moves out. A perfect-play
  // opening book (when present) skips the slowest early moves and plays them
  // optimally. Named for the highest rank of Gaelic filí. Slower to move by design.
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
    return { move: null, score: evaluate(state, DEFAULT_WEIGHTS, rules), depth: 0, nodes: 0, elapsedMs: 0 };

  const { limits, config, blunder } = DIFFICULTY[difficulty];
  if (blunder > 0 && rng() < blunder)
    return {
      move: moves[Math.floor(rng() * moves.length)],
      score: evaluate(state, DEFAULT_WEIGHTS, rules),
      depth: 0,
      nodes: 0,
      elapsedMs: 0,
    };

  // ollamh plays proven book moves instantly (depth -1 flags "from book").
  if (difficulty === "ollamh") {
    const booked = bookMove(state, rules);
    if (booked)
      return {
        move: booked,
        score: evaluate(state, DEFAULT_WEIGHTS, rules),
        depth: -1,
        nodes: 0,
        elapsedMs: 0,
      };
  }

  const t0 = defaultNow();
  const r = pickMove(state, rules, limits, config, rng);
  return { move: r.move, score: r.score, depth: r.depth, nodes: r.nodes, elapsedMs: defaultNow() - t0 };
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
export const ANALYSIS_LIMITS: SearchLimits = { maxDepth: 3, deadlineMs: 1000 };

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
  return { move: r.move, score: r.score, depth: r.depth, nodes: r.nodes, elapsedMs: defaultNow() - t0 };
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
