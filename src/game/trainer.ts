// ── The trainer: which puzzle next, and when a band is outgrown ──────────────
//
// The Learn screen no longer shows the **Pool** as a list: the Puzzles door
// opens straight onto a board, lichess-style, and this module decides which
// puzzle is on it. One current **Band**, walked upward on evidence:
//
//   easy   → medium   after  8 clean solves in easy,
//   medium → hard     after  5 clean solves in medium,
//   hard   → ollamh   after  5 clean solves in hard,
//
// each gate also requiring **80% accuracy** over every attempt made in that
// band — eight clean solves out of eleven tries is not the same claim as eight
// out of nine, and the gate exists to measure the claim, not the persistence.
//
// A **clean solve** is the puzzle solved with no wrong guess and no *view the
// solution* — lichess's rule, where the first wrong move fails the puzzle even
// if you find the answer afterwards. A puzzle solved late still lands in the
// solved **Ledger** (it is done, and is not served again), it just does not
// argue for promotion.
//
// Two ways out of a band, and only two: the gate above, or running dry — a band
// with nothing left unsolved cannot be trained in, so it is skipped regardless
// of accuracy. Past the last band the trainer goes to **free play**: random
// serving over everything still unsolved, until the whole bank is done.
//
// There is no demotion. The bands' unlock ladder in `puzzleProgress.ts` is
// blind to attempts and never revoked, and this walks the same direction: a bad
// day in `medium` slows the gate, it does not send anyone back to `easy`.
//
// Pure and tested, in the project idiom: the component that serves boards holds
// no judgement worth testing, because every judgement is here.

import { DIFFICULTIES, type Difficulty } from "./ai";
import type { Puzzle } from "./puzzleBank";

const TRAINER_KEY = "brandubh.trainer.v1";

/**
 * Clean solves required to leave each band. `easy` asks for more because it is
 * where fundamentals are proven; the upper gates ask five each, per the design.
 * `ollamh` is the last band — nothing above it to promote into.
 */
export const PROMOTE_AFTER: Record<Difficulty, number | null> = {
  easy: 8,
  medium: 5,
  hard: 5,
  ollamh: null,
};

/** The accuracy floor at every gate: clean solves over attempts in the band. */
export const MIN_ACCURACY = 0.8;

/** What one band has seen: every finished attempt, and the clean solves among
 *  them. An attempt is a *finished* puzzle — walking away mid-position records
 *  nothing, because nothing was answered. */
export interface BandRecord {
  correct: number;
  attempted: number;
}

export interface TrainerState {
  /** The band currently being trained. */
  band: Difficulty;
  record: Record<Difficulty, BandRecord>;
}

const emptyRecord = (): Record<Difficulty, BandRecord> => ({
  easy: { correct: 0, attempted: 0 },
  medium: { correct: 0, attempted: 0 },
  hard: { correct: 0, attempted: 0 },
  ollamh: { correct: 0, attempted: 0 },
});

export const initialTrainer = (): TrainerState => ({ band: "easy", record: emptyRecord() });

/** The band above, or null at the top of the ladder. */
export function nextBand(band: Difficulty): Difficulty | null {
  const i = DIFFICULTIES.indexOf(band);
  return i >= 0 && i + 1 < DIFFICULTIES.length ? DIFFICULTIES[i + 1] : null;
}

/**
 * Whether this record earns promotion out of `band`.
 *
 * Both legs must hold: the clean-solve count *and* the accuracy floor over the
 * band's whole history. The count guarantees `attempted > 0`, so the division
 * is safe exactly when it is reached. Someone below the floor is not locked
 * out — every further clean solve raises both numbers, so the gate stays
 * reachable at any history (8 clean of 10 is 80%).
 */
export function promotes(band: Difficulty, r: BandRecord): boolean {
  const need = PROMOTE_AFTER[band];
  return need !== null && r.correct >= need && r.correct / r.attempted >= MIN_ACCURACY;
}

