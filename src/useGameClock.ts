import { useCallback, useEffect, useRef, useState } from "react";
import type { Side } from "./game/types";
import type { TimeControl } from "./game/clock";

const other = (s: Side): Side => (s === "attackers" ? "defenders" : "attackers");

export interface GameClock {
  /** Milliseconds left on each side's bank. */
  remaining: Record<Side, number>;
  /** The side whose bank is currently counting down (or would, once running). */
  active: Side | null;
  /** True once the first move has engaged the clock. */
  started: boolean;
  /** Manually held (hotseat pause). */
  paused: boolean;
  /** The side that ran out of time, if any. */
  flagged: Side | null;
  /** True while a bank is actively ticking down this instant. */
  running: boolean;
  /** Whether a clock is configured at all. */
  enabled: boolean;
  /** Record a completed move: bank the mover's increment, hand over the clock. */
  press: (mover: Side) => void;
  /** Re-arm both banks to the starting time (new game / new control). */
  reset: () => void;
  /** Toggle the manual hold. */
  togglePause: () => void;
  /** Hand the running clock to a specific side without any increment (takeback
   *  / branch), so the bank that ticks matches the side now to move. */
  handTo: (side: Side) => void;
  /** Re-arm both banks from a saved game (see game/persist.ts). */
  restore: (snapshot: ClockSnapshot) => void;
}

/** The parts of the clock worth persisting across a reload. */
export interface ClockSnapshot {
  remaining: Record<Side, number>;
  active: Side | null;
  started: boolean;
  flagged: Side | null;
}

/**
 * A two-sided chess clock. The active side's bank ticks down in real time; on a
 * completed move the mover receives the Fischer increment and the clock passes
 * to the opponent. The clock stays idle until the first move (so it never drains
 * while a game is being set up), pauses whenever the game is not live at the tip
 * (game over, or reviewing history), and flags — calling `onFlag` — the moment a
 * bank hits zero.
 *
 * `config` is the current time control (null switches the clock off). `liveGate`
 * should be true only while play is live at the latest position.
 */
export function useGameClock(
  config: TimeControl | null,
  liveGate: boolean,
  onFlag: (loser: Side) => void,
): GameClock {
  const initialMs = (config?.initialSeconds ?? 0) * 1000;

  const [remaining, setRemaining] = useState<Record<Side, number>>({
    attackers: initialMs,
    defenders: initialMs,
  });
  const [active, setActive] = useState<Side | null>("attackers");
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [flagged, setFlagged] = useState<Side | null>(null);

  // Refs mirror the ticking state so the interval reads fresh values without
  // resubscribing on every 100ms update.
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;
  const lastRef = useRef(0);
  const onFlagRef = useRef(onFlag);
  onFlagRef.current = onFlag;
  const configRef = useRef(config);
  configRef.current = config;

  const reset = useCallback(() => {
    const ms = (configRef.current?.initialSeconds ?? 0) * 1000;
    const fresh: Record<Side, number> = { attackers: ms, defenders: ms };
    remainingRef.current = fresh;
    setRemaining(fresh);
    setActive("attackers"); // attackers move first
    setStarted(false);
    setPaused(false);
    setFlagged(null);
  }, []);

  // Re-arm whenever the time control changes (a new bank/increment, or the
  // clock being switched on or off).
  useEffect(() => {
    reset();
  }, [config?.initialSeconds, config?.incrementSeconds, config === null, reset]);

  const press = useCallback((mover: Side) => {
    const cfg = configRef.current;
    if (!cfg) return;
    const cur = remainingRef.current;
    const updated: Record<Side, number> = {
      ...cur,
      [mover]: cur[mover] + cfg.incrementSeconds * 1000,
    };
    remainingRef.current = updated;
    setRemaining(updated);
    setActive(other(mover));
    setStarted(true);
    setPaused(false);
    lastRef.current = performance.now();
  }, []);

  const togglePause = useCallback(() => setPaused((p) => !p), []);

  const handTo = useCallback((side: Side) => {
    setActive(side);
    lastRef.current = performance.now();
  }, []);

  // Resuming a saved game puts the banks back exactly where they were left.
  // The clock is frozen while the tab is away — there is no server to arbitrate
  // time spent off the page — so no elapsed time is charged here.
  const restore = useCallback((snapshot: ClockSnapshot) => {
    remainingRef.current = snapshot.remaining;
    setRemaining(snapshot.remaining);
    setActive(snapshot.active);
    setStarted(snapshot.started);
    setPaused(false);
    setFlagged(snapshot.flagged);
    lastRef.current = performance.now();
  }, []);

  const running =
    config !== null && started && !paused && liveGate && flagged === null && active !== null;

  useEffect(() => {
    if (!running || active === null) return;
    lastRef.current = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - lastRef.current;
      lastRef.current = now;
      const next = Math.max(0, remainingRef.current[active] - dt);
      const updated: Record<Side, number> = { ...remainingRef.current, [active]: next };
      remainingRef.current = updated;
      setRemaining(updated);
      if (next <= 0) {
        setFlagged(active);
        onFlagRef.current(active);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [running, active]);

  return {
    remaining,
    active,
    started,
    paused,
    flagged,
    running,
    enabled: config !== null,
    press,
    reset,
    togglePause,
    handTo,
    restore,
  };
}
