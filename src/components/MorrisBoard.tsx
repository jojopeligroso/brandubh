import { useEffect, useMemo, useState } from "react";
import { POINTS, pointName } from "../game/morris/rules";
import { GRID_SIZE, type Board, type Move, type Side } from "../game/morris/types";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import type { EmblemDef } from "../emblems";
import type { DefenderEmblemDef } from "../defenderEmblems";

/**
 * The Morris board — an SVG of its own, not a value of `Board`'s geometry seam.
 *
 * ## Why it is not `Board`
 *
 * `components/Board.tsx` draws a square lattice of cells and takes an optional
 * geometry (size, file letters, which squares are marked) so that 7×7, 9×9 and
 * 11×11 are one component. Twenty-four points on three concentric rings joined by
 * four spokes is not a larger value of that parameter: there are no cells, two
 * thirds of the lattice carries nothing at all, and the lines between points are
 * the board rather than the gaps between its squares. ADR-0008 records the
 * decision; this file is the thing it decided.
 *
 * What *is* shared is everything that is not the geometry: the theme tokens, the
 * piece emblems (the same traced artwork the tafl stones carry), the flip
 * preferences, and the reduced-motion hook.
 *
 * ## The drawing
 *
 * A 100-unit lattice over the 7×7 grid the points are named on, so a point at
 * grid `(x, y)` is drawn at `(x·100 + 50, y·100 + 50)` — the board itself is the
 * 700×700 square that implies, and the `viewBox` adds a `GUTTER` on the left and
 * the bottom for the coordinates, which do not fit in the 50 units the lattice
 * leaves (see `GUTTER`). Nothing is sized in pixels: the `<svg>` scales, and every
 * radius and stroke below is in those user units.
 *
 * Flipping mirrors **where a point is drawn** and never what it is called — the
 * same contract `src/orientation.ts` states for the square boards, and the reason
 * the labels are derived from the point rather than from its drawn position.
 *
 * ## Accessibility
 *
 * The board is a `group` and each point a `button` with the point's own name (plus
 * the stone standing on it), reachable by Tab and operable by Enter or Space. A
 * `<g>` rather than a `<foreignObject>` button because the hit target has to be a
 * circle in board space; everything drawn over it — the grid lines, the rings, the
 * engine's travelling stone — is `aria-hidden` decoration.
 */

/**
 * A turn the player has begun but not finished: the stone has been put where it
 * is going and its mill is waiting for a victim.
 *
 * It is **not** in `board`, because nothing is committed until the removal is
 * chosen (see `MorrisScreen`'s removal step) — so the board draws it from here
 * instead, and says so in the point's own label. Showing it is not a nicety: the
 * player has just clicked a point, a mill has been announced, and a board that
 * still looked untouched would read as "that click did nothing".
 */
export interface MorrisPreview {
  from: number | null;
  to: number;
  side: Side;
}

/** What is travelling, and from where, while the engine's move is revealed. */
export interface MorrisReveal {
  /** Null for a placement: there is no origin, so the stone fades in instead. */
  from: number | null;
  to: number;
  side: Side;
}

/** How long the engine's stone takes to travel, in ms. Deliberately slower than
 *  the stone-placing flourish (180ms): this is not decoration on something the
 *  player already knows, it *is* how they find out what happened. Mirrors
 *  `AI_SLIDE_MS` in src/useAiReveal.ts, which the square boards use. */
export const MORRIS_TRAVEL_MS = 520;

/**
 * The backstop for taking the travelling stone down and letting the real one
 * show. Not how long the flight lasts — the transition's own `transitionend` is
 * what normally ends it; this only covers the case where that never arrives (a
 * backgrounded tab, a frame the display never composites).
 *
 * Deliberately much longer than the flight, for the reason
 * `AI_SLIDE_BACKSTOP_MS` in src/useAiReveal.ts documents at length: the two
 * clocks do not start together (this one when React is told to draw the stone,
 * the transition when the browser actually paints it), and a backstop that can
 * win that race tears the stone down mid-air and leaves it short of its point.
 * Overrunning costs nothing — the copy finishes exactly over the real stone.
 */
const TRAVEL_BACKSTOP_MS = 1400;

