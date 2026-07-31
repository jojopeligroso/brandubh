import EvalGraph from "./EvalGraph";
import { markGlyph, tally, worstMoves, type Mark } from "../game/annotate";
import type { Side } from "../game/types";
import type { Translations } from "../i18n";

/**
 * "Where did I go wrong?" — the front door of analysis.
 *
 * This is deliberately the first thing under the board rather than a panel
 * below the fold with a button on it. The engine could already do all of this;
 * the reason it added nothing was that you had to know it existed and go
 * looking. A tool you have to find is a tool most people never use, so the
 * review runs itself and puts its answer where the eye already is.
 *
 * Three readings, cheapest first, because they answer different questions:
 *
 *  1. **The strip** — when was the game decided? Often not the move that was
 *     marked; a game can be lost over four quiet moves with no single blunder.
 *  2. **The worst moves** — one tap each, straight to the position. This is the
 *     question most people actually came with.
 *  3. **The tally** — how the two sides compare, for the player who wants it.
 *
 * Everything here is a jump into the existing timeline. Nothing is a new way to
 * look at a position; the board, the eval bar and the arrows do that already.
 */
export default function GameReview({
  t,
  scores,
  marks,
  movers,
  bottomSide,
  humanSide,
  sideLabel,
  cursor,
  running,
  onJump,
  onRun,
  onStop,
}: {
  t: Translations;
  scores: number[] | null;
  marks: (Mark | null)[] | null;
  movers: Side[];
  bottomSide: Side;
  /** The side the reviewer played, when there is one — "my mistakes" first. */
  humanSide: Side | null;
  /** Names the two sides for the tally line. */
  sideLabel: (side: Side) => string;
  cursor: number;
  running: { done: number; total: number } | null;
  onJump: (ply: number) => void;
  onRun: () => void;
  onStop: () => void;
}) {
  const ready = scores !== null && marks !== null && !running;

  // A learner reviewing their own game wants their own mistakes. With no side
  // of their own (over the board), every mistake is somebody's and they all
  // count.
  const worst =
    ready && scores && marks
      ? worstMoves(scores, movers, marks, { limit: 3, side: humanSide })
      : [];

  // Singular: this labels one listed move, not a count of them.
  const label = (m: Mark): string =>
    m === "blunder"
      ? t.markOne_blunder
      : m === "mistake"
        ? t.markOne_mistake
        : t.markOne_inaccuracy;

  // The per-side tally the old panel carried, kept as one compact line rather
  // than two — the ranking above is the answer, this is the context for it.
  const counts = ready && marks ? tally(marks, movers) : null;
  const tallyLine = (side: Side): string => {
    const c = (counts as NonNullable<typeof counts>)[side];
    return `${sideLabel(side)}  ${c.blunder}·${c.mistake}·${c.inaccuracy}`;
  };

  return (
    <section className="review card mt-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-parchment">{t.reviewTitle}</h3>
        {running ? (
          <button className="btn btn-sm" onClick={onStop}>
            {t.annotateStop}
          </button>
        ) : (
          <button className="btn btn-sm" onClick={onRun}>
            {scores ? t.annotateAgain : t.annotateRun}
          </button>
        )}
      </div>

      {running && (
        <div className="annotate-progress mt-2" role="status">
          <div className="annotate-bar" aria-hidden>
            <span style={{ width: `${Math.round((running.done / running.total) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-parchment-dim">
            {t.annotateProgress} {running.done}/{running.total}
          </p>
        </div>
      )}

      {ready && scores && scores.length > 1 && (
        <div className="mt-2">
          <EvalGraph
            t={t}
            scores={scores}
            marks={marks}
            bottomSide={bottomSide}
            cursor={cursor}
            onJump={onJump}
          />
        </div>
      )}

      {ready && worst.length > 0 && (
        <>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-parchment-dim">
            {humanSide ? t.reviewYourWorst : t.reviewWorst}
          </p>
          <ul className="review-list mt-1">
            {worst.map((w) => (
              <li key={w.index}>
                <button
                  className={`review-item is-${w.mark}${w.ply === cursor ? " is-current" : ""}`}
                  onClick={() => onJump(w.ply)}
                >
                  <span className="review-glyph" aria-hidden>
                    {markGlyph(w.mark)}
                  </span>
                  <span className="review-move">
                    {t.moveWord} {w.ply}
                  </span>
                  <span className="review-mark">{label(w.mark)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {ready && counts && (
        <p className="review-tally mt-2" title={t.reviewTallyHint}>
          <span>{tallyLine("attackers")}</span>
          <span>{tallyLine("defenders")}</span>
        </p>
      )}

      {/* A clean game is a result, not an empty state. Saying so is the whole
          answer to "where did I go wrong" when the answer is "you didn't". */}
      {ready && worst.length === 0 && (
        <p className="mt-2 text-xs text-parchment-dim">{t.reviewClean}</p>
      )}

      {!ready && !running && <p className="mt-2 text-xs text-parchment-dim">{t.annotateHint}</p>}
    </section>
  );
}
