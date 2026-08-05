import { useMemo } from "react";
import { isCorner, isThrone, movesFrom, sideOf } from "../game/engine";
import { BOARD_SIZE, type Board as BoardT, type Move, type Piece, type Side, type Square } from "../game/types";
import {
  fileLabel,
  fromView,
  isLabelledFileRow,
  isLabelledRankCol,
  rankLabel,
  squareName,
  viewArrow,
} from "../orientation";
import type { RuleSet } from "../game/variants";
import { markGlyph, type Mark } from "../game/annotate";
import type { EmblemDef } from "../emblems";
import { emblemCenter } from "../emblems";
import type { CornerEmblemDef } from "../cornerEmblems";
import type { KingEmblemDef } from "../kingEmblems";
import type { DefenderEmblemDef } from "../defenderEmblems";

// ── Piece emblems (Celtic / Gaelic inspired) ─────────────────────────────────
export function Emblem({
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
  /**
   * Mirror the board east–west (left/right) and/or north–south (top/bottom)
   * (view only — see src/orientation.ts). The squares keep their names:
   * flipping changes which drawn edge carries the coordinate labels, never
   * what a square is called.
   */
  flippedH?: boolean;
  flippedV?: boolean;
  /** Chosen emblem for the attacker (raider) pieces. */
  attackerEmblem: EmblemDef;
  /** Chosen emblem for the king piece. */
  kingEmblem: KingEmblemDef;
  /** Chosen emblem for the defender (king's guard) pieces. */
  defenderEmblem: DefenderEmblemDef;
  /** Chosen emblem for the four corner squares. */
  cornerEmblem: CornerEmblemDef;
  /**
   * The engine's suggested move at the position on screen, drawn as an arrow
   * over the grid (Session 7a). Decoration only — it is never playable, and the
   * overlay is `aria-hidden` and click-through, so the board's grid semantics
   * are exactly what they were without it.
   */
  bestMove?: Move | null;
  /**
   * Further moves the engine rates **exactly equal** to `bestMove`, drawn as
   * fainter arrows beside it. Empty when the best move is genuinely best —
   * which is the point: a second arrow means "these are the same", and drawing
   * one when they are not would teach a learner a distinction that isn't there.
   */
  alsoBest?: Move[];
  /**
   * The review's judgement on the move that produced the position on screen,
   * pinned to the square it landed on — lichess's on-board ?!/?/?? glyph. The
   * glyph names the mark and the colour differentiates severity; like the
   * arrows it is decoration, `aria-hidden` and click-through.
   */
  markBadge?: { square: Square; mark: Mark } | null;
  onSquareClick: (sq: Square) => void;
}

/**
 * The best-move arrow, drawn over the grid.
 *
 * Endpoints come from `viewArrow`, the single board-space → view-space mapping
 * (src/orientation.ts), so the arrow is orientation-aware for free and cannot
 * point at a square other than the one drawn beneath it. The `viewBox` is a
 * 0–100 square and the board is `aspect-ratio: 1/1`, so the arrowhead keeps its
 * shape at any size — no `preserveAspectRatio` skew to correct for.
 */
function BestMoveArrow({
  move,
  flippedH,
  flippedV,
  secondary = false,
}: {
  move: Move;
  flippedH: boolean;
  flippedV: boolean;
  /** An equal-best alternative rather than the move the engine returned. */
  secondary?: boolean;
}) {
  const { from, to } = viewArrow(move, flippedH, flippedV);
  const x1 = from.x * 100;
  const y1 = from.y * 100;
  const x2 = to.x * 100;
  const y2 = to.y * 100;

  // Stop the shaft short of the destination centre so the head sits inside the
  // target square rather than covering the piece standing on it, and start it
  // clear of the origin piece's own emblem.
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const HEAD = 4.6; // arrowhead half-length, in viewBox units
  // A cell is 100/7 ≈ 14.3 viewBox units across and a piece is 74% of one, so
  // its radius is ~5.3. Starting the shaft just past that keeps the arrow off
  // the piece it is telling you to move rather than through it.
  const TAIL_GAP = 5.6;
  const sx = x1 + ux * TAIL_GAP;
  const sy = y1 + uy * TAIL_GAP;
  // The shaft ends where the head begins, so the two never overlap and the
  // translucent arrow shows no darker seam.
  const ex = x2 - ux * HEAD;
  const ey = y2 - uy * HEAD;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <svg
      className={`best-move-arrow${secondary ? " is-alt" : ""}`}
      viewBox="0 0 100 100"
      aria-hidden
      focusable="false"
    >
      <line x1={sx} y1={sy} x2={ex} y2={ey} strokeWidth={2.6} strokeLinecap="butt" />
      <polygon
        points={`${-HEAD},${-3.4} ${-HEAD},${3.4} 0,0`}
        transform={`translate(${x2} ${y2}) rotate(${angle})`}
      />
    </svg>
  );
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
  flippedH = false,
  flippedV = false,
  attackerEmblem,
  kingEmblem,
  defenderEmblem,
  cornerEmblem,
  bestMove = null,
  alsoBest = [],
  markBadge = null,
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

  // The cells are emitted in *view* order — left to right, top to bottom as
  // drawn — and each one resolves back to the board square it stands for.
  // `flippedH` mirrors columns (east–west), `flippedV` mirrors rows
  // (north–south), independently; every square keeps its own identity: `d4`
  // is the throne from either chair. See src/orientation.ts; the coordinate
  // labels below move to whichever drawn edge is now the bottom/left, but
  // they never rename a square.
  return (
    <div className="board" role="grid" aria-label="Brandubh board">
      {Array.from({ length: BOARD_SIZE }, (_, viewRow) =>
        Array.from({ length: BOARD_SIZE }, (_, viewCol) => {
          const { row: r, col: c } = fromView({ row: viewRow, col: viewCol }, flippedH, flippedV);
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
          const file = isLabelledFileRow(r, flippedV) ? fileLabel(c) : null;
          const rank = isLabelledRankCol(c, flippedH) ? rankLabel(r) : null;

          return (
            <div
              key={key}
              role="gridcell"
              // The square's own name, so what a screen reader reads stays true
              // under flip — the labels below are decorative duplicates of it.
              aria-label={piece ? `${squareName({ row: r, col: c })} ${piece}` : squareName({ row: r, col: c })}
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
              {rank && (
                <span className="coord coord-rank" aria-hidden>
                  {rank}
                </span>
              )}
              {file && (
                <span className="coord coord-file" aria-hidden>
                  {file}
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
              {markBadge && markBadge.square.row === r && markBadge.square.col === c && (
                <span className={`mark-badge is-${markBadge.mark}`} aria-hidden>
                  {markGlyph(markBadge.mark)}
                </span>
              )}
              {/* fading captured-piece flash */}
              {!piece && fadeSet.has(key) && <span className="dot capture" style={{ animation: "capture 320ms ease-in forwards" }} />}
              {isLegal && <span className={`dot ${capHere ? "capture" : ""}`} />}
            </div>
          );
        }),
      )}
      {/* The arrow overlay is absolutely positioned, so it is out of flow and
          never becomes a grid item — the 7×7 auto-placement above is untouched.
          `aria-hidden` keeps it out of the accessibility tree entirely, so the
          grid's accessible children are still 49 gridcells and nothing else. */}
      {/* Alternatives first, so the primary arrow is drawn over them. */}
      {alsoBest.map((m, i) => (
        <BestMoveArrow
          key={`alt-${i}`}
          move={m}
          flippedH={flippedH}
          flippedV={flippedV}
          secondary
        />
      ))}
      {bestMove && <BestMoveArrow move={bestMove} flippedH={flippedH} flippedV={flippedV} />}
    </div>
  );
}
