// ── Puzzle progress: the solved ledger, and the bands it opens ────────────────
//
// What the learner has done with the **Puzzle Bank**, and what that entitles
// them to see. Two things, and only two: a set of solved **Puzzle numbers**, and
// the **Unlock** state derived from it.
//
// Written in the `tutorials.ts` idiom on purpose — a tolerant parser, a
// whitelist of ids that actually exist, and silent failure on a dead
// `localStorage` — because this is the same kind of thing: a small ledger whose
// worst realistic failure is that someone re-solves a puzzle they had already
// solved. Nothing here is worth throwing over.
//
// ## What is stored, and what is not
//
// The solved-id set, and nothing else. Not attempt counts, not times, not which
// band was open when. **Unlock is derived**, every time, from the set and the
// bank — so refitting the grade weights in 8f re-bands the app and the ledger
// keeps meaning what it meant, because a **Puzzle number** is permanent and a
// band is not.
//
// This is also the only thing about a bank puzzle that persists at all. Puzzle
// positions live in component state and never reach `persist.ts` or
// `gameFile.ts`, exactly as tutorial set plays do — see the
// replay-from-opening invariant in `replay.ts`.

import { DIFFICULTIES, type Difficulty } from "./engine";
import type { Puzzle } from "./puzzleBank";

const PROGRESS_KEY = "brandubh.puzzles.v1";

/**
 * How much of a **Band** must be solved before the next one opens.
 *
 * A proportion rather than a count, because the cuts in `grade.ts` are fixed
 * grades and the bands they produce differ in size — over the 161-puzzle bank,
 * **106 / 22 / 29 / 4**. A flat "solve ten" would be a tenth of `easy` and more
 * than twice the whole of `ollaṁ`.
 *
 * ## Why a quarter and not the third the plan proposed
 *
 * The plan proposed one third and said to revisit it once band sizes were
 * known. They are known now, and only one of the three gates is worth arguing
 * about: because `easy` holds two thirds of the bank, the proportion converts
 * there into much the largest absolute number, and that is the first wall
 * anybody meets.
 *
 * At one third it is **36 puzzles** — more than the whole of `medium` (22) and
 * more than `hard` (29). Reaching the second band would cost more work than the
 * second and third bands contain, and the gate does not exist to meter content:
 * it exists so nobody meets an `ollaṁ` puzzle on their second visit and
 * concludes the bank is impossible.
 *
 * A quarter gives **27 / 6 / 8** — 41 solves to open everything, a quarter of
 * the bank, with the first gate in the twenties: a sitting or two rather than a
 * campaign.
 *
 * A fifth (22 / 5 / 6) fixes nothing the quarter has not already fixed — 22 and
 * 27 are the same kind of number — and costs something: gates of five and six
 * are crossed without being noticed, and a threshold nobody notices is not doing
 * the job the threshold exists for.
 *
 * The quarter also survives 8f better. `grade.ts` records that `easy` is two
 * thirds of the bank because two of the three measurements barely vary, not
 * because those puzzles are meaningfully easier, so refitting the weights will
 * move the band sizes. A proportion is chosen once and outlives the sizes it was
 * picked against: at four even bands of ~40 a quarter is ten solves a band,
 * which still reads as a threshold at both ends of the range.
 */
export const UNLOCK_PROPORTION = 1 / 4;

/** Solves needed in a band of `total` puzzles to open the next one. An empty
 *  band needs nothing, so it can never dam the ladder behind it. */
export const unlockThreshold = (total: number): number =>
  Math.ceil(total * UNLOCK_PROPORTION);

/**
 * One band's standing: how big it is, how much of it is done, and whether it is
 * open yet.
 *
 * `needed` counts solves still owed **in the band immediately before this one**,
 * and is 0 whenever this band is already open. For a band two rungs up the
 * ladder that number is what opens it *once the rung below has opened* — which
 * is what the greying of the intervening row already says.
 */
export interface BandProgress {
  band: Difficulty;
  total: number;
  solved: number;
  unlocked: boolean;
  needed: number;
}

/**
 * The four bands in ladder order, with their counts and their locks.
 *
 * The rules, in full:
 *
 *  - the first band is always open — there is nothing before it to earn it;
 *  - a band is open when the band before it is open **and** enough of that band
 *    is solved. The chain matters: solving deep in `easy` opens `medium` and no
 *    more, so the ladder is walked rather than jumped;
 *  - unlock is **blind to how many attempts a solve took**. `Attempt.attempts`
 *    is counted for the copy and never scored, and nothing here reads it;
 *  - unlock is **never revoked**. It cannot be, from inside these rules: the
 *    solved set only grows within a session and band totals are fixed at build.
 *    (Regenerating the bank with different numbers would drop ids the parser no
 *    longer recognises — but the **Ledger** exists precisely so numbers survive
 *    regeneration, and 8c's determinism test is what enforces it.)
 */
export function bandProgress(
  puzzles: readonly Puzzle[],
  solved: ReadonlySet<string>,
): BandProgress[] {
  const out: BandProgress[] = [];
  let openable = true; // every band before this one met its threshold
  let prevOwed = 0; // solves still missing from the band immediately before
  for (const band of DIFFICULTIES) {
    const inBand = puzzles.filter((p) => p.band === band);
    const done = inBand.filter((p) => solved.has(p.id)).length;
    out.push({
      band,
      total: inBand.length,
      solved: done,
      unlocked: openable,
      needed: openable ? 0 : prevOwed,
    });
    const need = unlockThreshold(inBand.length);
    prevOwed = Math.max(0, need - done);
    openable = openable && done >= need;
  }
  return out;
}

/** Whether a band is open, by name. Convenience over `bandProgress` for the
 *  places that only need the boolean. */
export function isBandUnlocked(
  band: Difficulty,
  puzzles: readonly Puzzle[],
  solved: ReadonlySet<string>,
): boolean {
  return bandProgress(puzzles, solved).find((b) => b.band === band)?.unlocked ?? false;
}

/**
 * Read the stored set, dropping anything the bank does not contain.
 *
 * `known` is the ids of the loaded bank, which is empty under any ruleset the
 * bank was not verified for — so a solved set read while playing a different
 * variant comes back empty rather than half-recognised, and the stored string is
 * left untouched for when the ruleset comes back.
 */
export function parsePuzzleProgress(raw: string | null, known: ReadonlySet<string>): Set<string> {
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string" && known.has(x)));
  } catch {
    return new Set();
  }
}

export function loadPuzzleProgress(known: ReadonlySet<string>): Set<string> {
  try {
    return parsePuzzleProgress(localStorage.getItem(PROGRESS_KEY), known);
  } catch {
    return new Set();
  }
}

export function savePuzzleProgress(solved: ReadonlySet<string>): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([...solved]));
  } catch {
    /* ignore persistence failures */
  }
}