const UNIT = 100;
const HALF = UNIT / 2;
const SPAN = GRID_SIZE * UNIT;
/**
 * The coordinate gutter, in user units, added to the left and the bottom of the
 * visible area.
 *
 * The points stay exactly where the contract puts them — `(col·100 + 50,
 * row·100 + 50)` — and only the *window* onto them grows, because the 50-unit
 * margin those coordinates leave is not enough to hold a label: an outer-ring
 * stone reaches to within 13 units of the edge, and a legible glyph needs more
 * than that. Growing the viewBox rather than shrinking the board is what keeps
 * the stones the same size as the square boards' pieces (74% of a cell).
 */
const GUTTER = 40;
/** Stone radius, as a share of a lattice cell — the same 74% the square boards'
 *  `.piece` fills its cell with. */
const STONE_R = 0.37 * UNIT;
/** The point itself, when nothing stands on it. */
const POINT_R = 0.09 * UNIT;

export default function MorrisBoard({
  board,
  turn,
  legalTargets,
  selected,
  lastMove,
  removable,
  preview,
  reveal,
  interactive,
  controllable,
  flippedH = false,
  flippedV = false,
  attackerEmblem,
  defenderEmblem,
  onPointClick,
}: {
  board: Board;
  turn: Side;
  /** Empty points a click would play to, given the phase and the selection. */
  legalTargets: readonly number[];
  /** The stone the player has picked up, in the moving phase. */
  selected: number | null;
  /** The move that produced the position on screen — both its ends are lit. */
  lastMove: Move | null;
  /** Enemy stones the pending mill may take. Non-empty only during the removal
   *  step, which is the one time a click on an *occupied* point is a move. */
  removable: readonly number[];
  /** The half-made turn, drawn over the position it has not yet replaced. */
  preview: MorrisPreview | null;
  /** The engine's move, being shown over the position it already produced. The
   *  landing is this component's own business (see `travelling` below), so there
   *  is no "it has arrived" callback for a caller to have to get right. */
  reveal: MorrisReveal | null;
  interactive: boolean;
  /** The side the local human may touch (null = both, hotseat). Affects the
   *  cursor only; what is *legal* is the screen's business. */
  controllable: Side | null;
  flippedH?: boolean;
  flippedV?: boolean;
  attackerEmblem: EmblemDef;
  defenderEmblem: DefenderEmblemDef;
  onPointClick: (i: number) => void;
}) {
  const reducedMotion = usePrefersReducedMotion();

  // ── The engine's stone in flight ─────────────────────────────────────────────
  // Two pieces of state, and the distinction between them is the whole of getting
  // this right:
  //
  //   • `offset` is the transform, pushed back to the point the stone left for
  //     exactly one frame so the browser has a "from" to transition out of. A CSS
  //     transition rather than a keyframe animation because the distance differs
  //     every move — keyframes would have to be written per move, and a
  //     `transform` that changes once is what a transition is for.
  //   • `travelling` is how long the *real* stone waits, invisible, underneath.
  //     It has to last the whole flight, not one frame: with the two conflated,
  //     the real stone appeared on its point immediately and a second copy flew
  //     in beside it — a teleport with a decoration, which is exactly the failure
  //     `npm run check:ai-reveal` exists to catch on the square boards.
  const [offset, setOffset] = useState(false);
  const [travelling, setTravelling] = useState(false);
  useEffect(() => {
    if (!reveal || reveal.from === null || reducedMotion) {
      setOffset(false);
      setTravelling(false);
      return;
    }
    setOffset(true);
    setTravelling(true);
    const frame = requestAnimationFrame(() => setOffset(false));
    const backstop = window.setTimeout(() => setTravelling(false), TRAVEL_BACKSTOP_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(backstop);
    };
  }, [reveal, reducedMotion]);

  const x = (col: number): number => (flippedH ? GRID_SIZE - 1 - col : col) * UNIT + HALF;
  const y = (row: number): number => (flippedV ? GRID_SIZE - 1 - row : row) * UNIT + HALF;
  const px = (i: number): number => x(POINTS[i].x);
  const py = (i: number): number => y(POINTS[i].y);

  const legalSet = useMemo(() => new Set(legalTargets), [legalTargets]);
  const removableSet = useMemo(() => new Set(removable), [removable]);

  // The three rings, as rectangles through each ring's four corners. A mirror
  // maps a ring onto itself, so min/max is all the flip costs here.
  const rings = [0, 1, 2].map((ring) => {
    const lo = ring;
    const hi = GRID_SIZE - 1 - ring;
    const xs = [x(lo), x(hi)];
    const ys = [y(lo), y(hi)];
    return {
      ring,
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.abs(xs[1] - xs[0]),
      h: Math.abs(ys[1] - ys[0]),
    };
  });

  // The four spokes, each drawn from its outer midpoint to its inner one — the
  // middle ring's point sits on the line by construction (see ADJ / MILLS in
  // game/morris/rules.ts, which is where the graph itself lives).
  const spokes = [1, 3, 5, 7].map((k) => ({ k, from: k, to: 16 + k }));

  const fromPoint = reveal?.from ?? null;
  const travelX = reveal && fromPoint !== null ? px(fromPoint) - px(reveal.to) : 0;
  const travelY = reveal && fromPoint !== null ? py(fromPoint) - py(reveal.to) : 0;

  return (
    <svg
      className="morris-board"
      viewBox={`${-GUTTER} 0 ${SPAN + GUTTER} ${SPAN + GUTTER}`}
      role="group"
      aria-label="Nine Men's Morris board"
      // Handed to CSS rather than restated there: the travel is timed against the
      // screen's own reveal timer, and a stylesheet holding its own copy of 520ms
      // is a copy that will one day disagree.
      style={{ "--morris-travel": `${MORRIS_TRAVEL_MS}ms` } as React.CSSProperties}
    >
      <defs>
        {/* The drilled hole, for the one theme whose board is a peg board.
            Reproduces the two radial gradients `.board::before` paints per cell
            (see the Ballinderry section of index.css and
            docs/ballinderry-board.md): the lit far wall sits low and the bore
            over it, so the light reads as coming from above. Declared always and
            used only under `[data-theme="ballinderry"]` — the CSS decides, so a
            theme switch needs no re-render. */}
        <radialGradient id="morris-hole-bore" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="var(--hole-ink, #4b2f14)" />
          <stop offset="100%" stopColor="var(--hole-ink, #4b2f14)" stopOpacity="0.25" />
        </radialGradient>
        <radialGradient id="morris-hole-lip" cx="50%" cy="42%" r="60%">
          <stop offset="60%" stopColor="var(--hole-lip, #e2c89e)" />
          <stop offset="100%" stopColor="var(--hole-lip, #e2c89e)" stopOpacity="0.2" />
        </radialGradient>
      </defs>

      {/* ── The board itself: three rings and four spokes ─────────────────────
          Drawn twice: a wide dark stroke (the cut) and a narrow pale one over it
          (the inlay reading through). That is how the square boards show their
          grid — `.cell`'s hairline is `--motif-ink` and the chequer tone
          `--cell-dark` is the pale oak showing through it — so the same two
          tokens draw the same thing here, and every theme's board reads the same
          way it does on the other three. */}
      {(["morris-line", "morris-inlay"] as const).map((layer) => (
        <g className={`morris-lines ${layer}s`} key={layer} aria-hidden>
          {rings.map((r) => (
            <rect
              key={`ring-${r.ring}`}
              className={`${layer} morris-ring`}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
            />
          ))}
          {spokes.map((s) => (
            <line
              key={`spoke-${s.k}`}
              className={`${layer} morris-spoke`}
              x1={px(s.from)}
              y1={py(s.from)}
              x2={px(s.to)}
              y2={py(s.to)}
            />
          ))}
        </g>
      ))}

      {/* ── Coordinates ─────────────────────────────────────────────────────────
          Files along the bottom edge, ranks up the left, over the whole 7×7
          lattice rather than only the files that carry points — they name the
          *grid* the points are named on, which is what makes `d7` readable off
          the board. Decoration: the point's own aria-label is the truth. */}
      <g className="morris-coords" aria-hidden>
        {Array.from({ length: GRID_SIZE }, (_, col) => (
          <text key={`file-${col}`} className="morris-coord" x={x(col)} y={SPAN + GUTTER - 10} textAnchor="middle">
            {"abcdefg"[col]}
          </text>
        ))}
        {Array.from({ length: GRID_SIZE }, (_, row) => (
          <text
            key={`rank-${row}`}
            className="morris-coord"
            x={-GUTTER / 2}
            y={y(row) + 10}
            textAnchor="middle"
          >
            {GRID_SIZE - row}
          </text>
        ))}
      </g>

      {/* ── The twenty-four points ──────────────────────────────────────────── */}
      {POINTS.map((p, i) => {
        const cx = x(p.x);
        const cy = y(p.y);
        // The committed position, then the half-made turn drawn over it: the
        // stone already sitting where the player put it, and the point it left
        // already empty. Both are read from `preview` rather than from `board`,
        // because the turn is not in the board yet and must not be — see
        // `MorrisPreview`.
        const cell = board[i];
        const committed: Side | null = cell === 1 ? "white" : cell === 2 ? "black" : null;
        const side: Side | null =
          preview?.to === i ? preview.side : preview?.from === i ? null : committed;
        const isPreview = preview?.to === i;
        const name = pointName(i);
        const isSelected = selected === i;
        const isLegal = legalSet.has(i);
        const isRemovable = removableSet.has(i);
        const isLastTo = lastMove?.to === i;
        const isLastFrom = lastMove?.from === i;
        const isTaken = lastMove?.remove === i || (lastMove?.remove2 ?? null) === i;
        const isOrigin = fromPoint === i;
        // The real stone waits, invisible, under its travelling copy — so the two
        // never show at once and the overlay lifts onto a stone already standing
        // where it left it.
        const inFlight = travelling && reveal?.to === i;
        const pickable =
          interactive &&
          (isLegal ||
            isRemovable ||
            (side !== null && side === turn && (controllable === null || controllable === side)));

        const classes = [
          "morris-point",
          side ? `has-${side}` : "is-empty",
          isSelected ? "is-selected" : "",
          isLegal ? "is-target" : "",
          isRemovable ? "is-removable" : "",
          isLastTo || isLastFrom ? "is-lastmove" : "",
          isTaken ? "is-taken" : "",
          isOrigin ? "is-origin" : "",
          pickable ? "is-pickable" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <g
            key={i}
            className={classes}
            role="button"
            // An inert board is inert to the keyboard too: while the engine is
            // thinking, a finished game is on screen or the cursor is back in the
            // review, the click handler below does nothing, so leaving 24 focus
            // stops that silently swallow Enter is a lie a screen reader repeats
            // twenty-four times. Taken off the tab order and announced disabled
            // together — either alone is the same lie in the other direction.
            tabIndex={interactive ? 0 : -1}
            aria-disabled={interactive ? undefined : true}
            aria-label={side ? `${name} ${side}` : name}
            data-point={name}
            data-testid="morris-point"
            onClick={() => interactive && onPointClick(i)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              // Space scrolls the page otherwise, which moves the board out from
              // under the keyboard the moment it is used.
              e.preventDefault();
              if (interactive) onPointClick(i);
            }}
          >
            {/* The hit target: a full cell, so a point is as easy to hit with a
                thumb as a square is on the other boards. */}
            <circle className="morris-hit" cx={cx} cy={cy} r={HALF * 0.92} />

            {/* The station a stone stands on — this board's answer to the square
                boards' chequer, and drawn in the same token (`--cell-dark`). It
                shows only where no stone covers it, exactly as a dark square
                does, and it vanishes on the one theme that empties that token
                (Ballinderry, where the drilled hole below says the same thing
                far better). */}
            <circle className="morris-station" cx={cx} cy={cy} r={POINT_R * 1.9} />

            {/* The drilled hole, under everything, shown only by the Ballinderry
                theme. Two circles rather than one so the bore and its lit far
                wall are separate — the same two layers that theme's cell tile
                has. The testid is on the bore alone, so counting it counts
                twenty-four holes and not forty-eight. */}
            <circle className="morris-hole-lip" cx={cx} cy={cy + 6} r={POINT_R * 1.6} fill="url(#morris-hole-lip)" />
            <circle
              className="morris-hole"
              data-testid="morris-hole"
              cx={cx}
              cy={cy - 5}
              r={POINT_R * 1.6}
              fill="url(#morris-hole-bore)"
            />

            {/* The point, when nothing is standing on it. */}
            {side === null && <circle className="morris-pip" cx={cx} cy={cy} r={POINT_R} />}

            {/* Where a click would play. Drawn over the pip rather than instead
                of it, so the board does not appear to lose its points. */}
            {isLegal && <circle className="morris-dot" cx={cx} cy={cy} r={POINT_R * 1.5} />}

            {side && (
              <g
                className={`morris-stone${inFlight ? " in-flight" : ""}${
                  isPreview ? " is-preview" : ""
                } is-${side}`}
              >
                <circle cx={cx} cy={cy} r={STONE_R} />
                <StoneEmblem
                  side={side}
                  cx={cx}
                  cy={cy}
                  attackerEmblem={attackerEmblem}
                  defenderEmblem={defenderEmblem}
                />
              </g>
            )}

            {/* The ring that says "this one may be taken", during a removal. */}
            {isRemovable && <circle className="morris-removable" cx={cx} cy={cy} r={STONE_R + 5} />}
            {isSelected && <circle className="morris-selected" cx={cx} cy={cy} r={STONE_R + 5} />}
            {/* The point the engine's stone came *from*, held lit behind it.
                Outlasts the flight: it answers "where did that come from?", which
                is asked after the stone has landed. */}
            {isOrigin && <circle className="morris-origin" cx={cx} cy={cy} r={STONE_R} />}
          </g>
        );
      })}

      {/* ── The engine's stone, in flight ────────────────────────────────────────
          One stone drawn at the destination and pushed back to the origin for a
          frame, then let go. `key` includes both ends, so a second move starting
          before the first has settled restarts the travel rather than inheriting
          it. Out of the accessibility tree entirely: the position it describes is
          already committed, and the point labels above are the truth. */}
      {reveal && reveal.from !== null && !reducedMotion && travelling && (
        <g
          key={`${reveal.from}-${reveal.to}`}
          className="morris-mover"
          aria-hidden
          style={{
            transform: offset ? `translate(${travelX}px, ${travelY}px)` : "none",
          }}
          // Reported from the animation itself rather than timed alongside it:
          // the copy comes down and the real stone shows the instant the travel
          // actually finishes, whenever that is.
          onTransitionEnd={(e) => {
            if (e.propertyName === "transform") setTravelling(false);
          }}
        >
          <g className={`morris-stone is-${reveal.side}`}>
            <circle cx={px(reveal.to)} cy={py(reveal.to)} r={STONE_R} />
            <StoneEmblem
              side={reveal.side}
              cx={px(reveal.to)}
              cy={py(reveal.to)}
              attackerEmblem={attackerEmblem}
              defenderEmblem={defenderEmblem}
            />
          </g>
        </g>
      )}

      {/* The sixteen mills are not drawn as anything of their own: every one of
          them *is* a board line already (three along a ring side, three up a
          spoke), and the one just closed is better said by the removal step's
          rings than by a seventeenth kind of stroke. */}
    </svg>
  );
}

