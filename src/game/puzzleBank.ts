// ── The puzzle bank: stored format, decoder, loader ──────────────────────────
//
// A **Puzzle** is a stored, verified exercise: a position, a side to move, and
// the **Line** that answers it. This file is the contract between
// `scripts/genpuzzles.ts`, which produces them offline, and everything that
// reads them. It holds no verification of its own — a decoder that re-proved
// what it decoded would be the generator, run in the browser.
//
// ## The stored line
//
//     id|pos|leadIn|line|goal|flags|dtm|depthToFind|salience|motif|tags
//
//   id          the five-digit **Puzzle number**, permanent, never reused.
//   pos         `encodePosition` of the position *before* the opponent's last
//               move, so the side to move in it is the opponent.
//   leadIn      that move, `frfctrtc`. Opening the puzzle plays it and then
//               hands over. Storing it is what makes a puzzle arrive as a
//               position someone just moved into rather than as a diagram.
//   line        concatenated `frfctrtc` moves, alternating solver and scripted
//               reply, always ending on a solver move — so an odd count.
//   goal        regicide | escape | crushing | advantage. Four values, and a
//               **Guillotine** is not among them: it is an `escape` whose line
//               happens to be **Truncated** (ADR-0002).
//   flags       `t` when the line is Truncated. Empty otherwise.
//   dtm         distance to mate for a proof, `-` for an evaluation. Stored so
//               the truncation claim can be re-checked, NEVER displayed.
//   depthToFind the grade measurement; see `grade.ts`.
//   salience    the four salience flags, as the letters that are set:
//               `c` capture, `k` moves the King, `t` toward a corner,
//               `o` the only move that piece has. Empty when none are.
//   motif       the **Primary motif**, or empty. Empty throughout 8b: motifs
//               arrive with the recognisers in 8c.
//   tags        comma-separated computed **Tags**, or empty. Likewise 8c.
//
// ## Why the grade is not in there
//
// The payload stores the *measurements*; `grade.ts` turns them into a grade and
// a band at import, over ~80 records, once. Refitting the weights in 8f is then
// one edit and no regeneration.
//
// ## Why the whole bank is fingerprint-gated
//
// A Puzzle belongs to exactly one **Ruleset** and is invalid under any other: a
// differing flag can change whether the solving move wins, or whether it is
// even legal. `loadBank` therefore serves the bank only on an exact match and
// an empty bank otherwise, exactly as `bookRulesMatch` gates the opening book.
// The payload is keyed by nothing but the fingerprint const, so a second
// ruleset appends a second data module rather than forking this format.

import { decodeMove, encodeMove, rulesFingerprint } from "./openingBook";
import { applyMove } from "./engine";
import { parsePosition } from "./position";
import { bandOf, gradeOf, type GradeMeasurements, type Salience } from "./grade";
import { MOTIFS, PLAIN_TAGS, type Motif, type Tag } from "./motifs";
import type { Difficulty } from "./ai";
import { BOARD_SIZE, type GameState, type Move, type Side } from "./types";
import type { RuleSet } from "./variants";
import {
  BANK_BOARD_SIZE,
  BANK_DATA,
  BANK_RULES_FINGERPRINT,
  BANK_VERIFY_DEPTH,
} from "./puzzleBank.data";

export { BANK_BOARD_SIZE, BANK_RULES_FINGERPRINT, BANK_VERIFY_DEPTH };

/**
 * What a **Puzzle** asks for, and therefore how it was verified.
 *
 * `regicide` and `escape` are proven outright by the solver; `crushing` and
 * `advantage` are measured against the evaluation and are never called proofs.
 * The goal records what kind of evidence a puzzle rests on, so the bank never
 * claims more than it has.
 */
export type PuzzleGoal = "regicide" | "escape" | "crushing" | "advantage";

export const PUZZLE_GOALS: readonly PuzzleGoal[] = ["regicide", "escape", "crushing", "advantage"];

/** Whether a goal is a proof rather than an evaluation. `dtm` is finite exactly
 *  for these, which is the invariant the suite checks. */
export const isProof = (goal: PuzzleGoal): boolean => goal === "regicide" || goal === "escape";

