// ── Game clock (Lichess-style chess clock) ───────────────────────────────────
//
// A **time control** is a starting bank of thinking time plus a Fischer
// increment added to the mover's clock after each move. Lichess writes these as
// "initial+increment" in minutes+seconds — e.g. "3+2" is a three-minute bank
// with a two-second increment, the Brandubh default. When a side's bank reaches
// zero it is *flagged* and loses on time.
//
// This module is pure: the time-control values, the presets, the "M:SS" / "S.d"
// formatting, and localStorage persistence. The live ticking lives in the
// `useGameClock` hook, and the two-sided book-keeping is wired up in App.

/** A starting bank plus a per-move increment, both in whole seconds. */
export interface TimeControl {
  /** Starting thinking-time bank for each side, in seconds. */
  initialSeconds: number;
  /** Fischer increment added to the mover after each move, in seconds. */
  incrementSeconds: number;
}

export type TimeCategory = "bullet" | "blitz" | "rapid";

export interface TimePreset extends TimeControl {
  /** Stable id, also the Lichess-style label, e.g. "3+2". */
  id: string;
  category: TimeCategory;
}

const mk = (
  minutes: number,
  incrementSeconds: number,
  category: TimeCategory,
): TimePreset => ({
  id: `${minutes}+${incrementSeconds}`,
  category,
  initialSeconds: Math.round(minutes * 60),
  incrementSeconds,
});

/** The preset ladder, mirroring Lichess's common bullet → rapid controls. */
export const TIME_PRESETS: TimePreset[] = [
  mk(1, 0, "bullet"),
  mk(2, 1, "bullet"),
  mk(3, 0, "blitz"),
  mk(3, 2, "blitz"),
  mk(5, 0, "blitz"),
  mk(5, 3, "blitz"),
  mk(10, 0, "rapid"),
  mk(10, 5, "rapid"),
  mk(15, 10, "rapid"),
];

/** Brandubh's out-of-the-box control: 3 minutes + 2 seconds ("3+2"). */
export const DEFAULT_TIME_CONTROL_ID = "3+2";

/** Sentinel id for a user-defined bank/increment. */
export const CUSTOM_TIME_CONTROL_ID = "custom";

/** Bounds for the custom-control editor. */
export const CUSTOM_MIN_MINUTES = 0.25; // 15 seconds
export const CUSTOM_MAX_MINUTES = 60;
export const CUSTOM_MAX_INCREMENT = 60;

export const DEFAULT_CUSTOM_MINUTES = 5;
export const DEFAULT_CUSTOM_INCREMENT = 3;

export function presetById(id: string): TimePreset | undefined {
  return TIME_PRESETS.find((p) => p.id === id);
}

/** A short "3+2" description of any time control. */
export function describeTimeControl(tc: TimeControl): string {
  const minutes = tc.initialSeconds % 60 === 0
    ? String(tc.initialSeconds / 60)
    : (tc.initialSeconds / 60).toFixed(2).replace(/\.?0+$/, "");
  return `${minutes}+${tc.incrementSeconds}`;
}

/**
 * Format a remaining time (milliseconds) for display. Above ten seconds it is
 * "M:SS" (or "H:MM:SS" past an hour); in the final ten seconds it counts down
 * in tenths as "S.d", exactly like Lichess's low-time readout.
 */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) {
    const tenths = Math.floor(clamped / 100);
    return `${Math.floor(tenths / 10)}.${tenths % 10}`;
  }
  const totalSeconds = Math.ceil(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** True while a side is in its final ten seconds (urgent low-time styling). */
export const isLowTime = (ms: number): boolean => ms > 0 && ms < 10_000;

// ── Persistence ──────────────────────────────────────────────────────────────

export const CLOCK_ENABLED_KEY = "brandubh.clock.enabled";
export const CLOCK_CONTROL_KEY = "brandubh.clock.control";
export const CLOCK_CUSTOM_MINUTES_KEY = "brandubh.clock.customMinutes";
export const CLOCK_CUSTOM_INCREMENT_KEY = "brandubh.clock.customIncrement";

const clampNumber = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

/**
 * Whether a clock is used at all. Defaults to **off** — no timer — so a game is
 * untimed unless the player opts in. When switched on, the control defaults to
 * 3+2 (see {@link DEFAULT_TIME_CONTROL_ID}).
 */
export function loadClockEnabled(): boolean {
  try {
    const stored = localStorage.getItem(CLOCK_ENABLED_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    /* localStorage unavailable */
  }
  return false;
}

/** The chosen preset id, or the custom sentinel. Defaults to "3+2". */
export function loadControlId(): string {
  try {
    const stored = localStorage.getItem(CLOCK_CONTROL_KEY);
    if (stored === CUSTOM_TIME_CONTROL_ID || (stored && presetById(stored))) {
      return stored;
    }
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_TIME_CONTROL_ID;
}

export function loadCustomMinutes(): number {
  try {
    const raw = Number(localStorage.getItem(CLOCK_CUSTOM_MINUTES_KEY));
    if (Number.isFinite(raw) && raw > 0) {
      return clampNumber(raw, CUSTOM_MIN_MINUTES, CUSTOM_MAX_MINUTES);
    }
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_CUSTOM_MINUTES;
}

export function loadCustomIncrement(): number {
  try {
    const raw = Number(localStorage.getItem(CLOCK_CUSTOM_INCREMENT_KEY));
    if (Number.isFinite(raw) && raw >= 0) {
      return clampNumber(raw, 0, CUSTOM_MAX_INCREMENT);
    }
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_CUSTOM_INCREMENT;
}

/**
 * The four values the time-control picker edits, as one bundle.
 *
 * The settings panel holds them as separate pieces of App state, because there
 * each edit applies on the spot. The **setup overlay** needs them together: a
 * control chosen there is picked *before* the game it belongs to exists, so the
 * choice has to travel with the game choice (see `commitModeChoice` in App)
 * rather than being applied as it is made — backing out of the "discard the
 * game in progress?" gate must not have quietly re-armed the clock, exactly as
 * it must not have quietly changed the AI strength.
 *
 * Resolve one with {@link resolveTimeControl}.
 */
export interface ClockSelection {
  enabled: boolean;
  controlId: string;
  customMinutes: number;
  customIncrement: number;
}

/**
 * Resolve the current UI selection into a concrete {@link TimeControl}, or null
 * when the clock is switched off.
 */
export function resolveTimeControl(
  enabled: boolean,
  controlId: string,
  customMinutes: number,
  customIncrement: number,
): TimeControl | null {
  if (!enabled) return null;
  if (controlId === CUSTOM_TIME_CONTROL_ID) {
    return {
      initialSeconds: Math.round(
        clampNumber(customMinutes, CUSTOM_MIN_MINUTES, CUSTOM_MAX_MINUTES) * 60,
      ),
      incrementSeconds: Math.round(clampNumber(customIncrement, 0, CUSTOM_MAX_INCREMENT)),
    };
  }
  const preset = presetById(controlId);
  return preset
    ? { initialSeconds: preset.initialSeconds, incrementSeconds: preset.incrementSeconds }
    : null;
}
