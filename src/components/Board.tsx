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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        {/* Crossed Celtic spears with leaf-shaped blade tips */}
        {/* Spear shafts */}
        <line x1="5" y1="19" x2="19" y2="5" strokeLinecap="round" />
        <line x1="19" y1="19" x2="5" y2="5" strokeLinecap="round" />
        {/* Leaf-shaped spearheads — top-right */}
        <path d="M17.5 3.5q1.5-.5 2.5.5t.5 2.5q-1.2-.3-2-1.1T17.5 3.5z" fill="currentColor" stroke="none" />
        {/* Leaf-shaped spearheads — top-left */}
        <path d="M6.5 3.5q-1.5-.5-2.5.5T3.5 6.5q1.2-.3 2-1.1T6.5 3.5z" fill="currentColor" stroke="none" />
        {/* Central binding knot — Celtic interlace ring */}
        <circle cx="12" cy="12" r="2.2" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="1" strokeWidth="1" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      {/* Round Celtic shield with boss and radial cross */}
      {/* Outer rim */}
      <circle cx="12" cy="12" r="9" strokeWidth="2" />
      {/* Inner ring — decorative band */}
      <circle cx="12" cy="12" r="6" strokeWidth="1.2" />
      {/* Central boss */}
      <circle cx="12" cy="12" r="2.2" strokeWidth="1.6" />
      {/* Radial cross lines */}
      <line x1="12" y1="3" x2="12" y2="6" strokeWidth="1.4" />
      <line x1="12" y1="18" x2="12" y2="21" strokeWidth="1.4" />
      <line x1="3" y1="12" x2="6" y2="12" strokeWidth="1.4" />
      <line x1="18" y1="12" x2="21" y2="12" strokeWidth="1.4" />
      {/* Curved quadrant arcs between rings for Celtic feel */}
      <path d="M9 6.5q3 1.5 6 0" strokeWidth="1" />
      <path d="M9 17.5q3-1.5 6 0" strokeWidth="1" />
      <path d="M6.5 9q1.5 3 0 6" strokeWidth="1" />
      <path d="M17.5 9q-1.5 3 0 6" strokeWidth="1" />
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