export interface Puzzle {
  /** The five-digit **Puzzle number**. */
  id: string;
  /** The position before the lead-in; the opponent is to move in it. */
  position: string;
  /** The opponent's move that opens the puzzle. */
  leadIn: Move;
  /** Solver moves and scripted replies, alternating, ending on a solver move. */
  line: Move[];
  goal: PuzzleGoal;
  /** The line stops before the game does, because what follows is proven but
   *  long. Deliberately indistinguishable to the learner from a short decisive
   *  line — that is the whole intent of ADR-0002. */
  truncated: boolean;
  /** Distance to mate in plies, `Infinity` for an evaluation goal. Metadata for
   *  re-checking the truncation claim. Never rendered. */
  dtm: number;
  measurements: GradeMeasurements;
  /** The **Primary motif**, or null — which is most of the bank, and is meant
   *  to be. The type is the attested union from `motifs.ts`, so a motif this
   *  project invented cannot be stored even by accident. */
  motif: Motif | null;
  /** Computed **Tags** for filtering the **Pool**. */
  tags: Tag[];
  /** Computed at import from `measurements`, never stored. */
  grade: number;
  band: Difficulty;
}

/** Whose move it is once the lead-in has been played: the solver's. */
export function solverSide(p: Puzzle): Side {
  const parsed = parsePosition(p.position);
  if (!parsed.ok) return "attackers";
  return parsed.state.turn === "attackers" ? "defenders" : "attackers";
}

/** The number of solver moves in a line — its length as the glossary counts it.
 *  A "four-move puzzle" asks for four moves and holds seven plies. */
export const solverMoves = (line: Move[]): number => Math.ceil(line.length / 2);

/** True for the solver's own moves: even indices, because a line starts on one
 *  and alternates. */
export const isSolverPly = (i: number): boolean => i % 2 === 0;

// ── Salience encoding ─────────────────────────────────────────────────────────
const SALIENCE_LETTERS: ReadonlyArray<[keyof Salience, string]> = [
  ["capture", "c"],
  ["movesKing", "k"],
  ["towardCorner", "t"],
  ["onlyMoveOfPiece", "o"],
];

export function encodeSalience(s: Salience): string {
  return SALIENCE_LETTERS.filter(([k]) => s[k])
    .map(([, ch]) => ch)
    .join("");
}

export function decodeSalience(text: string): Salience {
  const out = { capture: false, movesKing: false, towardCorner: false, onlyMoveOfPiece: false };
  for (const [k, ch] of SALIENCE_LETTERS) if (text.includes(ch)) out[k] = true;
  return out;
}

// ── Payload codec ─────────────────────────────────────────────────────────────
/** Every string that may appear in the `tags` column: the computed ones, plus
 *  any **Motif** that is not a puzzle's primary one. */
const VALID_TAGS: ReadonlySet<string> = new Set<string>([...PLAIN_TAGS, ...MOTIFS]);

const decodeLine = (text: string): Move[] => {
  const out: Move[] = [];
  for (let i = 0; i + 4 <= text.length; i += 4) out.push(decodeMove(text.slice(i, i + 4)));
  return out;
};

/** One record, written the way the generator writes it. Kept beside the decoder
 *  so the two can never drift; the generator imports this rather than
 *  string-building a second copy of the format. */
export function encodePuzzle(p: Omit<Puzzle, "grade" | "band">): string {
  return [
    p.id,
    p.position,
    encodeMove(p.leadIn),
    p.line.map(encodeMove).join(""),
    p.goal,
    p.truncated ? "t" : "",
    Number.isFinite(p.dtm) ? String(p.dtm) : "-",
    String(p.measurements.depthToFind),
    encodeSalience(p.measurements.salience),
    p.motif ?? "",
    p.tags.join(","),
  ].join("|");
}

/**
 * Decode the payload. Tolerant in exactly one direction: a line it cannot read
 * is dropped rather than thrown, the way `tutorials.ts` drops an id it does not
 * recognise. A malformed record is a generator bug, and the suite is where that
 * gets caught — a learner opening the Learn screen is not.
 */
