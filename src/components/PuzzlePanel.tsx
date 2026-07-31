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
  onTryAgain,
  onReveal,
  onExit,
}: {
  t: Translations;
  puzzle: PuzzleState;
  sideLabel: (side: Side) => string;
  /** The answer has not come back yet — a guess cannot be judged. */
  waiting: boolean;
  onTryAgain: () => void;
  onReveal: () => void;
  onExit: () => void;
}) {
  const done = isFinished(puzzle);

  let headline: string;
  if (puzzle.stage === "solved") headline = t.puzzleSolved;
  else if (puzzle.stage === "revealed") headline = t.puzzleRevealed;
  else if (puzzle.stage === "wrong") headline = t.puzzleWrong;
  else headline = `${t.puzzlePrompt} · ${sideLabel(puzzle.mover)}`;

  return (
    <section className={`puzzle card mt-3 p-3 is-${puzzle.stage}`} role="status" aria-live="polite">
      <p className="puzzle-headline">{headline}</p>
      {puzzle.stage === "guessing" && (
        <p className="puzzle-hint">{waiting ? t.puzzleThinking : t.puzzleHint}</p>
      )}
      {puzzle.stage === "solved" && puzzle.attempts > 0 && (
        // Getting there late is still getting there — said plainly, not scored.
        <p className="puzzle-hint">{t.puzzleSolvedLate}</p>
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
        {done && (
          <button className="btn btn-sm" onClick={onExit}>
            {t.puzzleDone}
          </button>
        )}
        {puzzle.stage === "guessing" && (
          <button className="btn btn-sm" onClick={onReveal}>
            {t.puzzleReveal}
          </button>
        )}
      </div>
    </section>
  );
}
