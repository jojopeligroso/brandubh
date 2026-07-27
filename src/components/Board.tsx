import { useMemo } from "react";
import { isCorner, isThrone, movesFrom, sideOf } from "../game/engine";
import { BOARD_SIZE, type Board as BoardT, type Move, type Piece, type Side, type Square } from "../game/types";
import type { RuleSet } from "../game/variants";
import { SHIELD_KNOT_PATH, SHIELD_KNOT_VIEWBOX } from "../shieldKnot";
import type { EmblemDef } from "../emblems";
import type { CornerEmblemDef } from "../cornerEmblems";

// ── Piece emblems (Celtic / Gaelic inspired) ─────────────────────────────────
function Emblem({ piece, attackerEmblem }: { piece: Piece; attackerEmblem: EmblemDef }) {
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
      // The raiders' emblem — an exact vector trace of the chosen artwork
      // (see src/emblems.ts); only the colour is themed.
      <svg viewBox={attackerEmblem.viewBox} fill="currentColor" aria-hidden>
        <path d={attackerEmblem.path} />
      </svg>
    );
  return (
    // Celtic shield knot — the king's bodyguards. Exact vector trace of the
    // supplied artwork (see src/shieldKnot.ts); only the colour is themed.
    <svg viewBox={SHIELD_KNOT_VIEWBOX} fill="currentColor" aria-hidden>
      <path d={SHIELD_KNOT_PATH} />
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
  /** Chosen emblem for the attacker (raider) pieces. */
  attackerEmblem: EmblemDef;
  /** Chosen emblem for the four corner squares. */
  cornerEmblem: CornerEmblemDef;
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
  attackerEmblem,
  cornerEmblem,
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
              {isCorner(r, c) && !piece && (
                <span className="corner-emblem" aria-hidden>
                  <svg viewBox={cornerEmblem.viewBox} fill="currentColor">
                    <path d={cornerEmblem.path} />
                  </svg>
                </span>
              )}
              {piece && (
                <div className={`piece ${piece}`} title={piece}>
                  <Emblem piece={piece} attackerEmblem={attackerEmblem} />
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