export function decodeBank(data: string): Puzzle[] {
  const out: Puzzle[] = [];
  for (const raw of data.split("\n")) {
    const text = raw.trim();
    if (!text) continue;
    const f = text.split("|");
    if (f.length !== 11) continue;
    const [id, position, leadIn, line, goal, flags, dtm, depthToFind, salience, motif, tags] = f;
    if (!PUZZLE_GOALS.includes(goal as PuzzleGoal)) continue;
    // A motif or tag outside the attested vocabulary is a generator bug, and it
    // is dropped exactly as an unreadable goal is: the alternative is a Learn
    // screen filing a puzzle under a set that does not exist.
    if (motif !== "" && !(MOTIFS as readonly string[]).includes(motif)) continue;
    const tagList = tags === "" ? [] : tags.split(",");
    if (!tagList.every((t) => VALID_TAGS.has(t))) continue;
    const moves = decodeLine(line);
    if (moves.length === 0) continue;
    const measurements: GradeMeasurements = {
      depthToFind: Number(depthToFind),
      lineLength: solverMoves(moves),
      salience: decodeSalience(salience),
    };
    const grade = gradeOf(measurements);
    out.push({
      id,
      position,
      leadIn: decodeMove(leadIn),
      line: moves,
      goal: goal as PuzzleGoal,
      truncated: flags.includes("t"),
      dtm: dtm === "-" ? Infinity : Number(dtm),
      measurements,
      motif: motif === "" ? null : (motif as Motif),
      tags: tagList as Tag[],
      grade,
      band: bandOf(grade),
    });
  }
  return out;
}

/** True when `rules` plays identically to the ruleset the bank was verified
 *  under. Nothing verified under one ruleset is valid under another. */
export function bankRulesMatch(rules: RuleSet): boolean {
  return BANK_RULES_FINGERPRINT !== "" && rulesFingerprint(rules) === BANK_RULES_FINGERPRINT;
}

/** The bundled bank, or an empty one under any other ruleset. */
export function loadBank(rules: RuleSet): Puzzle[] {
  if (!bankRulesMatch(rules)) return [];
  if (BANK_BOARD_SIZE !== BOARD_SIZE) return [];
  return decodeBank(BANK_DATA);
}

/**
 * The two cuts the evaluation goals sit on, in the units of `evaluate`
 * (`src/game/ai.ts`).
 *
 * **Calibrated, not borrowed.** `scripts/annotate-calibrate.ts` measured the
 * distribution of |best-play score| over 645 positions from 40 seeded self-play
 * games at depth 3, a quarter of whose moves are random so the sample spans real
 * positions rather than only well-played ones:
 *
 * ```
 *   p50  44    p70  87    p80 104    p85 127    p90 167    p95 179    p99 262
 * ```
 *
 * The cuts sit on it, each also landing on a natural anchor in the evaluation's
 * own weights (`material` 40 per soldier, `escapeLane` 120):
 *
 * - **advantage 120** (≈p84) — three soldiers, or an escape lane handed over.
 * - **crushing 200** (≈p96) — five soldiers, or a lane plus two soldiers. Above
 *   p95, so a position ordinary play reaches rarely.
 *
 * A line ending below `advantage` is not a puzzle at all: nothing has been
 * shown. Re-run the calibration if `DEFAULT_WEIGHTS` changes — cuts measured
 * against a different evaluation say nothing about this one. The sample is
 * mid-game and the generator measures at its own deeper generation depth, so
 * read these as the scale of the units, not as percentiles of the bank.
 */
export const EVAL_CUTS = {
  advantage: 120,
  crushing: 200,
} as const;

/** The evaluation goal a line-end score earns for `side`, or null when the
 *  position is not decided enough to be worth asking about. `score` is
 *  attacker-positive, as everything from `evaluate` is. */
export function evalGoal(score: number, side: Side): PuzzleGoal | null {
  const forSide = side === "attackers" ? score : -score;
  if (forSide >= EVAL_CUTS.crushing) return "crushing";
  if (forSide >= EVAL_CUTS.advantage) return "advantage";
  return null;
}

/**
 * The position the learner actually sees: the stored position with the lead-in
 * played. Shared by the suite and by 8d's player, so neither invents its own
 * idea of where a puzzle starts.
 *
 * Returns null when the stored position will not parse, which is a generator
 * bug the suite catches rather than something a screen has to handle.
 */
export function puzzleStart(p: Puzzle, rules: RuleSet): GameState | null {
  const parsed = parsePosition(p.position);
  if (!parsed.ok) return null;
  return applyMove(parsed.state, p.leadIn, rules);
}
