import { markGlyph, type Mark } from "../game/annotate";
import type { Translations } from "../i18n";

/**
 * The collapsible move log — one grid cell per ply, colour-coded by the side
 * that moved, clickable to jump the timeline there.
 *
 * Shared by all four boards, which is why the move's *name* arrives as a
 * function: the three tafl boards agree on every type here (`game/tablut/types`
 * and `game/copenhagen/types` re-export them) but not on coordinates — Tablut's
 * files run a–i, Copenhagen's a–k. Marks are the one Brandubh-only extra (the
 * annotation pass lives in the shell); a surface with no review pass omits them.
 *
 * The ply list is **structural and generic** rather than a `GameState`, because
 * the fourth board's state is not one: Morris has no king, no captures and no
 * `moveCount`, and its move is a point plus an optional removal (ADR-0008). All
 * this component ever needed was "a list of plies, each with a move I can name and
 * a side that made it", so that is what it asks for — the three tafl screens pass
 * their `GameState` unchanged (extra fields are simply unread), and Morris maps
 * its colours onto the two seat names the styling is keyed by. Widening the type
 * was the whole of making this reusable; nothing about the rendering changed.
 */
export default function MoveLog<M>({
  t,
  game,
  activeIndex,
  marks,
  moveName,
  onMoveClick,
}: {
  t: Translations;
  /** Anything with a ply list: `{ history: [{ move, sideThatMoved }] }`. */
  game: { history: readonly { move: M; sideThatMoved: string }[] };
  activeIndex: number;
  /** Per-ply annotations, index-aligned with `game.history` (Session 7d). */
  marks?: (Mark | null)[] | null;
  /** Names a move in this board's coordinates. */
  moveName: (m: M) => string;
  onMoveClick: (i: number) => void;
}) {
  if (game.history.length === 0) return null;
  return (
    <details className="card mt-4 p-4" open>
      <summary className="cursor-pointer text-sm font-semibold text-parchment-dim">
        {t.moveLog} ({game.history.length})
      </summary>
      <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-parchment-dim sm:grid-cols-3">
        {game.history.map((h, i) => (
          <li
            key={i}
            className={`cursor-pointer rounded px-1 hover:bg-parchment/10 ${
              i === activeIndex ? "bg-parchment/15 ring-1 ring-gold/60" : ""
            }`}
            onClick={() => onMoveClick(i)}
          >
            <span className="text-parchment/50">{i + 1}.</span>{" "}
            <span className={h.sideThatMoved === "attackers" ? "text-blood/90" : "text-gold/90"}>
              {moveName(h.move)}
            </span>
            {marks?.[i] && (
              // The glyph carries the meaning for anyone reading it; the colour
              // is a second channel, never the only one.
              <span className={`mark mark-${marks[i]}`} title={t[`mark_${marks[i] as Mark}`]}>
                {markGlyph(marks[i] as Mark)}
                <span className="sr-only"> {t[`mark_${marks[i] as Mark}`]}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
