import { useEffect } from "react";

/**
 * The lichess-style bottom toolbar: five evenly-spread icon actions under the
 * board — menu, rematch/new-game cycle, analysis microscope, and the two move
 * steppers. Every label lives on the aria attributes; the icons carry the row
 * visually, exactly as on lichess mobile.
 */
export function GameToolbar({
  menuOpen,
  menuLabel,
  onMenu,
  cycleLabel,
  cycleEnabled,
  onCycle,
  analysisShown,
  analysisOn,
  analysisEnabled,
  analysisLabel,
  onAnalysis,
  canPrev,
  canNext,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
}: {
  menuOpen: boolean;
  menuLabel: string;
  onMenu: () => void;
  cycleLabel: string;
  cycleEnabled: boolean;
  onCycle: () => void;
  analysisShown: boolean;
  analysisOn: boolean;
  analysisEnabled: boolean;
  analysisLabel: string;
  onAnalysis: () => void;
  canPrev: boolean;
  canNext: boolean;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <nav className="toolbar" aria-label={menuLabel}>
      <button
        className={`toolbar-btn${menuOpen ? " on" : ""}`}
        onClick={onMenu}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={menuLabel}
        data-testid="toolbar-menu"
      >
        <ListIcon />
      </button>
      <button
        className="toolbar-btn"
        onClick={onCycle}
        disabled={!cycleEnabled}
        aria-label={cycleLabel}
        title={cycleLabel}
        data-testid="toolbar-cycle"
      >
        <CycleIcon />
      </button>
      {analysisShown && (
        <button
          className={`toolbar-btn${analysisOn ? " on" : ""}`}
          onClick={onAnalysis}
          disabled={!analysisEnabled}
          aria-pressed={analysisOn}
          aria-label={analysisLabel}
          title={analysisLabel}
          data-testid="toolbar-analysis"
        >
          <MicroscopeIcon />
        </button>
      )}
      <button
        className="toolbar-btn"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label={prevLabel}
        data-testid="toolbar-prev"
      >
        <RewindIcon />
      </button>
      <button
        className="toolbar-btn"
        onClick={onNext}
        disabled={!canNext}
        aria-label={nextLabel}
        data-testid="toolbar-next"
      >
        <ForwardIcon />
      </button>
    </nav>
  );
}

/**
 * The action sheet the toolbar's list icon opens: a bottom sheet of labelled
 * rows, one per game action, mirroring lichess's in-game menu. The parent
 * decides which rows exist; the sheet only draws them and closes itself on
 * backdrop tap or Escape.
 */
export function GameMenuSheet({
  title,
  items,
  onClose,
}: {
  title: string;
  items: { label: string; danger?: boolean; onClick: () => void }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="menusheet-backdrop" onClick={onClose} data-testid="game-menu">
      <div
        className="menusheet"
        role="menu"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="menusheet-title">{title}</p>
        {items.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            className={`menusheet-item${item.danger ? " danger" : ""}`}
            onClick={() => {
              onClose();
              item.onClick();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────
// Stroke-drawn to match the board tools; sized by .toolbar-btn svg.

/** Bulleted list — the menu. */
function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="2.6" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}

/** Two circling arrows — next game / rematch. */
function CycleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 8a8 8 0 0 0-14.5-2" />
      <path d="M5.5 2v4h4" />
      <path d="M4 16a8 8 0 0 0 14.5 2" />
      <path d="M18.5 22v-4h-4" />
    </svg>
  );
}

/** Microscope — analysis, straight from lichess's icon language. */
function MicroscopeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 18h8" />
      <path d="M3 22h18" />
      <path d="M14 22a7 7 0 1 0 0-14h-1" />
      <path d="M9 14h2" />
      <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
      <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
    </svg>
  );
}

/** Double chevron left — step back. */
function RewindIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden>
      <path d="M12.5 12 20 5.5v13L12.5 12z" />
      <path d="M4.5 12 12 5.5v13L4.5 12z" />
    </svg>
  );
}

/** Double chevron right — step forward. */
function ForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden>
      <path d="M11.5 12 4 5.5v13l7.5-6.5z" />
      <path d="M19.5 12 12 5.5v13l7.5-6.5z" />
    </svg>
  );
}
