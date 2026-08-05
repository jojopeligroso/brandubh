import { useEffect, useMemo, useState } from "react";
import BankPuzzlePlayer from "./BankPuzzlePlayer";
import ObjectivesContent, { type Emblems } from "./ObjectivesContent";
import RulesContent from "./RulesContent";
import TutorialPlayer from "./TutorialPlayer";
import type { Translations } from "../i18n";
import type { RuleSet } from "../game/variants";
import type { Difficulty } from "../game/ai";
import type { Side } from "../game/types";
import { loadBank } from "../game/puzzleBank";
import { namedSets, pool, poolTags, setLabel, tagLabel } from "../game/puzzlePool";
import {
  bandProgress,
  loadPuzzleProgress,
  savePuzzleProgress,
} from "../game/puzzleProgress";
import {
  TUTORIALS,
  loadTutorialProgress,
  saveTutorialProgress,
} from "../game/tutorials";
import { useDialogFocus } from "../useDialogFocus";

export type LearnView = "menu" | "objectives" | "rules" | "tutorials" | "puzzles";

/** How much of the **Pool** is listed at once. 161 rows in a phone-height modal
 *  is a wall rather than a list, and the order is meaningful, so the tail is
 *  asked for rather than scrolled past. */
const PAGE = 24;

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
  const [bandFilter, setBandFilter] = useState<Difficulty | null>(null);
  const [motifFilter, setMotifFilter] = useState<string | null>(null);
  // Several at once, read as "and" between facets and "or" within one — see
  // `pool`, which is where that reading is argued and tested.
  const [tagFilter, setTagFilter] = useState<readonly string[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const bands = bandProgress(bank, solved);
  const unlocked = new Set(bands.filter((b) => b.unlocked).map((b) => b.band));
  const sets = useMemo(() => namedSets(bank), [bank]);
  const tags = useMemo(() => poolTags(bank), [bank]);
  const listed = pool(bank, {
    unlocked,
    band: bandFilter,
    tags: tagFilter,
    ids: motifFilter ? new Set(sets.find((s) => s.motif === motifFilter)?.ids ?? []) : null,
  });
  const playingIndex = playingId ? listed.findIndex((p) => p.id === playingId) : -1;
  const playing = playingIndex >= 0 ? listed[playingIndex] : null;

  const markPuzzleSolved = (id: string) => {
    setSolved((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      savePuzzleProgress(next);
      return next;
    });
  };

  /** Every way into the **Pool** is a filter on the one list, never a second
   *  collection. A band row and a set row are each one choice and clear
   *  everything else, so the narrowing stays legible from the screen. */
  const narrow = (next: {
    band?: Difficulty | null;
    motif?: string | null;
    tags?: readonly string[];
  }) => {
    setBandFilter(next.band ?? null);
    setMotifFilter(next.motif ?? null);
    setTagFilter(next.tags ?? []);
    setShown(PAGE);
  };

  /** Chips accumulate; a band or a set row does not. Toggling a chip therefore
   *  drops the band and the set — those are one-choice rows — and keeps the
   *  other chips, which are the half of the filter that composes. */
  const toggleTag = (tag: string) =>
    narrow({
      tags: tagFilter.includes(tag) ? tagFilter.filter((x) => x !== tag) : [...tagFilter, tag],
    });

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

  // The modal's own navigation, named so `useDialogFocus` can put focus back
  // when a sub-view replaces the control that opened it. Every one of these
  // swaps the body of the dialog out from under the button that was pressed.
  const dialogRef = useDialogFocus<HTMLDivElement>(`${view}:${activeId ?? ""}:${playingId ?? ""}`);

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
    view === "menu"
      ? null
      : playing
        ? () => setPlayingId(null)
        : active
          ? () => setActiveId(null)
          : () => setView("menu");

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

        {view === "puzzles" && bank.length > 0 && !playing && (
          <div className="mt-4 flex flex-col gap-5">
            <section>
              <h3 className="text-sm font-semibold text-parchment">{t.learnBands}</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {bands.map((b) => (
                  <li key={b.band}>
                    <button
                      className={`btn w-full justify-between text-left ${b.unlocked ? "" : "opacity-50"}`}
                      // A lock that is a visual state only is a lock a screen
                      // reader cannot report, so the row says it in words as
                      // well as in colour, and stays in the tab order so the
                      // reason for it can be read.
                      aria-disabled={!b.unlocked}
                      aria-pressed={b.unlocked ? bandFilter === b.band : undefined}
                      onClick={() =>
                        b.unlocked && narrow({ band: bandFilter === b.band ? null : b.band })
                      }
                    >
                      <span className="flex w-full items-center justify-between gap-3">
                        <span>{t[b.band]}</span>
                        <span className="font-mono text-xs text-parchment-dim">
                          {b.unlocked
                            ? `${b.solved} / ${b.total} ${t.learnSolved}`
                            : `${t.learnBandLocked} · ${b.needed} ${t.learnMoreToUnlock}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-parchment">{t.learnSets}</h3>
              {sets.length === 0 ? (
                // The normal case, not a degraded one: most puzzles carry no
                // motif and live in the Pool.
                <p className="mt-2 text-sm text-parchment-dim">{t.learnNoSets}</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {sets.map((s) => (
                    <li key={s.motif}>
                      <button
                        className="btn w-full justify-between text-left"
                        aria-pressed={motifFilter === s.motif}
                        onClick={() =>
                          narrow({ motif: motifFilter === s.motif ? null : s.motif })
                        }
                      >
                        <span className="flex w-full items-center justify-between gap-3">
                          {/* The motif's name, not its completion note: the row
                              is read before a puzzle is attempted, and the note
                              is a sentence written to be read after one is
                              solved. `setLabel` is total over `Motif`, so the
                              row cannot fall back to either the sentence or the
                              bare id. */}
                          <span>{setLabel(t, s)}</span>
                          <span className="font-mono text-xs text-parchment-dim">
                            {s.ids.length}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-parchment">{t.learnPool}</h3>
              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="btn btn-sm"
                    aria-pressed={tagFilter.length === 0}
                    onClick={() => narrow({})}
                  >
                    {t.learnAllTags}
                  </button>
                  {tags.map((tag) => (
                    // The chip carries 8c's label for the tag, never the raw
                    // identifier: `TAG_LABEL_KEYS` is exhaustive over the `Tag`
                    // union, so an unlabelled tag is a build error and not a
                    // chip reading `soldierGivenUp` at a learner.
                    <button
                      key={tag}
                      className="btn btn-sm"
                      aria-pressed={tagFilter.includes(tag)}
                      onClick={() => toggleTag(tag)}
                    >
                      {tagLabel(t, tag)}
                    </button>
                  ))}
                </div>
              )}
              {listed.length === 0 ? (
                <p className="mt-2 text-sm text-parchment-dim">{t.learnPoolEmpty}</p>
              ) : (
                <>
                  <ol className="mt-2 flex flex-col gap-2">
                    {listed.slice(0, shown).map((p) => (
                      <li key={p.id}>
                        <button
                          className="btn w-full justify-between text-left"
                          onClick={() => setPlayingId(p.id)}
                        >
                          <span className="flex w-full items-center justify-between gap-3">
                            <span className="font-mono">
                              <span className="sr-only">{t.learnPuzzleLabel} </span>#{p.id}
                            </span>
                            <span className="text-xs text-parchment-dim">
                              {t[p.band]}
                              {solved.has(p.id) && (
                                // Solved was a gold tick and nothing else, so
                                // the row said it in colour and in a glyph most
                                // screen readers either skip or read as "check
                                // mark". The tick keeps the screen; the word is
                                // what reaches the accessibility tree.
                                <>
                                  <span className="ml-2 text-gold" aria-hidden>
                                    ✓
                                  </span>
                                  <span className="sr-only">{t.learnPuzzleSolved}</span>
                                </>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                  {shown < listed.length && (
                    <button
                      className="btn btn-sm mt-2"
                      onClick={() => setShown((n) => n + PAGE)}
                    >
                      {t.learnShowMore}
                    </button>
                  )}
                </>
              )}
            </section>
          </div>
        )}

        {view === "puzzles" && playing && (
          <BankPuzzlePlayer
            t={t}
            puzzle={playing}
            rules={rules}
            emblems={emblems}
            sideLabel={(side: Side) => (side === "attackers" ? t.raiders : t.kingsSide)}
            queue={{ index: playingIndex, total: listed.length }}
            onSolved={markPuzzleSolved}
            onNext={
              playingIndex < listed.length - 1
                ? () => setPlayingId(listed[playingIndex + 1].id)
                : null
            }
            onExit={() => setPlayingId(null)}
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
