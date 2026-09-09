// ── Human-vs-computer results record (WP-4.2, feature 2) ─────────────────────
//
// The only honest "how does the engine do against humans" signal this
// backend-free app can have is a local tally, kept per board on the device
// that played the games. Nothing like it exists yet for any board — this is
// not `records.ts`, which is a row-normalisation mirror of the *live* game
// (see its own header) and has no tally of finished games at all.
//
// Deliberately game-agnostic: a caller passes its own storage-key prefix
// (`"tablut"`, `"copenhagen"`, …) rather than this module importing anything
// from a specific game. That mirrors `boardFlipPrefs.ts` — one tiny module,
// no per-game copy to drift — and keeps it usable by a fourth board, or by
// Nine Men's Morris, which per GLOSSARY.md has no sides named "attackers" and
// "defenders" at all, without a rewrite. `humanSide`, `difficulty` and
// `rulesetId` are therefore plain strings: whatever the caller's own types
// happen to be, widened at the call site rather than imported here.
//
// Rules the caller is trusted to have already applied before calling
// `recordResult` (see the screens' own "victory curtain" effect):
//
//   • hotseat games are never recorded — there is no "the computer" to keep a
//     record against;
//   • a resignation by the human is a loss, exactly as any other loss;
//   • a draw by repetition is a draw;
//   • a game abandoned (a new game started before this one ended) is not
//     recorded — nothing calls in with a non-terminal outcome.
//
// `recordIfTerminal` is the one entry point that also *enforces* the two
// rules that reduce to "was there an outcome to record at all" — hotseat
// (`humanSide === null`) and abandonment (`winner === null`, i.e. the status
// was never terminal) — so a caller that fires it defensively on every
// render, rather than only on the one real transition, still cannot write a
// row for either case. `recordResult` underneath stays a plain, unconditional
// write, for callers (and tests) that already know they have a real result.

/** One finished human-vs-computer game. */
export type AiOutcome = "win" | "loss" | "draw";

export interface AiResultEntry {
  /** The ruleset id the game was played under (`rules.id`) — e.g.
   *  `"copenhagen"`, `"tablut-linnaeus"`, `"custom"`. */
  rulesetId: string;
  /** The AI level the computer played at, as the caller's own ladder names it
   *  (`"easy" | "medium" | "hard" | "ollamh"`, kept as `string` here so this
   *  module never has to import any one game's `Difficulty` type). */
  difficulty: string;
  /** Which side the human played (`"attackers" | "defenders"`, same reasoning). */
  humanSide: string;
  result: AiOutcome;
  /** When the game ended, ms since epoch. */
  endedAt: number;
}

/** How many rows are kept — old ones fall off the front, oldest first. Long
 *  enough to be a real record, small enough that the blob never gets heavy. */
export const MAX_ENTRIES = 500;

const storageKey = (store: string): string => `${store}.aiResults.v1`;

const isOutcome = (v: unknown): v is AiOutcome => v === "win" || v === "loss" || v === "draw";

const isEntry = (v: unknown): v is AiResultEntry =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as AiResultEntry).rulesetId === "string" &&
  typeof (v as AiResultEntry).difficulty === "string" &&
  typeof (v as AiResultEntry).humanSide === "string" &&
  isOutcome((v as AiResultEntry).result) &&
  typeof (v as AiResultEntry).endedAt === "number" &&
  Number.isFinite((v as AiResultEntry).endedAt);

/** Read the stored list, dropping anything that fails to parse rather than
 *  refusing the whole file over one bad row — the same tolerant-read policy
 *  `boardFlipPrefs.ts` and the persist modules use. */
function readEntries(store: string): AiResultEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(store));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

function writeEntries(store: string, entries: AiResultEntry[]): void {
  try {
    localStorage.setItem(storageKey(store), JSON.stringify(entries));
  } catch {
    /* storage unavailable or full — the record simply won't grow this time */
  }
}

/**
 * Append one finished human-vs-computer game. Unconditional: the caller
 * decides whether a game belongs in the record at all (see the module doc);
 * this just writes it, bounded to the last {@link MAX_ENTRIES}.
 */
