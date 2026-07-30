import { useCallback, useEffect, useRef, useState } from "react";
import Board from "./Board";
import type { Emblems } from "./ObjectivesContent";
import type { Translations } from "../i18n";
import { applyMove, isGameOver, movesFrom, sideOf } from "../game/engine";
import type { GameState, Move, Square } from "../game/types";
import {
  isAcceptedMove,
  rulesForScenario,
  stateFor,
  type TutorialScenario,
} from "../game/tutorials";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

type Phase = "playing" | "wrong" | "replying" | "solved";

/**
 * One tutorial set play: a hand-built position on the real board, driven by
 * the real engine. The learner must find the scenario's move; a wrong (but
 * legal) move is refused with a nudge rather than played. State lives only
 * here — tutorial games are never persisted or exported.
 */
export default function TutorialPlayer({
  scenario,
  t,
  emblems,
  onSolved,
  onNext,
}: {
  scenario: TutorialScenario;
  t: Translations;
  emblems: Emblems;
  onSolved: (id: string) => void;
  /** Advance to the next drill; null on the last one. */
  onNext: (() => void) | null;
}) {
  const rules = rulesForScenario(scenario);
  const reduced = usePrefersReducedMotion();
  const [game, setGame] = useState<GameState>(() => stateFor(scenario));
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("playing");
  const [selected, setSelected] = useState<Square | null>(null);
  const [fadingCaptures, setFadingCaptures] = useState<Square[]>([]);
  const [showHint, setShowHint] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const reset = useCallback(() => {
    clearTimers();
    setGame(stateFor(scenario));
    setStepIndex(0);
    setPhase("playing");
    setSelected(null);
    setFadingCaptures([]);
    setShowHint(false);
  }, [scenario]);

  // A new scenario starts clean.
  useEffect(() => {
    reset();
  }, [reset]);

  const flashCaptures = (s: GameState) => {
    const caps = s.history[s.history.length - 1]?.move.captures ?? [];
    if (!caps.length) return;
    setFadingCaptures(caps);
    timers.current.push(window.setTimeout(() => setFadingCaptures([]), 340));
  };

  const handleMove = (move: Move) => {
    setSelected(null);
    if (!isAcceptedMove(scenario, stepIndex, game, move, rules)) {
      setPhase("wrong");
      return;
    }
    const next = applyMove(game, move, rules);
    setGame(next);
    flashCaptures(next);
    if (stepIndex === scenario.steps.length - 1) {
      setPhase("solved");
      onSolved(scenario.id);
      return;
    }
    // Scripted riposte, after a beat so the learner's move reads first.
    const reply = scenario.steps[stepIndex].reply;
    setPhase("replying");
    timers.current.push(
      window.setTimeout(
        () => {
          if (reply) {
            setGame((g) => {
              const after = applyMove(g, reply, rules);
              flashCaptures(after);
              return after;
            });
          }
          setStepIndex((i) => i + 1);
          setPhase("playing");
        },
        reduced ? 80 : 700,
      ),
    );
  };

  const interactive =
    phase === "playing" && game.turn === scenario.side && !isGameOver(game.status);

  const onSquareClick = (sq: Square) => {
    if (!interactive) return;
    const mine = sideOf(game.board[sq.row][sq.col]) === game.turn;
    if (selected) {
      const legal = movesFrom(game.board, selected.row, selected.col, rules).some(
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

  const lastMove: Move | null = game.history.length
    ? game.history[game.history.length - 1].move
    : null;
  const sideName = scenario.side === "attackers" ? t.raiders : t.kingsSide;

  return (
    <div>
      <p className="mt-3 text-sm text-parchment">
        <span className="text-parchment-dim">{t.tutorialYouPlayAs}</span>{" "}
        <b className={scenario.side === "attackers" ? "text-blood" : "text-gold"}>{sideName}</b>
        <span className="text-parchment-dim"> · {t.tutorialGoals[scenario.id]}</span>
      </p>

      <div className="tutorial-board mt-3">
        <Board
          board={game.board}
          rules={rules}
          turn={game.turn}
          selected={selected}
          lastMove={lastMove}
          fadingCaptures={fadingCaptures}
          interactive={interactive}
          controllable={scenario.side}
          attackerEmblem={emblems.attackerEmblem}
          kingEmblem={emblems.kingEmblem}
          defenderEmblem={emblems.defenderEmblem}
          cornerEmblem={emblems.cornerEmblem}
          onSquareClick={onSquareClick}
        />
      </div>

      <div className="mt-3 min-h-16">
        {phase === "solved" ? (
          <div className="space-y-3 text-center">
            <p className="font-display text-xl text-gold">{t.tutorialSolvedTitle}</p>
            <div className="flex justify-center gap-2">
              <button className="btn" onClick={reset}>
                {t.tutorialReset}
              </button>
              {onNext && (
                <button className="btn btn-primary" onClick={onNext}>
                  {t.tutorialNext}
                </button>
              )}
            </div>
          </div>
        ) : phase === "wrong" ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-blood">{t.tutorialWrongMove}</p>
            <div className="flex justify-center gap-2">
              <button className="btn btn-primary" onClick={() => setPhase("playing")}>
                {t.tutorialTryAgain}
              </button>
              {!showHint && (
                <button className="btn" onClick={() => setShowHint(true)}>
                  {t.tutorialShowHint}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <button className="btn" onClick={reset}>
              {t.tutorialReset}
            </button>
            {!showHint && (
              <button className="btn" onClick={() => setShowHint(true)}>
                {t.tutorialShowHint}
              </button>
            )}
          </div>
        )}
        {showHint && phase !== "solved" && (
          <p className="mt-2 text-sm italic text-parchment-dim">{t.tutorialHints[scenario.id]}</p>
        )}
      </div>
    </div>
  );
}
