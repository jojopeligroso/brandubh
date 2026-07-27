import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "./components/Board";
import RulesModal from "./components/RulesModal";
import { chooseMove, type Difficulty } from "./game/ai";
import {
  allMoves,
  applyMove,
  initialState,
  isGameOver,
  moveName,
  sideOf,
  winnerOf,
} from "./game/engine";
import type { GameState, Move, Side, Square } from "./game/types";
import { CUSTOM_RULE_DEFAULTS, DEFAULT_VARIANT, VARIANTS, type RuleSet } from "./game/variants";
import { type Lang, type Translations, translations } from "./i18n";
import { applyTheme, loadTheme, THEMES, type ThemeId } from "./theme";
import {
  ATTACKER_EMBLEMS,
  ATTACKER_EMBLEM_KEY,
  type AttackerEmblemId,
  emblemById,
  emblemCenter,
  loadAttackerEmblem,
} from "./emblems";
import {
  CORNER_EMBLEMS,
  CORNER_EMBLEM_KEY,
  type CornerEmblemId,
  cornerEmblemById,
  loadCornerEmblem,
} from "./cornerEmblems";
import {
  DEFAULT_KING_EMBLEM,
  KING_EMBLEM_KEY,
  type KingEmblemId,
  availableKingEmblems,
  kingEmblemById,
  loadKingEmblem,
} from "./kingEmblems";
import {
  DEFENDER_EMBLEMS,
  DEFENDER_EMBLEM_KEY,
  type DefenderEmblemId,
  defenderEmblemById,
  loadDefenderEmblem,
} from "./defenderEmblems";

type PlayMode = "attackers" | "defenders" | "hotseat";

const opposite = (s: Side): Side => (s === "attackers" ? "defenders" : "attackers");

