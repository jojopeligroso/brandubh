import { useEffect } from "react";
import { Emblem } from "./Board";
import type { Emblems } from "./ObjectivesContent";
import type { Translations } from "../i18n";
import type { Side } from "../game/types";

/**
 * The end-of-game curtain: an unmissable full-screen announcement of who won
 * and why, carrying the follow-on choices (next game / next set / new game,
 * or dismiss to review the final position). Shown once per live game end —
 * never when browsing back into a finished game (see the status-transition
 * watcher in App.tsx).
 */
export default function VictoryOverlay({
  t,
  winner,
  reason,
  moveCount,
  emblems,
  primaryLabel,
  onPrimary,
  onAnalyse,
  onReview,
}: {
  t: Translations;
  winner: Side | "draw";
  reason: string;
  moveCount: number;
  emblems: Emblems;
  primaryLabel: string;
  onPrimary: () => void;
  /** Jump straight into analysis of the finished game — lichess's second row. */
  onAnalyse: (() => void) | null;
  onReview: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onReview();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onReview]);

  const title =
    winner === "attackers" ? t.victoryRaiders : winner === "defenders" ? t.victoryKing : t.victoryDraw;
  const tone =
    winner === "attackers" ? "text-blood" : winner === "defenders" ? "text-gold" : "text-parchment";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onReview}
    >
      <div
        className={`card victory-card mx-4 w-full max-w-sm space-y-5 p-8 text-center victory-${winner}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="victory-title"
      >
        {winner !== "draw" && (
          <div className="flex justify-center">
            <div className="victory-emblem">
              <div className={`piece ${winner === "attackers" ? "attacker" : "king"}`}>
                <Emblem
                  piece={winner === "attackers" ? "attacker" : "king"}
                  attackerEmblem={emblems.attackerEmblem}
                  kingEmblem={emblems.kingEmblem}
                  defenderEmblem={emblems.defenderEmblem}
                />
              </div>
            </div>
          </div>
        )}
        <h2 id="victory-title" className={`font-display text-4xl leading-tight ${tone}`}>
          {title}
        </h2>
        <p className="text-sm italic text-parchment">{reason}</p>
        <p className="font-mono text-xs tabular-nums text-parchment-dim">
          {moveCount} {t.movesWord}
        </p>
        {/* Lichess's game-over card: a stack of full-width labelled rows —
            rematch first, analysis second, review to dismiss. */}
        <div className="victory-actions">
          <button className="victory-action victory-action-primary" onClick={onPrimary}>
            {primaryLabel}
          </button>
          {onAnalyse && (
            <button className="victory-action" onClick={onAnalyse}>
              {t.analysisMode}
            </button>
          )}
          <button className="victory-action" onClick={onReview}>
            {t.victoryReview}
          </button>
        </div>
      </div>
    </div>
  );
}
