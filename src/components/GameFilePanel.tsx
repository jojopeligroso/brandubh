import { useRef, useState } from "react";
import {
  exportFileName,
  exportGame,
  parseGame,
  type GameFileMeta,
  type ParseErrorCode,
  type ParsedGame,
} from "../game/gameFile";
import type { GameState } from "../game/types";
import type { RuleSet } from "../game/variants";
import type { Translations } from "../i18n";

// ── Export / import panel ─────────────────────────────────────────────────────
// The UI half of the PGN-style game file (see game/gameFile.ts). Export goes out
// two ways — a downloaded .tafl file and the clipboard — and games come back in
// two ways: pasted text and an uploaded file. Both import paths funnel through
// the same `parseGame`, so a game is validated identically however it arrives.
//
// Anything the parser refuses is shown here with its reason and the offending
// line: a failed import must always say *why* it failed rather than leaving a
// blank board behind.

interface Props {
  t: Translations;
  /** The timeline tip — exporting while reviewing still writes the full game. */
  state: GameState;
  rules: RuleSet;
  meta: GameFileMeta;
  onImport: (game: ParsedGame) => void;
}

type Feedback =
  | { kind: "loaded"; moves: number; notes: string[] }
  | { kind: "failed"; reason: string; detail: string };

/** One plain sentence per failure, so the user knows what to fix. */
function reasonFor(t: Translations, code: ParseErrorCode): string {
  switch (code) {
    case "no_moves":
      return t.importErrNoMoves;
    case "bad_tag":
      return t.importErrBadTag;
    case "unknown_variant":
      return t.importErrUnknownVariant;
    case "missing_custom_rules":
      return t.importErrMissingRules;
    case "bad_token":
      return t.importErrBadToken;
    case "illegal_move":
      return t.importErrIllegalMove;
    case "moves_after_end":
      return t.importErrMovesAfterEnd;
    case "capture_mismatch":
      return t.importErrCaptureMismatch;
  }
}

/** Today, PGN-style (`YYYY.MM.DD`). */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/**
 * Copy without assuming a secure context: `navigator.clipboard` is unavailable
 * over plain http, which is exactly how the app gets served in local preview, so
 * fall back to the old selection-based copy before admitting failure.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const done = document.execCommand("copy");
    document.body.removeChild(ta);
    return done;
  } catch {
    return false;
  }
}

export default function GameFilePanel({ t, state, rules, meta, onImport }: Props) {
  const [pasted, setPasted] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const fileInput = useRef<HTMLInputElement>(null);

  const hasMoves = state.history.length > 0;
  const fileMeta: GameFileMeta = { date: today(), ...meta };
  const serialize = () => exportGame(state, rules, fileMeta);

  const download = () => {
    const url = URL.createObjectURL(new Blob([serialize()], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(rules, fileMeta.date);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    const done = await copyText(serialize());
    setCopyState(done ? "copied" : "failed");
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  // The single import path — paste and upload both land here.
  const load = (raw: string) => {
    const result = parseGame(raw);
    if (!result.ok) {
      setFeedback({
        kind: "failed",
        reason: reasonFor(t, result.error.code),
        detail: result.error.detail,
      });
      return;
    }
    onImport(result.game);
    setPasted("");
    setFeedback({
      kind: "loaded",
      moves: result.game.states.length - 1,
      notes: result.game.warnings,
    });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      load(await file.text());
    } catch {
      setFeedback({ kind: "failed", reason: t.importErrUnreadableFile, detail: file.name });
    }
    // Clear the input so re-picking the same file fires another change event.
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <details className="card mt-4 p-4" data-testid="gamefile-panel">
      <summary className="cursor-pointer text-sm font-semibold text-parchment-dim">
        {t.gameFileTitle}
      </summary>

      {/* ── Export ── */}
      <section className="mt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-parchment-dim">
          {t.exportLabel}
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className="btn" onClick={download} disabled={!hasMoves}>
            {t.exportDownload}
          </button>
          <button className="btn" onClick={copy} disabled={!hasMoves}>
            {copyState === "copied"
              ? t.exportCopied
              : copyState === "failed"
                ? t.exportCopyFailed
                : t.exportCopy}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-parchment-dim">
          {hasMoves ? t.exportHint : t.exportNothingYet}
        </p>
      </section>

      {/* ── Import ── */}
      <section className="mt-4 border-t border-parchment/10 pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-parchment-dim">
          {t.importLabel}
        </span>
        <textarea
          className="mt-2 h-24 w-full rounded-lg border border-parchment/20 bg-parchment/5 p-2 font-mono text-xs text-parchment placeholder:text-parchment-dim focus:border-gold focus:outline-none"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={t.importPlaceholder}
          aria-label={t.importLabel}
          spellCheck={false}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            className="btn btn-primary"
            onClick={() => load(pasted)}
            disabled={!pasted.trim()}
          >
            {t.importLoad}
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            {t.importChooseFile}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".tafl,.txt,text/plain"
            className="hidden"
            onChange={(e) => void upload(e.target.files?.[0])}
            aria-label={t.importChooseFile}
          />
        </div>
        <p className="mt-1.5 text-xs text-parchment-dim">{t.importHint}</p>

        {feedback?.kind === "failed" && (
          <div className="mt-3 rounded-lg bg-blood/15 p-3" role="alert" data-testid="import-error">
            <p className="text-sm text-parchment">
              <b className="text-blood">{t.importFailed}</b> — {feedback.reason}
            </p>
            <p className="mt-1 font-mono text-[11px] text-parchment-dim">{feedback.detail}</p>
          </div>
        )}

        {feedback?.kind === "loaded" && (
          <div className="mt-3 rounded-lg bg-gold/10 p-3" role="status" data-testid="import-ok">
            <p className="text-sm text-parchment">
              <b className="text-gold">{t.importLoaded}</b> — {feedback.moves} {t.movesWord}
            </p>
            {feedback.notes.length > 0 && (
              <>
                <p className="mt-1 text-xs text-parchment-dim">{t.importNotes}</p>
                <ul className="mt-0.5 list-disc pl-4 font-mono text-[11px] text-parchment-dim">
                  {feedback.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>
    </details>
  );
}
