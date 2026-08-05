import { isFinished, type PuzzleState } from "../game/puzzle";
import type { Side } from "../game/types";
import type { Translations } from "../i18n";

/**
 * The prompt and the two offers, for a mistake you have been put back into.
 *
 * Deliberately small and deliberately loud: it replaces the engine's opinion on
 * screen while a guess is outstanding, so it has to carry the whole state of the
 * exercise — what you are being asked, what just happened, and what you may do
 * next — in about two lines on a phone.
 *
 * The two offers after a wrong guess are *try again* and *see it*, and neither
 * is framed as the failure. Someone stuck learns nothing from being made to keep
 * guessing, and someone who wants another go should not have to scroll for it.
 */
export default function PuzzlePanel({
  t,
  puzzle,
  sideLabel,
  waiting,
  lesson,
  onTryAgain,
  onReveal,
  onSkip,
  onNext,
  onExit,
}: {
  t: Translations;
  puzzle: PuzzleState;
  sideLabel: (side: Side) => string;
  /** The answer has not come back yet — a guess cannot be judged. */
  waiting: boolean;
  /**
   * Set while this puzzle is one step of the sequential lesson ("learn from
   * your mistakes"): where we are in the queue, so the panel can show "2/6"
   * and offer Skip / Next instead of a bare Done.
   */
  lesson: { index: number; total: number } | null;
  onTryAgain: () => void;
  onReveal: () => void;
  /** Move on without answering — lesson only. */
  onSkip: () => void;
  /** The next queued mistake — lesson only; past the end it closes the panel. */
  onNext: () => void;
  onExit: () => void;
}) {
  const done = isFinished(puzzle);
  const lastOfLesson = lesson !== null && lesson.index + 1 >= lesson.total;

  let headline: string;
  if (puzzle.stage === "solved") headline = t.puzzleSolved;
  else if (puzzle.stage === "revealed") headline = t.puzzleRevealed;
  else if (puzzle.stage === "wrong") headline = t.puzzleWrong;
  else headline = `${t.puzzlePrompt} · ${sideLabel(puzzle.mover)}`;

  return (
    <section className={`puzzle card mt-3 p-3 is-${puzzle.stage}`} role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-2">
        <p className="puzzle-headline">{headline}</p>
        {lesson && (
          // Where you are in the lesson — lichess's "2/6" progress readout.
          <span className="puzzle-progress">
            {lesson.index + 1}/{lesson.total}
          </span>
        )}
      </div>
      {puzzle.stage === "guessing" && (
        <p className="puzzle-hint">{waiting ? t.puzzleThinking : t.puzzleHint}</p>
      )}
      {puzzle.stage === "solved" && puzzle.attempts > 0 && (
        // Getting there late is still getting there — said plainly, not scored.
        <p className="puzzle-hint">{t.puzzleSolvedLate}</p>
      )}
      {done && lastOfLesson && (
        // The end of the queue, said as an ending rather than just vanishing.
        <p className="puzzle-hint">{t.puzzleLessonDone}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {puzzle.stage === "wrong" && (
          <>
            <button className="btn btn-sm btn-primary" onClick={onTryAgain}>
              {t.puzzleTryAgain}
            </button>
            <button className="btn btn-sm" onClick={onReveal}>
              {t.puzzleReveal}
            </button>
          </>
        )}
        {done &&
          (lesson ? (
            <button className="btn btn-sm btn-primary" onClick={onNext}>
              {lastOfLesson ? t.puzzleDone : t.puzzleNext}
            </button>
          ) : (
            <button className="btn btn-sm" onClick={onExit}>
              {t.puzzleDone}
            </button>
          ))}
        {puzzle.stage === "guessing" && (
          <>
            <button className="btn btn-sm" onClick={onReveal}>
              {t.puzzleReveal}
            </button>
            {lesson && (
              <button className="btn btn-sm" onClick={onSkip}>
                {t.puzzleSkip}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
