import { decisiveWinner, evalBarFill, formatEvalScore } from "../evalBar";
import type { Side } from "../game/types";
import type { Translations } from "../i18n";

/**
 * The vertical eval bar that stands beside the board.
 *
 * `bottomSide` is the side seated at the *bottom* of the screen — the same seat
 * the bottom clock belongs to, already swapped for a north–south-flipped board
 * by the caller. Every reading here is from that seat: the fill grows upward
 * when the near player is ahead, and the number beneath carries the same sign.
 * See the orientation note at the top of src/evalBar.ts for why the bar turns
 * over with the board rather than pinning one side to one end.
 *
 * The whole thing is `aria-hidden`; the accessible reading is the text below
 * it, which says the same thing in words rather than in a picture.
 */
export default function EvalBar({
  t,
  score,
  bottomSide,
  pending,
}: {
  t: Translations;
  /** Attacker-positive engine score, or null before the first result arrives. */
  score: number | null;
  bottomSide: Side;
  /** A search is in flight for a position newer than `score` describes. */
  pending: boolean;
}) {
  const known = score !== null;
  // Hold the last known picture while the next search runs — a bar that emptied
  // to level on every cursor step would flicker more than it informed.
  const fill = known ? evalBarFill(score, bottomSide) : 0.5;
  const winner = known ? decisiveWinner(score) : null;

  const verdict = winner
    ? winner === "attackers"
      ? t.evalAttackersWin
      : t.evalDefendersWin
    : null;
  const readout = verdict ?? (known ? formatEvalScore(score, bottomSide) : "…");
  // Spoken form: the picture is decoration, this is what is actually announced.
  const spoken = verdict ?? (known ? `${t.evalLabel}: ${readout}` : t.evalThinking);

  return (
    <div
      className={[
        "evalbar",
        // Colours the two ends with the two sides' own pieces, near end first.
        bottomSide === "attackers" ? "near-attackers" : "",
        pending ? "is-pending" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="evalbar-track" aria-hidden>
        {/* Grows from the bottom end, which belongs to the near player. */}
        <div className="evalbar-fill" style={{ height: `${fill * 100}%` }} />
        <div className="evalbar-midline" />
      </div>
      <span className={`evalbar-score${winner ? " is-decisive" : ""}`} role="status">
        <span aria-hidden>{readout}</span>
        <span className="sr-only">{spoken}</span>
      </span>
    </div>
  );
}
