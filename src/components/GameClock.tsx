import { formatClock, isLowTime } from "../game/clock";
import type { Side } from "../game/types";

/**
 * A side's plate above/below the board: its name, and — when a clock is in
 * play — its remaining bank. The plate of the side to move is highlighted, so
 * it doubles as the turn indicator (there is no separate status bar). It turns
 * urgent red in the final ten seconds and dims to a flag once the bank is spent.
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
  thinking,
}: {
  name: string;
  side: Side;
  /** Remaining bank in ms, or null when the game is untimed (no clock shown). */
  ms: number | null;
  /** This side is the one to move. */
  active: boolean;
  /** The clock as a whole is ticking right now. */
  running: boolean;
  /** This side ran out of time. */
  flagged: boolean;
  /** Fischer increment, seconds — shown as a "+2" badge. */
  increment: number;
  flagLabel: string;
  /** The computer holds this side and is choosing its move. */
  thinking?: boolean;
}) {
  const timed = ms !== null;
  const low = timed && isLowTime(ms) && !flagged;
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
    <div
      className={classes}
      aria-label={timed ? `${name} — ${formatClock(ms)}` : name}
      aria-live="off"
    >
      <span className="clock-name">
        {name}
        {timed && increment > 0 && <span className="clock-inc">+{increment}</span>}
        {thinking && (
          <span className="clock-thinking" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        )}
      </span>
      {timed && (
        <span className="clock-time font-mono">
          {flagged ? flagLabel : formatClock(ms)}
        </span>
      )}
    </div>
  );
}
