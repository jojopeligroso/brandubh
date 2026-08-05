import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BankPuzzlePlayer from "./BankPuzzlePlayer";
import Board from "./Board";
import type { Emblems } from "./ObjectivesContent";
import { translations, type Lang, type Translations } from "../i18n";
import { loadLang } from "../i18n";
import { isGaelicLang, toSeanchloTable } from "../gaelic";
import { applyPieceColors, applyTheme, loadPieceColors, loadTheme } from "../theme";
import { emblemById, loadAttackerEmblem } from "../emblems";
import { cornerEmblemById, loadCornerEmblem } from "../cornerEmblems";
import { kingEmblemById, loadKingEmblem } from "../kingEmblems";
import { defenderEmblemById, loadDefenderEmblem } from "../defenderEmblems";
import { loadBank, puzzleStart, type Puzzle } from "../game/puzzleBank";
import { DEFAULT_VARIANT, VARIANTS } from "../game/variants";
import type { Side } from "../game/types";
import {
  ANCHOR_COUNT,
  COMPARISONS_PER_PUZZLE,
  MAILTO_CEILING,
  anchors,
  clearSession,
  encodeSession,
  isAnchorPosition,
  loadSession,
  nextAnchorIndex,
  saveSession,
  schedule,
  type Entry,
  type Session,
} from "../game/proving";

/** The project styles inputs with utilities rather than a class; this is the
 *  same underline the set scoreboard's name fields use, kept in one place so the
 *  three fields on the arrival screen cannot drift apart. */
const FIELD =
  "w-full border-b border-parchment/20 bg-transparent text-parchment placeholder:text-parchment-dim focus:border-gold focus:outline-none";

/**
 * The **Proving ground**: the unlisted page that produces the data 8f fits the
 * grade weights against.
 *
 * **Unlisted, not secured, and the arrival screen says so.** There is no
 * password and there will not be one: any check made in client-side JavaScript
 * can be read out of the bundle, and a client-side password is only meaningful
 * when it decrypts the gated content. The puzzle bank ships in the bundle for
 * the normal app, so this page reveals nothing that is not already public. See
 * ADR-0004.
 *
 * ## The protocol, and why the order is structural rather than enforced
 *
 * ADR-0005: the position cold and timed, an attempt *or a surrender*, then the
 * answer, then three **Comparisons**. Nothing in here checks that order, because
 * nothing has to. The only way to reach the answer is `BankPuzzlePlayer`'s *see
 * it*, which ends the Attempt; the Attempt ending is what stops the clock
 * (`onFinish`); and the comparison questions are not rendered until the clock
 * has stopped. A grader who wants the answer can have it immediately, and the
 * record simply says they took four seconds and did not solve it, which is a
 * measurement and not a cheat.
 *
 * `blind` is set on the player, so the **Band** is not shown. That is the one
 * thing on the normal Learn screen that would put a difficulty label in front of
 * someone about to judge difficulty.
 *
 * ## Nobody is asked how hard anything is
 *
 * There is no scale here, no slider, no four buttons. The only question this
 * page ever asks is "harder than this one?", against a puzzle the grader solved
 * earlier in the same session, with that puzzle's position on screen so the
 * comparison is a comparison and not a memory test. The anchor's *answer* is
 * never re-shown, so the curse of knowledge the strict order exists to prevent
 * does not come back in through the comparison panel.
 *
 * ## Standalone on purpose
 *
 * Mounted by `main.tsx` instead of `App`, not inside it. The app shell is four
 * thousand lines of game state that this page needs none of, and an early return
 * cannot come before four thousand lines of hooks. It does its own theme,
 * language and emblem setup — about a dozen lines, all of it reading the same
 * keys `App` reads, so a grader's board looks like their board.
 */
