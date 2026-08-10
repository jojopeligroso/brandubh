import { useEffect, type ReactNode } from "react";
import { toSeanchlo } from "../gaelic";
import { VISIBLE_LANGS, type Lang, type Translations } from "../i18n";
import { useDialogFocus } from "../useDialogFocus";

/**
 * The hamburger's slide-out drawer, lifted from lichess mobile: a full-height
 * panel from the right over a dimmed page, the app's destinations grouped
 * under section headers (Play / Learn / Tools), and the meta rows — language,
 * settings, about — pinned at the bottom, visually apart from navigation.
 *
 * The head repeats the wordmark and answers "what am I in the middle of?"
 * (mode · strength · variant) the way lichess's drawer head shows who you are
 * and how the connection feels — ambient state you get for free each time the
 * menu opens.
 *
 * In-game actions (resign, takeback, flips) deliberately stay in the bottom
 * toolbar's action sheet: this drawer is the app's navigation, not the game's.
 *
 * The one collapsed section is **More games**, which is where a second boardgame
 * lives (Tablut, 9x9 — see docs/adr/0006-…). It is collapsed because Brandubh is
 * what this app is, and an always-open list of alternatives would say otherwise;
 * it uses a native `<details>`, which is the app's existing collapsible idiom
 * (GameFilePanel, PositionPanel, MoveTreePanel, MoveLog all use the same pair of
 * elements) rather than a new accordion nobody else would share.
 */
export default function AppDrawer({
  t,
  lang,
  onLang,
  status,
  onClose,
  onNewGame,
  onObjectives,
  onRules,
  onTutorials,
  onPuzzles,
  onGameFile,
  onTablut,
  onSettings,
  onAbout,
}: {
  t: Translations;
  lang: Lang;
  onLang: (l: Lang) => void;
  /** One line of live state under the wordmark: mode · strength · variant. */
  status: string;
  onClose: () => void;
  onNewGame: () => void;
  onObjectives: () => void;
  onRules: () => void;
  onTutorials: () => void;
  onPuzzles: () => void;
  onGameFile: () => void;
  /** Open the Tablut surface (see components/TablutScreen). */
  onTablut: () => void;
  onSettings: () => void;
  onAbout: () => void;
}) {
  // The drawer is where the Learn screen's focus was being lost: its rows
  // unmount on the way out, so the point focus would return to no longer
  // exists by the time the destination mounts. Restoring here — to the
  // hamburger — is what gives the destination something to hand back to.
  const drawerRef = useDialogFocus<HTMLElement>();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Every row closes the drawer first, so the destination never opens under it.
  const go = (action: () => void) => () => {
    onClose();
    action();
  };

  const item = (
    label: string,
    icon: ReactNode,
    action: () => void,
    testid?: string,
  ) => (
    <button className="drawer-item" onClick={go(action)} data-testid={testid}>
      <span className="drawer-icon" aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  );

  return (
    <div className="drawer-backdrop" onClick={onClose} data-testid="app-drawer">
      <aside
        ref={drawerRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t.menu}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <p className="gaelic text-2xl leading-none text-parchment">
            {toSeanchlo("Brand")}
            <span className="text-gold">{toSeanchlo("ubh")}</span>
          </p>
          <p className="drawer-status">{status}</p>
        </div>

        <nav className="drawer-body">
          <p className="drawer-section">{t.drawerPlay}</p>
          {item(t.newGame, <PlusIcon />, onNewGame, "drawer-new-game")}

          <p className="drawer-section">{t.drawerLearn}</p>
          {item(t.learnObjectives, <TargetIcon />, onObjectives)}
          {item(t.learnRules, <BookIcon />, onRules)}
          {item(t.learnTutorials, <BoardIcon />, onTutorials)}
          {item(t.learnPuzzles, <BoardIcon />, onPuzzles)}

          <p className="drawer-section">{t.drawerTools}</p>
          {item(t.gameFileTitle, <FileIcon />, onGameFile, "drawer-game-file")}

          {/* Collapsed by default: Brandubh is the app, and these are the others. */}
          <details className="drawer-details" data-testid="drawer-more-games">
            <summary className="drawer-section drawer-summary">{t.drawerMoreGames}</summary>
            {item(t.gameTablut, <GridIcon />, onTablut, "drawer-tablut")}
          </details>
        </nav>

        <div className="drawer-foot">
          <div className="drawer-lang">
            <span className="text-xs font-semibold uppercase tracking-wide text-parchment-dim">
              {t.language}
            </span>
            {/* Driven by VISIBLE_LANGS, so revealing a locale is a one-line
                change there rather than a hand-edit here. */}
            <div className="seg">
              {VISIBLE_LANGS.map((l) => (
                <button
                  key={l.code}
                  className={lang === l.code ? "on" : ""}
                  onClick={() => onLang(l.code)}
                  aria-pressed={lang === l.code}
                  lang={l.code}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          {item(t.settings, <GearIcon />, onSettings, "gear")}
          {item(t.about, <InfoIcon />, onAbout, "drawer-about")}
        </div>
      </aside>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────
// Stroke-drawn to match the bottom toolbar's set; sized by .drawer-icon svg.

/** Plus in a circle — a new game. */
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

/** Target — the goal of the game. */
function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Open book — the rules. */
function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 6c-1.6-1.4-3.8-2-6.5-2H4v14h1.5c2.7 0 4.9.6 6.5 2 1.6-1.4 3.8-2 6.5-2H20V4h-1.5c-2.7 0-4.9.6-6.5 2Z" />
      <path d="M12 6v14" />
    </svg>
  );
}

/** Quartered board — the set plays, lichess's "study" language. */
function BoardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 4v16M4 12h16" />
      <path d="M4.8 4.8h7.2v7.2H4.8zM12 12h7.2v7.2H12z" fill="currentColor" stroke="none" opacity="0.45" />
    </svg>
  );
}

/** Sheet with both arrows — export / import. */
function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M9 8l3-3 3 3M12 5v9" />
    </svg>
  );
}

/** A denser grid — the 9x9 board, against BoardIcon's quartered 7x7. */
function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" />
    </svg>
  );
}

/** Gear — settings. */
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.92 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.92a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09c0 .68.4 1.29 1.03 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.27.63.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z" />
    </svg>
  );
}

/** i in a circle — about. */
function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" />
    </svg>
  );
}
