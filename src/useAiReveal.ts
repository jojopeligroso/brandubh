// ── Showing the engine's move ────────────────────────────────────────────────
//
// A human knows what they just played; against the engine the move simply
// appeared, one stone somewhere else than it was a frame ago. This hook is the
// answer to that: it holds the two pieces of state a board needs to *show* the
// engine moving — the stone in flight, and the square it left — and expires
// them on its own timers.
//
// It is presentation only. The move is committed to the game the moment the
// engine returns it, exactly as before; nothing here can delay, alter or lose a
// move. What it changes is what the board draws over the position for the next
// second and a half. That also means it is game-agnostic, like `clock` and
// `sides`, so Brandubh and Tablut share it rather than each growing their own.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Board, Move, Piece, Square } from "./game/types";

/**
 * How long the engine's stone takes to travel between the two squares.
 *
 * Deliberately slower than any other motion on the board (`place` is 180ms):
 * this one is not a flourish on something you already know happened, it *is*
 * how you find out what happened.
 */
export const AI_SLIDE_MS = 520;

/**
 * How long the square the stone left stays lit, from the same instant. It
 * outlasts the travel on purpose — the highlight is still answering "where did
 * that come from?" after the stone has landed and the eye has followed it.
 */
export const AI_ORIGIN_MS = 1400;

/**
 * The backstop for taking the travelling stone down. Not how long the flight
 * lasts: `endSlide`, fired from the animation's own `animationend`, is what
 * normally ends it, and this only covers the case where that never arrives at
 * all — a backgrounded tab, a frame the display never composites.
 *
 * It is the *whole* reveal's length rather than the flight's plus a margin,
 * because the two clocks do not start together. This one starts when React is
 * told to draw the stone; the animation starts when the browser actually paints
 * it. That gap is a frame on a good day and was measured at 405ms on a loaded
 * headless run — so a backstop of flight-plus-400ms beat the flight it was
 * meant to protect, tore the stone down mid-air, and left it short of its
 * square. A backstop that can win that race is worse than none.
 *
 * Overrunning costs nothing: the stone finishes on the destination and holds
 * there (`forwards`), directly over the real stone waiting hidden underneath,
 * so a late lift is invisible. Finishing early is what shows.
 */
const AI_SLIDE_BACKSTOP_MS = AI_ORIGIN_MS;

/** The engine's move, mid-flight. */
export interface AiSlide {
  move: Move;
  /** The stone travelling, taken from the position it is leaving. */
  piece: Piece;
  /**
   * The stones this move takes, still standing while it travels.
   *
   * The capture is applied to the board the instant the move is committed, so
   * without this the victims would vanish *before* the stone that took them
   * arrived — the pincer closing after the fact. The board redraws them for the
   * length of the flight, and the normal capture flash then plays on landing.
   */
  captured: { square: Square; piece: Piece }[];
}

export interface AiReveal {
  /** The stone in flight, or null when nothing is travelling. */
  slide: AiSlide | null;
  /** The square the engine's stone left, held lit behind it. */
  origin: Square | null;
  /**
   * Announce the move the engine is about to play, against the position it is
   * played *from* — the moving stone is still standing on `move.from` there.
   *
   * Returns how long the caller should hold back anything that belongs to the
   * landing rather than the departure (the capture flash, the victory curtain).
   * That is 0 under reduced motion, where there is no flight to wait for.
   */
  reveal: (move: Move, board: Board) => number;
  /**
   * The flight is over — the board reports this from the travel animation's own
   * `animationend`, which is the only thing that knows when it truly finished.
   * Idempotent, and harmless if the backstop got there first.
   */
  endSlide: () => void;
  /** Drop the reveal outright — a new game, a takeback, leaving the tip. */
  clear: () => void;
}

export function useAiReveal(reducedMotion: boolean): AiReveal {
  const [slide, setSlide] = useState<AiSlide | null>(null);
  const [origin, setOrigin] = useState<Square | null>(null);
  const timers = useRef<number[]>([]);

  const stopTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => stopTimers, [stopTimers]);

  const reveal = useCallback(
    (move: Move, board: Board): number => {
      // A second engine move before the first has finished showing (an undo
      // straight back into the engine's turn) replaces it rather than stacking.
      stopTimers();
      const piece = board[move.from.row][move.from.col];
      // The engine cannot move a stone that is not there; if the position and
      // the move have somehow parted company, show nothing rather than a lie.
      if (!piece) {
        setSlide(null);
        setOrigin(null);
        return 0;
      }
      setOrigin(move.from);
      timers.current.push(window.setTimeout(() => setOrigin(null), AI_ORIGIN_MS));
      if (reducedMotion) {
        // No travel: the stone appears where it landed, as it always did, and
        // the lit origin square is left to carry the whole explanation.
        setSlide(null);
        return 0;
      }
      const captured = (move.captures ?? []).flatMap((square) => {
        const victim = board[square.row][square.col];
        return victim ? [{ square, piece: victim }] : [];
      });
      setSlide({ move, piece, captured });
      // Taken down by `endSlide` when the travel animation says so; this is
      // only the backstop (see AI_SLIDE_BACKSTOP_MS). The real stone is already
      // drawn on the destination, hidden under the overlay, so lifting the
      // overlay is seamless whenever it happens.
      timers.current.push(window.setTimeout(() => setSlide(null), AI_SLIDE_BACKSTOP_MS));
      return AI_SLIDE_MS;
    },
    [reducedMotion, stopTimers],
  );

  const endSlide = useCallback(() => setSlide(null), []);

  const clear = useCallback(() => {
    stopTimers();
    setSlide(null);
    setOrigin(null);
  }, [stopTimers]);

  return { slide, origin, reveal, endSlide, clear };
}
