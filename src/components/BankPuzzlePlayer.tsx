import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board, { Emblem } from "./Board";
import type { Emblems } from "./ObjectivesContent";
import type { Translations } from "../i18n";
import { applyMove, isGameOver, movesFrom, sideOf } from "../game/engine";
import { parsePosition, stateFromBoard } from "../game/position";
import { isFinished, judge, retryStep, type Attempt, type LineStep } from "../game/attempt";
import { completionNote } from "../game/completionNote";
import { puzzleStart, solverSide, type Puzzle } from "../game/puzzleBank";
import type { GameState, Move, Side, Square } from "../game/types";
import type { RuleSet } from "../game/variants";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

/** How long the board rests before a move that was not the learner's plays.
 *  Reduced motion keeps the beat and shortens it to nearly nothing: the
 *  position still changes in two steps, it just does not linger. */
const beat = (reduced: boolean): number => (reduced ? 60 : 620);

/** How long a wrong guess stays on the board before it is bounced back —
 *  lichess's revert. Long enough to see what the move does and the ✗ it earned,
 *  short enough that the bounce reads as a verdict rather than a freeze. */
const bounce = (reduced: boolean): number => (reduced ? 120 : 800);

/**
 * What the feedback strip says while a guess is outstanding. Deliberately a
 * separate track from the Attempt's stage: a wrong guess is bounced back
 * automatically, which returns the Attempt to `guessing`, but the strip keeps
 * saying "that's not the move" until the next guess — exactly lichess's fail
 * state, which outlives the reverted move.
 */
type Feedback = "start" | "good" | "wrong";

/**
 * What is held: the board history, the index of the position at the start of the
 * current **Step**, and the **Attempt**.
 *
 * One object rather than three `useState`s, so a guess and the rewind point it
 * establishes can never land half apart.
 */
interface Live {
  states: GameState[];
  anchor: number;
  attempt: Attempt;
}

/**
 * One bank **Puzzle**, played — lichess-style.
 *
 * **Deliberately thin, and its props are a contract.** 8e's proving ground
 * mounts this same component for a puzzle nobody has seen before, so anything
 * decided in here is decided twice — which is the reason there is almost nothing
 * to decide in here. It holds the board states and an **Attempt**, plays the
 * lead-in on open, hands every guess to `judge()` and applies whatever comes
 * back in `play`, and renders `Board` + the feedback strip. Every judgement
 * worth testing already lives in `attempt.ts`, where the suites can reach it;
 * the project tests no components, so a state machine put here would be a state
 * machine nobody tests.
 *
 * ## The lichess loop
 *
 * A wrong guess is played so it can be seen, wears an ✗ for a beat, and is then
 * bounced back automatically — wiped from the board, never kept, exactly as
 * lichess reverts a failed try. There is no "try again" button because trying
 * again is not a choice, it is what the exercise *is*; the only offers while a
 * guess is outstanding are the next guess and *view the solution*. A finished
 * puzzle offers *retry* and *continue*.
 *
 * ## Why the anchor exists
 *
 * `states` is the board history from the position *before* the lead-in, and
 * `anchor` indexes the position at the start of the current **Step**. That pair
 * is what the bounce needs and `retryStep` cannot supply: the Attempt's cursor
 * does not move on a wrong guess, so someone who has found three moves has
 * found them, and the board has to be put back to where the fourth was asked —
 * with the first three still on it. `attempt.ts` says outright that rewinding
 * is the caller's job, because review rewinds differently.
 *
 * ## Re-presenting the same puzzle
 *
 * The reset runs off the `puzzle` prop's identity plus a local *occasion*
 * counter (Retry bumps it), so handing back the *same* `Puzzle` object resets
 * nothing — the board keeps the solved position and the finished Attempt. That
 * is right for the Learn screen, where a puzzle is only ever swapped for a
 * different one, and wrong for the proving ground, whose schedule slips a
 * puzzle back in silently to measure the re-test noise floor. A caller that can
 * re-present a puzzle must give this component a `key` that changes with the
 * *occasion* rather than with the puzzle, and the proving ground keys on the
 * schedule position for exactly that reason.
 *
 * ## Where none of it goes
 *
 * Nowhere. Bank puzzle positions live here and are never persisted or exported,
 * exactly as tutorial set plays are not: `persist.ts` and `gameFile.ts` replay a
 * move list from `initialState()`, and threading a custom starting board through
 * them is the replay-from-opening invariant broken. The only thing about a bank
 * puzzle that survives the screen is its id, written by whoever holds `onSolved`.
 *
 * `onPlay` is the one exception, and it does not weaken that. It hands the
 * finished position *out* to whoever mounted this, to be played on as a game;
 * the game that results still has no move list from the opening, so App keeps it
 * out of the save and the export the same way (`positionRoot` in analysis.ts).
 * Nothing about the puzzle is written anywhere by this component either way.
 */
