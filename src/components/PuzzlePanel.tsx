import { isFinished, type Attempt } from "../game/attempt";
import type { Side } from "../game/types";
import type { Translations } from "../i18n";

/**
 * The prompt and the offers, for an **Attempt** you have been put into.
 *
 * Deliberately small and deliberately loud: it replaces the engine's opinion on
 * screen while a guess is outstanding, so it has to carry the whole state of the
 * exercise — what you are being asked, what just happened, and what you may do
 * next — in about two lines on a phone.
 *
 * A wrong guess is bounced back automatically (the same lichess revert the bank
 * puzzles use), which returns the Attempt to `guessing`; the `feedback` track is
 * what keeps this panel red and saying so until the next guess, with **Try
 * again** as the loud, natural default. None of it is framed as the failure —
 * the position is still open, and *view the solution* (and, in a lesson, *skip*)
 * are always in reach.
 *
 * A finished Attempt immediately offers the two ways forward: the next queued
 * mistake (in a lesson), and playing the position on as a live game.
 *
 * It reads the Attempt and never its source: a bank puzzle and a review mistake
 * render identically here, which is why `mover` sits top-level on the Attempt
 * rather than inside the review variant of `AttemptSource`.
 */
export default function PuzzlePanel({
  t,
  attempt,
  sideLabel,
  waiting,
  feedback,
  lesson,
  prompt,
  onTryAgain,
  onReveal,
  onSkip,
  onNext,
  onExit,
  onPlayFromHere,
}: {
  t: Translations;
  attempt: Attempt;
  sideLabel: (side: Side) => string;
  /** The answer has not come back yet — a guess cannot be judged. */
  waiting: boolean;
  /**
   * The fail track: `"wrong"` from a wrong guess until the next one, outliving
   * the automatic revert (which returns the Attempt itself to `guessing`).
   */
  feedback: "wrong" | null;
  /**
   * The headline while a guess is outstanding. Defaults to `t.puzzlePrompt`,
   * which says "find a *better* move" — right for a **Review Mistake**, where
   * you played something, and wrong for a bank **Puzzle**, where nobody has.
   */
  prompt?: string;
  /**
   * Set while this puzzle is one step of the sequential lesson ("learn from
   * your mistakes"): where we are in the queue, so the panel can show "2/6"
   * and offer Skip / Next mistake instead of a bare Done.
   */
  lesson: { index: number; total: number } | null;
  onTryAgain: () => void;
  onReveal: () => void;
  /** Move on without answering — lesson only. */
  onSkip: () => void;
  /** The next queued mistake — lesson only; past the end it closes the panel. */
  onNext: () => void;
  onExit: () => void;
  /** Play the position on as a live game; null while there is no game left in
   *  it (or the caller does not offer one). */
  onPlayFromHere: (() => void) | null;
}) {
  const done = isFinished(attempt);
  const lastOfLesson = lesson !== null && lesson.index + 1 >= lesson.total;
  // Red while a wrong guess is on the board *or* after it has been bounced
  // back — the accent outlives the revert until the next guess.
  const failing = attempt.stage === "wrong" || (attempt.stage === "guessing" && feedback === "wrong");

  let headline: string;
  if (attempt.stage === "solved") headline = t.puzzleSolved;
  else if (attempt.stage === "revealed") headline = t.puzzleRevealed;
  else if (failing) headline = t.puzzleWrong;
  else headline = `${prompt ?? t.puzzlePrompt} · ${sideLabel(attempt.mover)}`;

  return (
    <section className={`puzzle card mt-3 p-3 ${failing ? "is-wrong" : `is-${attempt.stage}`}`}>
      {/* The live region is the *reading matter* and not the whole panel.
          `role="status"` used to sit on the section, which put the offers
          inside it, so every change of stage re-announced "Try again · See it ·
          Skip" behind the sentence that mattered — and overrode the section's
          own role while it was at it. The buttons announce themselves when they
          are reached; what has to be spoken unasked is what just happened. */}
      <div role="status" aria-live="polite">
        <div className="flex items-baseline justify-between gap-2">
          <p className="puzzle-headline">{headline}</p>
          {lesson && (
            // Where you are in the lesson — lichess's "2/6" progress readout.
            <span className="puzzle-progress">
              {lesson.index + 1}/{lesson.total}
            </span>
          )}
        </div>
        {failing && (
          // The board just took the move back on its own; saying so is what
          // keeps the revert from reading as a glitch.
          <p className="puzzle-hint">{t.puzzleTakenBack}</p>
        )}
        {!failing && attempt.stage === "guessing" && (
          <p className="puzzle-hint">{waiting ? t.puzzleThinking : t.puzzleHint}</p>
        )}
        {attempt.stage === "solved" && attempt.attempts > 0 && (
          // Getting there late is still getting there — said plainly, not scored.
          <p className="puzzle-hint">{t.puzzleSolvedLate}</p>
        )}
        {done && lastOfLesson && (
          // The end of the queue, said as an ending rather than just vanishing.
          <p className="puzzle-hint">{t.puzzleLessonDone}</p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {failing && (
          <>
            {/* The natural default, and dressed as one: try the position
                again. During the bounce it takes the move back at once. */}
            <button className="btn btn-primary" onClick={onTryAgain}>
              {t.puzzleTryAgain}
            </button>
            <button className="btn btn-sm" onClick={onReveal}>
              {t.puzzleReveal}
            </button>
            {lesson && (
              // Skip belongs here more than anywhere: someone who has just
              // guessed wrong is *more* likely to want out than someone who has
              // not guessed at all.
              <button className="btn btn-sm" onClick={onSkip}>
                {t.puzzleSkip}
              </button>
            )}
          </>
        )}
        {done && (
          <>
            {lesson ? (
              <button className="btn btn-primary" onClick={onNext}>
                {lastOfLesson ? t.puzzleFinishLesson : t.puzzleNextMistake}
              </button>
            ) : (
              <button className="btn btn-sm" onClick={onExit}>
                {t.puzzleDone}
              </button>
            )}
            {onPlayFromHere && (
              <button className="btn btn-sm" onClick={onPlayFromHere}>
                {t.playFromHere}
              </button>
            )}
          </>
        )}
        {!failing && attempt.stage === "guessing" && (
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
      {done && onPlayFromHere && (
        // What taking that door costs, said before the tap: the review closes
        // and the autosave now describes the new game.
        <p className="mt-2 text-xs text-parchment-dim">{t.puzzlePlayFromHereHint}</p>
      )}
    </section>
  );
}
