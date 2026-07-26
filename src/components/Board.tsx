import { useMemo } from "react";
import { isCorner, isThrone, movesFrom, sideOf } from "../game/engine";
import { BOARD_SIZE, type Board as BoardT, type Move, type Piece, type Side, type Square } from "../game/types";
import type { RuleSet } from "../game/variants";

// ── Piece emblems (Celtic / Gaelic inspired) ─────────────────────────────────
function Emblem({ piece }: { piece: Piece }) {
  if (piece === "king")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        {/* Celtic crown with triskelion */}
        {/* Crown base and points */}
        <path d="M5 18h14v2H5zM5 16h14l1 2H4l1-2z" />
        <path d="M6 10q0-3 2-5t4-2q2 0 4 2t2 5l-1 6H7l-1-6z" />
        {/* Crown points with Celtic curves */}
        <path d="M8 6q1-3 4-4Q10 4 8 6zM16 6q-1-3-4-4Q14 4 16 6zM12 4q0-2.5 0-3Q12 3 12 4z" />
        {/* Triskelion triple spiral at centre */}
        <path d="M12 11.5q1.5 0 1.5 1.2t-1.5 1.3q-1.5 0-1.5-1.3T12 11.5z" />
        <path d="M12 12.7q.9-.5 1.6.2t0 1.6q-.8.5-1.6-.2T12 12.7z" />
        <path d="M12 12.7q-.9-.5-1.6.2t0 1.6q.8.5 1.6-.2T12 12.7z" />
        <path d="M12 12.7q.9.5 1.6-.2t0-1.6q-.8-.5-1.6.2T12 12.7z" />
      </svg>
    );
  if (piece === "attacker")
    return (
      // Brandubh — "the black raven": the raiders' emblem.
      // Raven glyph from game-icons.net (CC BY 3.0) — see NOTICE. Colour only is themed.
      <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden>
        <path d="M343.313 22.22c-57.33 0-61.26 36.153-91.125 54.874C154.782 42.52 133.115 221.496 169.844 330c-15.396 31.924-30.736 75.9-43.813 134.906c56.828 30.66 119.124 38.655 182.22 9.906c-6.2-37.715-14.18-68.858-21.97-95.375c25.025-12.63 59.594-14.573 86.5 14.407c.24-28.626-19.022-40.956-40.53-42.25l-22.03-47.313c42.606-45.056 74.38-100.18 57.905-157.06c-10.303-38.45 58.203-62.225 122.344-53.75c-24.523-21.164-55.99-30.482-85.845-33.876c-8.843-21.763-32.616-37.375-61.313-37.375zm10.968 21.936c9.808 0 17.783 7.944 17.783 17.75s-7.974 17.75-17.782 17.75s-17.75-7.943-17.75-17.75c0-9.806 7.945-17.75 17.75-17.75zm-58.092 274.25l16.28 34.938c-11.62 2.698-22.325 8.217-29.312 15.687c-3.298-10.84-6.498-20.903-9.47-30.28a500 500 0 0 0 22.502-20.344z" />
      </svg>
    );
  return (
    // Celtic shield knot (interlaced "#" woven within a ring) — the king's bodyguards.
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="9"
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden
    >
      <circle cx="50" cy="50" r="44" strokeWidth="8" />
      {/* two verticals + two horizontals, woven over/under at the four crossings */}
      <path d="M38,8 L38,56 M38,68 L38,92" />
      <path d="M62,8 L62,32 M62,44 L62,92" />
      <path d="M8,38 L32,38 M44,38 L92,38" />
      <path d="M8,62 L56,62 M68,62 L92,62" />
    </svg>
  );
}

interface BoardProps {
  board: BoardT;
  rules: RuleSet;
  turn: Side;
  selected: Square | null;
  lastMove: Move | null;
  /** Squares captured on the last move, still animating out. */
  fadingCaptures: Square[];
  interactive: boolean;
  /** The side the local human is allowed to move (null = both, hotseat). */
  controllable: Side | null;
  onSquareClick: (sq: Square) => void;
}

export default function Board({
  board,
  rules,
  turn,
  selected,
  lastMove,
  fadingCaptures,
  interactive,
  controllable,
  onSquareClick,
}: BoardProps) {
  const legal = useMemo<Square[]>(() => {
    if (!selected) return [];
    return movesFrom(board, selected.row, selected.col, rules);
  }, [selected, board, rules]);

  const legalSet = useMemo(() => new Set(legal.map((s) => s.row * 10 + s.col)), [legal]);
  const fadeSet = useMemo(
    () => new Set(fadingCaptures.map((s) => s.row * 10 + s.col)),
    [fadingCaptures],
  );

  const canPick = (sq: Square): boolean => {
    if (!interactive) return false;
    const s = sideOf(board[sq.row][sq.col]);
    return s === turn && (controllable === null || controllable === turn);
  };

  return (
    <div className="board" role="grid" aria-label="Brandubh board">
      {Array.from({ length: BOARD_SIZE }, (_, r) =>
        Array.from({ length: BOARD_SIZE }, (_, c) => {
          const piece = board[r][c];
          const key = r * 10 + c;
          const special = isThrone(r, c) || isCorner(r, c);
          const isSel = selected?.row === r && selected?.col === c;
          const isLegal = legalSet.has(key);
          const capHere = isLegal && piece !== null;
          const lastTo = lastMove && lastMove.to.row === r && lastMove.to.col === c;
          const lastFrom = lastMove && lastMove.from.row === r && lastMove.from.col === c;
          const dark = (r + c) % 2 === 1;
          const pickable = canPick({ row: r, col: c }) || isLegal;

          return (
            <div
              key={key}
              role="gridcell"
              className={[
                "cell",
                dark ? "dark" : "",
                special ? "special" : "",
                isCorner(r, c) ? "corner" : "",
                isSel ? "selected" : "",
                lastTo || lastFrom ? "lastmove" : "",
                pickable ? "playable" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => interactive && onSquareClick({ row: r, col: c })}
            >
              {piece && (
                <div className={`piece ${piece}`} title={piece}>
                  <Emblem piece={piece} />
                </div>
              )}
              {/* fading captured-piece flash */}
              {!piece && fadeSet.has(key) && <span className="dot capture" style={{ animation: "capture 320ms ease-in forwards" }} />}
              {isLegal && <span className={`dot ${capHere ? "capture" : ""}`} />}
            </div>
          );
        }),
      )}
    </div>
  );
}
