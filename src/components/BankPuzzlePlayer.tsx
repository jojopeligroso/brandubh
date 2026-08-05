import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "./Board";
import PuzzlePanel from "./PuzzlePanel";
import type { Emblems } from "./ObjectivesContent";
import type { Translations } from "../i18n";
import { applyMove, isGameOver, movesFrom, sideOf } from "../game/engine";
import { parsePosition } from "../game/position";
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
 * One bank **Puzzle**, played.
 *
 * **Deliberately thin, and its props are a contract.** 8e's proving ground
 * mounts this same component for a puzzle nobody has seen before, so anything
 * decided in here is decided twice — which is the reason there is almost nothing
 * to decide in here. It holds the board states and an **Attempt**, plays the
 * lead-in on open, hands every guess to `judge()` and applies whatever comes
 * back in `play`, and renders `Board` + `PuzzlePanel`. Every judgement worth
 * testing already lives in `attempt.ts`, where the suites can reach it; the
 * project tests no components, so a state machine put here would be a state
 * machine nobody tests.
 *
 * ## Why the anchor exists
 *
 * `states` is the board history from the position *before* the lead-in, and
 * `anchor` indexes the position at the start of the current **Step**. That pair
 * is what `retryStep` needs and cannot supply: the Attempt's cursor does not
 * move on a wrong guess, so someone who has found three moves has found them,
 * and the board has to be put back to where the fourth was asked — with the
 * first three still on it. `attempt.ts` says outright that rewinding is the
 * caller's job, because review rewinds differently.
 *
 * ## Where none of it goes
 *
 * Nowhere. Bank puzzle positions live here and are never persisted or exported,
 * exactly as tutorial set plays are not: `persist.ts` and `gameFile.ts` replay a
 * move list from `initialState()`, and threading a custom starting board through
 * them is the replay-from-opening invariant broken. The only thing about a bank
 * puzzle that survives the screen is its id, written by whoever holds `onSolved`.
 */
export default function BankPuzzlePlayer({
  t,
  puzzle,
  rules,
  emblems,
  sideLabel,
  queue,
  onSolved,
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
   * Where this puzzle sits in whatever list the caller is walking, so the panel
   * can show "3/106" and offer Skip. Null when there is no list — 8e shows one
   * puzzle at a time — and Skip is then not offered.
   */
  queue: { index: number; total: number } | null;
  /** Fired once, the first time the Attempt reaches `solved`. The Learn screen
   *  writes the ledger with it; a caller that keeps no ledger passes a no-op. */
  onSolved: (id: string) => void;
  /** The next puzzle in the caller's list; null when there is none. Also what
   *  Skip does, because skipping is moving on without answering. */
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
  const solvedFired = useRef(false);

  const flash = useCallback((s: GameState) => {
    const caps = s.history[s.history.length - 1]?.move.captures ?? [];
    if (!caps.length) return;
    setFadingCaptures(caps);
    timers.current.push(window.setTimeout(() => setFadingCaptures([]), 340));
  }, []);

  // A new puzzle starts clean, and plays its lead-in after a beat so the move
  // reads as a move rather than as the board's first state.
  useEffect(() => {
    clearTimers();
    solvedFired.current = false;
    setSelected(null);
    setFadingCaptures([]);
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
  }, [puzzle, opening, mover, reduced, flash]);

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
    setLive({
      states: [...live.states, first],
      // A correct middle step re-anchors only once its reply has landed, so a
      // rewind during the reply cannot strand the board mid-exchange. A wrong
      // guess and a solved last step both leave the anchor where it was.
      anchor: attempt.step > live.attempt.step && !second ? live.states.length : live.anchor,
      attempt,
    });
    if (second) {
      timers.current.push(
        window.setTimeout(() => {
          setLive((l) => ({ ...l, states: [...l.states, second], anchor: l.states.length }));
          flash(second);
        }, beat(reduced)),
      );
    }
    if (attempt.stage === "solved" && !solvedFired.current) {
      solvedFired.current = true;
      onSolved(puzzle.id);
    }
  };

  const tryAgain = () => {
    clearTimers();
    setFadingCaptures([]);
    setSelected(null);
    setLive((l) => ({
      ...l,
      states: l.states.slice(0, l.anchor + 1),
      attempt: retryStep(l.attempt),
    }));
  };

  /** Show it: back to the step's position, then the rest of the **Line** on the
   *  board. A legitimate way to finish and not a lesser one — someone stuck
   *  learns nothing from being made to guess again. */
  const reveal = () => {
    clearTimers();
    setFadingCaptures([]);
    setSelected(null);
    setLive((l) => {
      let at = l.states[l.anchor];
      const played = l.states.slice(0, l.anchor + 1);
      for (const m of puzzle.line.slice(l.attempt.step * 2)) {
        if (isGameOver(at.status)) break;
        at = applyMove(at, m, rules);
        played.push(at);
      }
      return { ...l, states: played, attempt: { ...l.attempt, stage: "revealed" } };
    });
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
  // asked about is the one on screen. After a wrong guess the board shows the
  // guess, not the question, so the way back is the panel's *try again* rather
  // than another move played onto a position nobody was asked about.
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

  return (
    <div>
      <p className="mt-3 flex items-baseline justify-between gap-3 text-sm text-parchment-dim">
        <span className="font-mono">
          <span className="sr-only">{t.learnPuzzleLabel} </span>#{puzzle.id}
        </span>
        <span>{t[puzzle.band]}</span>
      </p>

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
          onSquareClick={onSquareClick}
        />
      </div>

      <PuzzlePanel
        t={t}
        attempt={live.attempt}
        sideLabel={sideLabel}
        // The bank's answer is stored, so unlike a Review Mistake there is never
        // a search to wait for and never a guess that cannot be judged.
        waiting={false}
        prompt={t.puzzleFindMove}
        lesson={queue}
        onTryAgain={tryAgain}
        onReveal={reveal}
        onSkip={onNext ?? onExit}
        onNext={onNext ?? onExit}
        onExit={onExit}
      />

      {/* The region is always mounted and only its contents come and go. It
          used to carry `role="status"` on the note itself, which meant the live
          region and the text it was to announce arrived in the same commit —
          and a live region inserted together with its content is announced by
          some screen readers and silently skipped by others. An empty div
          occupies nothing; the margin moved onto the note, so the screen is
          unchanged. */}
      <div role="status" aria-live="polite">
        {isFinished(live.attempt) && noteText && (
          <p className="puzzle-note mt-2 text-sm text-parchment-dim">{noteText}</p>
        )}
      </div>
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
