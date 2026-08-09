// ── Motifs and tags: what a Puzzle is *about* ────────────────────────────────
//
// A **Motif** is a named tafl tactic, drawn from the attested vocabulary in
// GLOSSARY.md's *Named tactics* rather than invented here (ADR-0003). This file
// holds the union, the recognisers written so far, the fixed priority that picks
// a **Primary motif**, and the computed **Tags** every puzzle carries whether a
// motif is found in it or not.
//
// Two rules govern everything below.
//
//   • **A recogniser is written only for an attested term.** There is no
//     `forkOnTheFile` here, because nobody ever called anything that. Where a
//     shape has a name but no recogniser yet, the name is in the union and the
//     count comes out zero — a result about Brandubh, printed rather than
//     omitted.
//   • **A recogniser reports what it can prove, and nothing near it.** Over-
//     firing is a silent data-quality bug: a learner told a position is a
//     Guillotine when it is not has been lied to by the system that is supposed
//     to be teaching them. Every predicate here is therefore built from
//     conditions that are checkable on the board, and where the attested
//     description is narrower than the word, the narrow reading wins.
//
// ## Why the Guillotine takes a proof and the others take a line
//
// The Guillotine is the one motif no player can spot by eye. It lives past the
// end of the shipped **Line**: the puzzle stops once there is no longer a single
// right answer (ADR-0001/0002), and the shuttling only starts afterwards. So it
// is recognised from the solver's working — the full proven continuation — while
// the board-shape motifs are recognised from the line the learner actually
// plays.

import { CORNERS, findKing } from "./rules";
import { clearPathToCorner, kingCornerMoves } from "./engine";
import { BOARD_SIZE, type GameState, type Move, type Side, type Square } from "./types";
import type { RuleSet } from "./variants";

// ── The vocabulary ────────────────────────────────────────────────────────────

/**
 * Exactly the attested list from GLOSSARY.md's **Named tactics**, in the order
 * the glossary gives them.
 *
 * `shuttle` and `svikmølle` are recorded there as *aliases* of the Guillotine
 * and are never values here — the whole point of the alias note is that the two
 * do not drift back into two entries. `millarGambit` is an 11×11 opening and
 * does not transfer to a 7×7 board, so it is not a Brandubh motif at all.
 */
export type Motif =
  | "guillotine"
  | "snapTrap"
  | "clamp"
  | "spring"
  | "balling"
  | "cordon"
  | "cornerFight"
  | "twinTowers";

export const MOTIFS: readonly Motif[] = [
  "guillotine",
  "snapTrap",
  "clamp",
  "spring",
  "balling",
  "cordon",
  "cornerFight",
  "twinTowers",
];

/**
 * The order a **Primary motif** is picked in when more than one is recognised.
 * Fixed, so the choice is reproducible from the data alone and a regeneration
 * cannot quietly relabel a puzzle.
 *
 * Guillotine first because it is the strongest evidence in the bank: it is
 * proven, not evaluated, and it is the only motif a person could not have
 * checked by looking. Corner fight next, the other recogniser. The rest keep
 * glossary order; they have no recogniser yet, so their position only matters
 * once a hand-label or a future recogniser starts producing them.
 */
export const MOTIF_PRIORITY: readonly Motif[] = [
  "guillotine",
  "cornerFight",
  "snapTrap",
  "clamp",
  "spring",
  "balling",
  "cordon",
  "twinTowers",
];

/**
 * How many puzzles a recogniser-found motif needs before it earns a **Named
 * set** row on the Learn screen.
 *
 * Data, not code: the number is here to be read and argued with, not buried in
 * a comparison somewhere in the screen. Four, because three of anything is
 * still a coincidence and a row with two puzzles in it is a worse experience
 * than no row at all.
 */
export const MOTIF_SET_THRESHOLD = 4;

/**
 * Which motifs earn a **Named set**.
 *
 * A motif assigned by a hand-written **Note** bypasses the threshold entirely,
 * because a person deciding a position matters is better evidence than a count
 * of positions a recogniser happened to reach.
 */
export function namedSets(
  counts: ReadonlyMap<Motif, number>,
  byHand: ReadonlySet<Motif>,
): Motif[] {
  return MOTIF_PRIORITY.filter(
    (m) => (counts.get(m) ?? 0) > 0 && (byHand.has(m) || (counts.get(m) ?? 0) >= MOTIF_SET_THRESHOLD),
  );
}

/**
 * A computed descriptor a puzzle carries for filtering the **Pool**.
 *
 * Board-only and cheap: side to move, line length, whether a soldier is given
 * up, and any **Motif** that is not the primary one. Nothing here needs the
 * solver, which is why tagging the whole bank is a merge-time job.
 */
export type Tag =
  | "attackers"
  | "defenders"
  | "moves1"
  | "moves2"
  | "moves3"
  | "moves4"
  | "soldierGivenUp"
  | Motif;

