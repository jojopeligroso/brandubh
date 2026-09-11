// ── Why a Morris game ended, in words ─────────────────────────────────────────
//
// The Morris counterpart of `src/gameOverText.ts`, and a separate file for the
// reason ADR-0008 gives: `MorrisStatus` has **no member in common** with the tafl
// `GameStatus`. A king does not escape here, nothing is encircled, and the two
// endings this game does have — a side reduced below three stones, and a side with
// no move to make — do not exist over there. So the mapping forks with the status
// type rather than growing a fourth set of cases in the shared function.
//
// It is a lookup rather than a `switch`, which is the other difference: the tafl
// version has one `t.*` key per status and `tsc` checks the lot, while
// `t.morrisStatuses` is a `Record<string, string>` keyed by the status itself.
// That buys a new status its sentence for free and costs the compile-time check,
// so `i18n.test.ts` asserts the coverage instead — every non-playing
// `MorrisStatus` has copy, in every locale.

import type { MorrisStatus } from "./types";
import type { Translations } from "../../i18n";

/**
 * The sentence for a finished game, or the empty string while it is still being
 * played — which is what the callers test for before showing a result line, so
 * "playing" must not produce words.
 */
export function morrisGameOverText(status: MorrisStatus, t: Translations): string {
  return t.morrisStatuses[status] ?? "";
}