export default function ProvingGround() {
  const [lang] = useState<Lang>(loadLang);
  const t: Translations = useMemo(() => {
    const table = translations[lang];
    return isGaelicLang(lang) ? toSeanchloTable(table) : table;
  }, [lang]);

  // The same preferences the app reads, applied once. Without this the page
  // renders in whatever the stylesheet defaults to, which is a different board
  // from the one the grader is used to — and an unfamiliar board is a variable
  // in an experiment that is trying to measure something else.
  useEffect(() => {
    applyTheme(loadTheme());
    applyPieceColors(loadPieceColors());
  }, []);
  const emblems: Emblems = useMemo(
    () => ({
      attackerEmblem: emblemById(loadAttackerEmblem()),
      kingEmblem: kingEmblemById(loadKingEmblem()),
      defenderEmblem: defenderEmblemById(loadDefenderEmblem()),
      cornerEmblem: cornerEmblemById(loadCornerEmblem()),
    }),
    [],
  );
  const sideLabel = useCallback(
    (s: Side) => (s === "attackers" ? t.raiders : t.kingsSide),
    [t],
  );

  // One ruleset, the one the bank was verified under. A **Puzzle** is invalid
  // under any other, so there is no variant picker here and there should not be.
  const rules = VARIANTS[DEFAULT_VARIANT];
  const bank = useMemo(() => loadBank(rules), [rules]);
  const byId = useMemo(() => new Map(bank.map((p) => [p.id, p])), [bank]);
  const anchorList = useMemo(() => anchors(bank), [bank]);

  const [session, setSession] = useState<Session | null>(loadSession);
  const [started, setStarted] = useState(false);
  const [grader, setGrader] = useState("");
  const [seed, setSeed] = useState("");
  const [size, setSize] = useState(60);

  // Per-puzzle state. `answers` is what the grader has said so far about the
  // puzzle on screen; `elapsed` is null until the Attempt ends, which is exactly
  // the moment the clock stops.
  const [phase, setPhase] = useState<"solving" | "answer" | "comparing">("solving");
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [solvedIt, setSolvedIt] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const startedAt = useRef<number>(Date.now());
  const [copied, setCopied] = useState(false);

  const order = useMemo(
    () => (session ? schedule(bank, session.seed, session.size) : []),
    [bank, session],
  );
  const index = session ? session.entries.length : 0;
  const current: Puzzle | null =
    session && index < order.length ? (byId.get(order[index]) ?? null) : null;
  const finished = session !== null && index >= order.length;

  // A new puzzle: clean state and a fresh clock. The clock starts when the
  // position mounts, which is a beat before the lead-in lands; that beat is the
  // same for every puzzle in a sitting, so it is a constant offset rather than a
  // difference between puzzles.
  useEffect(() => {
    setPhase("solving");
    setAnswers([]);
    setSolvedIt(false);
    setElapsed(null);
    startedAt.current = Date.now();
  }, [current?.id, index]);

  const onFinish = useCallback((_id: string, outcome: "solved" | "revealed") => {
    setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
    setSolvedIt(outcome === "solved");
    setPhase("answer");
  }, []);

  /** The answer has been read; the questions come next. An anchor has none, so
   *  it is recorded and passed straight over. */
  const afterAnswer = () => {
    if (isAnchorPosition(index)) commit([]);
    else setPhase("comparing");
  };

  const commit = (given: boolean[]) => {
    if (!session || !current) return;
    const entry: Entry = {
      puzzleId: current.id,
      seconds: elapsed ?? 0,
      solved: solvedIt,
      answers: given,
    };
    const next: Session = { ...session, entries: [...session.entries, entry] };
    setSession(next);
    saveSession(next);
  };

  const answer = (harder: boolean) => {
    const given = [...answers, harder];
    if (given.length >= COMPARISONS_PER_PUZZLE) commit(given);
    else setAnswers(given);
  };

  const begin = () => {
    const s: Session = {
      version: 1,
      grader: grader.trim() || "anon",
      seed: seed.trim() || "brandubh",
      size,
      entries: [],
    };
    setSession(s);
    saveSession(s);
    setStarted(true);
  };

  const blob = session ? encodeSession(session) : "";
  const tooLong = blob.length > MAILTO_CEILING;

  if (bank.length === 0) {
    return (
      <Shell t={t}>
        <p className="mt-4 text-sm text-parchment-dim">{t.provingUnavailable}</p>
      </Shell>
    );
  }

  // ── Arrival ─────────────────────────────────────────────────────────────────
  if (!session || (!started && session.entries.length === 0)) {
    return (
      <Shell t={t}>
        <p className="mt-3 text-sm text-parchment">{t.provingWhat}</p>
        <p className="mt-2 text-sm text-parchment-dim">{t.provingHow}</p>
        {/* Said plainly, so a later reader does not mistake the address for a
            lock. ADR-0004: the gate is a sign. */}
        <p className="mt-2 text-xs text-parchment-dim">{t.provingUnlisted}</p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>{t.provingGrader}</span>
            <input
              className={FIELD}
              value={grader}
              onChange={(e) => setGrader(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t.provingSeed}</span>
            <input
              className={FIELD}
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              autoComplete="off"
            />
            <span className="text-xs text-parchment-dim">{t.provingSeedHint}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t.provingSize}</span>
            <input
              className={FIELD}
              type="number"
              min={ANCHOR_COUNT}
              max={bank.length}
              value={size}
              onChange={(e) => setSize(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <button className="btn btn-primary" onClick={begin}>
            {t.provingStart}
          </button>
        </div>
      </Shell>
    );
  }

  // ── Resume ──────────────────────────────────────────────────────────────────
  if (!started && session.entries.length > 0 && !finished) {
    return (
      <Shell t={t}>
        <p className="mt-3 text-sm text-parchment">
          {session.grader} · {session.entries.length} {t.provingProgress} {order.length}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => setStarted(true)}>
            {t.provingResume}
          </button>
          <button
            className="btn"
            onClick={() => {
              clearSession();
              setSession(null);
            }}
          >
            {t.provingDiscard}
          </button>
        </div>
      </Shell>
    );
  }

  // ── Done: the two buttons, and nothing that sends by itself ─────────────────
  if (finished || !current) {
    const mail = `mailto:?subject=${encodeURIComponent(
      `Brandubh proving ground: ${session.grader}`,
    )}&body=${encodeURIComponent(blob)}`;
    return (
      <Shell t={t}>
        <p className="mt-3 text-sm text-parchment">{t.provingFinished}</p>
        <h2 className="mt-4 text-sm font-semibold text-parchment">{t.provingExportTitle}</h2>
        <p className="mt-1 text-xs text-parchment-dim">
          {blob.length} {t.provingBlobSize}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {/* Measured, not assumed. A mail client that truncates the URL would
              leave a JSON array that still parses, so the failure would be
              silent and would corrupt the fit; past the ceiling the button is
              not offered at all rather than offered with a warning. */}
          {!tooLong && (
            <a className="btn btn-primary" href={mail}>
              {t.provingMail}
            </a>
          )}
          <button
            className="btn"
            onClick={() => {
              void navigator.clipboard?.writeText(blob).then(() => setCopied(true));
            }}
          >
            {t.provingCopy}
          </button>
        </div>
        {tooLong && <p className="mt-2 text-sm text-parchment-dim">{t.provingTooLong}</p>}
        {copied && (
          <p className="mt-2 text-sm text-parchment-dim" role="status" aria-live="polite">
            {t.provingCopied}
          </p>
        )}
        <textarea
          className={`${FIELD} mt-3 h-28 font-mono text-xs`}
          readOnly
          value={blob}
          aria-label={t.provingExportTitle}
        />
        <button
          className="btn btn-sm mt-3"
          onClick={() => {
            clearSession();
            setSession(null);
            setStarted(false);
          }}
        >
          {t.provingRestart}
        </button>
      </Shell>
    );
  }

  // ── The protocol ────────────────────────────────────────────────────────────
  const askingAbout = nextAnchorIndex(answers);
  const anchor = askingAbout === null ? null : (anchorList[askingAbout] ?? null);
  const anchorPosition = anchor ? puzzleStart(anchor, rules) : null;

  return (
    <Shell t={t}>
      <p className="mt-2 text-xs text-parchment-dim">
        {session.grader} · {index + 1} {t.provingProgress} {order.length}
      </p>

      {phase !== "comparing" && (
        <BankPuzzlePlayer
          // **Keyed on the schedule position, not the puzzle.** A tenth of the
          // schedule is a puzzle already met, and the player resets off the
          // `puzzle` prop's identity — so a repeat handed back the same object
          // would keep the solved board and the finished Attempt, and the
          // re-test noise floor would measure nothing. The key also removes the
          // one-frame window in which a fresh puzzle is on screen beside the
          // previous puzzle's finished Attempt, which fired `onFinish`
          // spuriously and recorded a solve as a surrender in no time at all.
          key={index}
          t={t}
          puzzle={current}
          rules={rules}
          emblems={emblems}
          sideLabel={sideLabel}
          // No queue: Skip would let a puzzle be passed with no entry written,
          // and the blob is positional against the schedule, so a missing entry
          // is not a gap — it is every later entry attributed to the wrong
          // puzzle. There is no skip here on purpose.
          queue={null}
          // ADR-0005. The band is the label being calibrated.
          blind
          onSolved={() => {}}
          onFinish={onFinish}
          onNext={null}
          onExit={afterAnswer}
        />
      )}

      {phase === "comparing" && anchor && anchorPosition && (
        <section className="mt-4">
          <h2 className="text-sm font-semibold text-parchment">
            {t.provingCompare} ({answers.length + 1}/{COMPARISONS_PER_PUZZLE})
          </h2>
          <p className="mt-1 text-xs text-parchment-dim">{t.provingCompareHint}</p>
          <p className="mt-2 font-mono text-sm text-parchment-dim">
            <span className="sr-only">{t.provingAnchorLabel} </span>#{anchor.id}
          </p>
          {/* The anchor's position, small and dead. Shown because a comparison
              against a puzzle you cannot picture is noise, not a judgement; its
              *answer* is not shown, so the blinding the strict order buys is not
              handed back here. */}
          <div className="mx-auto mt-2 max-w-[16rem]">
            <Board
              board={anchorPosition.board}
              rules={rules}
              turn={anchorPosition.turn}
              selected={null}
              lastMove={null}
              fadingCaptures={[]}
              interactive={false}
              controllable={null}
              attackerEmblem={emblems.attackerEmblem}
              kingEmblem={emblems.kingEmblem}
              defenderEmblem={emblems.defenderEmblem}
              cornerEmblem={emblems.cornerEmblem}
              onSquareClick={() => {}}
            />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <button className="btn btn-primary" onClick={() => answer(true)}>
              {t.provingHarder}
            </button>
            <button className="btn" onClick={() => answer(false)}>
              {t.provingEasier}
            </button>
          </div>
        </section>
      )}
    </Shell>
  );
}

/** The page's chrome. No header, no drawer, no menu: this is an instrument, and
 *  every control on it that is not part of the protocol is a way to leave the
 *  protocol. */
function Shell({ t, children }: { t: Translations; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-4 pb-16 pt-4 sm:max-w-lg">
      <h1 className="text-lg font-semibold text-parchment">{t.provingTitle}</h1>
      {children}
    </div>
  );
}