/** Every tag that is not a motif, for the filter row and for the suite. */
export const PLAIN_TAGS: readonly Tag[] = [
  "attackers",
  "defenders",
  "moves1",
  "moves2",
  "moves3",
  "moves4",
  "soldierGivenUp",
];

// ── Reading a played-out sequence ─────────────────────────────────────────────

/** One played ply, as the engine recorded it: who moved, the move, and what it
 *  took. Captures are read off the history entry rather than off the move that
 *  was passed in, because `allMoves` does not resolve captures — `applyMove`
 *  does, and records them. */
export interface Ply {
  move: Move;
  side: Side;
  captures: Square[];
  /** The position it was played in, and the one it produced. Carried on the ply
   *  rather than looked up by index, so nothing downstream has to keep two
   *  arrays in step. */
  before: GameState;
  after: GameState;
}

/**
 * The plies that produced `states`, which must be a chain: `states[i+1]` is
 * `states[i]` with one move applied.
 *
 * Read from the history entries rather than taken as a separate argument, so a
 * caller cannot hand a move list that disagrees with the boards it also handed.
 */
export function plies(states: GameState[]): Ply[] {
  const out: Ply[] = [];
  for (let i = 1; i < states.length; i++) {
    const h = states[i].history[states[i].history.length - 1];
    if (!h) continue;
    out.push({
      move: h.move,
      side: h.sideThatMoved,
      captures: h.move.captures ?? [],
      before: states[i - 1],
      after: states[i],
    });
  }
  return out;
}

const same = (a: Square, b: Square): boolean => a.row === b.row && a.col === b.col;
const keyOf = (s: Square): string => `${s.row},${s.col}`;

// ── Guillotine ────────────────────────────────────────────────────────────────

/**
 * How many times the blade has to fall.
 *
 * A **cycle** here is one execution: the raiders feed a soldier in to block the
 * escape, and the shuttling piece swings across and takes it. Two, because one
 * is just a capture — it is the *repetition*, the piece coming back the other
 * way for the next victim, that makes the shape a Guillotine rather than a good
 * move. The forum's own image is the same one: the executioner drops the blade
 * and the return move "raises the blade ready for the next victim".
 */
export const GUILLOTINE_CYCLES = 2;

/** The four board lines that run corner to corner: the edge ranks and files.
 *  These are the escape lanes — every square a king enters a corner from lies
 *  on one — and they are the only lines with a corner at each end to crush a
 *  blocker against. */
const EDGE_LINES: ReadonlyArray<{ axis: "row" | "col"; index: number }> = [
  { axis: "row", index: 0 },
  { axis: "row", index: BOARD_SIZE - 1 },
  { axis: "col", index: 0 },
  { axis: "col", index: BOARD_SIZE - 1 },
];

const onLine = (sq: Square, line: { axis: "row" | "col"; index: number }): boolean =>
  line.axis === "row" ? sq.row === line.index : sq.col === line.index;

/** Position along an edge line: the coordinate that varies. */
const along = (sq: Square, line: { axis: "row" | "col"; index: number }): number =>
  line.axis === "row" ? sq.col : sq.row;

/**
 * The square a capture against a corner puts the *captured* piece on, given the
 * capturing piece stopped at `to`.
 *
 * A custodial capture needs the victim between two hostile squares. With a
 * corner as one of them the geometry is fully pinned: the victim stands next to
 * the corner and the capturer stands next to the victim, so on a line running
 * `corner, victim, capturer` the capturer is exactly two squares from the
 * corner. Returns null when `to` is not two squares from either end.
 */
function cornerAnvilVictim(
  to: Square,
  line: { axis: "row" | "col"; index: number },
): Square | null {
  const t = along(to, line);
  for (const end of [0, BOARD_SIZE - 1]) {
    if (Math.abs(t - end) !== 2) continue;
    const victim = end + (t > end ? 1 : -1);
    return line.axis === "row"
      ? { row: line.index, col: victim }
      : { row: victim, col: line.index };
  }
  return null;
}