/**
 * The emblem on a stone — the very same traced artwork the tafl pieces carry
 * (`src/emblems.ts`, `src/defenderEmblems.ts`), so a player's chosen emblems
 * follow them onto this board: the raiders' mark rides on Black, the defenders'
 * knot on White.
 *
 * A nested `<svg>` rather than a `<path>` with a transform, because each emblem
 * has its own `viewBox` and scale; letting SVG fit it into a box is what keeps the
 * artwork honest at any board size.
 */
function StoneEmblem({
  side,
  cx,
  cy,
  attackerEmblem,
  defenderEmblem,
}: {
  side: Side;
  cx: number;
  cy: number;
  attackerEmblem: EmblemDef;
  defenderEmblem: DefenderEmblemDef;
}) {
  const emblem = side === "black" ? attackerEmblem : defenderEmblem;
  // 52% of the stone, matching `.piece svg` on the square boards.
  const size = STONE_R * 1.04;
  return (
    <svg
      className={`morris-emblem is-${side}`}
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      viewBox={emblem.viewBox}
      fill="currentColor"
      fillRule={side === "black" ? attackerEmblem.fillRule ?? "evenodd" : "evenodd"}
      aria-hidden
      focusable="false"
    >
      <path d={emblem.path} />
    </svg>
  );
}
