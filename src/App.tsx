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

type PlayMode = "attackers" | "defenders" | "hotseat";

const opposite = (s: Side): Side => (s === "attackers" ? "defenders" : "attackers");

function sideLabel(s: Side, t: Translations): string {
  return s === "attackers" ? t.raiders : t.kingsSide;
}

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const t = translations[lang];

  const [variantId, setVariantId] = useState(DEFAULT_VARIANT);
  const [customRules, setCustomRules] = useState<Omit<RuleSet, "id" | "name" | "blurb">>(
    CUSTOM_RULE_DEFAULTS,
  );
  const [playMode, setPlayMode] = useState<PlayMode>("defenders");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  const [game, setGame] = useState<GameState>(() => initialState());
  const [undoStack, setUndoStack] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [fadingCaptures, setFadingCaptures] = useState<Square[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [showModeOverlay, setShowModeOverlay] = useState(true);
  const [rewindTarget, setRewindTarget] = useState<number | null>(null);

  const rules: RuleSet =
    variantId === "custom"
      ? { id: "custom", name: "Custom", blurb: "Your custom ruleset.", ...customRules }
      : VARIANTS[variantId];
  const humanSide: Side | null = playMode === "hotseat" ? null : playMode;
  const aiSide: Side | null = humanSide ? opposite(humanSide) : null;

  const lastMove: Move | null = game.history.length
    ? game.history[game.history.length - 1].move
    : null;

  const gameOver = isGameOver(game.status);

  // ── Applying a move (shared by human + AI) ──────────────────────────────────
  const commitMove = useCallback(
    (move: Move) => {
      setGame((prev) => {
        setUndoStack((s) => [...s, prev]);
        const next = applyMove(prev, move, rules);
        if (move.captures && move.captures.length) {
          const caps = move.captures;
          setFadingCaptures(caps);
          window.setTimeout(() => setFadingCaptures([]), 340);
        }
        return next;
      });
      setSelected(null);
    },
    [rules],
  );

  // ── AI turn ─────────────────────────────────────────────────────────────────
  const aiTimer = useRef<number | null>(null);
  useEffect(() => {
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    if (gameOver || aiSide === null || game.turn !== aiSide) {
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
  }, [game, aiSide, difficulty, rules, gameOver, commitMove]);

  // ── Human interaction ───────────────────────────────────────────────────────
  const interactive = !gameOver && !thinking && (humanSide === null || game.turn === humanSide);

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
  const newGame = useCallback(() => {
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    setGame(initialState());
    setUndoStack([]);
    setSelected(null);
    setFadingCaptures([]);
    setThinking(false);
  }, []);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      let idx = stack.length - 1;
      // In AI mode, step back to the human's most recent decision point.
      if (aiSide !== null) {
        while (idx > 0 && stack[idx].turn === aiSide) idx--;
      }
      setGame(stack[idx]);
      setSelected(null);
      setFadingCaptures([]);
      setThinking(false);
      return stack.slice(0, idx);
    });
  }, [aiSide]);

  const confirmRewind = useCallback(() => {
    if (rewindTarget === null) return;
    const i = rewindTarget;
    setRewindTarget(null);
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    if (i === game.history.length - 1) return; // already there
    // undoStack[i+1] = state after move i
    setUndoStack((stack) => {
      const target = stack[i + 1];
      if (target) {
        setGame(target);
        setSelected(null);
        setFadingCaptures([]);
        setThinking(false);
      }
      return stack.slice(0, i + 1);
    });
  }, [rewindTarget, game.history.length]);

  const changeVariant = (id: string) => {
    setVariantId(id);
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    setGame(initialState());
    setUndoStack([]);
    setSelected(null);
    setFadingCaptures([]);
    setThinking(false);
  };

  const changeMode = (m: PlayMode) => {
    setPlayMode(m);
    newGame();
  };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-4 pb-10 pt-5 sm:max-w-lg">
      <Header t={t} lang={lang} onLang={setLang} onShowRules={() => setShowRules(true)} />

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
          onSquareClick={onSquareClick}
        />
      </div>

      <CapturedTray t={t} game={game} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={newGame}>
          {t.newGame}
        </button>
        <button className="btn" onClick={undo} disabled={undoStack.length === 0 || thinking}>
          {t.undo}
        </button>
        <button className="btn" onClick={() => setShowRules(true)}>
          {t.rules}
        </button>
      </div>

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
        <CustomRuleEditor rules={customRules} onChange={setCustomRules} />
      )}

      <MoveLog t={t} game={game} onMoveClick={(i) => setRewindTarget(i)} />

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

      {rewindTarget !== null && (
        <RewindConfirm
          t={t}
          moveNumber={rewindTarget + 1}
          onConfirm={confirmRewind}
          onCancel={() => setRewindTarget(null)}
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
}: {
  t: Translations;
  lang: Lang;
  onLang: (l: Lang) => void;
  onShowRules: () => void;
}) {
  return (
    <header className="flex items-center justify-between">
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
      </div>
    </header>
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
      else text = t.defendersWinNoMoves;
      tone = w === "defenders" ? "text-gold" : "text-blood";
    }
  } else {
    const toMove = sideLabel(game.turn, t);
    const who =
      humanSide === null
        ? `${toMove} ${t.toMove}`
        : game.turn === humanSide
          ? `${t.yourMove} \u00b7 ${toMove}`
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
  rules,
  onChange,
}: {
  rules: CustomRules;
  onChange: (r: CustomRules) => void;
}) {
  const toggle = (key: keyof CustomRules) => {
    onChange({ ...rules, [key]: !rules[key] });
  };

  const boolRules: Array<{ key: keyof CustomRules; label: string; hint: string }> = [
    { key: "armedKing", label: "Armed king", hint: "King can act as a flanking piece in captures" },
    { key: "throneHostileToSoldiers", label: "Empty throne hostile to soldiers", hint: "Empty throne acts as an anvil when capturing soldiers" },
    { key: "throneHostileToKing", label: "Empty throne hostile to king", hint: "Empty throne counts as an enemy flank when capturing the king" },
    { key: "kingMayReoccupyThrone", label: "King may return to throne", hint: "King can re-enter the throne after leaving it" },
    { key: "soldiersPassThroughThrone", label: "Soldiers pass through empty throne", hint: "Soldiers may slide through (but not stop on) the empty throne" },
    { key: "cornersHostile", label: "Corners hostile", hint: "Corner squares act as anvils for all captures including the king" },
    { key: "strongKingOnThrone", label: "Strong king on throne", hint: "King on the throne requires all four sides surrounded to be captured" },
    { key: "strongKingAdjacentToThrone", label: "Strong king adjacent to throne", hint: "King beside the throne also requires all four sides surrounded" },
    { key: "encirclementWin", label: "Encirclement win", hint: "Attackers win by forming an unbroken ring around the king's side (no board edge)" },
  ];

  return (
    <div className="card mt-4 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-parchment-dim">
        Custom rules
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
        <span className="text-sm text-parchment-dim">Repetition result</span>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {(
            [
              ["none", "Ignored"],
              ["draw", "Draw"],
              ["loss_for_defenders", "Loss for King's side"],
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

function MoveLog({ t, game, onMoveClick }: { t: Translations; game: GameState; onMoveClick: (i: number) => void }) {
  if (game.history.length === 0) return null;
  return (
    <details className="card mt-4 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-parchment-dim">
        {t.moveLog} ({game.history.length})
      </summary>
      <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-parchment-dim sm:grid-cols-3">
        {game.history.map((h, i) => (
          <li
            key={i}
            className="cursor-pointer rounded px-1 hover:bg-parchment/10"
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

function RewindConfirm({
  t,
  moveNumber,
  onConfirm,
  onCancel,
}: {
  t: Translations;
  moveNumber: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="card mx-4 w-full max-w-sm space-y-5 p-8 text-center">
        <p className="font-display text-lg text-parchment">
          {t.continueFromMove} {moveNumber}?
        </p>
        <p className="text-sm text-parchment-dim">
          {t.movesWillBeLost}
        </p>
        <div className="flex gap-3 justify-center">
          <button className="btn" onClick={onCancel}>
            {t.back}
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            {t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