export function recordResult(store: string, entry: AiResultEntry): void {
  const entries = readEntries(store);
  entries.push(entry);
  writeEntries(store, entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries);
}

/**
 * The two rules that decide "is there anything to record at all", pulled out
 * as a pure function so they are testable without a screen, a store, or even
 * `localStorage`:
 *
 *   • `humanSide === null` is hotseat — there is no human side to keep a
 *     record for, so nothing is ever recorded there;
 *   • `winner === null` is "not actually over" — an abandoned game (a new
 *     one started before this one finished) never reaches a terminal status,
 *     so nothing is recorded for it either.
 */
export function outcomeForHuman(
  winner: string | "draw" | null,
  humanSide: string | null,
): AiOutcome | null {
  if (humanSide === null || winner === null) return null;
  if (winner === "draw") return "draw";
  return winner === humanSide ? "win" : "loss";
}

/**
 * Record a game only if it actually has a result for a human — see
 * {@link outcomeForHuman}. This is what the screens call from their
 * "victory curtain" effect; calling it on a non-terminal or hotseat game is
 * always a safe no-op, which is what makes "abandoned games are not
 * recorded" true even if a caller fires this eagerly.
 */
export function recordIfTerminal(
  store: string,
  input: {
    winner: string | "draw" | null;
    humanSide: string | null;
    rulesetId: string;
    difficulty: string;
    endedAt: number;
  },
): void {
  const result = outcomeForHuman(input.winner, input.humanSide);
  if (result === null) return;
  recordResult(store, {
    rulesetId: input.rulesetId,
    difficulty: input.difficulty,
    humanSide: input.humanSide as string,
    result,
    endedAt: input.endedAt,
  });
}

/** A win/loss/draw tally. */
export interface Tally {
  win: number;
  loss: number;
  draw: number;
}

const emptyTally = (): Tally => ({ win: 0, loss: 0, draw: 0 });

export interface AiResultsSummary {
  overall: Tally;
  /** Keyed by `difficulty`. */
  byDifficulty: Record<string, Tally>;
  /** Keyed by `humanSide`. */
  bySide: Record<string, Tally>;
}

/**
 * Tally the stored games, optionally narrowed to one ruleset and/or one
 * difficulty. With no filter, every game recorded for `store` counts.
 */
export function summary(
  store: string,
  filter: { rulesetId?: string; difficulty?: string } = {},
): AiResultsSummary {
  const entries = readEntries(store).filter(
    (e) =>
      (filter.rulesetId === undefined || e.rulesetId === filter.rulesetId) &&
      (filter.difficulty === undefined || e.difficulty === filter.difficulty),
  );
  const overall = emptyTally();
  const byDifficulty: Record<string, Tally> = {};
  const bySide: Record<string, Tally> = {};
  for (const e of entries) {
    overall[e.result]++;
    (byDifficulty[e.difficulty] ??= emptyTally())[e.result]++;
    (bySide[e.humanSide] ??= emptyTally())[e.result]++;
  }
  return { overall, byDifficulty, bySide };
}

/**
 * The compact setup-sheet line — "Easy 3-1-0, Medium 0-4-0" — built from a
 * summary rather than computed twice by each screen. `order` is the game's
 * own difficulty ladder (so the tiers read in ladder order, not insertion
 * order) and `labels` its translated names; a tier with no games recorded at
 * all is left out rather than padding the line with "Hard 0-0-0" for a level
 * nobody has played yet. `null` when nothing has been recorded, so the
 * caller can hide the whole line rather than show an empty sentence.
 */
export function formatTierLine(
  s: AiResultsSummary,
  order: readonly string[],
  labels: Record<string, string>,
): string | null {
  const parts = order
    .filter((d) => {
      const tally = s.byDifficulty[d];
      return tally !== undefined && tally.win + tally.loss + tally.draw > 0;
    })
    .map((d) => {
      const tally = s.byDifficulty[d];
      return `${labels[d] ?? d} ${tally.win}-${tally.loss}-${tally.draw}`;
    });
  return parts.length > 0 ? parts.join(", ") : null;
}