/**
 * Does the proof contain a Guillotine?
 *
 * `proof` is the full proven continuation from the puzzle position — the
 * solver's working, not the shipped **Line**. The motif starts after the line
 * has stopped, so nothing shorter can see it.
 *
 * A run of King's-side moves counts when, for `GUILLOTINE_CYCLES` swings in a
 * row:
 *
 *   1. one and the same King's-side piece makes every move (the destination of
 *      one is the origin of the next);
 *   2. every square it stands on lies on a single **edge line** — an escape
 *      lane, with a corner at each end;
 *   3. it alternates between exactly two squares on that line, going back and
 *      forth rather than walking along it;
 *   4. every move captures a raider against a corner of that line: the victim
 *      next to the corner, the shuttling piece next to the victim;
 *   5. every raider it takes was *interposed* — it arrived on that square during
 *      the proof, on an attacker move, rather than having stood there all
 *      along. This is "forcing the raiders to feed soldiers in to block the
 *      escape" made checkable;
 *   6. and after each execution the King has an open straight lane to a corner.
 *      The blocker was blocking something; if nothing opens, the piece was not
 *      blocking an escape and this is not the motif.
 *
 * Scanned over the whole proof, not only its literal tail, because the proof's
 * last move is the King stepping into the corner and that move captures
 * nothing — a strict tail test would be hidden by the very move the shuttling
 * was for.
 *
 * ## Why "interposed" is not "interposed on the previous ply"
 *
 * The obvious reading of the mechanism is that the raider blocks and is taken
 * straight back. Play it out and it is not what happens, because the shuttling
 * piece cannot execute by standing still: it has to be *arriving* at the square
 * beside the victim, so it must be somewhere else when the block goes in. The
 * cycle is
 *
 *     block one lane · shuttle across and execute at the *other* corner ·
 *     block that lane · shuttle back and execute the first blocker
 *
 * so the raider that dies was fed in two attacker moves ago, not one. Requiring
 * the previous ply would have been a recogniser that could never fire on the
 * thing it was named for — the sort of bug a hand-built proof catches and a
 * bank-wide count of zero never would, because zero is also what a correct
 * recogniser returns here.
 */
export function isGuillotine(proof: GameState[], rules: RuleSet): boolean {
  // Without hostile corners there is no anvil, and the whole mechanism is an
  // ordinary sequence of moves.
  if (!rules.cornersHostile) return false;
  const played = plies(proof);

  for (const line of EDGE_LINES) {
    // Every possible starting ply, because the run may sit anywhere in the
    // proof; the inner walk steps by two, which is what "alternating" means
    // once the raiders' interposing moves are counted in.
    for (let start = 0; start < played.length; start++) {
      let run = 0;
      let prevTo: Square | null = null;
      const visited = new Set<string>();
      for (let i = start; i < played.length; i += 2) {
        const p = played[i];
        if (p.side !== "defenders") break; // King's side only
        if (!onLine(p.move.from, line) || !onLine(p.move.to, line)) break;
        if (prevTo && !same(p.move.from, prevTo)) break; // one and the same piece
        if (!isSwing(played, i, line)) break;
        // The *destinations* are what alternate. Where the piece first came from
        // is the approach, not part of the shuttle, so it is not counted.
        visited.add(keyOf(p.move.to));
        if (visited.size > 2) break; // a walk along the lane, not a shuttle
        prevTo = p.move.to;
        run++;
        if (run >= GUILLOTINE_CYCLES && visited.size === 2) return true;
      }
    }
  }
  return false;
}

/** One fall of the blade: a capture against a corner of `line`, of a raider that
 *  was fed onto the lane earlier in the proof, after which the King has a clear
 *  lane to a corner. */
function isSwing(played: Ply[], i: number, line: { axis: "row" | "col"; index: number }): boolean {
  const p = played[i];
  const victim = cornerAnvilVictim(p.move.to, line);
  if (!victim) return false;
  if (!p.captures.some((c) => same(c, victim))) return false;
  // Interposed: the raider standing there arrived there, on an attacker move,
  // during the proof. The *latest* such arrival is the piece being taken now.
  const fedIn = played
    .slice(0, i)
    .some((q) => q.side === "attackers" && same(q.move.to, victim));
  if (!fedIn) return false;
  const k = findKing(p.after.board);
  return k !== null && clearPathToCorner(p.after.board, k.row, k.col) >= 1;
}

// ── Corner fight ──────────────────────────────────────────────────────────────

/** The middle rank and file, which both quadrants on either side share. On a
 *  7×7 board that is index 3, the throne's line. */
const MID = Math.floor(BOARD_SIZE / 2);

/** The quarter of the board a corner owns, inclusive of the middle rank and
 *  file so no square is outside every quadrant. */
function inQuadrant(sq: Square, corner: Square): boolean {
  const rowOk = corner.row === 0 ? sq.row <= MID : sq.row >= MID;
  const colOk = corner.col === 0 ? sq.col <= MID : sq.col >= MID;
  return rowOk && colOk;
}

/** How near the corner has to be for it to be what the King is playing for.
 *  `kingCornerMoves` is exact at 1 and 2 and caps at 3, so this is "one move, or
 *  one move and a pivot" — the range in which the corner is a live target rather
 *  than a direction of travel. */
const CORNER_FIGHT_KING_MOVES = 2;