export default function BankPuzzlePlayer({
  t,
  puzzle,
  rules,
  emblems,
  sideLabel,
  queue,
  blind = false,
  showMeta = true,
  onSolved,
  onFinish,
  onPlay,
  onNext,
  onExit,
}: {
  t: Translations;
  puzzle: Puzzle;
  /** The ruleset the puzzle was verified under. A **Puzzle** belongs to exactly
   *  one **Ruleset** and is invalid under any other, so the caller is
   *  responsible for having gated on `bankRulesMatch` before mounting this. */
  rules: RuleSet;
  emblems: Emblems;
  sideLabel: (side: Side) => string;
  /**
   * Where this puzzle sits in whatever list the caller is walking, so the strip
   * can offer Retry and Continue through the queue. Null when there is no list —
   * 8e shows one puzzle at a time — and Retry is then not offered either, since
   * a re-presented puzzle would corrupt the timing record.
   */
  queue: { index: number; total: number } | null;
  /**
   * Hide the **Band**. Off by default, so the Learn screen is unchanged.
   *
   * The proving ground sets it, and has to: the band is the label being
   * calibrated, and printing it above a position a grader is about to judge is
   * the same displaced-centre failure ADR-0005's whole protocol exists to
   * prevent. Only this one line is hidden — the **Puzzle number** stays, because
   * the comparison questions name puzzles by it.
   */
  blind?: boolean;
  /** Hide the `#id` / band line above the board. The full-screen puzzle view
   *  carries both in its own header, and saying them twice is noise; the
   *  proving ground keeps the default, because its comparisons name puzzles by
   *  the number this line shows. */
  showMeta?: boolean;
  /** Fired once, the first time the Attempt reaches `solved` *without the
   *  solution having been shown this visit*. The Learn screen writes the ledger
   *  with it; a caller that keeps no ledger passes a no-op. A solve on a retry
   *  after *view the solution* is practice, not a solve, and is not reported. */
  onSolved: (id: string) => void;
  /**
   * Fired once, the first time the Attempt *finishes* — solved or revealed.
   *
   * `onSolved` is not enough for a caller that is timing the attempt, because a
   * surrender is an ending too and it is the ending that produces the longest
   * times. Distinct from `onExit`, which is the learner pressing a button after
   * reading the note: the clock has to stop when the exercise stops, not when
   * they finish reading about it. Fired once per *puzzle*, never re-armed by
   * Retry, so a timing caller's record cannot be overwritten by practice.
   *
   * `wrongGuesses` is the Attempt's count of bounced guesses, so the trainer
   * can tell a clean solve from a late one — lichess's rule, where the first
   * wrong move fails the puzzle for scoring even if it is solved afterwards.
   */
  onFinish?: (id: string, outcome: "solved" | "revealed", wrongGuesses: number) => void;
  /**
   * Play the finished position on as a real game. Omitted where that makes no
   * sense — the proving ground is timing an attempt and collects nothing
   * (ADR-0004), so leaving the screen mid-schedule is not on offer there.
   *
   * `humanSide` is the side the person keeps; null means over the board. The
   * caller is handed the board and the side and decides everything else.
   */
  onPlay?: (position: GameState, humanSide: Side | null) => void;
  /** The next puzzle in the caller's list; null when there is none. */
  onNext: (() => void) | null;
  onExit: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const timers = useRef<number[]>([]);
  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const mover = solverSide(puzzle);

  // The two positions a puzzle is built from: what was on the board before the
  // opponent's lead-in, and what the learner is actually asked about. Storing
  // the lead-in is what makes a puzzle arrive as a position someone just moved
  // into rather than as a diagram, so it is played and not skipped.
  const opening = useMemo(() => {
    const parsed = parsePosition(puzzle.position);
    return { before: parsed.ok ? parsed.state : null, after: puzzleStart(puzzle, rules) };
  }, [puzzle, rules]);

  const [live, setLive] = useState<Live>(() => freshLive(puzzle, opening, mover));
  const [fadingCaptures, setFadingCaptures] = useState<Square[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [feedback, setFeedback] = useState<Feedback>("start");
  // The ✓/✗ roundel on the square the guess landed on. Cleared when the wrong
  // move bounces back, or when the scripted reply lands; a solving move keeps
  // its ✓, which is the picture "Success!" sits beside.
  const [verdict, setVerdict] = useState<{ square: Square; ok: boolean } | null>(null);
  // Retry bumps this to re-present the same puzzle from its opening position.
  const [occasion, setOccasion] = useState(0);
  // Who the finished position would be played on against. Vs the computer
  // unless asked otherwise: a puzzle is solved alone, so the person who has
  // just finished one is on their own at the screen until they say they are not.
  const [vsComputer, setVsComputer] = useState(true);
  const solvedFired = useRef(false);
  const finishFired = useRef(false);
  // Whether *view the solution* has been taken this visit. Survives Retry on
  // purpose: solving a puzzle you have just been shown is practice, and the
  // ledger records solves, not practice.
  const revealedEver = useRef(false);

  const flash = useCallback((s: GameState) => {
    const caps = s.history[s.history.length - 1]?.move.captures ?? [];
    if (!caps.length) return;
    setFadingCaptures(caps);
    timers.current.push(window.setTimeout(() => setFadingCaptures([]), 340));
  }, []);

  // A change of *puzzle* forgets everything, including what was fired for the
  // previous one. Declared before the presentation reset so both run in this
  // order on a puzzle change; a Retry (occasion bump) re-runs only the reset,
  // so the fired guards and the reveal record survive it — see `onSolved`.
  useEffect(() => {
    solvedFired.current = false;
    finishFired.current = false;
    revealedEver.current = false;
  }, [puzzle]);

  // A fresh presentation starts clean, and plays its lead-in after a beat so
  // the move reads as a move rather than as the board's first state.
  useEffect(() => {
    clearTimers();
    setSelected(null);
    setFadingCaptures([]);
    setFeedback("start");
    setVerdict(null);
    const fresh = freshLive(puzzle, opening, mover);
    setLive(fresh);
    const after = opening.after;
    if (fresh.anchor === 0 || !after) return; // nothing to play; already on
    timers.current.push(
      window.setTimeout(() => {
        setLive((l) => (l.states.length === 1 ? { ...l, states: [...l.states, after] } : l));
        flash(after);
      }, beat(reduced)),
    );
  }, [puzzle, opening, mover, reduced, flash, occasion]);

  // The attempt has ended, however it ended. Watched here rather than announced
  // from `handleMove`, because `reveal` sets the stage directly and a surrender
  // is the ending a timing caller most needs told about.
  useEffect(() => {
    if (!onFinish || finishFired.current || !isFinished(live.attempt)) return;
    finishFired.current = true;
    onFinish(
      puzzle.id,
      live.attempt.stage === "solved" ? "solved" : "revealed",
      live.attempt.attempts,
    );
  }, [live.attempt, onFinish, puzzle.id]);

  /** True once the lead-in is on the board. Before that there is nothing to
   *  guess at, because the position being asked about is not on screen yet. */
  const opened = live.states.length > live.anchor;
  const board = live.states[live.states.length - 1];

  /** The **Step** the Attempt's cursor is on, in the shape the judge wants. A
   *  **Line** alternates solver move and scripted reply and ends on a solver
   *  move, so step *n* answers `line[2n]` and is replied to by `line[2n+1]`. */
  const stepAt = (step: number): { line: LineStep; isLast: boolean } => ({
    line: {
      // Exactly one accepted move, by ADR-0001: the generator filters for a
      // uniquely-best solving move, so the set the judge sees is a singleton by
      // construction rather than by a second, laxer acceptance rule.
      accepted: puzzle.line[step * 2] ? [puzzle.line[step * 2]] : null,
      reply: puzzle.line[step * 2 + 1] ?? null,
    },
    isLast: step * 2 >= puzzle.line.length - 1,
  });

  const handleMove = (move: Move) => {
    setSelected(null);
    const { line, isLast } = stepAt(live.attempt.step);
    const { attempt, play } = judge(live.attempt, move, line, isLast);
    // `play` is the judge's and is questioned nowhere: a wrong guess is played
    // so it can be seen, a correct last step ends on it, and a correct middle
    // step carries the scripted reply behind it.
    const first = applyMove(board, play[0], rules);
    const second = play[1] ? applyMove(first, play[1], rules) : null;
    flash(first);
    setVerdict({ square: play[0].to, ok: attempt.stage !== "wrong" });

    if (attempt.stage === "wrong") {
      // The lichess fail: the guess is on the board just long enough to see
      // what it does and the ✗ it earned, then it is bounced back — wiped, not
      // kept — and the same step is asked again. The strip keeps saying so
      // (`feedback` stays "wrong") until the next guess.
      setFeedback("wrong");
      setLive({ states: [...live.states, first], anchor: live.anchor, attempt });
      timers.current.push(
        window.setTimeout(() => {
          setFadingCaptures([]);
          setVerdict(null);
          setLive((l) => ({
            ...l,
            states: l.states.slice(0, l.anchor + 1),
            attempt: retryStep(l.attempt),
          }));
        }, bounce(reduced)),
      );
      return;
    }

    if (attempt.stage === "guessing") setFeedback("good");
    setLive({
      states: [...live.states, first],
      // A correct middle step re-anchors only once its reply has landed, so a
      // rewind during the reply cannot strand the board mid-exchange. A solved
      // last step leaves the anchor where it was.
      anchor: attempt.step > live.attempt.step && !second ? live.states.length : live.anchor,
      attempt,
    });
    if (second) {
      timers.current.push(
        window.setTimeout(() => {
          setVerdict(null);
          setLive((l) => ({ ...l, states: [...l.states, second], anchor: l.states.length }));
          flash(second);
        }, beat(reduced)),
      );
    }
    if (attempt.stage === "solved" && !solvedFired.current && !revealedEver.current) {
      solvedFired.current = true;
      onSolved(puzzle.id);
    }
  };

  /** Show it: back to the step's position, then the rest of the **Line** on the
   *  board. A legitimate way to finish and not a lesser one — someone stuck
   *  learns nothing from being made to guess again. */
  const reveal = () => {
    clearTimers();
    setFadingCaptures([]);
    setSelected(null);
    setVerdict(null);
    revealedEver.current = true;
    setLive((l) => {
      // **The lead-in may not be on the board yet.** *See it* is offered from
      // the moment the puzzle mounts, and the lead-in lands a beat later, so
      // anyone who takes the offer inside that beat asks to rewind to a position
      // the history does not hold — `states` has one entry and `anchor` is 1.
      // Reading past the end threw, and the proving ground finds it every time
      // because surrendering immediately is a legitimate answer there. The
      // pending lead-in has just been cancelled by `clearTimers`, so it is
      // played here instead.
      const states =
        l.states.length > l.anchor || !opening.after ? l.states : [...l.states, opening.after];
      let at = states[l.anchor];
      // A stored position that will not parse is a generator bug the suite
      // catches, not something a screen has to render; leave the board alone.
      if (!at) return l;
      const played = states.slice(0, l.anchor + 1);
      for (const m of puzzle.line.slice(l.attempt.step * 2)) {
        if (isGameOver(at.status)) break;
        at = applyMove(at, m, rules);
        played.push(at);
      }
      return { ...l, states: played, attempt: { ...l.attempt, stage: "revealed" } };
    });
  };

  /** The same puzzle again, from the top — lichess's Retry. The Attempt starts
   *  over but the fired guards do not, so a caller's ledger and timing record
   *  see one puzzle once however many times it is replayed. */
  const retry = () => {
    clearTimers();
    setOccasion((n) => n + 1);
  };

  /**
   * The completion note, computed from the **Line** and not from the board.
   *
   * Deliberately not "the position on screen": that would differ between a
   * puzzle solved and the same puzzle revealed, and — worse — between a
   * **Truncated** line and a whole one. The note is a property of the puzzle,
   * which is why `completionNote` is handed the two ends of the line rather than
   * whatever happens to be rendered.
   */
  const note = useMemo(() => {
    const start = opening.after;
    if (!start) return null;
    let end = start;
    for (const m of puzzle.line) {
      if (isGameOver(end.status)) break;
      end = applyMove(end, m, rules);
    }
    return completionNote(puzzle, start, end, mover);
  }, [puzzle, opening, rules, mover]);

  // The lookup, and only the lookup: `completionNote` chose the layer and the
  // row. A motif the copy has no line for falls back to nothing rather than
  // showing a bare identifier — 8c owns the motif vocabulary and may outrun
  // this table.
  const noteText = !note
    ? null
    : note.layer === "motif"
      ? (t.puzzleNoteMotifs[note.key] ?? t.puzzleNoteGoals[note.key] ?? null)
      : note.layer === "term"
        ? (t.puzzleNoteTerms[note.key] ?? null)
        : (t.puzzleNoteGoals[note.key] ?? null);

  // A guess is taken only while one is outstanding *and* the position being
  // asked about is the one on screen. During the bounce the board shows the
  // wrong guess, not the question, and the Attempt sits at `wrong` for exactly
  // that window — so this gate closes itself and reopens when the board is put
  // back, with no button in between.
  const interactive = opened && live.attempt.stage === "guessing" && !isGameOver(board.status);

  const onSquareClick = (sq: Square) => {
    if (!interactive) return;
    const mine = sideOf(board.board[sq.row][sq.col]) === board.turn;
    if (selected) {
      const legal = movesFrom(board.board, selected.row, selected.col, rules).some(
        (to) => to.row === sq.row && to.col === sq.col,
      );
      if (legal) {
        handleMove({ from: selected, to: sq });
        return;
      }
      setSelected(mine ? sq : null);
      return;
    }
    if (mine) setSelected(sq);
  };

  const lastMove: Move | null = board.history.length
    ? board.history[board.history.length - 1].move
    : null;

  /**
   * Play the finished position on as a real game — the answer to "and then
   * what?", which is the question a **Truncated** line leaves hanging by
   * design: it stops at the deciding move and tells you nothing about the
   * twenty plies of technique after it (ADR-0002). This is where you go and
   * find out, against an opponent that will not co-operate.
   *
   * Offered only where there is still a game in the position. A line that ended
   * the game leaves nothing to play on, and the board has already said so
   * itself — the king is standing in a corner, or he is gone from it — so the
   * offer's absence discloses nothing the picture did not. ADR-0002's
   * indistinguishability survives that: a truncated line and a short decisive
   * one both end on a board that is still playing, so both carry the offer.
   */
  const canPlayOn = onPlay !== undefined && isFinished(live.attempt) && !isGameOver(board.status);

  const playOn = () => {
    if (!onPlay || !canPlayOn) return;
    // Handed over as a *position*, history dropped — which is the honest shape
    // for it. The moves on this board are the puzzle's, not the new game's, and
    // a game that inherited them would count them towards repetition and list
    // them in its own move log as though someone had played them there.
    //
    // The solver keeps the side they solved as, so it is the opponent's move:
    // you found the move, now beat the reply. Over the board (`null`) both
    // sides are handed back and nobody replies.
    onPlay(stateFromBoard(board.board, board.turn), vsComputer ? mover : null);
  };

  // ── The feedback strip — lichess's band under the board ─────────────────────
  // One glyph, a headline, a hint. The stage owns the finished states; the
  // `feedback` track owns what is said while a guess is outstanding, because a
  // bounced-back wrong guess returns the stage to `guessing` while the strip
  // must go on saying what just happened.
  const stage = live.attempt.stage;
  const finished = isFinished(live.attempt);
  const failing = stage === "wrong" || (stage === "guessing" && feedback === "wrong");
  let tone: "" | "is-wrong" | "is-right" = "";
  let glyph: string | null = null;
  let title: string;
  let sub: string | null = null;
  if (stage === "solved") {
    tone = "is-right";
    glyph = "✓";
    title = t.puzzleSuccess;
    sub = noteText ?? (live.attempt.attempts > 0 ? t.puzzleSolvedLate : null);
  } else if (stage === "revealed") {
    glyph = "✓";
    title = t.puzzleRevealed;
    sub = noteText;
  } else if (failing) {
    tone = "is-wrong";
    glyph = "✗";
    title = t.puzzleNotTheMove;
  } else if (feedback === "good") {
    tone = "is-right";
    glyph = "✓";
    title = t.puzzleBestMove;
    sub = t.puzzleKeepGoing;
  } else {
    title = t.puzzleYourTurn;
    sub = `${t.puzzleFindMove} · ${sideLabel(mover)}`;
  }

  return (
    <div>
      {showMeta && (
        <p className="mt-3 flex items-baseline justify-between gap-3 text-sm text-parchment-dim">
          <span className="font-mono">
            <span className="sr-only">{t.learnPuzzleLabel} </span>#{puzzle.id}
          </span>
          {/* The band is the thing being calibrated, so the proving ground turns
              it off. Everywhere else it is the one piece of context worth having
              before you start. */}
          {!blind && <span>{t[puzzle.band]}</span>}
        </p>
      )}

      <div className="tutorial-board mt-3">
        <Board
          board={board.board}
          rules={rules}
          turn={board.turn}
          selected={selected}
          lastMove={lastMove}
          fadingCaptures={fadingCaptures}
          interactive={interactive}
          controllable={mover}
          attackerEmblem={emblems.attackerEmblem}
          kingEmblem={emblems.kingEmblem}
          defenderEmblem={emblems.defenderEmblem}
          cornerEmblem={emblems.cornerEmblem}
          verdict={verdict}
          onSquareClick={onSquareClick}
        />
      </div>

      <section className={`puzzle-feed mt-3 ${tone}`}>
        <span className="puzzle-feed-glyph" aria-hidden>
          {glyph ?? (
            // The opening state shows whose move it is, as lichess shows the
            // side-to-move piece: the solver's own emblem, in its side's colour.
            <span
              className={`puzzle-feed-emblem ${mover === "attackers" ? "text-blood" : "text-gold"}`}
            >
              <Emblem
                piece={mover === "attackers" ? "attacker" : "king"}
                attackerEmblem={emblems.attackerEmblem}
                kingEmblem={emblems.kingEmblem}
                defenderEmblem={emblems.defenderEmblem}
              />
            </span>
          )}
        </span>
        {/* The live region is the reading matter, never the offers: what has to
            be spoken unasked is what just happened, and the buttons announce
            themselves when they are reached. */}
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <p className="puzzle-feed-title">{title}</p>
          {sub && <p className="puzzle-feed-sub">{sub}</p>}
        </div>
      </section>

      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {!finished && (
          <button className="btn btn-sm" onClick={reveal}>
            {t.puzzleReveal}
          </button>
        )}
        {finished && (
          <>
            {/* No Retry with no queue: the proving ground times one attempt per
                schedule slot, and a re-presented board would corrupt it. */}
            {queue !== null && (
              <button className="btn btn-sm" onClick={retry}>
                {t.puzzleRetry}
              </button>
            )}
            {onNext ? (
              <button className="btn btn-sm btn-primary" onClick={onNext}>
                {t.puzzleContinue}
              </button>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={onExit}>
                {t.puzzleDone}
              </button>
            )}
          </>
        )}
      </div>

      {/* Play it on. Below the row above and never the primary button: the
          trainer's own loop is the next puzzle, and this is the door out of it
          for someone who wants to finish this one properly. */}
      {canPlayOn && (
        <div className="mt-3 border-t border-parchment/10 pt-3" data-testid="puzzle-play-on">
          <div className="choice-block">
            <p className="choice-label">{t.puzzlePlayOnLabel}</p>
            <div className="choice">
              <button
                type="button"
                className={vsComputer ? "on" : ""}
                aria-pressed={vsComputer}
                onClick={() => setVsComputer(true)}
              >
                {t.playVsAi}
              </button>
              <button
                type="button"
                className={vsComputer ? "" : "on"}
                aria-pressed={!vsComputer}
                onClick={() => setVsComputer(false)}
              >
                {t.overTheBoard}
              </button>
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button className="btn btn-sm" onClick={playOn}>
              {t.playFromHere}
            </button>
          </div>
          <p className="mt-2 text-xs text-parchment-dim">{t.puzzlePlayOnHint}</p>
        </div>
      )}
    </div>
  );
}

/** A fresh Attempt on a fresh board. `states` opens on the position *before* the
 *  lead-in so the lead-in has somewhere to be played from; a stored position that
 *  will not parse — a generator bug the suite catches, not something a screen has
 *  to handle — opens on the puzzle itself rather than on nothing. */
function freshLive(
  puzzle: Puzzle,
  opening: { before: GameState | null; after: GameState | null },
  mover: Side,
): Live {
  const both = opening.before !== null && opening.after !== null;
  return {
    states: both ? [opening.before!] : [(opening.after ?? opening.before)!],
    anchor: both ? 1 : 0,
    attempt: {
      source: { kind: "bank", puzzleId: puzzle.id },
      mover,
      stage: "guessing",
      step: 0,
      attempts: 0,
    },
  };
}
