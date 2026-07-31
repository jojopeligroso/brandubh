import { evalBarFill } from "../evalBar";
import { markGlyph, type Mark } from "../game/annotate";
import type { Side } from "../game/types";
import type { Translations } from "../i18n";

/**
 * The shape of the whole game, in one strip.
 *
 * Built from the per-ply scores the annotation pass already computes — it used
 * to throw them away and keep only the marks, which is a shame, because the
 * scores are the more useful half: marks tell you *that* a move was bad, the
 * curve tells you when the game was actually decided, and those are often
 * different moments.
 *
 * ## Orientation
 *
 * Up is good for the player at the bottom of the screen, exactly as the eval
 * bar fills upward for them — it reads through `evalBarFill`, so the strip and
 * the bar can never disagree, and a north–south flip turns both over together.
 *
 * ## Why an area chart and not a line
 *
 * The thing being read is *who is ahead*, which is a question about which side
 * of the middle the curve is on. Filling to the midline makes that preattentive:
 * you see the balance of the game without reading the axis. A bare line asks you
 * to find the midline yourself, every time.
 *
 * Mobile first: the whole strip is a tap target, sized so a thumb can hit any
 * ply, and the current position is marked so you can see where you are without
 * counting.
 */
export default function EvalGraph({
  t,
  scores,
  marks,
  bottomSide,
  cursor,
  onJump,
}: {
  t: Translations;
  /** Attacker-positive score per ply; index 0 is the starting position. */
  scores: number[];
  /** Per-move judgements, index `i` describing the move that produced ply `i+1`. */
  marks: (Mark | null)[] | null;
  bottomSide: Side;
  /** The ply currently on the board. */
  cursor: number;
  onJump: (ply: number) => void;
}) {
  const n = scores.length - 1; // number of moves
  if (n < 1) return null;

  const W = 100;
  const H = 34;
  const x = (ply: number) => (n === 0 ? 0 : (ply / n) * W);
  // `evalBarFill` is 0 at the far player's end and 1 at the near player's, and
  // SVG y grows downward — so the near player being ahead is a *smaller* y.
  const y = (score: number) => (1 - evalBarFill(score, bottomSide)) * H;

  const pts = scores.map((s, i) => `${x(i).toFixed(2)},${y(s).toFixed(2)}`).join(" ");
  const area = `0,${(H / 2).toFixed(2)} ${pts} ${W},${(H / 2).toFixed(2)}`;

  // Only the moves worth interrupting the curve for. Inaccuracies are marks but
  // not events; plotting all three bands turns the strip into a rash.
  const flagged = (marks ?? [])
    .map((m, i) => ({ m, ply: i + 1 }))
    .filter((f): f is { m: Mark; ply: number } => f.m === "blunder" || f.m === "mistake");

  return (
    <div className={`evalgraph${bottomSide === "attackers" ? " near-attackers" : ""}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="evalgraph-svg"
        role="img"
        aria-label={t.evalGraphLabel}
      >
        {/* Level — the line the whole strip is read against. */}
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="evalgraph-mid" />
        <polygon points={area} className="evalgraph-area" />
        <polyline points={pts} className="evalgraph-line" fill="none" />
        {flagged.map((f) => (
          <circle
            key={f.ply}
            cx={x(f.ply)}
            cy={y(scores[f.ply])}
            r={2.2}
            className={`evalgraph-mark is-${f.m}`}
          />
        ))}
        <line
          x1={x(cursor)}
          y1="0"
          x2={x(cursor)}
          y2={H}
          className="evalgraph-cursor"
        />
      </svg>
      {/* One button per ply, laid over the strip: a real tap target and a real
          keyboard stop, rather than a click handler doing arithmetic on a
          pointer position. */}
      <div className="evalgraph-hits">
        {scores.map((_, ply) => (
          <button
            key={ply}
            className={`evalgraph-hit${ply === cursor ? " is-current" : ""}`}
            onClick={() => onJump(ply)}
            aria-label={
              ply === 0
                ? t.evalGraphStart
                : `${t.moveWord} ${ply}${
                    marks?.[ply - 1] ? ` ${markGlyph(marks[ply - 1] as Mark)}` : ""
                  }`
            }
            aria-current={ply === cursor ? "true" : undefined}
          />
        ))}
      </div>
    </div>
  );
}
