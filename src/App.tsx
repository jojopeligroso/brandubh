import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "./components/Board";
import RulesModal from "./components/RulesModal";
import { type Difficulty } from "./game/ai";
import { useAiWorker } from "./game/useAiWorker";
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
import {
  matchTotals,
  newMatch,
  recordMatchGame,
  SET_LENGTH_OPTIONS,
  standing,
  startNextSet,
  type Match,
  type PlayerId,
} from "./game/matchSet";
import { CUSTOM_RULE_DEFAULTS, DEFAULT_VARIANT, VARIANTS, type RuleSet } from "./game/variants";
import { type Lang, type Translations, translations } from "./i18n";
import {
  applyPieceColors,
  applyTheme,
  loadPieceColors,
  loadTheme,
  THEMES,
  type PieceColors,
  type PieceKey,
  type ThemeId,
} from "./theme";
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

  // Optional per-side stone colours layered over the theme (null = follow theme).
  const [pieceColors, setPieceColors] = useState<PieceColors>(loadPieceColors);
  useEffect(() => {
    applyPieceColors(pieceColors);
  }, [pieceColors]);
  const setPieceColor = useCallback((key: PieceKey, value: string | null) => {
    setPieceColors((prev) => ({ ...prev, [key]: value }));
  }, []);

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

  // ── Over-the-board "match" scoring ──────────────────────────────────────────
  // A match is a running series of sets; each set is a group of games in which
  // the players swap sides. Only meaningful in hotseat play; null otherwise.
  const [match, setMatch] = useState<Match | null>(null);
  const [gamesPerSet, setGamesPerSet] = useState<number>(2);
  // Editable player names; empty falls back to the localized "Player N".
  const [names, setNames] = useState<{ p1: string; p2: string }>({ p1: "", p2: "" });

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
  // A branch ("play from here") awaiting the opponent's agreement in hotseat play.
  const [pendingBranch, setPendingBranch] = useState<{ vsComputer: boolean } | null>(null);
  const [showResign, setShowResign] = useState(false);
  const [showNewMatchConfirm, setShowNewMatchConfirm] = useState(false);
  const [showNewGameConfirm, setShowNewGameConfirm] = useState(false);
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
  const { requestMove, cancel: cancelAi } = useAiWorker();
  // Guards the set recorder so a finished game is counted exactly once, even as
  // the cursor is moved back and forth over the terminal position.
  const recorded = useRef(false);

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
  // The search runs in a Web Worker (see useAiWorker), so even a long `hard`
  // think never freezes the board. A minimum "thinking" delay keeps fast moves
  // (easy/medium) from snapping instantly, preserving the pacing of play.
  const AI_MIN_THINK_MS = 350;
  useEffect(() => {
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    if (!atTip || gameOver || aiSide === null || game.turn !== aiSide) {
      setThinking(false);
      cancelAi();
      return;
    }
    setThinking(true);
    let cancelled = false;
    const start = performance.now();
    requestMove(game, difficulty, rules).then((move) => {
      if (cancelled) return;
      const wait = Math.max(0, AI_MIN_THINK_MS - (performance.now() - start));
      aiTimer.current = window.setTimeout(() => {
        if (cancelled) return;
        setThinking(false);
        if (move) commitMove(move);
      }, wait);
    });
    return () => {
      cancelled = true;
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
    };
  }, [game, atTip, aiSide, difficulty, rules, gameOver, commitMove, requestMove, cancelAi]);

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
  // Clear the board back to the opening position. Shared by every "start a
  // game" path; it does not touch the set score.
  const resetBoard = useCallback(() => {
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    recorded.current = false;
    setStates([initialState()]);
    setCursor(0);
    setSelected(null);
    setFadingCaptures([]);
    setThinking(false);
    setShowTakeback(false);
  }, []);

  // Fresh board and, in hotseat play, a brand-new match (score reset to zero).
  const resetGame = useCallback(() => {
    resetBoard();
    setMatch(playMode === "hotseat" ? newMatch(gamesPerSet) : null);
  }, [resetBoard, playMode, gamesPerSet]);

  // Start the next game of the current set (sides already swapped on record).
  const nextGame = useCallback(() => {
    resetBoard();
  }, [resetBoard]);

  // Bank the finished set and open a fresh one, continuing the running count.
  const nextSet = useCallback(() => {
    resetBoard();
    setMatch((m) => (m ? startNextSet(m) : m));
  }, [resetBoard]);

  // ── Record a finished hotseat game into the current set (exactly once) ───────
  useEffect(() => {
    if (playMode !== "hotseat" || !match) return;
    if (!atTip || !gameOver || recorded.current) return;
    if (match.set.results.length >= match.set.gamesPerSet) return;
    recorded.current = true;
    setMatch((m) => (m ? recordMatchGame(m, game.status, game.moveCount) : m));
  }, [playMode, match, atTip, gameOver, game.status, game.moveCount]);

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
      recorded.current = false; // this branch becomes a fresh live game
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

  // Over the board, resuming from an earlier move discards every move that
  // followed — a multi-move takeback — so it needs the opponent's agreement,
  // routed through the same confirmation screen. Solo play (vs the computer)
  // has no opponent to ask, so it branches immediately.
  const requestPlayFromHere = useCallback(
    (vsComputer: boolean) => {
      if (isGameOver(states[cursor].status)) return;
      if (humanSide === null) setPendingBranch({ vsComputer });
      else playFromHere(vsComputer);
    },
    [states, cursor, humanSide, playFromHere],
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
    resetBoard();
    setMatch(playMode === "hotseat" ? newMatch(gamesPerSet) : null);
  };

  const changeMode = (m: PlayMode) => {
    setPlayMode(m);
    resetBoard();
    // playMode state updates async, so decide the match from the new mode here.
    setMatch(m === "hotseat" ? newMatch(gamesPerSet) : null);
  };

  const changeSetLength = (n: number) => {
    setGamesPerSet(n);
    resetBoard();
    setMatch(playMode === "hotseat" ? newMatch(n) : null);
  };

  const showVsAiBranch = playMode === "hotseat" || gameOver;

  // In hotseat the primary button drives the match: "Next game" between games,
  // "Next set" once a set is decided (continuing the count), and "New match" to
  // wipe the score. Everywhere else it stays "New game".
  const otbMatch = playMode === "hotseat" ? match : null;
  const otbSet = otbMatch?.set ?? null;
  const setComplete = otbSet !== null && standing(otbSet).complete;
  const midSet =
    otbSet !== null && otbSet.results.length > 0 && !setComplete;
  const primaryLabel = setComplete
    ? t.nextSet
    : midSet
      ? t.nextGame
      : otbMatch
        ? t.newMatch
        : t.newGame;
  // Starting a new match wipes the running score, so route it through a
  // confirmation whenever there's actually progress to lose. Anything with
  // nothing to discard (a fresh board, solo "New game") falls straight through.
  const matchHasProgress =
    otbMatch !== null && (otbSet!.results.length > 0 || matchTotals(otbMatch).setsCompleted > 0);
  // A solo game with moves on the board and no result yet is worth guarding too:
  // a stray "New game" tap shouldn't silently wipe a game in progress.
  const soloGameInProgress = otbMatch === null && tip >= 1 && !gameOver;
  const requestNewMatch = useCallback(() => {
    if (matchHasProgress) setShowNewMatchConfirm(true);
    else if (soloGameInProgress) setShowNewGameConfirm(true);
    else resetGame();
  }, [matchHasProgress, soloGameInProgress, resetGame]);

  const primaryAction = setComplete ? nextSet : midSet ? nextGame : requestNewMatch;
  // The standalone "New match" button is a shortcut for discarding a match in
  // progress. Hide it while a set is live over the board — the primary button
  // is "Next game" there and this sits right beside it, easy to fumble — so a
  // mid-set reset goes through Settings instead. Between sets it stays handy.
  const showNewMatch = matchHasProgress && !midSet;

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

      {otbMatch && (
        <SetScoreboard
          t={t}
          match={otbMatch}
          names={names}
          onRename={(id, value) => setNames((n) => ({ ...n, [id]: value }))}
          gameOver={gameOver}
          liveMoves={game.moveCount}
        />
      )}

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
        <button className="btn btn-primary" onClick={primaryAction}>
          {primaryLabel}
        </button>
        {showNewMatch && (
          <button className="btn" onClick={requestNewMatch}>
            {t.newMatch}
          </button>
        )}
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
          onPlay={() => requestPlayFromHere(false)}
          onPlayVsAi={() => requestPlayFromHere(true)}
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
        gamesPerSet={gamesPerSet}
        onSetLength={changeSetLength}
        canNewMatch={matchHasProgress}
        onNewMatch={requestNewMatch}
        onShowDesign={() => setShowDesign(true)}
      />

      {variantId === "custom" && (
        <CustomRuleEditor t={t} rules={customRules} onChange={setCustomRules} />
      )}

      <MoveLog t={t} game={states[tip]} activeIndex={cursor - 1} onMoveClick={(i) => setCursor(i + 1)} />

      {showRules && <RulesModal t={t} rules={rules} onClose={() => setShowRules(false)} />}

      {showModeOverlay && (
        <ModeOverlay
          t={t}
          difficulty={difficulty}
          onDifficulty={setDifficulty}
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

      {pendingBranch && (
        <ConfirmDialog
          t={t}
          title={t.takebackTitle}
          body={t.takebackBody}
          confirmLabel={t.allow}
          cancelLabel={t.decline}
          onConfirm={() => {
            const { vsComputer } = pendingBranch;
            setPendingBranch(null);
            playFromHere(vsComputer);
          }}
          onCancel={() => setPendingBranch(null)}
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

      {showNewMatchConfirm && (
        <ConfirmDialog
          t={t}
          title={t.newMatchTitle}
          body={t.newMatchBody}
          confirmLabel={t.newMatch}
          cancelLabel={t.back}
          onConfirm={() => {
            setShowNewMatchConfirm(false);
            resetGame();
          }}
          onCancel={() => setShowNewMatchConfirm(false)}
        />
      )}

      {showNewGameConfirm && (
        <ConfirmDialog
          t={t}
          title={t.newGameTitle}
          body={t.newGameBody}
          confirmLabel={t.newGame}
          cancelLabel={t.back}
          onConfirm={() => {
            setShowNewGameConfirm(false);
            resetGame();
          }}
          onCancel={() => setShowNewGameConfirm(false)}
        />
      )}

      {showDesign && (
        <DesignModal
          t={t}
          theme={theme}
          onTheme={setTheme}
          pieceColors={pieceColors}
          onPieceColor={setPieceColor}
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

  const live = !isGameOver(game.status);
  const turnGlow = live ? ` turn-glow turn-glow-${game.turn}` : "";

  return (
    <div className={`card mt-4 flex items-center justify-between px-4 py-2.5${turnGlow}`}>
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

// ── Over-the-board match scoreboard ──────────────────────────────────────────
// Shows the running match (sets-won) tally, the current set's king/raiders
// counters, which player holds which side this game, each finished game's
// result with its move count, and — once the set is decided — who took it (by
// wins, or by the move-count tiebreaker when the set is level).
function SetScoreboard({
  t,
  match,
  names,
  onRename,
  gameOver,
  liveMoves,
}: {
  t: Translations;
  match: Match;
  names: { p1: string; p2: string };
  onRename: (id: PlayerId, value: string) => void;
  gameOver: boolean;
  liveMoves: number;
}) {
  const set = match.set;
  const s = standing(set);
  const totals = matchTotals(match);
  const defaultName = (id: PlayerId) => (id === "p1" ? t.player1 : t.player2);
  const playerName = (id: PlayerId) => names[id].trim() || defaultName(id);
  const currentGame = Math.min(set.results.length + 1, set.gamesPerSet);
  const seriesStarted = totals.setsCompleted > 0;

  const sideOfPlayer = (id: PlayerId): Side =>
    set.attackersPlayer === id ? "attackers" : "defenders";

  return (
    <div className="card mt-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg text-parchment">{t.matchSet}</h3>
        <span className="font-mono text-xs text-parchment-dim">
          {s.complete
            ? `${set.gamesPerSet}/${set.gamesPerSet}`
            : `${t.gameWord} ${currentGame}/${set.gamesPerSet}`}
        </span>
      </div>

      {/* Running match (sets-won) tally */}
      <div className="mt-2 flex items-center justify-between rounded-lg bg-parchment/5 px-3 py-1.5 text-sm">
        <span className="text-xs uppercase tracking-wide text-parchment-dim">{t.matchScore}</span>
        <span className="font-mono text-parchment">
          {playerName("p1")} <b className="text-gold">{totals.setsWon.p1}</b>
          <span className="text-parchment-dim"> – </span>
          <b className="text-gold">{totals.setsWon.p2}</b> {playerName("p2")}
          {totals.setsDrawn > 0 && (
            <span className="text-parchment-dim"> · {totals.setsDrawn} {t.drawsShort}</span>
          )}
        </span>
      </div>

      {/* King vs raiders counters across the current set */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-gold/10 px-3 py-2">
          <div className="font-display text-2xl text-gold">{s.sideWins.defenders}</div>
          <div className="text-xs uppercase tracking-wide text-parchment-dim">{t.kingCounter}</div>
        </div>
        <div className="rounded-lg bg-blood/10 px-3 py-2">
          <div className="font-display text-2xl text-blood">{s.sideWins.attackers}</div>
          <div className="text-xs uppercase tracking-wide text-parchment-dim">{t.raidersCounter}</div>
        </div>
      </div>

      {/* Per-player standings, with editable names */}
      <div className="mt-3 space-y-1.5">
        {(["p1", "p2"] as PlayerId[]).map((id) => {
          const side = sideOfPlayer(id);
          const best = s.fastestWin[id];
          return (
            <div key={id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <input
                  value={names[id]}
                  placeholder={defaultName(id)}
                  onChange={(e) => onRename(id, e.target.value)}
                  aria-label={defaultName(id)}
                  maxLength={20}
                  className="w-28 min-w-0 border-b border-parchment/20 bg-transparent text-parchment placeholder:text-parchment-dim focus:border-gold focus:outline-none"
                />
                {!s.complete && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                      side === "attackers" ? "bg-blood/20 text-blood" : "bg-gold/20 text-gold"
                    }`}
                  >
                    {sideLabel(side, t)}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-parchment-dim">
                {best !== null && (
                  <span>
                    {t.bestWin} {best} {t.movesWord}
                  </span>
                )}
                <span className="font-display text-base text-parchment">{s.wins[id]}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Finished-game lines */}
      {set.results.length > 0 && (
        <ol className="mt-3 space-y-1 border-t border-parchment/10 pt-2 font-mono text-xs text-parchment-dim">
          {set.results.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span>
                {t.gameWord} {i + 1}
                {r.winningPlayer ? (
                  <>
                    {" · "}
                    <span className={r.winner === "attackers" ? "text-blood/90" : "text-gold/90"}>
                      {playerName(r.winningPlayer)}
                    </span>{" "}
                    {t.wonAs} {sideLabel(r.winner as Side, t)}
                  </>
                ) : (
                  <> · {t.drawShort}</>
                )}
              </span>
              <span>
                {r.moves} {t.movesWord}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* Live move count for the game in progress (the tiebreaker metric) */}
      {!s.complete && !gameOver && (
        <p className="mt-2 font-mono text-xs text-parchment-dim">
          {t.gameWord} {currentGame}: {liveMoves} {t.movesWord}
        </p>
      )}

      {/* Between-games prompt */}
      {gameOver && !s.complete && (
        <p className="mt-2 text-xs text-parchment-dim">{t.sidesSwapNext}</p>
      )}

      {/* Set outcome */}
      {s.complete ? (
        <p className="mt-3 border-t border-parchment/10 pt-2 font-display text-base text-parchment">
          {s.winner === "draw" ? (
            t.setDrawn
          ) : (
            <>
              <span className="text-gold">{playerName(s.winner as PlayerId)}</span>{" "}
              {s.decidedByMoves ? t.winsSetOnMoves : t.winsTheSet}
            </>
          )}
        </p>
      ) : (
        set.results.length === 0 &&
        !seriesStarted && (
          <p className="mt-3 border-t border-parchment/10 pt-2 text-xs text-parchment-dim">
            {t.setInProgress}
          </p>
        )
      )}
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
  gamesPerSet,
  onSetLength,
  canNewMatch,
  onNewMatch,
  onShowDesign,
}: {
  t: Translations;
  variantId: string;
  onVariant: (id: string) => void;
  playMode: PlayMode;
  onMode: (m: PlayMode) => void;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  gamesPerSet: number;
  onSetLength: (n: number) => void;
  canNewMatch: boolean;
  onNewMatch: () => void;
  onShowDesign: () => void;
}) {
  return (
    <div className="card mt-4 space-y-4 p-4">
      <h2 className="font-display text-lg text-parchment">{t.settings}</h2>

      {/* ── Game ── how you play: side, opponent strength, ruleset ── */}
      <SettingsSection label={t.sectionGame}>
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
      </SettingsSection>

      {/* ── Match ── over-the-board series controls (hotseat only) ── */}
      {playMode === "hotseat" && (
        <SettingsSection label={t.sectionMatch}>
          <Row label={t.setLength}>
            <div className="seg">
              {SET_LENGTH_OPTIONS.map((n) => (
                <button key={n} className={gamesPerSet === n ? "on" : ""} onClick={() => onSetLength(n)}>
                  {n}
                </button>
              ))}
            </div>
          </Row>

          {/* Reset the running match — kept here (not in the action row) so it
              can't be fumbled mid-set, but still reachable while a set is live. */}
          {canNewMatch && (
            <Row label={t.newMatch}>
              <button className="btn" onClick={onNewMatch}>
                {t.newMatch}
              </button>
            </Row>
          )}
        </SettingsSection>
      )}

      {/* ── Appearance ── board & piece look (opens the design modal) ── */}
      <SettingsSection label={t.sectionAppearance}>
        <button className="btn w-full justify-center" onClick={onShowDesign}>
          {t.design}
        </button>
      </SettingsSection>
    </div>
  );
}

// A labelled group of rows inside the settings card.
function SettingsSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-t border-parchment/10 pt-3 first-of-type:border-t-0 first-of-type:pt-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-parchment-dim">
        {label}
      </span>
      {children}
    </div>
  );
}

// "Design your board" — theme + piece/corner icon customisation (gear menu).
function DesignModal({
  t,
  theme,
  onTheme,
  pieceColors,
  onPieceColor,
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
  pieceColors: PieceColors;
  onPieceColor: (key: PieceKey, value: string | null) => void;
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
  // The colour a piece has under the current theme, with any custom override
  // stripped — this seeds the picker when a side is still "follow theme". Read
  // straight from the applied CSS so it always tracks index.css, then restore
  // the live overrides so the board itself isn't disturbed.
  const [themeStones, setThemeStones] = useState<Record<PieceKey, string>>({
    atk: "#888888",
    def: "#888888",
    king: "#888888",
  });
  useEffect(() => {
    const root = document.documentElement;
    const keys: PieceKey[] = ["atk", "def", "king"];
    const saved = keys.map((k) => [k, root.style.getPropertyValue(`--${k}`)] as const);
    keys.forEach((k) => root.style.removeProperty(`--${k}`));
    const cs = getComputedStyle(root);
    const next = {} as Record<PieceKey, string>;
    keys.forEach((k) => {
      const v = cs.getPropertyValue(`--${k}`).trim();
      next[k] = /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#888888";
    });
    saved.forEach(([k, v]) => {
      if (v) root.style.setProperty(`--${k}`, v);
    });
    setThemeStones(next);
  }, [theme]);

  const stoneRows: { key: PieceKey; label: string }[] = [
    { key: "atk", label: t.raiders },
    { key: "def", label: t.defenders },
    { key: "king", label: t.king },
  ];

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
          <span className="text-sm font-semibold text-parchment-dim">{t.pieceColours}</span>
          <div className="mt-2 space-y-2">
            {stoneRows.map(({ key, label }) => {
              const custom = pieceColors[key];
              const value = custom ?? themeStones[key];
              return (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-parchment">{label}</span>
                  <div className="flex items-center gap-2">
                    <label className="color-swatch" style={{ background: value }}>
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => onPieceColor(key, e.target.value)}
                        aria-label={label}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn text-xs"
                      onClick={() => onPieceColor(key, null)}
                      disabled={!custom}
                    >
                      {t.themeDefault}
                    </button>
                  </div>
                </div>
              );
            })}
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

function ModeOverlay({
  t,
  difficulty,
  onDifficulty,
  onChoose,
}: {
  t: Translations;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  onChoose: (m: PlayMode) => void;
}) {
  // Two-step overlay: pick opponent (AI or a friend), then — for the AI — pick
  // the difficulty before the board appears.
  const [pickingDifficulty, setPickingDifficulty] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="card mx-4 w-full max-w-sm space-y-6 p-8 text-center">
        <h2 className="font-display text-2xl text-parchment">
          Brand<span className="text-gold">ubh</span>
        </h2>
        {pickingDifficulty ? (
          <>
            <p className="text-sm text-parchment-dim">{t.chooseDifficulty}</p>
            <div className="flex flex-col gap-3">
              {(
                [
                  ["easy", t.easy],
                  ["medium", t.medium],
                  ["hard", t.hard],
                ] as [Difficulty, string][]
              ).map(([d, label]) => (
                <button
                  key={d}
                  className={`btn py-3 text-base ${difficulty === d ? "btn-primary" : ""}`}
                  onClick={() => {
                    onDifficulty(d);
                    onChoose("defenders");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="text-xs text-parchment-dim underline"
              onClick={() => setPickingDifficulty(false)}
            >
              {t.back}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-parchment-dim">{t.chooseGame}</p>
            <div className="flex flex-col gap-3">
              <button
                className="btn btn-primary py-3 text-base"
                onClick={() => setPickingDifficulty(true)}
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
          </>
        )}
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
