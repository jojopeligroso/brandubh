import { useState } from "react";
import { encodePosition, parsePosition, type PositionError } from "../game/position";
import type { GameState } from "../game/types";
import type { Translations } from "../i18n";

/**
 * Position setup — paste a board in to analyse it, or copy the one on screen out.
 *
 * This is the sibling of `GameFilePanel`, and the difference is the whole point:
 * that one carries a *game* (a move list replayed from the opening), this one
 * carries a *position*, which is exactly what a move list cannot express.
 *
 * A pasted position opens in **analysis**, as the root of a fresh move tree. It
 * never becomes the live game, is never saved, and is never exported — see the
 * replay-from-opening invariant in `game/position.ts` and `CLAUDE.md`.
 */
export default function PositionPanel({
  t,
  state,
  onLoad,
  placement = "page",
}: {
  t: Translations;
  /** The position currently on screen, for the copy button. */
  state: GameState;
  onLoad: (position: GameState) => void;
  /** "page": collapsed card among the others. "modal": the panel is the destination. */
  placement?: "page" | "modal";
}) {
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<PositionError | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const current = encodePosition(state);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  const load = () => {
    const result = parsePosition(pasted);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setPasted("");
    onLoad(result.state);
  };

  return (
    <details
      className={placement === "modal" ? "" : "card mt-4 p-4"}
      data-testid={placement === "modal" ? "position-panel-modal" : "position-panel"}
      // In the modal the panel *is* the destination, so it arrives unfolded;
      // in the page it stays a collapsed card among the others. (Initial state
      // only: React leaves the attribute alone on re-render, so the summary
      // toggle still works.)
      open={placement === "modal"}
    >
      <summary className="cursor-pointer text-sm font-semibold text-parchment-dim">
        {t.positionTitle}
      </summary>

      <p className="mt-2 text-xs text-parchment-dim">{t.positionHint}</p>

      <label className="mt-3 block text-xs font-semibold text-parchment-dim" htmlFor="position-out">
        {t.positionCurrent}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id="position-out"
          className="min-w-0 flex-1 rounded border border-parchment/15 bg-night/40 px-2 py-1 font-mono text-xs text-parchment"
          value={current}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
        />
        <button className="btn btn-sm" onClick={copy}>
          {copyState === "copied"
            ? t.exportCopied
            : copyState === "failed"
              ? t.exportCopyFailed
              : t.exportCopy}
        </button>
      </div>

      <label className="mt-3 block text-xs font-semibold text-parchment-dim" htmlFor="position-in">
        {t.positionPaste}
      </label>
      <textarea
        id="position-in"
        className="mt-1 h-16 w-full rounded border border-parchment/15 bg-night/40 px-2 py-1 font-mono text-xs text-parchment"
        value={pasted}
        placeholder={current}
        onChange={(e) => {
          setPasted(e.target.value);
          setError(null);
        }}
      />
      <div className="mt-2 flex items-center gap-2">
        <button className="btn btn-sm" onClick={load} disabled={!pasted.trim()}>
          {t.positionLoad}
        </button>
      </div>

      {error && (
        <p className="position-error mt-2 text-xs" role="alert">
          {/* The headline is localized; the detail is the parser's own English,
              because it quotes the offending text back and must stay exact. */}
          {t.positionRejected} {error.detail}
          {error.rank !== undefined && ` (${t.positionRank} ${error.rank})`}
        </p>
      )}
    </details>
  );
}