/**
 * Is the line a fight over one corner?
 *
 * `states` is the shipped **Line** played out: `states[0]` is the position the
 * learner is given. Board geometry only — no proof, no solver.
 *
 * There must be a corner such that every capture in the line falls inside its
 * quadrant, at least one of those captures uses that very corner as its anvil,
 * and the King is both in the quadrant and close enough to the corner for it to
 * be his target. That last clause is what stops the recogniser firing on any
 * capture that happens to occur near a corner: the corner has to be in play as
 * a goal as well as as an anvil, which is exactly the double role the glossary
 * gives it.
 *
 * Deliberately indifferent to which side the puzzle belongs to. A corner fight
 * is a fight, and the raiders are in it too.
 */
export function isCornerFight(states: GameState[], rules: RuleSet): boolean {
  if (!rules.cornersHostile) return false;
  if (states.length === 0) return false;
  const played = plies(states);
  const captured = played.flatMap((p) => p.captures);
  if (captured.length === 0) return false; // no captures, no fight

  const king = findKing(states[0].board);
  if (!king) return false;
  if (kingCornerMoves(states[0].board, king.row, king.col) > CORNER_FIGHT_KING_MOVES) return false;

  return CORNERS.some((corner) => {
    if (!inQuadrant(king, corner)) return false;
    if (!captured.every((c) => inQuadrant(c, corner))) return false;
    return played.some((p) => usesCornerAsAnvil(p, corner));
  });
}

/** The capture geometry, checked rather than assumed: victim next to the
 *  corner, capturer's destination next to the victim on the far side. */
function usesCornerAsAnvil(p: Ply, corner: Square): boolean {
  return p.captures.some((victim) => {
    const dr = victim.row - corner.row;
    const dc = victim.col - corner.col;
    if (Math.abs(dr) + Math.abs(dc) !== 1) return false;
    return same(p.move.to, { row: victim.row + dr, col: victim.col + dc });
  });
}

// ── The tagger ────────────────────────────────────────────────────────────────

/** Everything a puzzle offers the tagger. `proof` is null for an evaluation
 *  goal, which has no proof to be a continuation of (ADR-0002) — and so can
 *  never carry a Guillotine. */
export interface MotifInput {
  /** The shipped line played out; `[0]` is the position the learner sees. */
  states: GameState[];
  /** The full proven continuation from the same position, or null. */
  proof: GameState[] | null;
}

/** Every motif recognised in a puzzle, in `MOTIF_PRIORITY` order. */
export function recogniseMotifs(input: MotifInput, rules: RuleSet): Motif[] {
  const found: Motif[] = [];
  if (input.proof && isGuillotine(input.proof, rules)) found.push("guillotine");
  if (isCornerFight(input.states, rules)) found.push("cornerFight");
  // snapTrap, clamp, spring, balling, cordon: static shapes, waiting for a
  // hand-label to repeat before they earn a recogniser (ADR-0003).
  // twinTowers: wants more board than Brandubh has, and is expected to find
  // nothing here. That is a result, and it is printed as one.
  return MOTIF_PRIORITY.filter((m) => found.includes(m));
}

/** The one motif a puzzle is listed under, or null — most of the bank. */
export function primaryMotif(found: readonly Motif[]): Motif | null {
  return MOTIF_PRIORITY.find((m) => found.includes(m)) ?? null;
}

/**
 * Whether the solver gives a soldier up: a solver move whose piece the scripted
 * reply then captures.
 *
 * Read off the played line, so it is the engine's own idea of a capture and not
 * a second one written here. The King does not count — losing him is not a
 * sacrifice, it is the end of the game.
 */
export function givesUpSoldier(states: GameState[]): boolean {
  const played = plies(states);
  for (let i = 0; i + 1 < played.length; i += 2) {
    const solverPly = played[i];
    const reply = played[i + 1];
    const { from, to } = solverPly.move;
    if (solverPly.before.board[from.row][from.col] === "king") continue;
    if (reply.captures.some((c) => same(c, to))) return true;
  }
  return false;
}

const MOVE_TAGS: readonly Tag[] = ["moves1", "moves2", "moves3", "moves4"];

/**
 * The computed tags for one puzzle, in a fixed order so the stored record is
 * byte-stable across regenerations.
 *
 * `motifs` is everything recognised; the primary one is left out, because a tag
 * repeating the row a puzzle is already filed under says nothing.
 */
export function computeTags(args: {
  side: Side;
  states: GameState[];
  motifs: readonly Motif[];
  primary: Motif | null;
}): Tag[] {
  const { side, states, motifs, primary } = args;
  const out: Tag[] = [side];
  const solverMoves = Math.ceil(plies(states).length / 2);
  const lengthTag = MOVE_TAGS[Math.min(solverMoves, MOVE_TAGS.length) - 1];
  if (lengthTag) out.push(lengthTag);
  if (givesUpSoldier(states)) out.push("soldierGivenUp");
  for (const m of MOTIF_PRIORITY) if (motifs.includes(m) && m !== primary) out.push(m);
  return out;
}
