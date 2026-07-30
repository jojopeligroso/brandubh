import { useEffect, useState } from "react";
import ObjectivesContent, { type Emblems } from "./ObjectivesContent";
import RulesContent from "./RulesContent";
import TutorialPlayer from "./TutorialPlayer";
import type { Translations } from "../i18n";
import type { RuleSet } from "../game/variants";
import {
  TUTORIALS,
  loadTutorialProgress,
  saveTutorialProgress,
} from "../game/tutorials";

export type LearnView = "menu" | "objectives" | "rules" | "tutorials";

/**
 * The Learn hub behind "Show me how" / "How to play": a menu of three doors —
 * the animated objectives demo, the rules (quick + full), and the interactive
 * tutorial set plays — in one modal with its own back navigation.
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  const title =
    view === "menu"
      ? t.learnTitle
      : view === "objectives"
        ? t.learnObjectives
        : view === "rules"
          ? t.learnRules
          : active
            ? t.tutorialTitles[active.id]
            : t.learnTutorials;

  const goBack =
    view === "menu"
      ? null
      : active
        ? () => setActiveId(null)
        : () => setView("menu");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="card w-full sm:max-w-xl max-h-[90vh] overflow-y-auto p-6 rounded-b-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="learn-title"
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

        {view !== "menu" && (
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