function sideLabel(s: Side, t: Translations): string {
  return s === "attackers" ? t.raiders : t.kingsSide;
}

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const t = translations[lang];

  const [theme, setTheme] = useState<ThemeId>(loadTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const [attackerEmblem, setAttackerEmblem] = useState<AttackerEmblemId>(loadAttackerEmblem);
  useEffect(() => {
    try {
      localStorage.setItem(ATTACKER_EMBLEM_KEY, attackerEmblem);
    } catch {
      /* ignore persistence failures */
    }
  }, [attackerEmblem]);

  const [cornerEmblem, setCornerEmblem] = useState<CornerEmblemId>(loadCornerEmblem);
  useEffect(() => {
    try {
      localStorage.setItem(CORNER_EMBLEM_KEY, cornerEmblem);
    } catch {
      /* ignore persistence failures */
    }
  }, [cornerEmblem]);

  const [kingEmblem, setKingEmblem] = useState<KingEmblemId>(loadKingEmblem);
  useEffect(() => {
    try {
      localStorage.setItem(KING_EMBLEM_KEY, kingEmblem);
    } catch {
      /* ignore persistence failures */
    }
  }, [kingEmblem]);

  const [defenderEmblem, setDefenderEmblem] = useState<DefenderEmblemId>(loadDefenderEmblem);
  useEffect(() => {
    try {
      localStorage.setItem(DEFENDER_EMBLEM_KEY, defenderEmblem);
    } catch {
      /* ignore persistence failures */
    }
  }, [defenderEmblem]);

  const [variantId, setVariantId] = useState(DEFAULT_VARIANT);
  const [customRules, setCustomRules] = useState<Omit<RuleSet, "id" | "name" | "blurb">>(
    CUSTOM_RULE_DEFAULTS,
  );
  const [playMode, setPlayMode] = useState<PlayMode>("defenders");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  // ── Move timeline ───────────────────────────────────────────────────────────
  // `states[k]` is the full position after k moves; `cursor` is the position
  // currently on screen. Browsing with the arrows only moves the cursor — it
  // never discards moves, so you can cycle back and forth freely. "Play from
  // here" is the only action that branches (truncates) the timeline.
  const [states, setStates] = useState<GameState[]>(() => [initialState()]);
  const [cursor, setCursor] = useState(0);

  const [selected, setSelected] = useState<Square | null>(null);
  const [fadingCaptures, setFadingCaptures] = useState<Square[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [showModeOverlay, setShowModeOverlay] = useState(true);
  const [showTakeback, setShowTakeback] = useState(false);
  const [showResign, setShowResign] = useState(false);
  const [showDesign, setShowDesign] = useState(false);

  const rules: RuleSet =
    variantId === "custom"
      ? { id: "custom", name: "Custom", blurb: "Your custom ruleset.", ...customRules }
      : VARIANTS[variantId];
  // A sword king emblem is only valid when the king is armed; fall back otherwise.
  useEffect(() => {
    if (!availableKingEmblems(rules.armedKing).some((e) => e.id === kingEmblem)) {
      setKingEmblem(DEFAULT_KING_EMBLEM);
    }
  }, [rules.armedKing, kingEmblem]);
  const humanSide: Side | null = playMode === "hotseat" ? null : playMode;
  const aiSide: Side | null = humanSide ? opposite(humanSide) : null;

  const tip = states.length - 1;
  const atTip = cursor === tip;
  const reviewing = !atTip;
  const game = states[cursor];
  const gameOver = isGameOver(game.status);

  const lastMove: Move | null = game.history.length
    ? game.history[game.history.length - 1].move
    : null;

  const aiTimer = useRef<number | null>(null);

  // ── Applying a move (shared by human + AI) ──────────────────────────────────
  const commitMove = useCallback(
    (move: Move) => {
      if (move.captures && move.captures.length) {
        const caps = move.captures;
        setFadingCaptures(caps);
        window.setTimeout(() => setFadingCaptures([]), 340);
      }
      // A move is only ever committed from the tip, so append + advance cursor.
      setStates((prev) => [...prev, applyMove(prev[prev.length - 1], move, rules)]);
      setCursor((c) => c + 1);
      setSelected(null);
    },
    [rules],
  );

  // ── AI turn (only while live at the tip, never while browsing) ───────────────
  useEffect(() => {
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    if (!atTip || gameOver || aiSide === null || game.turn !== aiSide) {
      setThinking(false);
      return;
    }
    setThinking(true);
    aiTimer.current = window.setTimeout(() => {
      const move = chooseMove(game, difficulty, rules);
      setThinking(false);
      if (move) commitMove(move);
    }, 420);
    return () => {
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
    };
  }, [game, atTip, aiSide, difficulty, rules, gameOver, commitMove]);

  // ── Human interaction ───────────────────────────────────────────────────────
  const interactive =
    atTip && !gameOver && !thinking && (humanSide === null || game.turn === humanSide);

  const legalTargets = useMemo(() => {
    if (!selected) return new Set<number>();
    return new Set(
      allMoves(game.board, game.turn, rules)
        .filter((m) => m.from.row === selected.row && m.from.col === selected.col)
        .map((m) => m.to.row * 10 + m.to.col),
    );
  }, [selected, game, rules]);

  const onSquareClick = useCallback(
    (sq: Square) => {
      if (!interactive) return;
      const piece = game.board[sq.row][sq.col];
      const mine = sideOf(piece) === game.turn;

      if (selected) {
        if (legalTargets.has(sq.row * 10 + sq.col)) {
          const move = allMoves(game.board, game.turn, rules).find(
            (m) =>
              m.from.row === selected.row &&
              m.from.col === selected.col &&
              m.to.row === sq.row &&
              m.to.col === sq.col,
          );
          if (move) commitMove(move);
          return;
        }
        if (mine) {
          setSelected(sq);
          return;
        }
        setSelected(null);
        return;
      }
      if (mine) setSelected(sq);
    },
    [interactive, game, selected, legalTargets, rules, commitMove],
  );

  // ── Controls ────────────────────────────────────────────────────────────────
  const resetGame = useCallback(() => {
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    setStates([initialState()]);
    setCursor(0);
    setSelected(null);
    setFadingCaptures([]);
    setThinking(false);
    setShowTakeback(false);
  }, []);

  const goPrev = useCallback(() => {
    setSelected(null);
    setCursor((c) => Math.max(0, c - 1));
  }, []);
  const goNext = useCallback(() => {
    setSelected(null);
    setCursor((c) => Math.min(tip, c + 1));
  }, [tip]);
  const goLatest = useCallback(() => {
    setSelected(null);
    setCursor(tip);
  }, [tip]);

  // Branch the game at the currently-viewed position and resume play.
  const playFromHere = useCallback(
    (vsComputer: boolean) => {
      if (isGameOver(states[cursor].status)) return; // nothing to play from a finished position
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
      const sideToMove = states[cursor].turn;
      setStates((prev) => prev.slice(0, cursor + 1));
      setSelected(null);
      setFadingCaptures([]);
      setThinking(false);
      if (vsComputer) {
        // The human keeps the side to move; the computer takes the other side.
        setPlayMode(sideToMove);
      }
    },
    [cursor, states],
  );

  const doTakeback = useCallback(() => {
    setShowTakeback(false);
    if (tip < 1) return;
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    setStates((prev) => prev.slice(0, -1));
    setCursor(tip - 1);
    setSelected(null);
    setFadingCaptures([]);
    setThinking(false);
  }, [tip]);

  const resign = useCallback(() => {
    setShowResign(false);
    if (gameOver || !atTip) return;
    // In AI play the human resigns; over-the-board, the side to move resigns.
    const loser: Side = humanSide === null ? game.turn : humanSide;
    const status: GameState["status"] =
      opposite(loser) === "attackers" ? "attackers_win_resign" : "defenders_win_resign";
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    setThinking(false);
    setSelected(null);
    setStates((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1], status };
      return copy;
    });
  }, [gameOver, atTip, humanSide, game.turn]);

  const changeVariant = (id: string) => {
    setVariantId(id);
    resetGame();
  };

  const changeMode = (m: PlayMode) => {
    setPlayMode(m);
    resetGame();
  };

  const showVsAiBranch = playMode === "hotseat" || gameOver;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-4 pb-10 pt-5 sm:max-w-lg">
      <Header
        t={t}
        lang={lang}
        onLang={setLang}
        onShowRules={() => setShowRules(true)}
        onShowDesign={() => setShowDesign(true)}
      />

      <StatusBar t={t} game={game} thinking={thinking} humanSide={humanSide} aiSide={aiSide} />

      <div className="mt-3">
        <Board
          board={game.board}
          rules={rules}
          turn={game.turn}
          selected={selected}
          lastMove={lastMove}
          fadingCaptures={fadingCaptures}
          interactive={interactive}
          controllable={humanSide}
          attackerEmblem={emblemById(attackerEmblem)}
          kingEmblem={kingEmblemById(kingEmblem)}
          defenderEmblem={defenderEmblemById(defenderEmblem)}
          cornerEmblem={cornerEmblemById(cornerEmblem)}
          onSquareClick={onSquareClick}
        />
      </div>

      <CapturedTray t={t} game={game} />

      <MoveNav
        t={t}
        cursor={cursor}
        tip={tip}
        onPrev={goPrev}
        onNext={goNext}
        onLatest={goLatest}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={resetGame}>
          {t.newGame}
        </button>
        <button className="btn" onClick={() => setShowRules(true)}>
          {t.rules}
        </button>
        {humanSide === null && atTip && !gameOver && tip >= 1 && (
          <button className="btn" onClick={() => setShowTakeback(true)}>
            {t.proposeTakeback}
          </button>
        )}
        {atTip && !gameOver && (
          <button className="btn" onClick={() => setShowResign(true)}>
            {t.resign}
          </button>
        )}
      </div>

      {(reviewing || gameOver) && (
        <ReviewBar
          t={t}
          reviewing={reviewing}
          moveNumber={cursor}
          totalMoves={tip}
          viewedTerminal={gameOver}
          showVsAi={showVsAiBranch}
          onLatest={goLatest}
          onPlay={() => playFromHere(false)}
          onPlayVsAi={() => playFromHere(true)}
        />
      )}

      <Settings
        t={t}
        variantId={variantId}
        onVariant={changeVariant}
        playMode={playMode}
        onMode={changeMode}
        difficulty={difficulty}
        onDifficulty={setDifficulty}
      />

      {variantId === "custom" && (
        <CustomRuleEditor t={t} rules={customRules} onChange={setCustomRules} />
      )}

      <MoveLog t={t} game={states[tip]} activeIndex={cursor - 1} onMoveClick={(i) => setCursor(i + 1)} />

      {showRules && <RulesModal t={t} rules={rules} onClose={() => setShowRules(false)} />}

      {showModeOverlay && (
        <ModeOverlay
          t={t}
          onChoose={(m) => {
            changeMode(m);
            setShowModeOverlay(false);
          }}
        />
      )}

      {showTakeback && (
        <ConfirmDialog
          t={t}
          title={t.takebackTitle}
          body={t.takebackBody}
          confirmLabel={t.allow}
          cancelLabel={t.decline}
          onConfirm={doTakeback}
          onCancel={() => setShowTakeback(false)}
        />
      )}

      {showResign && (
        <ConfirmDialog
          t={t}
          title={t.resignTitle}
          body={t.resignBody}
          confirmLabel={t.resign}
          cancelLabel={t.back}
          onConfirm={resign}
          onCancel={() => setShowResign(false)}
        />
      )}

      {showDesign && (
        <DesignModal
          t={t}
          theme={theme}
          onTheme={setTheme}
          attackerEmblem={attackerEmblem}
          onAttackerEmblem={setAttackerEmblem}
          kingEmblem={kingEmblem}
          onKingEmblem={setKingEmblem}
          armedKing={rules.armedKing}
          defenderEmblem={defenderEmblem}
          onDefenderEmblem={setDefenderEmblem}
          cornerEmblem={cornerEmblem}
          onCornerEmblem={setCornerEmblem}
          onClose={() => setShowDesign(false)}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────
function Header({
  t,
  lang,
  onLang,
  onShowRules,
  onShowDesign,
}: {
  t: Translations;
  lang: Lang;
  onLang: (l: Lang) => void;
  onShowRules: () => void;
  onShowDesign: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-2">
      <div>
        <h1 className="font-display text-3xl leading-none text-parchment">
          Brand<span className="text-gold">ubh</span>
        </h1>
        <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-parchment-dim">
          {t.subtitle}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="seg">
          <button className={lang === "en" ? "on" : ""} onClick={() => onLang("en")}>
            EN
          </button>
          <button className={lang === "es" ? "on" : ""} onClick={() => onLang("es")}>
            ES
          </button>
        </div>
        <button className="btn" onClick={onShowRules}>
          {t.howToPlay}
        </button>
        <button
          className="iconbtn"
          onClick={onShowDesign}
          aria-label={t.design}
          title={t.design}
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="3.2" />
      <path
        d="M12 2.5l1.4 2.6 2.9-.5.4 2.9 2.6 1.4-1.3 2.6 1.3 2.6-2.6 1.4-.4 2.9-2.9-.5L12 21.5l-1.4-2.6-2.9.5-.4-2.9-2.6-1.4 1.3-2.6-1.3-2.6 2.6-1.4.4-2.9 2.9.5z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusBar({
  t,
  game,
  thinking,
  humanSide,
  aiSide,
}: {
  t: Translations;
  game: GameState;
  thinking: boolean;
  humanSide: Side | null;
  aiSide: Side | null;
}) {
  let text: string;
  let tone = "text-parchment";
  if (isGameOver(game.status)) {
    const w = winnerOf(game.status);
    if (w === "draw") {
      text = t.drawMessage;
    } else {
      if (game.status === "defenders_win_escape") text = t.defendersWinEscape;
      else if (game.status === "attackers_win_capture") text = t.attackersWinCapture;
      else if (game.status === "attackers_win_encirclement") text = t.attackersWinEncirclement;
      else if (game.status === "attackers_win_repetition") text = t.attackersWinRepetition;
      else if (game.status === "attackers_win_no_moves") text = t.attackersWinNoMoves;
      else if (game.status === "attackers_win_resign") text = t.attackersWinResign;
      else if (game.status === "defenders_win_resign") text = t.defendersWinResign;
      else text = t.defendersWinNoMoves;
      tone = w === "defenders" ? "text-gold" : "text-blood";
    }
  } else {
    const toMove = sideLabel(game.turn, t);
    const who =
      humanSide === null
        ? `${toMove} ${t.toMove}`
        : game.turn === humanSide
          ? `${t.yourMove} · ${toMove}`
          : thinking
            ? `${toMove} ${t.thinkingSuffix}`
            : `${toMove} ${t.toMove}`;
    text = who;
    if (aiSide && game.turn === aiSide) tone = "text-parchment-dim";
  }

  return (
    <div className="card mt-4 flex items-center justify-between px-4 py-2.5">
      <span className={`font-display text-lg ${tone}`}>{text}</span>
      <span className="font-mono text-xs text-parchment-dim">{t.moveLabel} {game.moveCount}</span>
    </div>
  );
}

function CapturedTray({ t, game }: { t: Translations; game: GameState }) {
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-parchment-dim">
      <span>
        {t.raidersLost} <b className="text-parchment">{game.captured.attackers}</b>
      </span>
      <span>
        {t.defendersLost} <b className="text-parchment">{game.captured.defenders}</b>
      </span>
    </div>
  );
}

// Curved-arrow move navigator: cycle back and forth through the whole game.
function MoveNav({
  t,
  cursor,
  tip,
  onPrev,
  onNext,
  onLatest,
}: {
  t: Translations;
  cursor: number;
  tip: number;
  onPrev: () => void;
  onNext: () => void;
  onLatest: () => void;
}) {
  const canPrev = cursor > 0;
  const canNext = cursor < tip;
  const reviewing = cursor < tip;

  let statusLabel: string;
  if (reviewing) statusLabel = `${t.reviewingLabel} · ${cursor}/${tip}`;
  else if (tip === 0) statusLabel = "—";
  else statusLabel = t.liveLabel;

  return (
    <div className="mt-3 flex items-center justify-center gap-2">
      <button className="iconbtn" onClick={onPrev} disabled={!canPrev} aria-label={t.prevMove}>
        <UndoArrow />
      </button>
      <button
        className={`pill ${reviewing ? "pill-review" : ""}`}
        onClick={reviewing ? onLatest : undefined}
        disabled={!reviewing}
        title={reviewing ? t.latest : t.liveLabel}
      >
        {!reviewing && tip > 0 && <span className="live-dot" aria-hidden />}
        {statusLabel}
      </button>
      <button className="iconbtn" onClick={onNext} disabled={!canNext} aria-label={t.nextMove}>
        <RedoArrow />
      </button>
    </div>
  );
}

function UndoArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 7 4 12l5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12h9a6 6 0 0 1 6 6v1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RedoArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M15 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12h-9a6 6 0 0 0-6 6v1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReviewBar({
  t,
  reviewing,
  moveNumber,
  totalMoves,
  viewedTerminal,
  showVsAi,
  onLatest,
  onPlay,
  onPlayVsAi,
}: {
  t: Translations;
  reviewing: boolean;
  moveNumber: number;
  totalMoves: number;
  viewedTerminal: boolean;
  showVsAi: boolean;
  onLatest: () => void;
  onPlay: () => void;
  onPlayVsAi: () => void;
}) {
  return (
    <div className="card mt-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-parchment-dim">
          {reviewing ? `${t.reviewingLabel} · ${moveNumber}/${totalMoves}` : t.playFromHere}
        </span>
        <div className="flex flex-wrap gap-2">
          {reviewing && (
            <button className="btn" onClick={onLatest}>
              {t.latest}
            </button>
          )}
          <button className="btn btn-primary" onClick={onPlay} disabled={viewedTerminal}>
            {t.playFromHere}
          </button>
          {showVsAi && (
            <button className="btn" onClick={onPlayVsAi} disabled={viewedTerminal}>
              {t.playFromHereVsAi}
            </button>
          )}
        </div>
      </div>
      {viewedTerminal && <p className="mt-2 text-xs text-parchment-dim">{t.branchHint}</p>}
    </div>
  );
}

function Settings({
  t,
  variantId,
  onVariant,
  playMode,
  onMode,
  difficulty,
  onDifficulty,
}: {
  t: Translations;
  variantId: string;
  onVariant: (id: string) => void;
  playMode: PlayMode;
  onMode: (m: PlayMode) => void;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
}) {
  return (
    <div className="card mt-4 space-y-3 p-4">
      <Row label={t.playAs}>
        <div className="seg">
          {(
            [
              ["defenders", t.king],
              ["attackers", t.raiders],
              ["hotseat", t.overTheBoard],
            ] as [PlayMode, string][]
          ).map(([m, l]) => (
            <button key={m} className={playMode === m ? "on" : ""} onClick={() => onMode(m)}>
              {l}
            </button>
          ))}
        </div>
      </Row>

      {playMode !== "hotseat" && (
        <Row label={t.aiLevel}>
          <div className="seg">
            {(([["easy", t.easy], ["medium", t.medium], ["hard", t.hard]] as [Difficulty, string][]).map(([d, label]) => (
              <button key={d} className={difficulty === d ? "on" : ""} onClick={() => onDifficulty(d)}>
                {label}
              </button>
            )))}
          </div>
        </Row>
      )}

      <Row label={t.variant}>
        <select
          className="btn"
          value={variantId}
          onChange={(e) => onVariant(e.target.value)}
        >
          {Object.values(VARIANTS).map((v) => (
            <option key={v.id} value={v.id}>
              {t.variantNames[v.id] ?? v.name}
            </option>
          ))}
          <option value="custom">{t.variantNames["custom"] ?? "Custom"}</option>
        </select>
      </Row>
    </div>
  );
}

// "Design your board" — theme + piece/corner icon customisation (gear menu).
function DesignModal({
  t,
  theme,
  onTheme,
  attackerEmblem,
  onAttackerEmblem,
  kingEmblem,
  onKingEmblem,
  armedKing,
  defenderEmblem,
  onDefenderEmblem,
  cornerEmblem,
  onCornerEmblem,
  onClose,
}: {
  t: Translations;
  theme: ThemeId;
  onTheme: (id: ThemeId) => void;
  attackerEmblem: AttackerEmblemId;
  onAttackerEmblem: (id: AttackerEmblemId) => void;
  kingEmblem: KingEmblemId;
  onKingEmblem: (id: KingEmblemId) => void;
  armedKing: boolean;
  defenderEmblem: DefenderEmblemId;
  onDefenderEmblem: (id: DefenderEmblemId) => void;
  cornerEmblem: CornerEmblemId;
  onCornerEmblem: (id: CornerEmblemId) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="card max-h-[88vh] w-full overflow-y-auto rounded-b-none p-6 sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl text-gold">{t.design}</h2>
          <button className="btn" onClick={onClose} aria-label={t.close}>
            ✕
          </button>
        </div>

        <section className="mt-5">
          <span className="text-sm font-semibold text-parchment-dim">{t.colourTheme}</span>
          <div className="theme-swatches mt-2">
            {THEMES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`theme-swatch ${theme === m.id ? "on" : ""}`}
                onClick={() => onTheme(m.id)}
                aria-pressed={theme === m.id}
              >
                <span className="chips" aria-hidden>
                  {m.chips.map((c, i) => (
                    <i key={i} style={{ background: c }} />
                  ))}
                </span>
                {m.name}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <span className="text-sm font-semibold text-parchment-dim">{t.attackerIcon}</span>
          <div className="emblem-swatches mt-2">
            {ATTACKER_EMBLEMS.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`emblem-swatch ${attackerEmblem === e.id ? "on" : ""}`}
                onClick={() => onAttackerEmblem(e.id)}
                aria-pressed={attackerEmblem === e.id}
                title={e.name}
              >
                <svg
                  viewBox={e.viewBox}
                  fill="currentColor"
                  fillRule={e.fillRule ?? "evenodd"}
                  style={e.scale ? { transform: `scale(${e.scale})` } : undefined}
                  aria-hidden
                >
                  <path d={e.path} />
                </svg>
                <span className="emblem-name">{e.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <span className="text-sm font-semibold text-parchment-dim">{t.kingIcon}</span>
          <div className="emblem-swatches mt-2">
            {availableKingEmblems(armedKing).map((e) => (
              <button
                key={e.id}
                type="button"
                className={`emblem-swatch ${kingEmblem === e.id ? "on" : ""}`}
                onClick={() => onKingEmblem(e.id)}
                aria-pressed={kingEmblem === e.id}
                title={e.name}
              >
                <svg
                  viewBox={e.viewBox}
                  fill="currentColor"
                  fillRule="evenodd"
                  style={e.scale ? { transform: `scale(${e.scale})` } : undefined}
                  aria-hidden
                >
                  <path d={e.path} />
                </svg>
                <span className="emblem-name">{e.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <span className="text-sm font-semibold text-parchment-dim">{t.defenderIcon}</span>
          <div className="emblem-swatches mt-2">
            {DEFENDER_EMBLEMS.map((e) => {
              const ring = e.outerRing;
              const center = ring ? emblemCenter(e.viewBox) : null;
              return (
                <button
                  key={e.id}
                  type="button"
                  className={`emblem-swatch ${defenderEmblem === e.id ? "on" : ""}`}
                  onClick={() => onDefenderEmblem(e.id)}
                  aria-pressed={defenderEmblem === e.id}
                  title={e.name}
                >
                  <svg
                    viewBox={e.viewBox}
                    fill="currentColor"
                    fillRule="evenodd"
                    style={e.scale ? { transform: `scale(${e.scale})` } : undefined}
                    aria-hidden
                  >
                    <path d={e.path} />
                    {ring && center && (
                      <circle
                        cx={center.cx}
                        cy={center.cy}
                        r={ring.r}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={ring.width}
                      />
                    )}
                  </svg>
                  <span className="emblem-name">{e.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-5">
          <span className="text-sm font-semibold text-parchment-dim">{t.cornerIcon}</span>
          <div className="emblem-swatches mt-2">
            {CORNER_EMBLEMS.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`emblem-swatch ${cornerEmblem === e.id ? "on" : ""}`}
                onClick={() => onCornerEmblem(e.id)}
                aria-pressed={cornerEmblem === e.id}
                title={e.name}
              >
                <svg viewBox={e.viewBox} fill="currentColor" fillRule="evenodd" aria-hidden>
                  <path d={e.path} />
                </svg>
                <span className="emblem-name">{e.name}</span>
              </button>
            ))}
          </div>
        </section>

        <button className="btn btn-primary mt-6 w-full" onClick={onClose}>
          {t.done}
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-parchment-dim">{label}</span>
      {children}
    </div>
  );
}

function ModeOverlay({ t, onChoose }: { t: Translations; onChoose: (m: PlayMode) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="card mx-4 w-full max-w-sm space-y-6 p-8 text-center">
        <h2 className="font-display text-2xl text-parchment">
          Brand<span className="text-gold">ubh</span>
        </h2>
        <p className="text-sm text-parchment-dim">{t.chooseGame}</p>
        <div className="flex flex-col gap-3">
          <button
            className="btn btn-primary py-3 text-base"
            onClick={() => onChoose("defenders")}
          >
            {t.playVsAi}
          </button>
          <button
            className="btn py-3 text-base"
            onClick={() => onChoose("hotseat")}
          >
            {t.otbOverlay}
            <span className="block text-xs font-normal text-parchment-dim">{t.withFriend}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

type CustomRules = Omit<RuleSet, "id" | "name" | "blurb">;

function CustomRuleEditor({
  t,
  rules,
  onChange,
}: {
  t: Translations;
  rules: CustomRules;
  onChange: (r: CustomRules) => void;
}) {
  const toggle = (key: keyof CustomRules) => {
    onChange({ ...rules, [key]: !rules[key] });
  };

  const boolRules: Array<{ key: keyof CustomRules; label: string; hint: string }> = [
    { key: "armedKing", label: t.ruleArmedKing, hint: t.ruleArmedKingHint },
    { key: "throneHostileToSoldiers", label: t.ruleThroneHostileSoldiers, hint: t.ruleThroneHostileSoldiersHint },
    { key: "throneHostileToKing", label: t.ruleThroneHostileKing, hint: t.ruleThroneHostileKingHint },
    { key: "kingMayReoccupyThrone", label: t.ruleKingReoccupyThrone, hint: t.ruleKingReoccupyThroneHint },
    { key: "soldiersPassThroughThrone", label: t.ruleSoldiersPassThrone, hint: t.ruleSoldiersPassThroneHint },
    { key: "cornersHostile", label: t.ruleCornersHostile, hint: t.ruleCornersHostileHint },
    { key: "strongKingOnThrone", label: t.ruleStrongKingOnThrone, hint: t.ruleStrongKingOnThroneHint },
    { key: "strongKingAdjacentToThrone", label: t.ruleStrongKingAdjacentThrone, hint: t.ruleStrongKingAdjacentThroneHint },
    { key: "encirclementWin", label: t.ruleEncirclementWin, hint: t.ruleEncirclementWinHint },
  ];

  return (
    <div className="card mt-4 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-parchment-dim">
        {t.customRulesTitle}
      </h3>
      <ul className="mt-3 space-y-2">
        {boolRules.map(({ key, label, hint }) => (
          <li key={key} className="flex items-start gap-3">
            <input
              type="checkbox"
              id={`rule-${key}`}
              checked={rules[key] as boolean}
              onChange={() => toggle(key)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
            />
            <label htmlFor={`rule-${key}`} className="cursor-pointer text-sm">
              <span className="text-parchment">{label}</span>
              <span className="ml-1 text-parchment-dim">— {hint}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <span className="text-sm text-parchment-dim">{t.repetitionResultLabel}</span>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {(
            [
              ["none", t.repetitionOptionNone],
              ["draw", t.repetitionOptionDraw],
              ["loss_for_defenders", t.repetitionOptionLossDefenders],
            ] as [CustomRules["repetitionResult"], string][]
          ).map(([val, label]) => (
            <label key={val} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="repetitionResult"
                value={val}
                checked={rules.repetitionResult === val}
                onChange={() => onChange({ ...rules, repetitionResult: val })}
                className="accent-gold"
              />
              <span className={rules.repetitionResult === val ? "text-parchment" : "text-parchment-dim"}>
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function MoveLog({
  t,
  game,
  activeIndex,
  onMoveClick,
}: {
  t: Translations;
  game: GameState;
  activeIndex: number;
  onMoveClick: (i: number) => void;
}) {
  if (game.history.length === 0) return null;
  return (
    <details className="card mt-4 p-4" open>
      <summary className="cursor-pointer text-sm font-semibold text-parchment-dim">
        {t.moveLog} ({game.history.length})
      </summary>
      <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-parchment-dim sm:grid-cols-3">
        {game.history.map((h, i) => (
          <li
            key={i}
            className={`cursor-pointer rounded px-1 hover:bg-parchment/10 ${
              i === activeIndex ? "bg-parchment/15 ring-1 ring-gold/60" : ""
            }`}
            onClick={() => onMoveClick(i)}
          >
            <span className="text-parchment/50">{i + 1}.</span>{" "}
            <span className={h.sideThatMoved === "attackers" ? "text-blood/90" : "text-gold/90"}>
              {moveName(h.move)}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  t: Translations;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="card mx-4 w-full max-w-sm space-y-5 p-8 text-center">
        <p className="font-display text-lg text-parchment">{title}</p>
        <p className="text-sm text-parchment-dim">{body}</p>
        <div className="flex justify-center gap-3">
          <button className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
