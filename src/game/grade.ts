// ── Puzzle grade and band ────────────────────────────────────────────────────
//
// How hard a **Puzzle** is reckoned to be, and which of the four **Bands** that
// puts it in. An estimate, and never shown as one.
//
// Kept apart from the data module on purpose. The bank stores the
// **measurements** — things about a position that are facts, that a re-run
// reproduces exactly, and that no refit can change — and this file turns them
// into a number. Refitting the weights in 8f is then one edit here: no
// regeneration, no re-solve, and the Learn screen re-bands for free.
//
// The measurements are all engine-side, which is the point of grading this way
// at all: `depthToFind` returns the same number every time it is asked, so the
// fitted formula has no occasion noise even though the labels it was fitted to
// are noisy. A simple model of a judge routinely outperforms the judge for
// exactly that reason (ADR-0005).

import { DIFFICULTIES, type Difficulty } from "./ai";

/**
 * What the eye lands on first.
 *
 * Depth-to-find alone systematically under-rates a move that takes the engine a
 * long time to justify but a person half a second to see. These four flags are
 * the correction: they are the properties of a solving move that make it jump
 * off the board before any calculation happens.
 *
 * A starting vector to be fitted, not a claim about human vision. 8f measures
 * whether each of them earns its weight.
 */
export interface Salience {
  /** The solving move takes a piece. */
  capture: boolean;
  /** It moves the King. */
  movesKing: boolean;
  /** It moves toward a corner — the King's goal, and every capture's anvil. */
  towardCorner: boolean;
  /** It is the only legal move that piece has, so the piece picks the move. */
  onlyMoveOfPiece: boolean;
}

/** The stored facts a grade is computed from. All reproducible from the bank. */
export interface GradeMeasurements {
  /** The smallest search depth at which the engine returns the step-1 solving
   *  move as its single best. The dominant term, and the only expensive one. */
  depthToFind: number;
  /** Solver moves in the shipped **Line** — 1 to 4. Derivable from the line,
   *  and passed in rather than re-derived so this file never parses anything. */
  lineLength: number;
  salience: Salience;
}

/**
 * EXPLICITLY A GUESS until 8f fits it. The shape is agreed — depth to find,
 * corrected for salience, plus line length — and the weights are not measured.
 *
 * The units are arbitrary and only the cuts below give them meaning. Nothing
 * reads a raw grade: the Learn screen shows a **Band**, and a person is never
 * asked for either (ADR-0005).
 *
 * `src/game/annotate.ts:62-96` is how this comment should read once 8f has run:
 * what was measured, over how much data, with what accuracy against what noise
 * floor. Until then it says "guess", because it is one.
 */
export const GRADE_WEIGHTS = {
  /** Per ply of search the answer needed. Dominant by design. */
  depthToFind: 100,
  /** Per solver move past the first. A four-move line is a different exercise
   *  from a one-move line even when each move is individually easy. */
  linePastFirst: 60,
  /** Subtracted when the flag is set: a salient move is an easier move. */
  salience: {
    capture: 50,
    movesKing: 40,
    towardCorner: 30,
    onlyMoveOfPiece: 60,
  },
} as const;

/**
 * Three cuts, four **Bands**, on the same ladder as **AI level** — one ladder,
 * two things graded on it.
 *
 * Fixed grades, so band sizes differ and are allowed to; that is exactly why
 * **Unlock** is a proportion of a band rather than a count. What is *not*
 * allowed is an empty band: an empty band means the cuts describe a bank that
 * does not exist, so `scripts/genpuzzles.ts` prints the per-band counts and
 * says so rather than shrugging.
 *
 * A grade below the first cut is `easy`; at or above the last is `ollamh`.
 *
 * ## Calibrated against the bank, not guessed
 *
 * The first attempt (250 / 420 / 600) was written before a bank existed and was
 * wrong in a way only data could show: `ollamh` at 600 was **unreachable**.
 * `depthToFind` cannot exceed `BANK_VERIFY_DEPTH` by construction — the
 * generator rejects a move that is not uniquely best at that depth — so with a
 * verify depth of 4 the formula maxes at `4·100 + 3·60 = 580`. Two of the four
 * bands named a region no puzzle could enter.
 *
 * The 161-puzzle bank grades in four tight clusters, one per `depthToFind`,
 * with real gaps between them:
 *
 * ```
 *   dtf 1   n=126   0–100        dtf 3   n= 29   220–290
 *   dtf 2   n=  2   120          dtf 4   n=  4   330–370
 * ```
 *
 * The cuts sit in those gaps (30→50, 120→220, 290→330), giving **106 / 22 / 29
 * / 4**. Percentiles were not usable and the reason is worth recording: 92 of
 * 161 puzzles grade at exactly 30, so p25, p50 and p75 cannot separate them. A
 * distribution with a spike that large is not cut by quantiles, it is cut by
 * where it stops being flat.
 *
 * ## What these counts are actually telling us, which is not about the cuts
 *
 * `easy` holds two thirds of the bank and `ollamh` holds four puzzles. That is a
 * finding about `GRADE_WEIGHTS`, not something to fix by moving the cuts until
 * the bands look even — that would be tuning the ruler to flatter the thing
 * being measured. Two measurements are barely varying:
 *
 *  - **`depthToFind` is 1 for 126 of 161.** The dominant term is nearly a
 *    constant. `assess()` already moved its decisiveness gate deeper once for
 *    this exact reason and it was not enough.
 *  - **`lineLength` is 1 for 160 of 161**, so `linePastFirst` contributes
 *    nothing at all. ADR-0001's uniqueness requirement is what does it: a line
 *    can only continue while every solver move stays uniquely best, and in
 *    practice the second step almost always has a rival. A four-move bank puzzle
 *    is rarer than the format anticipated.
 *
 * Both are 8f's business — it fits the weights against blind human comparisons,
 * and may well conclude that a term which never varies should not be weighted at
 * all. These cuts are what keeps the four bands honest until then.
 */
export const BAND_CUTS = {
  medium: 40,
  hard: 210,
  ollamh: 310,
} as const;

/** The grade: depth to find, corrected for salience, plus line length. */
export function gradeOf(m: GradeMeasurements): number {
  const w = GRADE_WEIGHTS;
  let g = m.depthToFind * w.depthToFind + Math.max(0, m.lineLength - 1) * w.linePastFirst;
  if (m.salience.capture) g -= w.salience.capture;
  if (m.salience.movesKing) g -= w.salience.movesKing;
  if (m.salience.towardCorner) g -= w.salience.towardCorner;
  if (m.salience.onlyMoveOfPiece) g -= w.salience.onlyMoveOfPiece;
  // A salience correction can in principle out-run a shallow depth; a negative
  // grade would still band as `easy`, but the floor keeps the number readable
  // and keeps the 8f fit from having to explain a sign.
  return Math.max(0, g);
}

/** Which of the four bands a grade falls in. */
export function bandOf(grade: number): Difficulty {
  if (grade >= BAND_CUTS.ollamh) return "ollamh";
  if (grade >= BAND_CUTS.hard) return "hard";
  if (grade >= BAND_CUTS.medium) return "medium";
  return "easy";
}

/** The bands in ladder order — `DIFFICULTIES`, named for what it means here. */
export const BANDS: readonly Difficulty[] = DIFFICULTIES;
