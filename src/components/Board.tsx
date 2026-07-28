import { useMemo } from "react";
import { isCorner, isThrone, movesFrom, sideOf } from "../game/engine";
import { BOARD_SIZE, type Board as BoardT, type Move, type Piece, type Side, type Square } from "../game/types";
import type { RuleSet } from "../game/variants";
import type { EmblemDef } from "../emblems";
import { emblemCenter } from "../emblems";
import type { CornerEmblemDef } from "../cornerEmblems";
import type { KingEmblemDef } from "../kingEmblems";
import type { DefenderEmblemDef } from "../defenderEmblems";

// ── Piece emblems (Celtic / Gaelic inspired) ─────────────────────────────────
function Emblem({
  piece,
  attackerEmblem,
  kingEmblem,
  defenderEmblem,
}: {
  piece: Piece;
  attackerEmblem: EmblemDef;
  kingEmblem: KingEmblemDef;
  defenderEmblem: DefenderEmblemDef;
}) {
  if (piece === "king")
    return (
      // The king's emblem — a vector trace of the chosen artwork
      // (see src/kingEmblems.ts); only the colour is themed.
      <svg
        viewBox={kingEmblem.viewBox}
        fill="currentColor"
        fillRule="evenodd"
        style={kingEmblem.scale ? { transform: `scale(${kingEmblem.scale})` } : undefined}
        aria-hidden
      >
        <path d={kingEmblem.path} />
      </svg>
    );
  if (piece === "attacker")
    return (
      // The raiders' emblem — an exact vector trace of the chosen artwork
      // (see src/emblems.ts); only the colour is themed.
      <svg
        viewBox={attackerEmblem.viewBox}
        fill="currentColor"
        fillRule={attackerEmblem.fillRule ?? "evenodd"}
        style={attackerEmblem.scale ? { transform: `scale(${attackerEmblem.scale})` } : undefined}
        aria-hidden
      >
        <path d={attackerEmblem.path} />
      </svg>
    );
  return (
    // The defenders' emblem — a vector trace of the chosen artwork
    // (see src/defenderEmblems.ts); only the colour is themed.
    <svg
      viewBox={defenderEmblem.viewBox}
      fill="currentColor"
      fillRule="evenodd"
      style={defenderEmblem.scale ? { transform: `scale(${defenderEmblem.scale})` } : undefined}
      aria-hidden
    >
      <path d={defenderEmblem.path} />
      {defenderEmblem.outerRing &&
        (() => {
          const { cx, cy } = emblemCenter(defenderEmblem.viewBox);
          return (
            <circle
              cx={cx}
              cy={cy}
              r={defenderEmblem.outerRing.r}
              fill="none"
              stroke="currentColor"
              strokeWidth={defenderEmblem.outerRing.width}
            />
          );
        })()}
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
  /** Chosen emblem for the king piece. */
  kingEmblem: KingEmblemDef;
  /** Chosen emblem for the defender (king's guard) pieces. */
  defenderEmblem: DefenderEmblemDef;
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
  kingEmblem,
  defenderEmblem,
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

  // Chessboard-style coordinates: files a–g across, ranks 1–7 up the side.
  const FILES = "abcdefg";

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
          const fileLabel = r === BOARD_SIZE - 1 ? FILES[c] : null;
          const rankLabel = c === 0 ? String(BOARD_SIZE - r) : null;

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
              {rankLabel && (
                <span className="coord coord-rank" aria-hidden>
                  {rankLabel}
                </span>
              )}
              {fileLabel && (
                <span className="coord coord-file" aria-hidden>
                  {fileLabel}
                </span>
              )}
              {isCorner(r, c) && !piece && (
                <span className="corner-emblem" aria-hidden>
                  <svg viewBox={cornerEmblem.viewBox} fill="currentColor" fillRule="evenodd">
                    <path d={cornerEmblem.path} />
                  </svg>
                </span>
              )}
              {piece && (
                <div
                  className={`piece ${piece}${sideOf(piece) === turn ? " active-turn" : ""}`}
                  title={piece}
                >
                  <Emblem
                    piece={piece}
                    attackerEmblem={attackerEmblem}
                    kingEmblem={kingEmblem}
                    defenderEmblem={defenderEmblem}
                  />
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