/**
 * Record one finished attempt in the current band and promote if it is earned.
 *
 * The attempt is scored against the band being *trained*, not the band the
 * puzzle wears: in free play an `easy` leftover may be served while the state
 * sits at `ollamh`, and its result belongs to the sitting, not the label.
 * Promotion does not reset the next band's record — there is nothing in it yet,
 * and an old partial record (from a band exhausted and skipped) stays honest.
 */
export function recordAttempt(s: TrainerState, correct: boolean): TrainerState {
  const r: BandRecord = {
    correct: s.record[s.band].correct + (correct ? 1 : 0),
    attempted: s.record[s.band].attempted + 1,
  };
  const record = { ...s.record, [s.band]: r };
  const band = promotes(s.band, r) ? (nextBand(s.band) ?? s.band) : s.band;
  return { band, record };
}

/**
 * The next puzzle to serve, and the band the trainer stands in after choosing.
 *
 * Random within the current band's unsolved puzzles, because the pool's order
 * is a browsing order and the trainer is not browsing. `avoid` is the puzzle
 * just finished: a failed puzzle stays unsolved and will come around again, but
 * not as the very next board — unless it is the only one left, in which case
 * serving it again *is* the honest choice.
 *
 * A band with nothing unsolved is skipped upward (returned in `band`, so the
 * caller can persist the move); past `ollamh` the trainer is in free play and
 * serves randomly from everything unsolved. Null when the whole bank is solved.
 *
 * `rand` is injected (a `Math.random`-shaped source) so the suites can pin it.
 */
export function pickNext(
  bank: readonly Puzzle[],
  solved: ReadonlySet<string>,
  band: Difficulty,
  rand: () => number,
  avoid?: string,
): { puzzle: Puzzle | null; band: Difficulty } {
  const draw = (pool: readonly Puzzle[]): Puzzle | null => {
    if (!pool.length) return null;
    const rest = pool.length > 1 ? pool.filter((p) => p.id !== avoid) : pool;
    return rest[Math.min(rest.length - 1, Math.floor(rand() * rest.length))];
  };

  let at: Difficulty | null = band;
  while (at !== null) {
    const pick = draw(bank.filter((p) => p.band === at && !solved.has(p.id)));
    if (pick) return { puzzle: pick, band: at };
    at = nextBand(at);
  }
  // Every band from `band` up is dry. Free play: anything still unsolved,
  // anywhere — leftovers below the current band included, which is what lets
  // the whole bank actually finish.
  return { puzzle: draw(bank.filter((p) => !solved.has(p.id))), band: "ollamh" };
}

// ── Persistence, in the ledger idiom: tolerant parse, silent failure ─────────

export function parseTrainer(raw: string | null): TrainerState {
  if (!raw) return initialTrainer();
  try {
    const v = JSON.parse(raw) as {
      band?: unknown;
      record?: Partial<Record<Difficulty, { correct?: unknown; attempted?: unknown }>>;
    };
    const band = DIFFICULTIES.includes(v.band as Difficulty) ? (v.band as Difficulty) : "easy";
    const record = emptyRecord();
    for (const b of DIFFICULTIES) {
      const r = v.record?.[b];
      const attempted =
        typeof r?.attempted === "number" && Number.isFinite(r.attempted)
          ? Math.max(0, Math.floor(r.attempted))
          : 0;
      const correct =
        typeof r?.correct === "number" && Number.isFinite(r.correct)
          ? Math.min(attempted, Math.max(0, Math.floor(r.correct)))
          : 0;
      record[b] = { correct, attempted };
    }
    return { band, record };
  } catch {
    return initialTrainer();
  }
}

export function loadTrainer(): TrainerState {
  try {
    return parseTrainer(localStorage.getItem(TRAINER_KEY));
  } catch {
    return initialTrainer();
  }
}

export function saveTrainer(s: TrainerState): void {
  try {
    localStorage.setItem(TRAINER_KEY, JSON.stringify(s));
  } catch {
    /* ignore persistence failures */
  }
}
