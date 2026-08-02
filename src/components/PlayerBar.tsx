import { formatClock, isLowTime } from "../game/clock";
import type { Side } from "../game/types";

/**
 * Lichess-style player bar: seated above or below the board, it names the
 * player on that side (with a colour dot for the side they hold), tallies the
 * pieces they have taken, and — when a clock is running — carries their boxed
 * time on the right. The bar as a whole brightens while its side is on the
 * move, and the clock box turns urgent red in the final seconds.
 */
export default function PlayerBar({
  name,
  sub,
  side,
  captures,
  clockEnabled,
  ms,
  active,
  running,
  flagged,
  increment,
  flagLabel,
  thinking,
  moveCount,
}: {
  /** Who is sitting here — a player's name, or the AI tier. */
  name: string;
  /** The side they hold this game, already translated. */
  sub: string;
  side: Side;
  /** Enemy pieces this side has taken so far. */
  captures: number;
  clockEnabled: boolean;
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
  /** This side's AI is currently searching. */
  thinking?: boolean;
  /** Total game moves so far — shown on the bottom bar only. */
  moveCount?: number;
}) {
  const low = clockEnabled && isLowTime(ms) && !flagged;
  const classes = [
    "playerbar",
    `playerbar-${side}`,
    active ? "playerbar-active" : "",
    low ? "playerbar-low" : "",
    flagged ? "playerbar-flag" : "",
    running && active ? "playerbar-ticking" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      aria-label={clockEnabled ? `${name} — ${formatClock(ms)}` : name}
      aria-live="off"
    >
      <span className={`playerbar-dot playerbar-dot-${side}`} aria-hidden />
      <span className="playerbar-id">
        <span className="playerbar-name">
          {name}
          {thinking && <span className="playerbar-thinking" aria-label="thinking">...</span>}
        </span>
        <span className="playerbar-sub">
          {sub}
          {captures > 0 && <span className="playerbar-caps">{"\u00d7"}{captures}</span>}
          {moveCount != null && moveCount > 0 && (
            <span className="playerbar-movecount">{moveCount}</span>
          )}
        </span>
      </span>
      {clockEnabled && (
        <span className="playerbar-clock font-mono">
          {flagged ? flagLabel : formatClock(ms)}
          {increment > 0 && <span className="playerbar-inc">+{increment}</span>}
        </span>
      )}
    </div>
  );
}
