import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Translations } from "../i18n";
import type { TutorialMistake } from "../game/tutorials";

/**
 * The full-screen curtain a refused tutorial move drops. A beginner mis-reading
 * a one-line nudge under the board is the whole failure mode this exists to
 * stop: the drill is the one place in the app where being told *what* went
 * wrong matters more than staying out of the way, so the refusal takes the
 * screen and names the consequence on the board before offering the way on.
 *
 * Tutorials only — a live game never interrupts the player like this.
 *
 * Rendered through a portal so it is measured against the viewport rather than
 * the Learn modal's scrolling card, and sits above that modal's z-50.
 */
export default function TutorialMistakeOverlay({
  t,
  mistake,
  goal,
  hint,
  showingHint,
  onTryAgain,
  onShowHint,
}: {
  t: Translations;
  mistake: TutorialMistake;
  /** The drill's own goal line, restated so the learner can re-aim. */
  goal: string;
  hint: string;
  /** The hint is already on screen behind the curtain — don't offer it twice. */
  showingHint: boolean;
  onTryAgain: () => void;
  onShowHint: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.stopPropagation();
        onTryAgain();
      }
    };
    // Capture phase: the Learn modal's own Escape handler would otherwise close
    // the whole hub out from under a learner who only meant to dismiss this.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onTryAgain]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onTryAgain}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="tutorial-mistake-title"
      aria-describedby="tutorial-mistake-body"
    >
      <div
        className="card victory-card victory-attackers w-full max-w-sm space-y-5 p-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mistake-mark" aria-hidden="true">
          ✕
        </div>
        <h2 id="tutorial-mistake-title" className="font-display text-3xl leading-tight text-blood">
          {t.tutorialWrongTitle}
        </h2>
        <p id="tutorial-mistake-body" className="text-base leading-relaxed text-parchment">
          {t.tutorialMistakes[mistake]}
        </p>
        <p className="text-sm text-parchment-dim">
          <span className="text-parchment">{t.tutorialGoalLabel}</span> {goal}
        </p>
        {showingHint && <p className="text-sm italic text-parchment-dim">{hint}</p>}
        <div className="flex flex-col gap-3">
          <button className="btn btn-primary py-3 text-base" onClick={onTryAgain} autoFocus>
            {t.tutorialTryAgain}
          </button>
          {!showingHint && (
            <button className="btn py-3 text-base" onClick={onShowHint}>
              {t.tutorialShowHint}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
