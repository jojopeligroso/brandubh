import { formatClock, isLowTime } from "../game/clock";
import type { Side } from "../game/types";

/**
 * A single side's clock face — the raiders' or the king's bank. Highlights while
 * that side is on the move, turns urgent red in the final ten seconds, and dims
 * to a flag once the bank is spent.
 */
export default function GameClock({
  name,
  side,
  ms,
  active,
  running,
  flagged,
  increment,
  flagLabel,
}: {
  name: string;
  side: Side;
  ms: number;
  /** This side is the one to move. */
  active: boolean;
  /** The clock as a whole is ticking right now. */
  running: boolean;
  /** This side ran out of time. */
  flagged: boolean;
  /** Fischer increment, seconds — shown as a "+2" badge. */
  increment: number;
  flagLabel: string;
}) {
  const low = isLowTime(ms) && !flagged;
  const classes = [
    "clock",
    `clock-${side}`,
    active ? "clock-active" : "clock-idle",
    running && active ? "clock-ticking" : "",
    low ? "clock-low" : "",
    flagged ? "clock-flag" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} aria-label={`${name} — ${formatClock(ms)}`} aria-live="off">
      <span className="clock-name">
        {name}
        {increment > 0 && <span className="clock-inc">+{increment}</span>}
      </span>
      <span className="clock-time font-mono">
        {flagged ? flagLabel : formatClock(ms)}
      </span>
    </div>
  );
}
