import { useEffect, useMemo, useState } from "react";
import BankPuzzlePlayer from "./BankPuzzlePlayer";
import ObjectivesContent, { type Emblems } from "./ObjectivesContent";
import RulesContent from "./RulesContent";
import TutorialPlayer from "./TutorialPlayer";
import type { Translations } from "../i18n";
import type { RuleSet } from "../game/variants";
import type { Side } from "../game/types";
import { loadBank, type Puzzle } from "../game/puzzleBank";
import { loadPuzzleProgress, savePuzzleProgress } from "../game/puzzleProgress";
import { loadTrainer, pickNext, recordAttempt, saveTrainer } from "../game/trainer";
import {
  TUTORIALS,
  loadTutorialProgress,
  saveTutorialProgress,
} from "../game/tutorials";
import { useDialogFocus } from "../useDialogFocus";

export type LearnView = "menu" | "objectives" | "rules" | "tutorials" | "puzzles";

/**
 * The Learn hub behind "Show me how" / "How to play": a menu of four doors —
 * the animated objectives demo, the rules (quick + full), the interactive
 * tutorial set plays, and the **Puzzle Bank** — in one modal with its own back
 * navigation.
 */
export default function LearnModal({
  t,
  rules,
  emblems,
  initialView,
  onClose,
}: {
  t: Translations;
  rules: RuleSet;
  emblems: Emblems;
  initialView: LearnView;
  onClose: () => void;
}) {
  const [view, setView] = useState<LearnView>(initialView);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(loadTutorialProgress);

  // The bank, or an empty one under any ruleset it was not verified for. A
  // **Puzzle** belongs to exactly one **Ruleset**, so this gate is not a
  // convenience: a differing flag can change whether the solving move even wins.
  const bank = useMemo(() => loadBank(rules), [rules]);
  const [solved, setSolved] = useState<Set<string>>(() =>
    loadPuzzleProgress(new Set(bank.map((p) => p.id))),
  );

  // ── The trainer (see game/trainer.ts) ───────────────────────────────────────
  // The Pool is not browsed any more: the Puzzles door opens straight onto a
  // board, and the trainer decides which. Its band walk and its record persist;
  // which puzzle is up right now does not — a fresh visit draws fresh.
  const [trainer, setTrainer] = useState(loadTrainer);
  useEffect(() => saveTrainer(trainer), [trainer]);
  /** The puzzle on the board. `undefined` = nothing drawn yet (or not in the
   *  view); `null` = the bank is finished — every puzzle solved. */
  const [serving, setServing] = useState<Puzzle | null | undefined>(undefined);
  /** Bumped per serve, so the player remounts even when the draw legitimately
   *  repeats a puzzle (the only-one-left case in `pickNext`). */
  const [serveCount, setServeCount] = useState(0);

  // Draw the first puzzle on entering the view; forget the board on leaving so
  // the next visit draws fresh rather than resuming a stale position.
  useEffect(() => {
    if (view !== "puzzles" || bank.length === 0) {
      setServing(undefined);
      return;
    }
    if (serving !== undefined) return;
    const picked = pickNext(bank, solved, trainer.band, Math.random);
    // A dry band is skipped upward inside pickNext; keep the walk.
    if (picked.band !== trainer.band) setTrainer((tr) => ({ ...tr, band: picked.band }));
    setServing(picked.puzzle);
    setServeCount((n) => n + 1);
  }, [view, bank, serving, solved, trainer.band]);

  const markPuzzleSolved = (id: string) => {
    setSolved((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      savePuzzleProgress(next);
      return next;
    });
  };

  /** A finished attempt, scored: clean — no wrong guess, no *view the
   *  solution* — argues for promotion; anything else just counts. */
  const recordFinish = (_id: string, outcome: "solved" | "revealed", wrongGuesses: number) =>
    setTrainer((tr) => recordAttempt(tr, outcome === "solved" && wrongGuesses === 0));

  /** Continue training: the next draw. Null past the last unsolved puzzle,
   *  which is what flips the view to the all-done state. */
  const serveNext = () => {
    const picked = pickNext(bank, solved, trainer.band, Math.random, serving?.id);
    if (picked.band !== trainer.band) setTrainer((tr) => ({ ...tr, band: picked.band }));
    setServing(picked.puzzle);
    setServeCount((n) => n + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Inside the trainer, Escape is one step out — back to the Learn menu —
      // rather than a trapdoor through every layer to the game.
      if (e.key === "Escape") {
        if (view === "puzzles") setView("menu");
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, view]);

  const markSolved = (id: string) => {
    setDone((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveTutorialProgress(next);
      return next;
    });
  };

  const activeIndex = activeId ? TUTORIALS.findIndex((s) => s.id === activeId) : -1;
  const active = activeIndex >= 0 ? TUTORIALS[activeIndex] : null;

  // The modal's own navigation, named so `useDialogFocus` can put focus back
  // when a sub-view replaces the control that opened it. Every one of these
  // swaps the body of the dialog out from under the button that was pressed.
  const dialogRef = useDialogFocus<HTMLDivElement>(
    `${view}:${activeId ?? ""}:${serving?.id ?? ""}:${serveCount}`,
  );

  const title =
    view === "menu"
      ? t.learnTitle
      : view === "objectives"
        ? t.learnObjectives
        : view === "rules"
          ? t.learnRules
          : view === "puzzles"
            ? // The **Puzzle number** belongs to the player, which carries it for
              // 8e too; repeating it in the modal's title would say it twice.
              t.learnPuzzles
            : active
              ? t.tutorialTitles[active.id]
              : t.learnTutorials;

  const goBack =
    view === "menu" ? null : active ? () => setActiveId(null) : () => setView("menu");

  // ── The trainer is a place, not a dialog ────────────────────────────────────
  // Lichess-style: the Puzzles door opens straight onto a board — no list to
  // browse, no "Play" button waiting to drop the learner back into a game they
  // were not thinking about. The screen is opaque, so nothing of the live game
  // shows behind the exercise; the ways out are back (to the Learn menu) and
  // close. Which puzzle is on the board is the trainer's call (game/trainer.ts).
  if (view === "puzzles" && bank.length > 0 && serving !== undefined) {
    return (
      <div
        ref={dialogRef}
        className="puzzle-screen fixed inset-0 z-50 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="learn-title"
        tabIndex={-1}
      >
        <div className="mx-auto w-full max-w-xl p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <button className="iconbtn" onClick={() => setView("menu")} aria-label={t.back}>
                ‹
              </button>
              <div>
                <h2 id="learn-title" className="font-display text-2xl text-gold">
                  {serving ? (
                    <>
                      {t.learnPuzzleLabel}{" "}
                      <span className="font-mono text-xl text-parchment">#{serving.id}</span>
                    </>
                  ) : (
                    t.learnPuzzles
                  )}
                </h2>
                {/* The band being trained and the bank-wide count — lichess's
                    "Rating · Played n times" line, in this bank's terms. */}
                <p className="text-xs text-parchment-dim">
                  {serving ? `${t[serving.band]} · ` : ""}
                  {solved.size} / {bank.length} {t.learnSolved}
                </p>
              </div>
            </div>
            <button className="btn" onClick={onClose} aria-label={t.close}>
              ✕
            </button>
          </div>

          {serving ? (
            <BankPuzzlePlayer
              // Remount per serve, not per puzzle: the draw may honestly repeat
              // the last unsolved puzzle, and a stale board must not survive it.
              key={serveCount}
              t={t}
              puzzle={serving}
              rules={rules}
              emblems={emblems}
              sideLabel={(side: Side) => (side === "attackers" ? t.raiders : t.kingsSide)}
              queue={{ index: solved.size, total: bank.length }}
              showMeta={false}
              onSolved={markPuzzleSolved}
              onFinish={recordFinish}
              onNext={serveNext}
              onExit={() => setView("menu")}
            />
          ) : (
            // `serving` is null: the trainer drew and found nothing — the whole
            // bank is solved.
            <div className="card mt-6 p-6 text-center">
              <p className="text-2xl" aria-hidden>
                ✓
              </p>
              <p className="mt-2 text-sm text-parchment">{t.learnAllSolved}</p>
              <button className="btn btn-primary mt-4" onClick={() => setView("menu")}>
                {t.puzzleDone}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="card w-full sm:max-w-xl max-h-[90vh] overflow-y-auto p-6 rounded-b-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="learn-title"
        // Focused on open by `useDialogFocus`, so a screen reader reads the
        // dialog's name before its contents. Programmatic focus does not match
        // `:focus-visible`, so nothing is drawn that was not drawn before.
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            {goBack && (
              <button className="iconbtn" onClick={goBack} aria-label={t.back}>
                ‹
              </button>
            )}
            <h2 id="learn-title" className="font-display text-2xl text-gold">
              {title}
            </h2>
          </div>
          <button className="btn" onClick={onClose} aria-label={t.close}>
            ✕
          </button>
        </div>

        {view === "menu" && (
          <div className="mt-4 flex flex-col gap-3">
            <MenuCard
              label={t.learnObjectives}
              hint={t.learnObjectivesHint}
              onClick={() => setView("objectives")}
            />
            <MenuCard
              label={t.learnRules}
              hint={t.learnRulesHint}
              onClick={() => setView("rules")}
            />
            <MenuCard
              label={t.learnTutorials}
              hint={t.learnTutorialsHint}
              badge={`${done.size} / ${TUTORIALS.length}`}
              onClick={() => setView("tutorials")}
            />
            <MenuCard
              label={t.learnPuzzles}
              hint={t.learnPuzzlesHint}
              badge={bank.length ? `${solved.size} / ${bank.length}` : undefined}
              onClick={() => setView("puzzles")}
            />
          </div>
        )}

        {view === "objectives" && <ObjectivesContent t={t} rules={rules} emblems={emblems} />}

        {view === "rules" && <RulesContent t={t} rules={rules} />}

        {view === "tutorials" && !active && (
          <div className="mt-4">
            <p className="text-sm text-parchment-dim">
              {done.size} / {TUTORIALS.length} {t.tutorialProgress}
            </p>
            {done.size === TUTORIALS.length && (
              <p className="mt-1 text-sm text-gold">{t.tutorialAllDone}</p>
            )}
            <ol className="mt-3 flex flex-col gap-2">
              {TUTORIALS.map((sc, i) => (
                <li key={sc.id}>
                  <button
                    className="btn w-full justify-between text-left"
                    onClick={() => setActiveId(sc.id)}
                  >
                    <span className="flex w-full items-center justify-between gap-3">
                      <span>
                        <span className="text-parchment-dim">{i + 1}.</span>{" "}
                        {t.tutorialTitles[sc.id]}
                        <span className="block text-xs font-normal text-parchment-dim">
                          {t.tutorialGoals[sc.id]}
                        </span>
                      </span>
                      <span
                        className={
                          sc.side === "attackers"
                            ? "text-xs text-blood"
                            : "text-xs text-gold"
                        }
                      >
                        {sc.side === "attackers" ? t.raiders : t.kingsSide}
                        {done.has(sc.id) && <span className="ml-2 text-gold">✓</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}

        {view === "tutorials" && active && (
          <TutorialPlayer
            scenario={active}
            t={t}
            emblems={emblems}
            onSolved={markSolved}
            onNext={
              activeIndex < TUTORIALS.length - 1
                ? () => setActiveId(TUTORIALS[activeIndex + 1].id)
                : null
            }
          />
        )}

        {view === "puzzles" && bank.length === 0 && (
          // Not a failure and not an empty state: the bank was proved under one
          // ruleset and says nothing about this one.
          <p className="mt-4 text-sm text-parchment-dim">{t.learnPuzzlesUnavailable}</p>
        )}

        {/* The puzzles view deliberately has no "Play" button: its exits lead
            deeper into puzzles or back out the way you came, never into a game
            (lichess-style — see the full-screen player above). */}
        {view !== "menu" && view !== "puzzles" && (
          <button className="btn btn-primary mt-6 w-full" onClick={onClose}>
            {t.playButton}
          </button>
        )}
      </div>
    </div>
  );
}

function MenuCard({
  label,
  hint,
  badge,
  onClick,
}: {
  label: string;
  hint: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button className="btn py-3 text-left" onClick={onClick}>
      <span className="flex w-full items-center justify-between gap-3">
        <span>
          <span className="text-base font-semibold">{label}</span>
          <span className="block text-xs font-normal text-parchment-dim">{hint}</span>
        </span>
        {badge && <span className="font-mono text-xs text-parchment-dim">{badge}</span>}
      </span>
    </button>
  );
}
