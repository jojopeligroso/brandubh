import { markGlyph, type Mark } from "../game/annotate";
import type { GameState, Move } from "../game/types";
import type { Translations } from "../i18n";

/**
 * The collapsible move log — one grid cell per ply, colour-coded by the side
 * that moved, clickable to jump the timeline there.
 *
 * Shared between the Brandubh shell and the Tablut surface, which is why the
 * move's *name* arrives as a function: the two boards agree on every type here
 * (`game/tablut/types` re-exports them) but not on coordinates — Tablut's files
 * run a–i. Marks are the one Brandubh-only extra (the annotation pass lives in
 * the shell); a surface with no review pass simply omits them.
 */
export default function MoveLog({
  t,
  game,
  activeIndex,
  marks,
  moveName,
  onMoveClick,
}: {
  t: Translations;
  game: GameState;
  activeIndex: number;
  /** Per-ply annotations, index-aligned with `game.history` (Session 7d). */
  marks?: (Mark | null)[] | null;
  /** Names a move in this board's coordinates. */
  moveName: (m: Move) => string;
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
