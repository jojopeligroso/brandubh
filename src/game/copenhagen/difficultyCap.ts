// ── The Copenhagen AI-level cap (owner decision, 2026-09-09) ─────────────────
//
// Playtesting on the 11×11 board found `hard` and `ollamh` too slow to be
// playable in the browser: the search cost per node is far higher than on the
// smaller boards, and the branching factor at the opening is 116, against
// Brandubh's ~40 and Tablut's ~80 (see the ladder's own comment in
// `engine.ts`). Until the site has a backend to run the search on, `medium` is
// the strongest AI level offered here — Tablut is unaffected and keeps all
// four.
//
// This is a **UI and persistence** rule, not an engine one: `DIFFICULTIES` and
// `DIFFICULTY` in `engine.ts` stay exactly as they are, because `scripts/`
// and the engine's own tests drive the full ladder. Everything that decides
// what a *player* may pick, or what a *save* may resume at, reads the cap from
// here instead of hard-coding "medium" a second time.
//
// Re-enable after Phase 3.4 (Zobrist hashing / make-unmake) and a measured
// deadline-depth check — see TASKS.md's Tablut/Copenhagen parity section.

import { DIFFICULTIES, type Difficulty } from "./engine";

/** The strongest AI level offered on this board until it has a server. */
export const COPENHAGEN_MAX_DIFFICULTY: Difficulty = "medium";

const MAX_INDEX = DIFFICULTIES.indexOf(COPENHAGEN_MAX_DIFFICULTY);

/** Whether a level is still choosable — the ladder position, not the name, so
 *  raising or lowering the cap only ever means moving `COPENHAGEN_MAX_DIFFICULTY`. */
export function isDifficultyOffered(d: Difficulty): boolean {
  return DIFFICULTIES.indexOf(d) <= MAX_INDEX;
}

/** The offered levels, in ladder order — what the setup sheet should render as
 *  choosable (the rest render disabled rather than being hidden). */
export function offeredDifficulties(): readonly Difficulty[] {
  return DIFFICULTIES.filter(isDifficultyOffered);
}

/** A level actually played at, clamped to what is currently offered. Used at
 *  load time — a save or import carrying `hard`/`ollamh` resumes at the cap. */
export function clampDifficulty(d: Difficulty): Difficulty {
  return isDifficultyOffered(d) ? d : COPENHAGEN_MAX_DIFFICULTY;
}
