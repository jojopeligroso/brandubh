import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gameOverText } from "./gameOverText";
import Board from "./components/Board";
import AppDrawer from "./components/AppDrawer";
import LearnModal, { type LearnView } from "./components/LearnModal";
import VictoryOverlay from "./components/VictoryOverlay";
import TablutScreen from "./components/TablutScreen";
import GameFilePanel from "./components/GameFilePanel";
import GameReview from "./components/GameReview";
import PuzzlePanel from "./components/PuzzlePanel";
import {
  acceptsGuess,
  hidesEngine,
  isFinished as attemptFinished,
  judge,
  retryStep,
  type Attempt,
} from "./game/attempt";
import type { GameFileMeta, ParsedGame } from "./game/gameFile";
import { ANALYSIS_WEIGHTS, DIFFICULTIES, evaluate, type Difficulty } from "./game/engine";
import { useAiWorker } from "./game/useAiWorker";
import { useAnalysisWorker } from "./game/useAnalysisWorker";
import EvalBar from "./components/EvalBar";
import {
  allMoves,
  applyMove,
  initialState,
  isGameOver,
  moveName,
  sideOf,
  winnerOf,
} from "./game/rules";
import type { GameState, GameStatus, Move, PlayMode, Side, Square } from "./game/types";
import {
  clearSavedGame,
  hasMatchProgress,
  loadResumableGame,
  newGameId,
  saveGame,
  snapshotGame,
  type RestoredGame,
} from "./game/persist";
import {
  rememberSurfaceOpen as rememberTablutSurface,
  wasSurfaceOpen as wasTablutSurfaceOpen,
} from "./game/tablut/persist";
import {
  matchTotals,
  newMatch,
  recordMatchGame,
  SET_LENGTH_OPTIONS,
  standing,
  startNextSet,
  unrecordLastMatchGame,
  type Match,
  type PlayerId,
} from "./game/matchSet";
import {
  CUSTOM_RULE_DEFAULTS,
  DEFAULT_VARIANT,
  VARIANTS,
  ruleFlags,
  type CustomRuleSet,
  type RuleSet,
} from "./game/variants";
import PlayerBar from "./components/PlayerBar";
import { GameToolbar, GameMenuSheet } from "./components/GameToolbar";
import { decisiveWinner, formatEvalScore } from "./evalBar";
import { useGameClock } from "./useGameClock";
import {
  CLOCK_CONTROL_KEY,
  CLOCK_CUSTOM_INCREMENT_KEY,
  CLOCK_CUSTOM_MINUTES_KEY,
  CLOCK_ENABLED_KEY,
  CUSTOM_MAX_INCREMENT,
  CUSTOM_MAX_MINUTES,
  CUSTOM_MIN_MINUTES,
  CUSTOM_TIME_CONTROL_ID,
  DEFAULT_TIME_CONTROL_ID,
  TIME_PRESETS,
  type ClockSelection,
  type TimeCategory,
  describeTimeControl,
  presetById,
  loadClockEnabled,
  loadControlId,
  loadCustomIncrement,
  loadCustomMinutes,
  resolveTimeControl,
} from "./game/clock";
import {
  banksAt,
  initialClockLine,
  isTimeLoss,
  recordArrival,
  truncateTo,
  type ClockLine,
} from "./game/clockLine";
import {
  ZEN_EXTRAS,
  loadZenConfig,
  saveZenConfig,
  type ZenConfig,
  type ZenExtraId,
} from "./zen";
import {
  loadLang,
  saveLang,
  translations,
  VISIBLE_LANGS,
  type Lang,
  type Translations,
} from "./i18n";
import { isGaelicLang, toSeanchlo, toSeanchloTable } from "./gaelic";
import {
  applyPieceColors,
  applyTheme,
  DEFAULT_PIECE_COLORS,
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
  VISIBLE_DEFENDER_EMBLEMS,
} from "./defenderEmblems";
import { aiSideOf, clockPlacement, humanSideOf, opposite } from "./game/sides";
import { BOARD_FLIP_H_KEY, BOARD_FLIP_V_KEY } from "./orientation";
import MoveTreePanel from "./components/MoveTreePanel";
import PositionPanel from "./components/PositionPanel";
import {
  addMove as treeAddMove,
  createTree,
  fromLine,
  lineTo,
  parentOf,
  promote as treePromote,
  remove as treeRemove,
  statesTo,
  tipOfLine,
  type MoveTree,
} from "./game/moveTree";
import {
  aiMayReply,
  analysisAvailable,
  autosaveAllowed,
  boardIsInteractive,
  controllableIn,
  settingsStackVisible,
} from "./analysis";
import {
  ANNOTATE_DIFFICULTY,
  type Mark,
  markGlyph,
  marksFromScores,
  terminalScore,
  type WorstMove,
} from "./game/annotate";

// ── Match-setup persistence ───────────────────────────────────────────────────
// Difficulty, variant and side survive a page refresh (a reload otherwise silently
// reset difficulty to "medium", which reads as the AI suddenly playing weaker).
// Mirrors the clock/emblem/theme persistence already in the app.
const DIFFICULTY_KEY = "brandubh.difficulty";
const VARIANT_KEY = "brandubh.variant";
const PLAYMODE_KEY = "brandubh.playMode";
function loadSetting<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v && (valid as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback; // localStorage unavailable (private mode, etc.)
  }
}
const EVAL_ON_KEY = "brandubh.evalBar";
/** The on/off counterpart of loadSetting, for the "1"/"0" flags Zen and the
 *  clock already store. Anything stored that is not "1" reads as off; a flag
 *  that has never been stored takes `fallback`, so a feature can ship on. */
function loadFlag(key: string, fallback = false): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback; // localStorage unavailable (private mode, etc.)
  }
}

// A position can be played on from unless the *board* has settled the game. A
// loss on time is the exception: it was the clock that ran out, not the
// position, so it can be resumed — with the times that position was first
// offered with, which is exactly what a player who stepped away needs.
const resumable = (status: GameStatus): boolean => !isGameOver(status) || isTimeLoss(status);


function sideLabel(s: Side, t: Translations): string {
  return s === "attackers" ? t.raiders : t.kingsSide;
}

/** The localized one-liner for a finished game — shared by the status bar and
 *  the victory overlay so the two can never drift apart. */

export default function App() {
  // Language: persisted choice, else browser detection (see i18n.loadLang).
  const [lang, setLang] = useState<Lang>(loadLang);
  useEffect(() => {
    saveLang(lang);
  }, [lang]);
  // Gaelic locales (Irish/Scottish Gaelic) render in traditional overdot
  // orthography; every other language passes through unchanged. See gaelic.ts.
  const t = useMemo(
    () => (isGaelicLang(lang) ? toSeanchloTable(translations[lang]) : translations[lang]),
    [lang],
  );
  // Flag the document for a Gaelic locale so display text uses the cló face
  // (the [data-lang-gaelic] rules in index.css); cleared for other languages.
  useEffect(() => {
    const root = document.documentElement;
    if (isGaelicLang(lang)) root.setAttribute("data-lang-gaelic", "");
    else root.removeAttribute("data-lang-gaelic");
  }, [lang]);

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

  const [variantId, setVariantId] = useState(() =>
    loadSetting(VARIANT_KEY, [...Object.keys(VARIANTS), "custom"], DEFAULT_VARIANT),
  );
  const [customRules, setCustomRules] = useState<CustomRuleSet>(CUSTOM_RULE_DEFAULTS);
  const [playMode, setPlayMode] = useState<PlayMode>(() =>
    loadSetting(PLAYMODE_KEY, ["attackers", "defenders", "hotseat"], "defenders"),
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(() =>
    loadSetting(DIFFICULTY_KEY, DIFFICULTIES, "easy"),
  );
  // Remember the match setup across refreshes.
  useEffect(() => {
    try {
      localStorage.setItem(DIFFICULTY_KEY, difficulty);
      localStorage.setItem(VARIANT_KEY, variantId);
      localStorage.setItem(PLAYMODE_KEY, playMode);
    } catch {
      /* ignore persistence failures */
    }
  }, [difficulty, variantId, playMode]);

  // ── Game clock (chess clock) ────────────────────────────────────────────────
  // A bank of thinking time plus a Fischer increment per move, à la Lichess.
  // Off by default (no timer); when enabled, defaults to 3+2.
  const [clockEnabled, setClockEnabled] = useState<boolean>(loadClockEnabled);
  const [controlId, setControlId] = useState<string>(loadControlId);
  const [customMinutes, setCustomMinutes] = useState<number>(loadCustomMinutes);
  const [customIncrement, setCustomIncrement] = useState<number>(loadCustomIncrement);
  useEffect(() => {
    try {
      localStorage.setItem(CLOCK_ENABLED_KEY, clockEnabled ? "1" : "0");
      localStorage.setItem(CLOCK_CONTROL_KEY, controlId);
      localStorage.setItem(CLOCK_CUSTOM_MINUTES_KEY, String(customMinutes));
      localStorage.setItem(CLOCK_CUSTOM_INCREMENT_KEY, String(customIncrement));
    } catch {
      /* ignore persistence failures */
    }
  }, [clockEnabled, controlId, customMinutes, customIncrement]);
  const timeControl = useMemo(
    () => resolveTimeControl(clockEnabled, controlId, customMinutes, customIncrement),
    [clockEnabled, controlId, customMinutes, customIncrement],
  );
  // The time-control picker is rendered in two places (the inline settings stack
  // and the gear ⚙ modal), so its wiring is described once here.
  const clockControls = {
    t,
    enabled: clockEnabled,
    onEnabled: setClockEnabled,
    controlId,
    onControl: setControlId,
    customMinutes,
    onCustomMinutes: setCustomMinutes,
    customIncrement,
    onCustomIncrement: setCustomIncrement,
  };
  // The same four values as one bundle, for the setup overlay's time step: it
  // starts from whatever is set now and hands a whole selection back when the
  // game is committed (see ClockSelection in game/clock.ts for why it travels
  // rather than applying as it is edited).
  const clockSelection: ClockSelection = {
    enabled: clockEnabled,
    controlId,
    customMinutes,
    customIncrement,
  };
  const applyClockSelection = (sel: ClockSelection) => {
    setClockEnabled(sel.enabled);
    setControlId(sel.controlId);
    setCustomMinutes(sel.customMinutes);
    setCustomIncrement(sel.customIncrement);
  };
  // The clocks each position was first offered with, index-aligned with the move
  // timeline below. Rewinding the board rewinds these too, so a position always
  // resumes with the time it had when it was first put in front of the player.
  const [clockLine, setClockLine] = useState<ClockLine>(() => initialClockLine(timeControl));
  // A new bank/increment re-arms the live clock (see useGameClock); the recorded
  // line starts over with it rather than keeping times from the old control.
  useEffect(() => {
    setClockLine(initialClockLine(timeControl));
  }, [timeControl]);

  // ── Board orientation (view only) ───────────────────────────────────────────
  // Which way up the board is drawn. Purely a preference about the picture: it
  // does not touch the position, the side you control or the saved game, and
  // `game/sides.ts` still holds that orientation never follows the side you
  // play. Two independent mirrors: east–west (left/right) and north–south
  // (top/bottom) — see the clock note at the render for which one moves the
  // clocks.
  const [flippedH, setFlippedH] = useState<boolean>(() => loadFlag(BOARD_FLIP_H_KEY));
  // The north–south flag falls back to the east–west one, which carries a
  // pre-split save over intact: back then there was a single key meaning a full
  // 180° rotation — *both* mirrors — and it is the key `BOARD_FLIP_H_KEY` still
  // reads. So a returning player who left the board flipped gets both toggles
  // on and sees the picture they left, rather than a half-applied east–west
  // one. One-shot by construction: the effects below write the V key on mount,
  // so the fallback only ever fires on the first load after the split.
  const [flippedV, setFlippedV] = useState<boolean>(() =>
    loadFlag(BOARD_FLIP_V_KEY, loadFlag(BOARD_FLIP_H_KEY)),
  );
  useEffect(() => {
    try {
      localStorage.setItem(BOARD_FLIP_H_KEY, flippedH ? "1" : "0");
    } catch {
      /* ignore persistence failures */
    }
  }, [flippedH]);
  useEffect(() => {
    try {
      localStorage.setItem(BOARD_FLIP_V_KEY, flippedV ? "1" : "0");
    } catch {
      /* ignore persistence failures */
    }
  }, [flippedV]);

  // ── Engine eval (bar + best-move arrow) ─────────────────────────────────────
  // Whether the analysis readout is switched on. Persisted like the flip
  // preference beside it, and separate from the Zen extra that decides whether
  // the *toggle* is on screen at all — the same two-layer arrangement the flip
  // button has (`showExtra("eval")` shows the button, this holds the state).
  const [evalOn, setEvalOn] = useState<boolean>(() => loadFlag(EVAL_ON_KEY, true));
  useEffect(() => {
    try {
      localStorage.setItem(EVAL_ON_KEY, evalOn ? "1" : "0");
    } catch {
      /* ignore persistence failures */
    }
  }, [evalOn]);

  // ── Zen mode (calm, over-the-board board) ───────────────────────────────────
  // Off by default. When on, only the essentials show — board, turn, clock,
  // move log — plus any opted-in extras. Game-flow controls are contextual and
  // handled separately, so they are never part of this config.
  const [zen, setZen] = useState<ZenConfig>(loadZenConfig);
  useEffect(() => {
    saveZenConfig(zen);
  }, [zen]);
  // An optional extra shows when Zen is off, or when it has been opted in.
  const showExtra = (id: ZenExtraId): boolean => !zen.enabled || zen.extras[id];
  const setZenEnabled = (enabled: boolean) => setZen((z) => ({ ...z, enabled }));
  const toggleZenExtra = (id: ZenExtraId) =>
    setZen((z) => ({ ...z, extras: { ...z.extras, [id]: !z.extras[id] } }));

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
  // The *live* game. In analysis these are left untouched — see the tree below —
  // so `states`/`cursor` are derived a few lines down rather than read directly.
  const [liveStates, setStates] = useState<GameState[]>(() => [initialState()]);
  const [liveCursor, setCursor] = useState(0);

  // ── Analysis (free-move) mode ───────────────────────────────────────────────
  // A scratch mode over the live game: the computer stops replying, both sides
  // become pickable, the clock stops, and nothing is written to the save. The
  // decisions that make that true are pure functions in analysis.ts (they are
  // unit-tested there); this is the state they read.
  //
  // Deliberately *not* persisted, unlike the flip preference next to it. The
  // snapshot below cannot survive a reload, so restoring the mode would put you
  // in analysis with no live game to hand back — and since analysis never
  // writes to storage, a reload already lands you safely on the real game.
  const [analysis, setAnalysis] = useState(false);

  // ── The analysis move tree (Session 7c) ─────────────────────────────────────
  // Analysis no longer borrows the live timeline: it has its own structure, a
  // *tree*, so a second idea from the same position becomes a sibling instead of
  // destroying the first (`src/game/moveTree.ts`).
  //
  // Live play stays a single line. A game has one history, the save and the
  // export encode one move list, and a takeback is meant to destroy moves — see
  // docs/design/lichess-ui.md, where that decision is written down.
  const [tree, setTree] = useState<MoveTree | null>(null);
  const [nodeId, setNodeId] = useState(0);
  // True when the tree was rooted on a *pasted position* rather than seeded from
  // the live game (Session 7e). Such a tree has no path back to the opening, so
  // its move list cannot be exported — see `positionRooted` at the export panel.
  const [pastedRoot, setPastedRoot] = useState(false);

  // ── A live game played on from a puzzle ─────────────────────────────────────
  // True when `liveStates` was seeded from a **Puzzle** position rather than
  // from the opening. Analysis is not involved — this is the real game, clock
  // running, computer answering. What it does not have is a past: the save
  // format and the export format are both move lists replayed from
  // `initialState()` (CLAUDE.md's replay-from-opening invariant), and no such
  // list reaches this board, so the game is kept out of both. Every path that
  // installs a game grown from the opening clears the flag again.
  const [positionGame, setPositionGame] = useState(false);

  // ── Resumable game ──────────────────────────────────────────────────────────
  // A game in progress is written to localStorage as it is played (see
  // game/persist.ts) and read back once, here, at startup. It is never restored
  // silently: while it is pending, the opening overlay offers Resume or a fresh
  // game, and nothing is saved over it until that choice is made.
  const [pendingResume, setPendingResume] = useState<RestoredGame | null>(loadResumableGame);

  const [selected, setSelected] = useState<Square | null>(null);
  const [fadingCaptures, setFadingCaptures] = useState<Square[]>([]);
  // The Learn hub (objectives / rules / tutorials); null = closed.
  const [learnView, setLearnView] = useState<LearnView | null>(null);
  const [thinking, setThinking] = useState(false);
  // Stats from the AI's last search — surfaced so the depth/nodes actually reached
  // on this device (not just the benchmark machine) are visible while diagnosing.
  const [lastAiInfo, setLastAiInfo] = useState<{
    depth: number;
    nodes: number;
    elapsedMs: number;
    difficulty: Difficulty;
  } | null>(null);
  const [showModeOverlay, setShowModeOverlay] = useState(true);
  // True when the setup overlay was *reopened* (drawer → New game) over a live
  // board, so it grows a way back out. The boot-time overlay has nothing behind
  // it worth returning to and keeps its original no-exit shape.
  const [modeOverlayCancelable, setModeOverlayCancelable] = useState(false);
  // A game picked in the setup overlay that would wipe a live one, held until
  // the player confirms. Null whenever nothing is awaiting an answer.
  const [pendingModeChoice, setPendingModeChoice] = useState<{
    mode: PlayMode;
    difficulty?: Difficulty;
    clock?: ClockSelection;
  } | null>(null);
  const [showTakeback, setShowTakeback] = useState(false);
  // A branch ("play from here") awaiting the opponent's agreement in hotseat play.
  const [pendingBranch, setPendingBranch] = useState<{ vsComputer: boolean } | null>(null);
  const [showResign, setShowResign] = useState(false);
  const [showNewMatchConfirm, setShowNewMatchConfirm] = useState(false);
  const [showNewGameConfirm, setShowNewGameConfirm] = useState(false);
  const [showDesign, setShowDesign] = useState(false);
  // The lichess-style toolbar's action sheet (new game / resign / settings…).
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  // The hamburger's slide-out drawer (see AppDrawer) and the two destinations
  // only it reaches: the standalone game-file modal and the about card.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showGameFile, setShowGameFile] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  /**
   * The Tablut surface, reached from the drawer's More games section.
   *
   * A sibling overlay rather than anything woven into the shell's state: Tablut is
   * a separate Boardgame with its own ruleset *type* (see ADR-0006 and the note in
   * TablutScreen), so it owns its own game, engine worker and rule editor, and
   * this shell owns nothing of it beyond whether it is open. Nothing below this
   * line reads it, which is the point — opening Tablut cannot disturb a Brandubh
   * game in progress, and closing it cannot have lost one.
   *
   * Whether it is open *persists*: a reload mid-Tablut must land back on the
   * Tablut board, exactly as a reload mid-Brandubh lands on the Brandubh one.
   * The 7×7 shell is only returned to by the player's own back button.
   */
  const [showTablut, setShowTablut] = useState(wasTablutSurfaceOpen);
  useEffect(() => {
    rememberTablutSurface(showTablut);
  }, [showTablut]);

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
  // Which side the player took (raiders or king) and which one is left for the
  // computer. Both derive from the play mode — see game/sides.ts.
  const humanSide: Side | null = humanSideOf(playMode);
  const aiSide: Side | null = aiSideOf(playMode);

  // ── What the board is actually showing ──────────────────────────────────────
  // In analysis this is the line from the tree's root down to the selected node;
  // otherwise it is the live game. Deriving it here is what lets the board, the
  // move log, the captured tray and the review controls work inside a tree
  // without any of them knowing a tree exists — they see a list of positions and
  // an index, exactly as they always have.
  //
  // Note this makes `cursor` the end of the displayed line in analysis, so
  // `atTip` is always true there: stepping "back" selects the parent *node*,
  // which shortens the line, rather than moving an index along a fixed one.
  const analysisLine = useMemo(
    () => (analysis && tree ? statesTo(tree, nodeId) : null),
    [analysis, tree, nodeId],
  );
  const states = analysisLine ?? liveStates;
  const cursor = analysisLine ? analysisLine.length - 1 : liveCursor;

  const tip = states.length - 1;

  // ── The whole line you are standing on ──────────────────────────────────────
  //
  // `states` above is the line from the root down to the *selected node*, so in
  // analysis it always ends where you are standing. That is right for the board
  // — it shows one position — and wrong for everything that describes the LINE,
  // and the difference was a cluster of bugs that all felt like one:
  //
  //  - the navigator reads "can I go forward?" as `cursor < tip`, which was
  //    never true, so forward was dead at every node: you could walk back up
  //    the tree and never return;
  //  - the status pill therefore claimed "Live", green dot and all, while you
  //    stood in the middle of a scratch variation;
  //  - the move log listed only the moves up to the current node, so it could
  //    jump back but never forward;
  //  - and the game review is keyed on the line, so stepping back changed the
  //    key and the whole review vanished until you walked to the end again.
  //
  // Stepping back is not the end of a line, it is a position with a
  // continuation. This is that continuation, and it is what the navigator, the
  // log, the review and the eval graph are all told about.
  const lineStates = useMemo(
    () => (analysis && tree ? statesTo(tree, tipOfLine(tree, nodeId)) : liveStates),
    [analysis, tree, nodeId, liveStates],
  );
  const lineEnd = lineStates.length - 1;
  const atTip = cursor === tip;
  const reviewing = !atTip;
  const game = states[cursor];
  const gameOver = isGameOver(game.status);

  // ── Victory overlay ─────────────────────────────────────────────────────────
  // Announce a game the moment it ends *live*: the watcher fires only on a
  // playing → terminal transition of the tip status, so restoring, importing
  // or browsing back into an already-finished game never re-raises the
  // curtain. Loaders that install a whole timeline pre-seed the ref (below)
  // for the same reason the clock's prevTipRef is pre-seeded.
  const [showVictory, setShowVictory] = useState(false);
  const tipStatus = states[tip].status;
  const prevTipStatusRef = useRef<GameStatus>(tipStatus);
  useEffect(() => {
    const prev = prevTipStatusRef.current;
    prevTipStatusRef.current = tipStatus;
    // A line pushed to a win in analysis is a finding, not a result — no
    // curtain. (The ref is still advanced, so leaving analysis, which restores
    // it from the live timeline, cannot raise one either.)
    if (analysis) return;
    if (prev === "playing" && isGameOver(tipStatus)) setShowVictory(true);
    else if (!isGameOver(tipStatus)) setShowVictory(false);
  }, [tipStatus, analysis]);

  const lastMove: Move | null = game.history.length
    ? game.history[game.history.length - 1].move
    : null;

  // A flag (bank hits zero) is a loss on time for that side. Only ever fires
  // while live at the tip, so it always applies to the current position.
  const onFlag = useCallback((loser: Side) => {
    setStates((prev) => {
      if (isGameOver(prev[prev.length - 1].status)) return prev;
      const status: GameState["status"] =
        loser === "attackers" ? "defenders_win_time" : "attackers_win_time";
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1], status };
      return copy;
    });
  }, []);
  // Analysis stops the clock through the same gate that stops it while you are
  // reviewing history: the banks hold where they are, no flag can fall, and the
  // *manual* pause is left alone — so leaving analysis hands back a clock in
  // exactly the state it was put aside in.
  const clock = useGameClock(timeControl, atTip && !gameOver && !analysis, onFlag);

  const aiTimer = useRef<number | null>(null);
  const { requestMove, cancel: cancelAi } = useAiWorker();
  // Guards the set recorder so a finished game is counted exactly once, even as
  // the cursor is moved back and forth over the terminal position.
  const recorded = useRef(false);
  // This game's stable identity, held for as long as the game lasts so every
  // autosave writes the same game rather than a new one. A resumed game keeps
  // the id it was saved under. See game/records.ts.
  const gameId = useRef<string>(pendingResume?.id ?? newGameId());
  const gameStartedAt = useRef<number>(pendingResume?.createdAt ?? Date.now());

  // ── Applying a move (shared by human + AI) ──────────────────────────────────
  const commitMove = useCallback(
    (move: Move) => {
      if (move.captures && move.captures.length) {
        const caps = move.captures;
        setFadingCaptures(caps);
        window.setTimeout(() => setFadingCaptures([]), 340);
      }
      // In analysis a move extends the *tree* (Session 7c). Playing from a
      // position that already has a continuation adds a sibling rather than
      // replacing it, and replaying a move already tried navigates to the branch
      // that exists instead of growing a second copy of it.
      if (analysis && tree) {
        const grown = treeAddMove(tree, nodeId, move, rules);
        setTree(grown.tree);
        setNodeId(grown.nodeId);
        setSelected(null);
        // A move played while a guess is outstanding is an answer, not just
        // exploration. It is still committed to the tree either way, so a wrong
        // guess is on the board where you can see what it does — being told
        // "no" without seeing why teaches nothing.
        if (acceptsGuess(attemptRef.current)) {
          // A review mistake is one step, and its accepted answer is the
          // worker's whole equal-best set with no scripted reply — so `isLast`
          // is always true and the returned `play` is just the move, which the
          // tree above has already taken.
          setAttempt((a) =>
            a
              ? judge(a, move, { accepted: solutionRef.current?.bestMoves ?? null, reply: null }, true)
                  .attempt
              : a,
          );
        }
        return;
      }
      // Live play only ever commits from the tip, so this appends.
      setStates((prev) => [...prev, applyMove(prev[prev.length - 1], move, rules)]);
      setCursor((c) => c + 1);
      setSelected(null);
    },
    [rules, analysis, tree, nodeId],
  );

  // ── AI turn (only while live at the tip, never while browsing) ───────────────
  // The search runs in a Web Worker (see useAiWorker), so even a long `hard`
  // think never freezes the board. A minimum "thinking" delay keeps fast moves
  // (easy/medium) from snapping instantly, preserving the pacing of play.
  const AI_MIN_THINK_MS = 350;
  useEffect(() => {
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    // Analysis suppresses the auto-reply outright — see `aiMayReply`.
    if (
      !aiMayReply({
        analysis,
        atTip,
        gameOver,
        paused: clock.paused,
        aiSide,
        turn: game.turn,
      })
    ) {
      setThinking(false);
      cancelAi();
      return;
    }
    setThinking(true);
    let cancelled = false;
    const start = performance.now();
    requestMove(game, difficulty, rules).then((res) => {
      if (cancelled) return;
      const wait = Math.max(0, AI_MIN_THINK_MS - (performance.now() - start));
      aiTimer.current = window.setTimeout(() => {
        if (cancelled) return;
        setThinking(false);
        setLastAiInfo({ depth: res.depth, nodes: res.nodes, elapsedMs: res.elapsedMs, difficulty });
        if (res.move) commitMove(res.move);
      }, wait);
    });
    return () => {
      cancelled = true;
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
    };
  }, [
    game,
    atTip,
    aiSide,
    difficulty,
    rules,
    gameOver,
    commitMove,
    clock.paused,
    analysis,
    requestMove,
    cancelAi,
  ]);

  // ── Background analysis (eval bar + best-move arrow) ────────────────────────
  //
  // Evaluates the position **on screen** — `states[cursor]`, not the tip — so
  // stepping back through the game shows what the engine made of each position
  // as you pass it, which is the whole point of an eval bar on a timeline.
  //
  // It cannot interfere with the live game's search. The two run on separate
  // worker threads (see useAnalysisWorker for why that is structural, not
  // incidental), so neither one's cancellation touches the other and the AI's
  // move is never delayed by a cursor step. The debounce below is about not
  // *starting* work that is already stale: scrubbing quickly through a game
  // fires one search at the end of the scrub rather than one per position.
  const ANALYSIS_DEBOUNCE_MS = 220;
  const { requestAnalysis, cancel: cancelAnalysis } = useAnalysisWorker();
  const [evalInfo, setEvalInfo] = useState<{
    score: number;
    depth: number;
    move: Move | null;
    /** The equal-best set from the search — see `SearchResult.bestMoves`. */
    bestMoves: Move[];
  } | null>(null);
  const [evalPending, setEvalPending] = useState(false);
  // A depth-8 answer for the position on screen, asked for rather than assumed.
  // Cleared whenever the position changes, so the deep badge can never describe
  // a board you have already left.
  const [deepRequest, setDeepRequest] = useState(0);

  // Analysis is a post-game room, and the door is locked until the game is over
  // — see `analysisAvailable`. The gate is on the *room*, not on the furniture:
  // the eval bar, the best-move arrow, the annotation pass and a pasted position
  // are all things analysis offers, so gating each one separately would be four
  // chances to miss a door. The live game's result is what unlocks it, and
  // reading that is trivial since 7c: `liveStates` is the live game, and
  // analysis never writes to it.
  //
  // The eval bar therefore has no gate of its own. It is part of analysis, and
  // it shows when you are in analysis — subject only to the Zen extra and its
  // own on/off toggle, which are preferences rather than permissions.
  const liveTipStatus = liveStates[liveStates.length - 1].status;
  const canAnalyse = analysisAvailable({ liveGameOver: isGameOver(liveTipStatus) });
  // ── Learn from your mistakes (Session 7f) ───────────────────────────────────
  // Tapping a costliest move does not show you the better one: it puts you back
  // in the position and asks you to find it. See game/attempt.ts.
  // Review mistakes are one source of an Attempt; the bank is the other, and it
  // renders its own panel rather than this one (see the plan's 8d).
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  // The answer, fetched when the Attempt opens and deliberately NOT rendered
  // while a guess is outstanding. A review mistake's answer is the worker's
  // equal-best set, which is why it arrives late and may hold several moves.
  const [attemptAnswer, setAttemptAnswer] = useState<{
    bestMoves: Move[];
    move: Move | null;
  } | null>(null);
  // The sequential lesson (lichess's "Learn from your mistakes"): one side's
  // mistakes and blunders in game order, each opened as the Attempt above. Null
  // when one was opened on its own from the costliest-moves list.
  const [lesson, setLesson] = useState<{ queue: WorstMove[]; index: number } | null>(null);

  const showEval = analysis && evalOn && showExtra("eval") && !hidesEngine(attempt);
  // Read by `commitMove`, which must not be rebuilt on every stage change.
  const attemptRef = useRef<Attempt | null>(null);
  const solutionRef = useRef<{ bestMoves: Move[]; move: Move | null } | null>(null);
  attemptRef.current = attempt;
  solutionRef.current = attemptAnswer;

  /**
   * The equal-best alternatives to draw beside the primary arrow.
   *
   * Capped at two extra (three arrows total) because past that the board is a
   * diagram of the engine rather than a picture of the position — and because
   * a position with a dozen equally-good moves is telling you it does not
   * matter, which three arrows say just as well as twelve.
   *
   * Empty whenever the engine has a single best move. That is the rule you
   * asked for and it is worth stating plainly: a second arrow is a claim that
   * two moves are *the same*, and the engine only makes that claim when their
   * scores are exactly equal (see `SearchResult.bestMoves`).
   */
  const ALT_ARROW_CAP = 2;
  const altBestMoves = useMemo(() => {
    const all = evalInfo?.bestMoves ?? [];
    const primary = evalInfo?.move;
    if (!primary || all.length < 2) return [];
    return all
      .filter(
        (m) =>
          !(
            m.from.row === primary.from.row &&
            m.from.col === primary.from.col &&
            m.to.row === primary.to.row &&
            m.to.col === primary.to.col
          ),
      )
      .slice(0, ALT_ARROW_CAP);
  }, [evalInfo]);
  useEffect(() => {
    if (!showEval) {
      // Switched off (or hidden by Zen): stop searching and drop the readout, so
      // turning it back on cannot show a stale eval for a different position.
      cancelAnalysis();
      setEvalInfo(null);
      setEvalPending(false);
      return;
    }
    // A finished position has no best move and needs no search — its result is
    // already on the board.
    if (isGameOver(game.status)) {
      cancelAnalysis();
      setEvalPending(false);
      setEvalInfo({
        score: evaluate(game, ANALYSIS_WEIGHTS, rules),
        depth: 0,
        move: null,
        bestMoves: [],
      });
      return;
    }
    let cancelled = false;
    setEvalPending(true);
    const timer = window.setTimeout(() => {
      requestAnalysis(game, rules, deepRequest > 0).then((res) => {
        if (cancelled) return; // the position moved on under us
        setEvalInfo({
          score: res.score,
          depth: res.depth,
          move: res.move,
          bestMoves: res.bestMoves,
        });
        setEvalPending(false);
      });
    }, ANALYSIS_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [showEval, game, rules, requestAnalysis, cancelAnalysis, deepRequest]);

  // A deep answer describes one position. Moving the board drops the request so
  // the badge can never claim depth 8 for a board you have already left.
  useEffect(() => setDeepRequest(0), [game]);

  // ── Drive the clock from the move timeline ──────────────────────────────────
  // Each new move at the tip presses the mover's clock (banks their increment
  // and hands the running clock to the opponent). The banks that result are the
  // arrival time of the position just reached, so they go into the clock line;
  // going back to that position later replays exactly them.
  const prevTipRef = useRef(tip);
  useEffect(() => {
    const prev = prevTipRef.current;
    prevTipRef.current = tip;
    if (!clock.enabled) return;
    if (analysis) return; // an explored move is not a played move — no press
    if (tip !== prev + 1) return; // stepping back is handled by rewindTo
    // After a move, the position's `turn` is the side *now* to move, so the
    // mover was the opposite side.
    const banks = clock.press(opposite(states[tip].turn));
    setClockLine((line) => recordArrival(line, tip, banks));
    // Only react to timeline length changes, not cursor scrubbing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tip]);

  // ── Returning the live game to an earlier position ──────────────────────────
  // Takebacks and "play from here" both land here. The timeline is cut back to
  // `ply`, and both clocks are put back to the times that position was first
  // offered with — which lifts a flag that fell after it, so a game the player
  // walked away from can be picked up again rather than being stuck lost on
  // time. A loss on time *at* `ply` is a clock result, not a board one, so
  // resuming the position clears it too.
  const rewindTo = useCallback(
    (ply: number) => {
      if (analysis) return; // analysis branches in the tree; it never cuts the live line
      setStates((prev) => {
        const next = prev.slice(0, ply + 1);
        if (isTimeLoss(next[ply].status)) next[ply] = { ...next[ply], status: "playing" };
        return next;
      });
      setClockLine((line) => truncateTo(line, ply));
      prevTipRef.current = ply; // this is a rewind, not a move
      if (clock.enabled) {
        clock.resumeAt(banksAt(clockLine, ply, timeControl), states[ply].turn, ply > 0);
      }
    },
    [clock, clockLine, states, timeControl, analysis],
  );

  // ── Entering and leaving analysis ───────────────────────────────────────────
  // Since 7c, analysis does not borrow the live timeline at all: entering seeds
  // a move tree from the live line and every exploratory move goes into that,
  // so `liveStates`/`liveCursor` are simply never written while analysing. The
  // snapshot-and-restore 7b needed is gone with the borrowing that made it
  // necessary — there is nothing left to put back.
  //
  // What still stands is the autosave guard (see `persistGame`): `states` is the
  // *derived* line, so without it a page-hide mid-variation would happily write
  // an explored position over the real game.
  const enterAnalysis = useCallback(() => {
    // The gate, enforced rather than merely displayed. Hiding the button is how
    // the rule is *shown*; this is how it holds — a keyboard route, a stale
    // render or a future caller cannot open the door on a game still being
    // played. Every other way in (the position panel, the annotation pass)
    // reads the same predicate.
    if (!analysisAvailable({ liveGameOver: isGameOver(liveStates[liveStates.length - 1].status) }))
      return;
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    cancelAi();
    const seeded = fromLine(liveStates);
    setTree(seeded);
    setPastedRoot(false);
    // Open on the position the player was looking at, not at the root.
    setNodeId(lineTo(seeded, tipOfLine(seeded, seeded.rootId))[liveCursor] ?? seeded.rootId);
    setAnalysis(true);
    setZenEnabled(false);
    setThinking(false);
    setSelected(null);
    setFadingCaptures([]);
    setShowTakeback(false);
  }, [liveStates, liveCursor, cancelAi, setZenEnabled]);

  const exitAnalysis = useCallback(() => {
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    cancelAi();
    setAnalysis(false);
    setTree(null);
    setPastedRoot(false);
    setThinking(false);
    setSelected(null);
    setFadingCaptures([]);
    // The live game was never touched, so it needs no restoring — but the board
    // is about to jump from a variation back to it, and neither the clock nor
    // the victory curtain may read that as something that just happened (the
    // same guards the resume and import paths use).
    prevTipRef.current = liveStates.length - 1;
    prevTipStatusRef.current = liveStates[liveStates.length - 1].status;
    setShowVictory(false);
  }, [cancelAi, liveStates]);

  const toggleAnalysis = useCallback(() => {
    if (analysis) exitAnalysis();
    else enterAnalysis();
  }, [analysis, enterAnalysis, exitAnalysis]);

  // ── Analysing a pasted position (Session 7e) ────────────────────────────────
  // The tree already roots at any GameState, so a pasted position needs nothing
  // new from it: `createTree(position)` and analysis works exactly as it does on
  // the live game. The position lives only here, in component state — the same
  // place the tutorial set-plays keep their hand-built boards — so the
  // replay-from-opening invariant (CLAUDE.md) holds without a guard: analysis
  // has never written to storage.
  const loadPosition = useCallback(
    (position: GameState) => {
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
      cancelAi();
      const seeded = createTree(position);
      setTree(seeded);
      setNodeId(seeded.rootId);
      setPastedRoot(true);
      setAnalysis(true);
      setThinking(false);
      setSelected(null);
      setFadingCaptures([]);
      setShowTakeback(false);
      setShowVictory(false);
    },
    [cancelAi],
  );

  // Leaving analysis for the paths that install a whole new game of their own
  // (new game, import, resume): the tree describes a game that is being
  // replaced, so it is discarded rather than carried across.
  const dropAnalysis = useCallback(() => {
    setAnalysis(false);
    setTree(null);
    setPastedRoot(false);
  }, []);

  // ── Playing on from a puzzle position ───────────────────────────────────────
  // The door out of the puzzle trainer: the position a puzzle finished on
  // becomes the live game. A **Truncated** line stops at the deciding move and
  // says nothing about converting it (ADR-0002); this is where that gets
  // answered, by playing it out against an opponent.
  //
  // It is a game in every respect but two. It cannot be *saved* and cannot be
  // *exported*, because both formats are move lists replayed from
  // `initialState()` and this board was never reached from one — so
  // `positionGame` closes the autosave (`positionRoot` in analysis.ts) and the
  // export panel, and the save already on disk, which describes a different
  // game entirely, is dropped rather than left to be silently written over.
  //
  // `humanSide` comes from the puzzle screen rather than from the position: the
  // solver keeps the side they solved as, which is *not* the side to move at
  // the end of a line, so the computer opens with the reply. Null is over the
  // board, where nobody replies.
  const playFromPosition = useCallback(
    (position: GameState, side: Side | null) => {
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
      cancelAi();
      dropAnalysis();
      clearSavedGame();
      recorded.current = false;
      setPositionGame(true);
      // A new game in every sense the record cares about: its own identity and
      // its own start time (see game/records.ts).
      gameId.current = newGameId();
      gameStartedAt.current = Date.now();
      // The board arrives whole rather than a move at a time, so neither the
      // clock nor the victory curtain may read it as something that just
      // happened — the same guard the import and resume paths use.
      prevTipRef.current = 0;
      prevTipStatusRef.current = position.status;
      setShowVictory(false);
      setPlayMode(side ?? "hotseat");
      // A match is a series of games from the opening with the sides swapping
      // between them; a one-off from a puzzle is not part of one, and the
      // import path lands over the board the same way.
      setMatch(null);
      setStates([position]);
      setCursor(0);
      setSelected(null);
      setFadingCaptures([]);
      setThinking(false);
      setShowTakeback(false);
      setClockLine(initialClockLine(timeControl));
      clock.reset();
    },
    [cancelAi, dropAnalysis, clock.reset, timeControl],
  );

  // ── Moving around the tree ──────────────────────────────────────────────────
  // The review controls mean something slightly different in analysis: "back" is
  // the parent node and "forward" is the first child, so stepping back and then
  // playing something else branches instead of overwriting. Outside analysis
  // they are the cursor moves they always were.
  const selectNode = useCallback((id: number) => {
    setSelected(null);
    setNodeId(id);
  }, []);

  /**
   * Jump to a ply of the line you are on — the graph, the costliest-move list
   * and the move log all go through here.
   *
   * In analysis it resolves against the line to the *end* of the current
   * variation, not to the selected node, so it can move forward as well as
   * back. Resolving against the selected node is what made the move log a
   * one-way trip.
   */
  const jumpToPly = useCallback(
    (ply: number) => {
      setSelected(null);
      if (analysis && tree) {
        const full = lineTo(tree, tipOfLine(tree, nodeId));
        setNodeId(full[Math.max(0, Math.min(full.length - 1, ply))] ?? nodeId);
        return;
      }
      setCursor(Math.max(0, Math.min(liveStates.length - 1, ply)));
    },
    [analysis, tree, nodeId, liveStates.length],
  );

  /**
   * Open a mistake as an Attempt: sit at the position *before* it, with the
   * engine's opinion hidden, and fetch the answer quietly in the background.
   *
   * The answer is searched deep. The shallow background pass is tuned for
   * re-running on every cursor step; a question someone has stopped to think
   * about deserves the better answer, and there is exactly one of them.
   *
   * A review mistake is a one-step Line, so `step` opens at 0 and stays there.
   */
  const startAttempt = useCallback(
    (ply: number, mover: Side) => {
      if (ply < 1) return;
      setAttemptAnswer(null);
      setAttempt({ source: { kind: "review", ply }, mover, stage: "guessing", step: 0, attempts: 0 });
      jumpToPly(ply - 1);
    },
    [jumpToPly],
  );

  const exitAttempt = useCallback(() => {
    setAttempt(null);
    setAttemptAnswer(null);
    setLesson(null);
  }, []);

  /** Begin the lesson: the first queued mistake opens as an Attempt. */
  const startLesson = useCallback(
    (queue: WorstMove[]) => {
      if (queue.length === 0) return;
      setLesson({ queue, index: 0 });
      startAttempt(queue[0].ply, queue[0].mover);
    },
    [startAttempt],
  );

  /**
   * Move to the next queued mistake — the Skip button while guessing and the
   * Next button once finished are the same step. Past the end, the lesson is
   * over and the panel closes.
   */
  const advanceLesson = useCallback(() => {
    if (!lesson) {
      exitAttempt();
      return;
    }
    const next = lesson.index + 1;
    if (next >= lesson.queue.length) {
      exitAttempt();
      return;
    }
    setLesson({ queue: lesson.queue, index: next });
    startAttempt(lesson.queue[next].ply, lesson.queue[next].mover);
  }, [lesson, startAttempt, exitAttempt]);

  /** Give up and be shown. A legitimate ending, not a lesser one. */
  const revealSolution = useCallback(() => {
    setAttempt((a) => (a ? { ...a, stage: "revealed" } : a));
  }, []);

  /**
   * Take the wrong move back and stand in the position again.
   *
   * The branch it created is removed rather than left behind: a tree littered
   * with a learner's rejected guesses is noise, and they did not ask to keep
   * them — they asked to try again.
   */
  const tryAgain = useCallback(() => {
    if (!tree) return;
    const parent = parentOf(tree, nodeId);
    if (parent !== null) {
      setTree(treeRemove(tree, nodeId));
      setNodeId(parent);
    }
    setSelected(null);
    // Back to the *same* step. Removing the branch is this caller's half of it;
    // a bank puzzle rewinds differently and `retryStep` is blind to which.
    setAttempt((a) => (a ? retryStep(a) : a));
  }, [tree, nodeId]);

  // Fetch the answer when an Attempt opens — deep, and quietly. The shallow pass
  // is tuned to re-run on every cursor step; a question someone has stopped to
  // think about deserves the better answer, and there is one of them.
  //
  // Review only: a bank puzzle's answer is stored, so there is nothing to fetch.
  useEffect(() => {
    if (!attempt || attemptAnswer) return;
    if (attempt.source.kind !== "review") return;
    const pos = lineStates[attempt.source.ply - 1];
    if (!pos) return;
    let cancelled = false;
    requestAnalysis(pos, rules, true).then((res) => {
      if (cancelled) return;
      setAttemptAnswer({ bestMoves: res.bestMoves, move: res.move });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, attemptAnswer, lineStates, rules, requestAnalysis]);

  const promoteCurrent = useCallback(() => {
    if (!tree) return;
    setTree(treePromote(tree, nodeId));
  }, [tree, nodeId]);

  // Deleting the branch you are standing on has to move you somewhere that still
  // exists — its parent, which is always the position it departed from.
  const deleteCurrent = useCallback(() => {
    if (!tree || nodeId === tree.rootId) return;
    const parent = parentOf(tree, nodeId) ?? tree.rootId;
    setTree(treeRemove(tree, nodeId));
    setSelected(null);
    setNodeId(parent);
  }, [tree, nodeId]);

  // ── Post-game annotations (Session 7d) ──────────────────────────────────────
  // Re-search the displayed line position by position and mark the moves where
  // the evaluation swung. The judgement is in `game/annotate.ts`, where it is
  // unit-tested; what lives here is the walk, because it drives the worker.
  //
  // One search per *position*, not two per move: the value after ply k is the
  // value before ply k+1, so an n-move game costs n+1 searches.
  //
  // The marks are stored against the exact line they were computed for, so
  // stepping into a variation hides them rather than showing another line's
  // verdicts, and stepping back shows them again.
  const [annotation, setAnnotation] = useState<{
    key: string;
    marks: (Mark | null)[];
    /** Per-ply scores. The pass computed these all along and threw them away;
     *  they are what the eval graph is drawn from. */
    scores: number[];
  } | null>(null);
  const [annotating, setAnnotating] = useState<{ done: number; total: number } | null>(null);
  const annotateStopped = useRef(false);

  const lineKey = useMemo(
    () => lineStates[lineEnd].history.map((h) => moveName(h.move)).join(" "),
    [lineStates, lineEnd],
  );
  const marks = annotation?.key === lineKey ? annotation.marks : null;

  // The real constraint is the single worker: the pass must not race the AI for
  // it.
  //
  // Availability was originally reasoned about from the *engine's* side — offer
  // it wherever the AI will not be wanting the worker: a finished game, analysis
  // (which suppresses the AI), or over-the-board play (where there is no
  // computer at all). That is a sound answer to a different question, and it
  // left the pass runnable mid-game in two of those three cases. Re-searching
  // every move of a game still being played, and being told where it swung, is
  // engine assistance during play — over the board it is assistance in front of
  // the opponent it is being used against.
  //
  // So it now shares the eval bar's gate: `evalAvailable`, on the *live* game's
  // result. Annotations are what 7d always called them — post-game — and this is
  // the reading that matches the name. Analysis on a *finished* game still
  // annotates, since the gate reads the live result rather than the tip.
  const canAnnotate = tip >= 1 && !thinking && canAnalyse;

  // Run it without being asked. The pass existed before this and went unused
  // because it sat behind a button below the fold: a review you have to know
  // about is a review most people never see. Entering analysis on a finished
  // game *is* the request, so the answer is already being computed by the time
  // the screen settles. Keyed on the line so it runs once per line, not once
  // per render, and skipped while one is already in flight.
  const autoRan = useRef<string | null>(null);
  useEffect(() => {
    if (!analysis || !canAnalyse) return;
    if (annotating || lineStates.length < 2) return;
    const key = lineKey;
    if (autoRan.current === key || annotation?.key === key) return;
    autoRan.current = key;
    void runAnnotation();
    // `runAnnotation` is stable enough for this: it is recreated when the line
    // changes, which is exactly when a re-run is wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, canAnalyse, lineStates, lineKey, annotating, annotation]);

  const stopAnnotating = useCallback(() => {
    // The in-flight search is left to finish rather than terminating the worker:
    // `cancel()` kills it mid-search and the promise waiting on it would never
    // settle. At this depth that is one position's wait, ~50ms.
    annotateStopped.current = true;
  }, []);

  const runAnnotation = useCallback(async () => {
    // Judge the whole line, not the slice up to wherever the cursor happens to
    // be — otherwise stepping back would re-key the review and throw it away.
    const line = lineStates;
    if (line.length < 2) return;
    const key = line[line.length - 1].history.map((h) => moveName(h.move)).join(" ");
    annotateStopped.current = false;
    setAnnotation(null);
    setAnnotating({ done: 0, total: line.length });

    const scores: number[] = [];
    const onlyMoves: boolean[] = [];
    for (let k = 0; k < line.length; k++) {
      if (annotateStopped.current) {
        setAnnotating(null);
        return;
      }
      // A position the board has already settled is read from its result; with
      // no legal moves a search reports 0, which would read as "level" in the
      // very place the game was decided.
      const settled = terminalScore(line[k].status);
      scores.push(settled ?? (await requestMove(line[k], ANNOTATE_DIFFICULTY, rules)).score);
      if (k < line.length - 1) {
        onlyMoves.push(allMoves(line[k].board, line[k].turn, rules).length === 1);
      }
      setAnnotating({ done: k + 1, total: line.length });
    }

    if (annotateStopped.current) {
      setAnnotating(null);
      return;
    }
    const movers = line.slice(1).map((s) => s.history[s.history.length - 1].sideThatMoved);
    setAnnotation({ key, marks: marksFromScores(scores, movers, onlyMoves), scores });
    setAnnotating(null);
  }, [lineStates, rules, requestMove]);

  // A pass judges one line; anything that replaces the game underneath it must
  // stop it rather than let it finish and label a game that is no longer there.
  useEffect(() => {
    if (annotating) annotateStopped.current = true;
    // Only on a change of game identity, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantId, playMode]);

  // ── Human interaction ───────────────────────────────────────────────────────
  const interactive = boardIsInteractive({
    analysis,
    atTip,
    gameOver,
    thinking,
    paused: clock.paused,
    humanSide,
    turn: game.turn,
  });

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
          setSelected(sq.row === selected.row && sq.col === selected.col ? null : sq);
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
    dropAnalysis();
    recorded.current = false;
    // Back at the opening, so whatever position was played on from is behind
    // us: this game replays from `initialState()` and may be saved and exported.
    setPositionGame(false);
    // A fresh board is a new game, so it gets a new identity (see game/records.ts).
    gameId.current = newGameId();
    gameStartedAt.current = Date.now();
    prevTipRef.current = 0;
    setStates([initialState()]);
    setCursor(0);
    setSelected(null);
    setFadingCaptures([]);
    setThinking(false);
    setShowTakeback(false);
    setClockLine(initialClockLine(timeControl));
    clock.reset();
  }, [clock.reset, timeControl, dropAnalysis]);

  // Fresh board and, in hotseat play, a brand-new match (score reset to zero).
  // Starting over is also the moment a saved game stops being worth keeping.
  const resetGame = useCallback(() => {
    resetBoard();
    setMatch(playMode === "hotseat" ? newMatch(gamesPerSet) : null);
    clearSavedGame();
  }, [resetBoard, playMode, gamesPerSet]);

  // ── Load an imported game into the timeline ─────────────────────────────────
  // The parsed states are engine output — every ply was replayed through
  // `applyMove` on the way in (see game/replay.ts) — so they drop straight into
  // `states` and the existing review controls work on them unchanged: step back
  // and forth, click the move log, branch with "play from here".
  //
  // An import lands over the board rather than in whatever mode you were in. An
  // imported game is often mid-position and often the computer's turn, and the
  // AI effect would otherwise play a move on top of it the instant it appeared;
  // "play from here vs the computer" hands a side back whenever you want one.
  //
  // It is a *different game* from whatever was on the board, so it takes a new
  // identity and a fresh clock line: reusing the old id would autosave the
  // import as a continuation of a game it has nothing to do with, and the old
  // per-ply banks are index-aligned to a timeline that no longer exists, so a
  // rewind would hand out another game's times.
  const loadImportedGame = useCallback(
    (imported: ParsedGame) => {
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
      cancelAi();
      dropAnalysis();
      recorded.current = false;
      // An imported game *is* a move list from the opening (game/replay.ts), so
      // it is savable and exportable however the board it replaces got there.
      setPositionGame(false);
      gameId.current = newGameId();
      gameStartedAt.current = Date.now();
      const tipIndex = imported.states.length - 1;
      // The timeline arrives whole, so the clock must not read the jump as a
      // move being played (the same guard the resume path uses).
      prevTipRef.current = tipIndex;
      // A finished import is history, not a live result — no victory curtain.
      prevTipStatusRef.current = imported.states[tipIndex].status;
      setShowVictory(false);
      setVariantId(imported.variantId);
      if (imported.variantId === "custom") setCustomRules(ruleFlags(imported.rules));
      setPlayMode("hotseat");
      setMatch(null);
      setStates(imported.states);
      setCursor(tipIndex);
      setSelected(null);
      setFadingCaptures([]);
      setThinking(false);
      setShowTakeback(false);
      setClockLine(initialClockLine(timeControl));
      clock.reset();
    },
    [cancelAi, clock.reset, timeControl, dropAnalysis],
  );

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
    if (analysis) return; // an explored line never scores the set
    if (!atTip || !gameOver || recorded.current) return;
    if (match.set.results.length >= match.set.gamesPerSet) return;
    recorded.current = true;
    setMatch((m) => (m ? recordMatchGame(m, game.status, game.moveCount) : m));
  }, [playMode, match, analysis, atTip, gameOver, game.status, game.moveCount]);

  // ── Resume a saved game ─────────────────────────────────────────────────────
  // Put back the setup the game was played under, then the timeline itself.
  // The clock banks only come back onto a matching time control: resuming a 3+2
  // game into a 10+0 setting would otherwise hand out or steal time.
  const resumeSavedGame = useCallback(() => {
    const r = pendingResume;
    if (!r) return;
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    dropAnalysis();
    // A restored game replayed from the opening to get here (game/persist.ts),
    // so it is a saved game again in every sense.
    setPositionGame(false);
    setVariantId(r.variantId);
    setCustomRules(r.customRules);
    setPlayMode(r.playMode);
    setDifficulty(r.difficulty);
    setGamesPerSet(r.gamesPerSet);
    setNames(r.names);
    setMatch(r.match);
    recorded.current = r.recorded;
    // Resuming continues the same game, so it keeps its id and start time.
    gameId.current = r.id;
    gameStartedAt.current = r.createdAt;
    // The timeline arrives whole rather than a move at a time, so the clock
    // must not read the jump as a move being played.
    prevTipRef.current = r.states.length - 1;
    // A restored game's result (a resumable time loss) is old news, not a
    // fresh live ending — no victory curtain on resume.
    prevTipStatusRef.current = r.states[r.states.length - 1].status;
    setShowVictory(false);
    setStates(r.states);
    setCursor(r.cursor);
    setSelected(null);
    setFadingCaptures([]);
    setThinking(false);
    if (
      r.clock &&
      timeControl &&
      r.clock.initialSeconds === timeControl.initialSeconds &&
      r.clock.incrementSeconds === timeControl.incrementSeconds
    ) {
      clock.restore(r.clock);
      // A saved line comes back as it was; a save written before the line
      // existed starts a fresh one, so its earlier positions rewind to a full
      // bank rather than blocking play.
      setClockLine(r.clock.line.length ? r.clock.line : initialClockLine(timeControl));
    }
    setPendingResume(null);
    setShowModeOverlay(false);
  }, [pendingResume, timeControl, clock.restore, dropAnalysis]);

  // Declining the offer discards the save immediately, so the fresh game starts
  // from a clean slate however the player sets it up.
  const discardSavedGame = useCallback(() => {
    setPendingResume(null);
    clearSavedGame();
    // The id was seeded from the save being offered; dropping it means the next
    // game is a new game, so it must not inherit the discarded one's identity.
    gameId.current = newGameId();
    gameStartedAt.current = Date.now();
  }, []);

  // ── Autosave ────────────────────────────────────────────────────────────────
  // Written on every move, cursor move and score change; the clock banks ride
  // along, refreshed whenever the clock is pressed (the between-press ticking is
  // caught by the page-hide handler below rather than by writing ten times a
  // second). Nothing is written while the overlay is still offering to resume —
  // an empty board must never overwrite the game it is offering to restore.
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const persistGame = useCallback(() => {
    // Two reasons never to write: the opening overlay is still offering to
    // restore a save (an empty board must not overwrite it), and analysis is on
    // (a scratch line must not overwrite the game it branched from). See
    // `autosaveAllowed` in analysis.ts.
    if (
      !autosaveAllowed({
        analysis,
        offeringResume: showModeOverlay || pendingResume !== null,
        // A game played on from a puzzle has no move list from the opening to
        // write — see `playFromPosition`.
        positionRoot: positionGame,
      })
    )
      return;
    if (tip < 1 && !hasMatchProgress(match)) {
      clearSavedGame(); // nothing worth resuming
      return;
    }
    const c = clockRef.current;
    saveGame(
      snapshotGame({
        id: gameId.current,
        createdAt: gameStartedAt.current,
        states,
        cursor,
        variantId,
        customRules,
        playMode,
        difficulty,
        recorded: recorded.current,
        clock: timeControl
          ? {
              initialSeconds: timeControl.initialSeconds,
              incrementSeconds: timeControl.incrementSeconds,
              remaining: c.remaining,
              active: c.active,
              started: c.started,
              flagged: c.flagged,
              // The per-position times ride along with the banks: without them
              // a reload would forget what each move was first offered with.
              line: clockLine,
            }
          : null,
        match,
        gamesPerSet,
        names,
      }),
    );
  }, [
    analysis,
    positionGame,
    showModeOverlay,
    pendingResume,
    tip,
    states,
    cursor,
    variantId,
    customRules,
    playMode,
    difficulty,
    match,
    gamesPerSet,
    names,
    timeControl,
    // Clock book-keeping changes on a press/reset, never on a tick.
    clock.active,
    clock.started,
    clock.flagged,
  ]);
  useEffect(() => {
    persistGame();
  }, [persistGame]);
  // Leaving the page (closing the tab, backgrounding on mobile) is the one
  // moment the ticking clock has to be captured — `pagehide` fires where
  // `unload` is unreliable on iOS, and `visibilitychange` covers app switching.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") persistGame();
    };
    window.addEventListener("pagehide", persistGame);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", persistGame);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [persistGame]);

  const goPrev = useCallback(() => {
    setSelected(null);
    if (analysis && tree) {
      setNodeId((id) => parentOf(tree, id) ?? id);
      return;
    }
    setCursor((c) => Math.max(0, c - 1));
  }, [analysis, tree]);
  const goNext = useCallback(() => {
    setSelected(null);
    if (analysis && tree) {
      // The first child is the mainline continuation of wherever you are; the
      // other branches are reached from the tree panel.
      setNodeId((id) => tree.nodes[id]?.children[0] ?? id);
      return;
    }
    setCursor((c) => Math.min(tip, c + 1));
  }, [analysis, tree, tip]);
  const goLatest = useCallback(() => {
    setSelected(null);
    if (analysis && tree) {
      setNodeId((id) => tipOfLine(tree, id));
      return;
    }
    setCursor(tip);
  }, [analysis, tree, tip]);

  // Branch the game at the currently-viewed position and resume play.
  const playFromHere = useCallback(
    (vsComputer: boolean) => {
      if (analysis) return; // branching the live game is not an analysis action
      if (!resumable(states[cursor].status)) return; // nothing to play from a finished position
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
      // A game already banked into the set is coming back to life (only a loss
      // on time can be), so take its result back out — otherwise the resumed
      // game would be scored twice.
      if (recorded.current) setMatch((m) => (m ? unrecordLastMatchGame(m) : m));
      recorded.current = false; // this branch becomes a fresh live game
      const sideToMove = states[cursor].turn;
      rewindTo(cursor);
      setSelected(null);
      setFadingCaptures([]);
      setThinking(false);
      if (vsComputer) {
        // The human keeps the side to move; the computer takes the other side.
        setPlayMode(sideToMove);
      }
    },
    [cursor, states, rewindTo, analysis],
  );

  // Over the board, resuming from an earlier move discards every move that
  // followed — a multi-move takeback — so it needs the opponent's agreement,
  // routed through the same confirmation screen. Solo play (vs the computer)
  // has no opponent to ask, so it branches immediately.
  const requestPlayFromHere = useCallback(
    (vsComputer: boolean) => {
      if (!resumable(states[cursor].status)) return;
      if (humanSide === null) setPendingBranch({ vsComputer });
      else playFromHere(vsComputer);
    },
    [states, cursor, humanSide, playFromHere],
  );

  const doTakeback = useCallback(() => {
    setShowTakeback(false);
    if (analysis || tip < 1) return;
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    rewindTo(tip - 1);
    setCursor(tip - 1);
    setSelected(null);
    setFadingCaptures([]);
    setThinking(false);
  }, [tip, rewindTo, analysis]);

  const resign = useCallback(() => {
    setShowResign(false);
    if (analysis) return; // you cannot resign a position you are only exploring
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
  }, [gameOver, atTip, humanSide, game.turn, analysis]);

  // ── Changing the rules ──────────────────────────────────────────────────────
  // A ruleset change cannot be applied to a game already in progress: the board
  // stands in a position the new rules may never have allowed, and the moves
  // that produced it may have taken pieces the new rules would have left alone.
  // So a rule change is a new game — `resetGame` clears the board, restarts the
  // match, *and* drops the save.
  //
  // Dropping the save is not housekeeping, it is the half that makes storage
  // agree with the UI. The autosave writes the current move list alongside the
  // current ruleset, and `restoreGame` replays that list under those rules
  // (game/persist.ts); leaving the two paired after a rule change would hand a
  // reload a move list to reinterpret under rules it was never played under.
  //
  // Both entry points go through here — picking a different variant, and
  // toggling a flag in the custom-rule editor. They are the same event.
  const changeVariant = (id: string) => {
    setVariantId(id);
    resetGame();
  };

  const changeCustomRules = (next: CustomRuleSet) => {
    setCustomRules(next);
    resetGame();
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

  // In hotseat the primary button drives the match:
  //   • set decided        → "Next set" (bank it and continue the series)
  //   • a game just ended   → "Next game" (sides swap)
  //   • a game in progress  → "New game" (restart this game, keep the score)
  // Vs the computer it is simply "New game".
  const otbMatch = playMode === "hotseat" ? match : null;
  const otbSet = otbMatch?.set ?? null;
  const setComplete = otbSet !== null && standing(otbSet).complete;
  const midSet =
    otbSet !== null && otbSet.results.length > 0 && !setComplete;
  // Starting a new match wipes the running score, so route it through a
  // confirmation whenever there's actually progress to lose. Anything with
  // nothing to discard (a fresh board, solo "New game") falls straight through.
  const matchHasProgress =
    otbMatch !== null && (otbSet!.results.length > 0 || matchTotals(otbMatch).setsCompleted > 0);
  // Moves on the board and no result yet — a game someone is in the middle of.
  const gameUnfinished = tip >= 1 && !gameOver;
  // A solo game with moves on the board and no result yet is worth guarding too:
  // a stray "New game" tap shouldn't silently wipe a game in progress.
  const soloGameInProgress = otbMatch === null && gameUnfinished;
  const requestNewMatch = useCallback(() => {
    if (matchHasProgress) setShowNewMatchConfirm(true);
    else if (soloGameInProgress) setShowNewGameConfirm(true);
    else resetGame();
  }, [matchHasProgress, soloGameInProgress, resetGame]);

  // Is there a game behind the setup overlay that picking a new one would wipe?
  // Deliberately broader than soloGameInProgress, which excludes over-the-board
  // play (otbMatch === null): a half-played first game of a set has no banked
  // result yet, so matchHasProgress is false there too, and between them a live
  // over-the-board game fell through both guards unasked.
  const wouldDiscardGame = matchHasProgress || gameUnfinished;

  // Open the setup overlay over the live board — the drawer's "New game" and the
  // header wordmark both land here. Cancelable, because there is now a view
  // behind it: nothing is reset until a game is actually chosen.
  const openSetupOverlay = () => {
    setModeOverlayCancelable(true);
    setShowModeOverlay(true);
  };

  const closeSetupOverlay = () => {
    setShowModeOverlay(false);
    setModeOverlayCancelable(false);
    setPendingModeChoice(null);
  };

  // Commit a game chosen in the overlay: this is the point of no return, so the
  // board reset — and the chosen AI strength, and the chosen time control —
  // land here and nowhere earlier.
  const commitModeChoice = (m: PlayMode, d?: Difficulty, c?: ClockSelection) => {
    if (d) setDifficulty(d);
    if (c) applyClockSelection(c);
    changeMode(m);
    closeSetupOverlay();
  };

  // Contextual primary button:
  //   • set decided        → "Next set" (bank it, continue the series)
  //   • a game just ended   → "Next game" (sides swap)
  //   • a game in progress  → "New game" (over the board: restart this game,
  //                           keeping the set score; vs the computer: a fresh
  //                           board, guarded so a stray tap can't wipe it)
  let primaryLabel: string;
  let primaryAction: () => void;
  if (otbMatch) {
    if (setComplete) {
      primaryLabel = t.nextSet;
      primaryAction = nextSet;
    } else if (gameOver) {
      primaryLabel = t.nextGame;
      primaryAction = nextGame;
    } else {
      primaryLabel = t.newGame;
      primaryAction = nextGame;
    }
  } else {
    primaryLabel = t.newGame;
    primaryAction = requestNewMatch;
  }
  // The standalone "New match" button wipes the running series. Hide it while a
  // set is live over the board — the primary sits right beside it, easy to
  // fumble — so a mid-set reset goes through Settings. Between sets it stays.
  const showNewMatch = matchHasProgress && !midSet;

  // The drawer head's one line of live state: mode (· strength) · variant —
  // the lichess drawer-head idea (who you are, how the connection feels)
  // translated to a game with no account: what you're set up to play.
  const difficultyLabels: Record<Difficulty, string> = {
    easy: t.easy,
    medium: t.medium,
    hard: t.hard,
    ollamh: t.ollamh,
  };
  const drawerStatus = [
    playMode === "hotseat"
      ? t.otbOverlay
      : `${t.playVsAi} · ${difficultyLabels[difficulty]}`,
    t.variantNames[variantId] ?? rules.name,
    // Where this game came from, when it did not come from the opening. It is
    // the one setup fact the mode and the ruleset do not carry, and it is the
    // reason the game file is refused further down.
    ...(positionGame ? [t.puzzleGameLabel] : []),
  ].join(" · ");

  // A move list back to the opening is what the game file records, and two
  // things on this screen do not have one: a tree rooted on a pasted position
  // (7e) and a game played on from a puzzle. Exporting either would write a
  // file that replays into a different game, so both are refused — in their own
  // words, because the rule is one rule but the situation is not one situation.
  const positionRooted = pastedRoot || positionGame;
  const positionExportRefusal = pastedRoot
    ? t.positionExportBlocked
    : t.puzzleGameExportBlocked;

  // Clock placement, Lichess-style: the away side rides above the board, the
  // near side below it. Vs the computer the human sits on the bottom, whichever
  // side they took.
  //
  // **Flipping the board north–south flips the clocks with it.** The clocks
  // are the two players' chairs, seated above/below the board — only a
  // top/bottom mirror (`flippedV`) moves them; the east–west mirror
  // (`flippedH`) only swaps which side of the screen each column is drawn on
  // and leaves top/bottom alone, so it leaves the clocks put. So the pair is
  // swapped here, in the view, off `flippedV` alone, and `clockPlacement` in
  // game/sides.ts keeps saying the same thing it always said about who is
  // *actually* near and far.
  const { top: topSide, bottom: bottomSide } = clockPlacement(playMode);
  const topClockSide = flippedV ? bottomSide : topSide;
  const bottomClockSide = flippedV ? topSide : bottomSide;
  const showPause = clock.enabled && clock.started && atTip && !gameOver;

  // Who goes in the exported file's [Attackers] / [Defenders] tags: the AI's
  // tier when the computer holds that side, otherwise the player's own name
  // (over the board, the set records who is on which side this game).
  const participantName = (side: Side): string => {
    if (side === aiSide) return difficulty;
    if (side === humanSide) return names.p1.trim() || t.player1;
    const attackersId: PlayerId = otbSet?.attackersPlayer ?? "p1";
    const id: PlayerId = side === "attackers" ? attackersId : attackersId === "p1" ? "p2" : "p1";
    return names[id].trim() || (id === "p1" ? t.player1 : t.player2);
  };
  const exportMeta: GameFileMeta = {
    event: "Brandubh",
    attackers: participantName("attackers"),
    defenders: participantName("defenders"),
  };
  // Browsing the game shows each position's own clocks — the times it was first
  // offered with — rather than the live banks, so what you see while reviewing
  // is what you get if you resume from there.
  const viewedBanks = reviewing ? banksAt(clockLine, cursor, timeControl) : clock.remaining;

  // The chosen emblems, resolved once for every consumer (board, learn hub,
  // victory overlay).
  const emblemSet = {
    attackerEmblem: emblemById(attackerEmblem),
    kingEmblem: kingEmblemById(kingEmblem),
    defenderEmblem: defenderEmblemById(defenderEmblem),
    cornerEmblem: cornerEmblemById(cornerEmblem),
  };
  // Lichess seats each player against their board edge: name and material on
  // the left, the boxed clock on the right. With no clock the bar still names
  // who sits where — the seat exists whether or not it is timed.
  const renderPlayerBar = (side: Side, position: "top" | "bottom") => (
    <PlayerBar
      name={participantName(side)}
      sub={sideLabel(side, t)}
      side={side}
      captures={side === "attackers" ? game.captured.defenders : game.captured.attackers}
      clockEnabled={clock.enabled}
      ms={viewedBanks[side]}
      active={
        !isGameOver(game.status) &&
        (reviewing || !clock.enabled ? game.turn === side : clock.active === side)
      }
      running={clock.running}
      flagged={!reviewing && clock.flagged === side}
      increment={timeControl?.incrementSeconds ?? 0}
      flagLabel={t.flagLabel}
      thinking={thinking && side === aiSide}
      moveCount={position === "bottom" ? game.moveCount : undefined}
    />
  );

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-4 pb-24 pt-3 sm:max-w-lg">
      <Header
        t={t}
        zenOn={zen.enabled}
        onZen={setZenEnabled}
        menuOpen={drawerOpen}
        onMenu={() => setDrawerOpen(true)}
        compact={!showModeOverlay}
        onHome={showModeOverlay ? null : openSetupOverlay}
      />

      {/* Not while analysing: a set scoreboard is about a series, and analysis
          is about one game that has already finished. On a phone it cost ~600px
          above the board, which pushed the review — the whole reason for being
          here — below the fold. */}
      {otbMatch && !analysis && showExtra("scoreboard") && (
        <SetScoreboard
          t={t}
          match={otbMatch}
          names={names}
          onRename={(id, value) => setNames((n) => ({ ...n, [id]: value }))}
          gameOver={gameOver}
          liveMoves={game.moveCount}
        />
      )}

      <div className="mt-3">{renderPlayerBar(topClockSide, "top")}</div>

      {/* The eval bar stands beside the board and shares its row, so the two
          line up top and bottom — see the orientation note in src/evalBar.ts
          for why its ends are the same two chairs the clocks use. */}
      <div className="mt-3 board-row">
        {showEval && (
          <EvalBar
            t={t}
            score={evalInfo?.score ?? null}
            bottomSide={bottomClockSide}
            pending={evalPending}
          />
        )}
        <div className="board-col">
          <Board
            board={game.board}
            rules={rules}
            turn={game.turn}
            selected={selected}
            lastMove={lastMove}
            fadingCaptures={fadingCaptures}
            interactive={interactive}
            controllable={controllableIn(analysis, humanSide)}
            flippedH={flippedH}
            flippedV={flippedV}
            attackerEmblem={emblemSet.attackerEmblem}
            kingEmblem={emblemSet.kingEmblem}
            defenderEmblem={emblemSet.defenderEmblem}
            cornerEmblem={emblemSet.cornerEmblem}
            bestMove={
            attempt && attemptFinished(attempt)
              ? (attemptAnswer?.move ?? null)
              : showEval
                ? (evalInfo?.move ?? null)
                : null
          }
          alsoBest={attempt ? [] : showEval ? altBestMoves : []}
            markBadge={
              // Lichess's on-board judgement glyph: ?!/?/?? on the square the
              // marked move landed on. Never while a guess is outstanding —
              // the badge names the mistake the attempt is asking about.
              analysis && marks && lastMove && !hidesEngine(attempt) && marks[cursor - 1]
                ? { square: lastMove.to, mark: marks[cursor - 1] as Mark }
                : null
            }
            onSquareClick={onSquareClick}
          />
        </div>
      </div>

      <div className="mt-3">{renderPlayerBar(bottomClockSide, "bottom")}</div>

      {showEval && evalInfo && (
        // Lichess's ceval strip: the score reads big on the left, the engine's
        // depth beside it, and the deepen control on the right.
        <div className="ceval mt-2">
          <span className="ceval-score font-mono" title={t.evalLabel}>
            {/* A decided position reads as the verdict, not a huge number —
                the same rule the eval bar's readout follows. */}
            {decisiveWinner(evalInfo.score)
              ? decisiveWinner(evalInfo.score) === "attackers"
                ? t.evalAttackersWin
                : t.evalDefendersWin
              : formatEvalScore(evalInfo.score, bottomClockSide)}
          </span>
          <span className="ceval-depth font-mono">d{evalInfo.depth}</span>
          <button
            className="btn btn-sm ceval-deeper"
            onClick={() => setDeepRequest((n) => n + 1)}
            disabled={evalPending}
          >
            {evalPending && deepRequest > 0 ? t.thinkingDeeper : t.thinkHarder}
          </button>
        </div>
      )}

      {analysis && attempt && (
        <PuzzlePanel
          t={t}
          attempt={attempt}
          sideLabel={(side) => sideLabel(side, t)}
          waiting={attemptAnswer === null}
          lesson={lesson ? { index: lesson.index, total: lesson.queue.length } : null}
          onTryAgain={tryAgain}
          onReveal={revealSolution}
          onSkip={advanceLesson}
          onNext={advanceLesson}
          onExit={exitAttempt}
        />
      )}

      {/* "Where did I go wrong" — the front door of analysis, directly under
          the board rather than in a panel below the fold with a button on it.
          It runs itself on entry; see the auto-run effect above. */}
      {analysis && canAnnotate && showExtra("annotate") && (
        <GameReview
          t={t}
          scores={annotation?.key === lineKey ? annotation.scores : null}
          marks={marks}
          movers={lineStates[lineEnd].history.map((h) => h.sideThatMoved)}
          bottomSide={bottomClockSide}
          humanSide={humanSide}
          sideLabel={(side) => sideLabel(side, t)}
          cursor={cursor}
          running={annotating}
          onJump={(ply) => {
            exitAttempt();
            jumpToPly(ply);
          }}
          onPractise={(ply, mover) => {
            // A one-off exercise, not a lesson step — drop any running lesson
            // so the panel doesn't show its progress over the wrong attempt.
            setLesson(null);
            startAttempt(ply, mover);
          }}
          onLesson={startLesson}
          onRun={runAnnotation}
          onStop={stopAnnotating}
        />
      )}

      {showExtra("captured") && <CapturedTray t={t} game={game} />}

      {(() => {
        // Lichess's bottom toolbar replaces the old nav row and button strip:
        // menu · new-game cycle · analysis · step back · step forward. In Zen
        // it obeys the same "nav" extra the old row did, but always surfaces
        // once a game ends so the next game is never out of reach.
        const showToolbar = showExtra("nav") || gameOver;
        if (!showToolbar) return null;
        // Everything wordy lives behind the list icon, exactly as on lichess.
        // Rows are contextual, under the same conditions the old buttons used.
        const progression = !zen.enabled || gameOver;
        const menuItems = [
          ...(progression ? [{ label: primaryLabel, onClick: primaryAction }] : []),
          ...(progression && showNewMatch
            ? [{ label: t.newMatch, onClick: requestNewMatch }]
            : []),
          ...(showExtra("rules")
            ? [{ label: t.rules, onClick: () => setLearnView("rules") }]
            : []),
          ...(showExtra("takeback") && humanSide === null && atTip && !gameOver && tip >= 1
            ? [{ label: t.proposeTakeback, onClick: () => setShowTakeback(true) }]
            : []),
          ...(showExtra("pause") && showPause
            ? [{ label: clock.paused ? t.resume : t.pause, onClick: clock.togglePause }]
            : []),
          ...(showExtra("resign") && atTip && !gameOver
            ? [{ label: t.resign, danger: true, onClick: () => setShowResign(true) }]
            : []),
          ...(analysis && showExtra("flip")
            ? [
                { label: t.flipBoardH, onClick: () => setFlippedH((f) => !f) },
                { label: t.flipBoardV, onClick: () => setFlippedV((f) => !f) },
              ]
            : []),
          ...(analysis && showExtra("eval")
            ? [{ label: evalOn ? t.evalHide : t.evalShow, onClick: () => setEvalOn((v) => !v) }]
            : []),
          { label: t.settings, onClick: () => setShowDesign(true) },
        ];
        return (
          <>
            <GameToolbar
              menuOpen={gameMenuOpen}
              menuLabel={t.menu}
              onMenu={() => setGameMenuOpen((v) => !v)}
              cycleLabel={primaryLabel}
              cycleEnabled={gameOver}
              onCycle={primaryAction}
              analysisShown={showExtra("analysis")}
              analysisOn={analysis}
              analysisEnabled={canAnalyse || analysis}
              analysisLabel={analysis ? t.analysisExit : t.analysisMode}
              onAnalysis={toggleAnalysis}
              canPrev={cursor > 0}
              canNext={cursor < lineEnd}
              prevLabel={t.prevMove}
              nextLabel={t.nextMove}
              onPrev={goPrev}
              onNext={goNext}
            />
            {gameMenuOpen && (
              <GameMenuSheet
                title={t.menu}
                items={menuItems}
                onClose={() => setGameMenuOpen(false)}
              />
            )}
          </>
        );
      })()}

      {(reviewing || gameOver) && showExtra("nav") && (
        <ReviewBar
          t={t}
          reviewing={reviewing}
          moveNumber={cursor}
          totalMoves={tip}
          viewedTerminal={!resumable(game.status)}
          showVsAi={showVsAiBranch}
          onLatest={goLatest}
          onPlay={() => requestPlayFromHere(false)}
          onPlayVsAi={() => requestPlayFromHere(true)}
        />
      )}

      {/* The settings panels can themselves be hidden in Zen, and so can the
          export/import panel below. Everything Zen can hide that is *configuration*
          stays reachable through the header's drawer regardless: Zen, the clock
          and the custom ruleset via the settings modal, the game file via the
          drawer's own Tools row. No Zen setting can ever lock you out of the
          control that would undo it. (Zen itself has a second way back out: the
          header toggle.)

          Analysis hides the stack too: analysis reads the game just played, and
          next-game configuration has no business in it — see settingsStackVisible. */}
      {settingsStackVisible({ analysis, settingsExtra: showExtra("settings") }) && (
        <>
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

          <div className="card mt-4 p-4">
            <ClockControls {...clockControls} />
          </div>

          <div className="card mt-4 p-4">
            <ZenSettings
              t={t}
              zen={zen}
              onEnabled={setZenEnabled}
              onToggleExtra={toggleZenExtra}
            />
          </div>

          {variantId === "custom" && (
            <div className="card mt-4 p-4">
              <CustomRuleControls t={t} rules={customRules} onChange={changeCustomRules} />
            </div>
          )}
        </>
      )}

      <MoveLog
        t={t}
        game={lineStates[lineEnd]}
        activeIndex={cursor - 1}
        marks={marks}
        onMoveClick={(i) => jumpToPly(i + 1)}
      />

      {analysis && tree && showExtra("tree") && (
        <MoveTreePanel
          t={t}
          tree={tree}
          currentId={nodeId}
          onSelect={selectNode}
          onPromote={promoteCurrent}
          onDelete={deleteCurrent}
        />
      )}

      {canAnalyse && showExtra("position") && (
        <PositionPanel t={t} state={game} onLoad={loadPosition} />
      )}

      {/* Export/import the whole mainline — always the tip, never the position
          currently under review (see docs/design/game-import-export.md).

          A board that did not come from the opening is the case this must
          refuse, in either of the two shapes it arrives in: a tree rooted on a
          pasted position (7e), and a game played on from a puzzle. The file
          format records a move list replayed from `initialState()`, and neither
          has a path back to one, so exporting the moves would write a file that
          replays into a completely different game. The panel is replaced by the
          reason rather than silently vanishing. */}
      {showExtra("gamefile") &&
        (positionRooted ? (
          <p className="card mt-4 p-4 text-xs text-parchment-dim">{positionExportRefusal}</p>
        ) : (
          <GameFilePanel
            t={t}
            state={states[tip]}
            rules={rules}
            meta={exportMeta}
            onImport={loadImportedGame}
          />
        ))}

      {aiSide !== null && lastAiInfo && (
        <p className="mt-1 text-center font-mono text-[11px] text-parchment-dim/70 tabular-nums">
          {lastAiInfo.difficulty} ·{" "}
          {lastAiInfo.depth === -1
            ? "opening book"
            : `depth ${lastAiInfo.depth} · ${lastAiInfo.nodes.toLocaleString()} nodes · ${Math.round(lastAiInfo.elapsedMs)} ms`}
        </p>
      )}

      {/* The second way out of Zen, at the foot of everything that scrolls. The
          header's switch is the standard one and stays where it is; this one is
          what you find by scrolling down, which is where you end up when the
          screen has been stripped and you are hunting for the control that did
          it. Only while Zen is on: off, it would be a stray toggle at the bottom
          of a page that already carries one at the top. */}
      {zen.enabled && (
        <div className="zen-foot">
          <ZenSwitch t={t} on={zen.enabled} onChange={setZenEnabled} testId="zen-toggle-foot" />
        </div>
      )}

      {showVictory && isGameOver(states[tip].status) && (
        <VictoryOverlay
          t={t}
          winner={winnerOf(states[tip].status) ?? "draw"}
          reason={gameOverText(states[tip].status, t)}
          moveCount={states[tip].moveCount}
          emblems={emblemSet}
          primaryLabel={primaryLabel}
          onPrimary={() => {
            setShowVictory(false);
            primaryAction();
          }}
          onDismiss={() => setShowVictory(false)}
          onReview={() => {
            setShowVictory(false);
            if (canAnalyse && !analysis) toggleAnalysis();
          }}
        />
      )}

      {showModeOverlay && (
        <ModeOverlay
          t={t}
          lang={lang}
          onLang={setLang}
          difficulty={difficulty}
          clock={clockSelection}
          side={humanSide ?? "defenders"}
          onShowDemo={() => setLearnView("menu")}
          resume={pendingResume}
          onResume={resumeSavedGame}
          onDiscardResume={discardSavedGame}
          onCancel={modeOverlayCancelable ? closeSetupOverlay : null}
          onChoose={(m, d, c) => {
            // Reopened over a game worth keeping? Ask before wiping it. The
            // overlay stays up behind the confirmation, so answering "no"
            // leaves the player where they were, mid-choice.
            if (modeOverlayCancelable && wouldDiscardGame)
              setPendingModeChoice({ mode: m, difficulty: d, clock: c });
            else commitModeChoice(m, d, c);
          }}
        />
      )}

      {drawerOpen && (
        <AppDrawer
          t={t}
          lang={lang}
          onLang={setLang}
          status={drawerStatus}
          onClose={() => setDrawerOpen(false)}
          // Reopen the setup overlay rather than resetting on the spot: the full
          // chooser (opponent → side → strength) is the "create a game" screen
          // here, and — opened over a live board — it can be backed out of
          // without losing anything. Same door the wordmark opens.
          onNewGame={openSetupOverlay}
          onObjectives={() => setLearnView("objectives")}
          onRules={() => setLearnView("rules")}
          onTutorials={() => setLearnView("tutorials")}
          onPuzzles={() => setLearnView("puzzles")}
          onGameFile={() => setShowGameFile(true)}
          onTablut={() => setShowTablut(true)}
          onSettings={() => setShowDesign(true)}
          onAbout={() => setShowAbout(true)}
        />
      )}

      {/* The game file, reached from the drawer's Tools section — configuration
          moved out of the gear ⚙ modal, where import/export never quite
          belonged. Same refusal as the in-page panel, for the same reason: no
          move list back to the opening, nothing a game file can honestly say. */}
      {showTablut && (
        <TablutScreen
          t={t}
          attackerEmblem={emblemSet.attackerEmblem}
          kingEmblem={emblemSet.kingEmblem}
          defenderEmblem={emblemSet.defenderEmblem}
          cornerEmblem={emblemSet.cornerEmblem}
          onClose={() => setShowTablut(false)}
        />
      )}

      {showGameFile && (
        <div
          className="settings-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={() => setShowGameFile(false)}
        >
          <div
            className="settings-sheet card max-h-[88vh] w-full overflow-y-auto rounded-b-none p-6 sm:max-w-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            data-testid="gamefile-modal"
          >
            <div className="flex justify-end">
              <button className="btn" onClick={() => setShowGameFile(false)} aria-label={t.close}>
                ✕
              </button>
            </div>
            {positionRooted ? (
              <p className="mt-4 text-xs text-parchment-dim">{positionExportRefusal}</p>
            ) : (
              <GameFilePanel
                t={t}
                state={states[tip]}
                rules={rules}
                meta={exportMeta}
                onImport={(g) => {
                  // An import replaces the board, so the modal has no reason
                  // to stay open.
                  loadImportedGame(g);
                  setShowGameFile(false);
                }}
                placement="modal"
              />
            )}
          </div>
        </div>
      )}

      {showAbout && (
        <div
          className="settings-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={() => setShowAbout(false)}
        >
          <div
            className="settings-sheet card max-h-[88vh] w-full overflow-y-auto rounded-b-none p-6 sm:max-w-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            data-testid="about-modal"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-2xl text-gold">{t.aboutTitle}</h2>
              <button className="btn" onClick={() => setShowAbout(false)} aria-label={t.close}>
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-parchment-dim">
              <p>{t.aboutBody1}</p>
              <p>{t.aboutBody2}</p>
              <p>{t.aboutBody3}</p>
            </div>
            <div className="mt-4">
              <a
                className="btn"
                href={`mailto:eoinmaleoin@gmail.com?subject=${encodeURIComponent(
                  "Brandubh & Tablut — UX test script",
                )}&body=${encodeURIComponent(
                  "UX test script for Brandubh/Tablut:\n\nhttps://claude.ai/code/artifact/f0e85027-3212-46da-9b8c-1832fc3f790d",
                )}`}
              >
                {t.aboutUxTestLink}
              </a>
            </div>
          </div>
        </div>
      )}

      {learnView !== null && (
        <LearnModal
          t={t}
          rules={rules}
          emblems={emblemSet}
          initialView={learnView}
          onPlayPosition={playFromPosition}
          onClose={() => setLearnView(null)}
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

      {/* Setup overlay → a game that would discard the one behind it. Sits over
          the overlay, so declining returns to the chooser rather than the board. */}
      {pendingModeChoice && (
        <ConfirmDialog
          t={t}
          title={t.newGameTitle}
          body={t.newGameBody}
          confirmLabel={t.newGame}
          cancelLabel={t.back}
          onConfirm={() =>
            commitModeChoice(
              pendingModeChoice.mode,
              pendingModeChoice.difficulty,
              pendingModeChoice.clock,
            )
          }
          onCancel={() => setPendingModeChoice(null)}
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
        <SettingsModal
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
          zen={zen}
          onZenEnabled={setZenEnabled}
          onToggleZenExtra={toggleZenExtra}
          clockControls={clockControls}
          customRules={variantId === "custom" ? customRules : null}
          onCustomRules={changeCustomRules}
          gameInProgress={tip >= 1 && !showModeOverlay}
          onClose={() => setShowDesign(false)}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────
// The header carries two controls and no more: Zen mode, which is the one thing
// you reach for *while* playing, and the hamburger opening the app drawer —
// where everything you reach for between games now lives (language, learning,
// game file, settings, about). The drawer itself is rendered by App, so the
// header only reports the button; see AppDrawer for what is behind it.
/**
 * The Zen control. A switch, not an icon button: Zen is a state you leave
 * turned on, so the control has to show which way it is set without being
 * pressed. `role="switch"` + `aria-checked` is the same promise made to a
 * screen reader. The word carries the meaning, so there is no icon to decode —
 * and, where the icon button was a second gold circle a glance away from the
 * eval toggle in the board tools, this cannot be mistaken for one.
 *
 * Rendered in two places, which is why it is a component rather than markup in
 * the header: its standard seat up in the header, and again at the foot of the
 * page while Zen is on. The header scrolls away with the page, and Zen is now
 * where a new player starts (see zen.ts), so the way back out has to be within
 * reach from wherever they have scrolled to — scrolling down past the board is
 * exactly what someone does when looking for the thing that put them here.
 */
function ZenSwitch({
  t,
  on,
  onChange,
  testId,
}: {
  t: Translations;
  on: boolean;
  onChange: (v: boolean) => void;
  /** Distinct per placement, so a driven browser can tell the two apart. */
  testId: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`switch${on ? " on" : ""}`}
      onClick={() => onChange(!on)}
      aria-label={t.zenMode}
      title={t.zenMode}
      data-testid={testId}
    >
      <span>{t.zenShort}</span>
      <span className="switch-track" aria-hidden>
        <span className="switch-knob" />
      </span>
    </button>
  );
}

function Header({
  t,
  zenOn,
  onZen,
  menuOpen,
  onMenu,
  compact,
  onHome,
}: {
  t: Translations;
  zenOn: boolean;
  onZen: (v: boolean) => void;
  menuOpen: boolean;
  onMenu: () => void;
  /** Shrink during gameplay so the board gets more vertical space. */
  compact: boolean;
  /**
   * Reopen the setup overlay over the live board. Null while that overlay is
   * already up — the wordmark is inert there rather than a button that leads
   * back to where you already are.
   */
  onHome: (() => void) | null;
}) {
  return (
    <header className="flex items-center justify-between gap-2">
      <div>
        <h1 className={`gaelic leading-none text-parchment ${compact ? "text-xl" : "text-3xl"}`}>
          {/* Gaelic word → cló face + overdot orthography (see gaelic.ts):
              "Brandubh" renders "Branduḃ".

              The wordmark doubles as the way back to the setup overlay — the
              app's "home", in the sense a site's logo is. It only ever opens
              that overlay: nothing is reset until a game is actually chosen
              there, and the overlay can be backed out of. */}
          {onHome ? (
            <button
              type="button"
              className="wordmark-home"
              onClick={onHome}
              aria-label={t.backToStart}
              title={t.backToStart}
              data-testid="wordmark-home"
            >
              <span className="wordmark">{toSeanchlo("Brandubh")}</span>
            </button>
          ) : (
            <>
              <span className="wordmark">{toSeanchlo("Brandubh")}</span>
            </>
          )}
        </h1>
        {!compact && (
          <p className="header-subtitle mt-0.5 text-xs uppercase tracking-[0.2em] text-parchment-dim">
            {t.subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <ZenSwitch t={t} on={zenOn} onChange={onZen} testId="zen-toggle" />
        <button
          className={`iconbtn${menuOpen ? " on" : ""}`}
          onClick={onMenu}
          aria-label={t.menu}
          title={t.menu}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          data-testid="menu-toggle"
        >
          <MenuIcon />
        </button>
      </div>
    </header>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
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
// ── Annotations — run the pass, show the tally ────────────────────────────────
// Offered only where the engine is free (a finished game, or analysis), so the
// pass never races the AI for the one worker. Progress is shown move by move and
// can be stopped: a forty-move game is a couple of seconds, but a slow phone is
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
        <ChoiceGroup
          label={t.playAs}
          value={playMode}
          options={[
            { value: "defenders", label: t.king },
            { value: "attackers", label: t.raiders },
            { value: "hotseat", label: t.overTheBoard },
          ]}
          onChange={onMode}
        />

        {playMode !== "hotseat" && (
          <ChoiceGroup
            label={t.aiLevel}
            value={difficulty}
            options={[
              { value: "easy", label: t.easy },
              { value: "medium", label: t.medium },
              { value: "hard", label: t.hard },
              // "Ollamh" is Irish → always set in the cló Gaelach face (see gaelic.ts).
              { value: "ollamh", label: <span className="gaelic">{toSeanchlo(t.ollamh)}</span> },
            ]}
            onChange={onDifficulty}
          />
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
          <ChoiceGroup
            label={t.setLength}
            value={gamesPerSet}
            options={SET_LENGTH_OPTIONS.map((n) => ({ value: n, label: n }))}
            onChange={onSetLength}
          />

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

// ── Clock settings (time-control picker) ─────────────────────────────────────
// Card-less, like ZenSettings: rendered both inline (in the settings stack) and
// in the gear ⚙ modal, so the time control stays reachable when Zen has hidden
// the inline panels. The caller supplies the surrounding card or section.

/** The full preset ladder, as the settings panels offer it. */
const ALL_TIME_CATEGORIES: TimeCategory[] = ["bullet", "blitz", "rapid"];
/**
 * What the setup overlay's over-the-board step offers: no bullet. A one- or
 * two-minute bank is a control for a mouse and a real clock, not for two people
 * passing one device back and forth — the handover alone eats the bank. Blitz
 * up is what an over-the-board game can actually be played at, and Custom is
 * still there for anyone who disagrees.
 */
const OTB_TIME_CATEGORIES: TimeCategory[] = ["blitz", "rapid"];

function ClockControls({
  t,
  enabled,
  onEnabled,
  controlId,
  onControl,
  customMinutes,
  onCustomMinutes,
  customIncrement,
  onCustomIncrement,
  categories = ALL_TIME_CATEGORIES,
}: {
  t: Translations;
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  controlId: string;
  onControl: (id: string) => void;
  customMinutes: number;
  onCustomMinutes: (n: number) => void;
  customIncrement: number;
  onCustomIncrement: (n: number) => void;
  /** Preset categories to offer, in order. Defaults to the full ladder. */
  categories?: TimeCategory[];
}) {
  const categoryLabels: Record<TimeCategory, string> = {
    bullet: t.catBullet,
    blitz: t.catBlitz,
    rapid: t.catRapid,
  };
  const rows = categories.map((key) => ({ key, label: categoryLabels[key] }));
  const custom = controlId === CUSTOM_TIME_CONTROL_ID;
  // Whole minutes, the same rounding resolveTimeControl applies, so the chip's
  // summary always names the control the game will actually be played at.
  const summary = describeTimeControl({
    initialSeconds: Math.round(customMinutes) * 60,
    incrementSeconds: Math.round(customIncrement),
  });

  return (
    <div className="space-y-3">
      <ChoiceGroup
        label={t.clock}
        value={enabled}
        options={[
          { value: false, label: t.clockOff },
          { value: true, label: t.timeControlLabel },
        ]}
        onChange={onEnabled}
      />

      {enabled && (
        <>
          <div className="tc-groups">
            {rows.map((c) => (
              <div key={c.key} className="tc-row">
                <span className="tc-cat">{c.label}</span>
                {TIME_PRESETS.filter((p) => p.category === c.key).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`tc-chip ${controlId === p.id ? "on" : ""}`}
                    onClick={() => onControl(p.id)}
                  >
                    {p.id}
                  </button>
                ))}
              </div>
            ))}
            <div className="tc-row">
              <span className="tc-cat" />
              <button
                type="button"
                className={`tc-chip ${custom ? "on" : ""}`}
                onClick={() => onControl(CUSTOM_TIME_CONTROL_ID)}
              >
                {custom ? `${t.customTimeControl} · ${summary}` : t.customTimeControl}
              </button>
            </div>
          </div>

          {custom && (
            <div className="tc-custom">
              <label className="tc-field">
                <span>
                  {t.minutesLabel}: <b>{customMinutes}</b>
                </span>
                <input
                  type="range"
                  min={CUSTOM_MIN_MINUTES}
                  max={CUSTOM_MAX_MINUTES}
                  step={1}
                  value={customMinutes}
                  onChange={(e) => onCustomMinutes(Number(e.target.value))}
                />
              </label>
              <label className="tc-field">
                <span>
                  {t.incrementLabel}: <b>{customIncrement}</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={CUSTOM_MAX_INCREMENT}
                  step={1}
                  value={customIncrement}
                  onChange={(e) => onCustomIncrement(Number(e.target.value))}
                />
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Zen mode settings — toggle + opt-in extras ────────────────────────────────
// Used both inline (in the settings stack) and in the gear ⚙ modal, so it stays
// reachable even when Zen has hidden the inline settings panels.
function ZenSettings({
  t,
  zen,
  onEnabled,
  onToggleExtra,
}: {
  t: Translations;
  zen: ZenConfig;
  onEnabled: (v: boolean) => void;
  onToggleExtra: (id: ZenExtraId) => void;
}) {
  const labels: Record<ZenExtraId, string> = {
    scoreboard: t.zenElScoreboard,
    captured: t.zenElCaptured,
    nav: t.zenElNav,
    rules: t.zenElRules,
    takeback: t.proposeTakeback,
    resign: t.resign,
    pause: t.pause,
    settings: t.zenElSettings,
    gamefile: t.zenElGameFile,
    flip: t.flipBoard,
    analysis: t.analysisMode,
    eval: t.zenElEval,
    tree: t.moveTree,
    annotate: t.annotateTitle,
    position: t.positionTitle,
  };
  return (
    <div>
      <ChoiceGroup
        label={t.zenMode}
        value={zen.enabled}
        options={[
          { value: false, label: t.off },
          { value: true, label: t.on },
        ]}
        onChange={onEnabled}
      />
      <p className="mt-1.5 text-xs text-parchment-dim">{t.zenHint}</p>
      {zen.enabled && (
        <div className="mt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-parchment-dim">
            {t.zenShowExtras}
          </span>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {ZEN_EXTRAS.map((id) => (
              <li key={id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`zen-${id}`}
                  checked={zen.extras[id]}
                  onChange={() => onToggleExtra(id)}
                  className="h-4 w-4 shrink-0 accent-gold"
                />
                <label htmlFor={`zen-${id}`} className="cursor-pointer text-sm text-parchment">
                  {labels[id]}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// The settings modal, opened from the header menu. It is the *guaranteed* home
// for configuration: Zen mode can hide the inline settings stack and the
// export/import panel, so every control those carry is rendered here as well.
// The rule is simple — if Zen can hide it
// and it configures the app, it lives here too, and no Zen setting can strand
// you without the control that undoes it. Board design lives here as before.
//
// Presentation mimics lichess mobile v8 (lichobile) settings: a root list of
// categories, each opening its own page under a back-arrow header. Enumerated
// settings render as full-width multi-choice strips (ChoiceGroup); the
// look-and-feel choices are picker lists — ✓ on the active row, its preview
// flush right (PickerRow).
type SettingsPage =
  | "root"
  | "zen"
  | "clock"
  | "rules"
  | "theme"
  | "pieces"
  | "atk"
  | "king"
  | "def"
  | "corner";
function SettingsModal({
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
  zen,
  onZenEnabled,
  onToggleZenExtra,
  clockControls,
  customRules,
  onCustomRules,
  gameInProgress,
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
  zen: ZenConfig;
  onZenEnabled: (v: boolean) => void;
  onToggleZenExtra: (id: ZenExtraId) => void;
  clockControls: React.ComponentProps<typeof ClockControls>;
  /** Null unless the "custom" variant is selected — nothing to edit otherwise. */
  customRules: CustomRuleSet | null;
  onCustomRules: (r: CustomRuleSet) => void;
  /** True while a game is live — clock/rules sections are hidden. */
  gameInProgress: boolean;
  onClose: () => void;
}) {
  // Which page the navigator shows; every open starts at the category list.
  const [page, setPage] = useState<SettingsPage>("root");

  // Escape walks back the way it came: sub-page → root → closed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (page === "root") onClose();
      else setPage("root");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, onClose]);

  const stoneRows: { key: PieceKey; label: string }[] = [
    { key: "atk", label: t.raiders },
    { key: "def", label: t.defenders },
    { key: "king", label: t.king },
  ];

  const titles: Record<SettingsPage, string> = {
    root: t.settings,
    zen: t.zenMode,
    clock: t.clock,
    rules: t.customRulesTitle,
    theme: t.colourTheme,
    pieces: t.pieceColours,
    atk: t.attackerIcon,
    king: t.kingIcon,
    def: t.defenderIcon,
    corner: t.cornerIcon,
  };

  const kingEmblems = availableKingEmblems(armedKing);
  const currentTheme = THEMES.find((m) => m.id === theme);
  const currentAtk = ATTACKER_EMBLEMS.find((e) => e.id === attackerEmblem);
  const currentKing = kingEmblems.find((e) => e.id === kingEmblem);
  const currentDef = DEFENDER_EMBLEMS.find((e) => e.id === defenderEmblem);
  const currentCorner = CORNER_EMBLEMS.find((e) => e.id === cornerEmblem);

  // A root row: label, the current pick's preview, and the nav chevron (CSS).
  const navRow = (label: string, target: SettingsPage, preview?: React.ReactNode) => (
    <li>
      <button
        type="button"
        className="settings-row nav"
        onClick={() => setPage(target)}
        data-testid={`settings-nav-${target}`}
      >
        <span className="row-name">{label}</span>
        {preview && (
          <span className="row-preview" aria-hidden>
            {preview}
          </span>
        )}
      </button>
    </li>
  );

  return (
    <div
      className="settings-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="settings-sheet card flex max-h-[88vh] w-full flex-col overflow-hidden rounded-b-none p-0 sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-head">
          <button
            type="button"
            className="settings-back"
            onClick={page === "root" ? onClose : () => setPage("root")}
            aria-label={page === "root" ? t.close : t.back}
            data-testid="settings-back"
          >
            {page === "root" ? <span aria-hidden>✕</span> : <BackIcon />}
          </button>
          <h2>{titles[page]}</h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {page === "root" && (
            <ul className="settings-list">
              {navRow(t.zenMode, "zen")}
              {/* Clock and custom rules: only relevant before/after a game. */}
              {!gameInProgress && navRow(t.clock, "clock")}
              {!gameInProgress && customRules && navRow(t.customRulesTitle, "rules")}
              {navRow(
                t.colourTheme,
                "theme",
                currentTheme && <ThemeChips chips={currentTheme.chips} />,
              )}
              {navRow(
                t.pieceColours,
                "pieces",
                <span className="row-chips">
                  {stoneRows.map(({ key }) => (
                    <i
                      key={key}
                      style={{ background: pieceColors[key] ?? DEFAULT_PIECE_COLORS[key] }}
                    />
                  ))}
                </span>,
              )}
              {navRow(
                t.attackerIcon,
                "atk",
                currentAtk && (
                  <EmblemGlyph
                    viewBox={currentAtk.viewBox}
                    path={currentAtk.path}
                    scale={currentAtk.scale}
                    fillRule={currentAtk.fillRule}
                  />
                ),
              )}
              {navRow(
                t.kingIcon,
                "king",
                currentKing && (
                  <EmblemGlyph
                    viewBox={currentKing.viewBox}
                    path={currentKing.path}
                    scale={currentKing.scale}
                  />
                ),
              )}
              {navRow(
                t.defenderIcon,
                "def",
                currentDef && (
                  <EmblemGlyph
                    viewBox={currentDef.viewBox}
                    path={currentDef.path}
                    scale={currentDef.scale}
                    ring={currentDef.outerRing}
                  />
                ),
              )}
              {navRow(
                t.cornerIcon,
                "corner",
                currentCorner && (
                  <EmblemGlyph viewBox={currentCorner.viewBox} path={currentCorner.path} />
                ),
              )}
            </ul>
          )}

          {page === "zen" && (
            <div className="settings-page" data-testid="modal-zen">
              <ZenSettings t={t} zen={zen} onEnabled={onZenEnabled} onToggleExtra={onToggleZenExtra} />
            </div>
          )}

          {page === "clock" && (
            <div className="settings-page" data-testid="modal-clock">
              <ClockControls {...clockControls} />
            </div>
          )}

          {page === "rules" && customRules && (
            <div className="settings-page" data-testid="modal-rules">
              <CustomRuleControls t={t} rules={customRules} onChange={onCustomRules} />
            </div>
          )}

          {page === "theme" && (
            <ul className="settings-list">
              {THEMES.map((m) => (
                <PickerRow
                  key={m.id}
                  name={m.name}
                  selected={theme === m.id}
                  onSelect={() => onTheme(m.id)}
                  preview={<ThemeChips chips={m.chips} />}
                />
              ))}
            </ul>
          )}

          {page === "pieces" && (
            <ul className="settings-list">
              {stoneRows.map(({ key, label }) => {
                const custom = pieceColors[key];
                const value = custom ?? DEFAULT_PIECE_COLORS[key];
                return (
                  <li key={key} className="settings-row">
                    <span className="row-name">{label}</span>
                    <span className="row-preview">
                      <button
                        type="button"
                        className="btn text-xs"
                        onClick={() => onPieceColor(key, null)}
                        disabled={!custom}
                      >
                        {t.pieceColourDefault}
                      </button>
                      <label className="color-swatch" style={{ background: value }}>
                        <input
                          type="color"
                          value={value}
                          onChange={(e) => onPieceColor(key, e.target.value)}
                          aria-label={label}
                        />
                      </label>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {page === "atk" && (
            <ul className="settings-list">
              {ATTACKER_EMBLEMS.map((e) => (
                <PickerRow
                  key={e.id}
                  name={e.name}
                  selected={attackerEmblem === e.id}
                  onSelect={() => onAttackerEmblem(e.id)}
                  preview={
                    <EmblemGlyph viewBox={e.viewBox} path={e.path} scale={e.scale} fillRule={e.fillRule} />
                  }
                />
              ))}
            </ul>
          )}

          {page === "king" && (
            <ul className="settings-list">
              {kingEmblems.map((e) => (
                <PickerRow
                  key={e.id}
                  name={e.name}
                  selected={kingEmblem === e.id}
                  onSelect={() => onKingEmblem(e.id)}
                  preview={<EmblemGlyph viewBox={e.viewBox} path={e.path} scale={e.scale} />}
                />
              ))}
            </ul>
          )}

          {page === "def" && (
            <ul className="settings-list">
              {VISIBLE_DEFENDER_EMBLEMS.map((e) => (
                <PickerRow
                  key={e.id}
                  name={e.name}
                  selected={defenderEmblem === e.id}
                  onSelect={() => onDefenderEmblem(e.id)}
                  preview={
                    <EmblemGlyph viewBox={e.viewBox} path={e.path} scale={e.scale} ring={e.outerRing} />
                  }
                />
              ))}
            </ul>
          )}

          {page === "corner" && (
            <ul className="settings-list">
              {CORNER_EMBLEMS.map((e) => (
                <PickerRow
                  key={e.id}
                  name={e.name}
                  selected={cornerEmblem === e.id}
                  onSelect={() => onCornerEmblem(e.id)}
                  preview={<EmblemGlyph viewBox={e.viewBox} path={e.path} />}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Lichess-style settings widgets (shared by the modal and inline stack) ────

// One row of a picker list: name, ✓ on the active row, preview flush right —
// lichobile's `li.list_item` from the board-theme / piece-set screens.
function PickerRow({
  name,
  selected,
  onSelect,
  preview,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
  preview: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        className={`settings-row ${selected ? "selected" : ""}`}
        onClick={onSelect}
        aria-pressed={selected}
      >
        <span className="row-name">{name}</span>
        {selected && (
          <span className="row-check" aria-hidden>
            <CheckIcon />
          </span>
        )}
        <span className="row-preview" aria-hidden>
          {preview}
        </span>
      </button>
    </li>
  );
}

// An enumerated setting: plain label above one full-width strip of joined,
// equal-width buttons — lichobile's `.form-multipleChoice`.
function ChoiceGroup<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="choice-block">
      <p className="choice-label">{label}</p>
      <div className="choice">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className={o.value === value ? "on" : ""}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Any emblem at swatch size; `ring` is the defender sets' optional outer ring.
function EmblemGlyph({
  viewBox,
  path,
  scale,
  fillRule,
  ring,
}: {
  viewBox: string;
  path: string;
  scale?: number;
  fillRule?: "evenodd" | "nonzero";
  ring?: { r: number; width: number };
}) {
  const center = ring ? emblemCenter(viewBox) : null;
  return (
    <svg
      viewBox={viewBox}
      fill="currentColor"
      fillRule={fillRule ?? "evenodd"}
      style={scale ? { transform: `scale(${scale})` } : undefined}
      aria-hidden
    >
      <path d={path} />
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
  );
}

// A theme's two board tones, light then dark — lichobile's board_thumbnail
// equivalent. Piece colours are not themed, so they are not shown here.
function ThemeChips({ chips }: { chips: readonly string[] }) {
  return (
    <span className="row-chips">
      {chips.map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 12.5l4.8 4.8L19.5 6.8" />
    </svg>
  );
}

/** ← back to the settings root. */
function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
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
  lang,
  onLang,
  difficulty,
  clock,
  side,
  onShowDemo,
  resume,
  onResume,
  onDiscardResume,
  onCancel,
  onChoose,
}: {
  t: Translations;
  lang: Lang;
  onLang: (l: Lang) => void;
  /** The current strength, shown as the highlighted option — not applied here. */
  difficulty: Difficulty;
  /** The time control as it stands, seeding the time step — not applied here. */
  clock: ClockSelection;
  /** The side played last time, offered as the default. */
  side: Side;
  onShowDemo: () => void;
  /** A game found in storage, offered before anything else. */
  resume: RestoredGame | null;
  onResume: () => void;
  onDiscardResume: () => void;
  /**
   * Non-null when the overlay was reopened over a live board (drawer → New
   * game): a way back out that keeps the game untouched. Null at boot, where
   * there is nothing behind the overlay to return to.
   */
  onCancel: (() => void) | null;
  /**
   * Commit a game. The difficulty comes along only on the vs-computer path, the
   * time control only on the over-the-board one — each is chosen on the step
   * that starts the game, and neither is applied before that.
   */
  onChoose: (m: PlayMode, difficulty?: Difficulty, clock?: ClockSelection) => void;
}) {
  // A step per choice, one path per opponent: vs the computer it is which side
  // to play, then how strong the computer should be; over the board it is the
  // time control. The last step of either path is what starts the game and puts
  // the board up. A saved game, if there is one, gets asked about first: resume
  // it, or drop it and set a new game up.
  const [step, setStep] = useState<"mode" | "side" | "difficulty" | "time">("mode");
  // Held here until a difficulty is picked, since that's the step that starts
  // the game (and starting it resets the board, so it must happen once).
  const [chosenSide, setChosenSide] = useState<Side>(side);
  // Likewise the over-the-board time control: edited here, applied only when
  // the game is committed (see ClockSelection). A bullet control set from the
  // settings panel has no chip to sit on in this step's shorter ladder, so it
  // is seeded off it — otherwise the step would open with the ladder showing
  // nothing selected and no way to tell what was about to be played.
  const [chosenClock, setChosenClock] = useState<ClockSelection>(() => {
    const preset = presetById(clock.controlId);
    return preset && !OTB_TIME_CATEGORIES.includes(preset.category)
      ? { ...clock, controlId: DEFAULT_TIME_CONTROL_ID }
      : clock;
  });

  // Escape backs out only when there is somewhere to back out to.
  useEffect(() => {
    if (!onCancel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      // Tapping the backdrop is the same "leave it as it was" gesture as ✕ and
      // Escape — but only when there is a board behind to fall back to.
      onClick={onCancel ?? undefined}
    >
      <div
        className="mode-card card relative w-full max-w-sm space-y-5 rounded-b-none p-6 text-center sm:mx-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {onCancel && (
          <button
            className="btn absolute right-3 top-3"
            onClick={onCancel}
            aria-label={t.close}
            data-testid="mode-overlay-close"
          >
            ✕
          </button>
        )}
        {/* The language choice lives on the landing card itself: the first
            words a new player reads should already be in their language, not
            behind the overlay in the header. */}
        <div className="flex justify-center">
          <div className="seg">
            {VISIBLE_LANGS.map(({ code, label }) => (
              <button
                key={code}
                className={lang === code ? "on" : ""}
                onClick={() => onLang(code)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <h2 className="gaelic text-3xl text-parchment">
          <span className="wordmark">{toSeanchlo("Brandubh")}</span>
        </h2>
        {resume ? (
          <>
            <div className="space-y-1">
              <p className="text-base text-parchment-dim">{t.resumeBody}</p>
              <p className="font-mono text-sm text-parchment-dim/80 tabular-nums">
                {resume.states.length - 1} {t.movesWord} ·{" "}
                {resume.playMode === "hotseat" ? t.otbOverlay : t.playVsAi}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button className="btn btn-primary py-3 text-base" onClick={onResume}>
                {t.resumeGame}
              </button>
              <button className="btn py-3 text-base" onClick={onDiscardResume}>
                {t.newGame}
              </button>
            </div>
          </>
        ) : step === "side" ? (
          <>
            <p className="text-xl font-semibold text-parchment">{t.chooseSide}</p>
            <div className="flex flex-col gap-3">
              {(
                [
                  ["defenders", t.kingsSide, t.sideKingHint, t.sideKingVerb],
                  ["attackers", t.raiders, t.sideRaidersHint, t.sideRaidersVerb],
                ] as [Side, string, string, string][]
              ).map(([s, label, hint, verb]) => (
                <button
                  key={s}
                  className={`btn py-4 text-base ${chosenSide === s ? "btn-primary" : ""}`}
                  onClick={() => {
                    setChosenSide(s);
                    setStep("difficulty");
                  }}
                >
                  <span className="flex items-baseline justify-center gap-2">
                    {label}
                    <span className="side-verb">{verb}</span>
                  </span>
                  <span className="block text-sm font-normal opacity-70 mt-0.5">{hint}</span>
                </button>
              ))}
            </div>
            <button
              className="text-sm text-parchment-dim underline"
              onClick={() => setStep("mode")}
            >
              {t.back}
            </button>
          </>
        ) : step === "difficulty" ? (
          <>
            <p className="text-lg font-semibold text-parchment">{t.chooseDifficulty}</p>
            <div className="flex flex-col gap-3">
              {(
                [
                  ["easy", t.easy],
                  ["medium", t.medium],
                  ["hard", t.hard],
                  ["ollamh", t.ollamh],
                ] as [Difficulty, string][]
              ).map(([d, label]) => (
                <button
                  key={d}
                  className={`btn py-3 text-base ${difficulty === d ? "btn-primary" : ""}`}
                  // The strength travels with the choice rather than being
                  // applied here: choosing can still be declined at the
                  // "discard the game in progress?" gate, and backing out of
                  // that must not have quietly changed the AI level.
                  onClick={() => onChoose(chosenSide, d)}
                >
                  {/* "Ollamh" is Irish → always set in the cló Gaelach face (see gaelic.ts). */}
                  {d === "ollamh" ? <span className="gaelic">{toSeanchlo(label)}</span> : label}
                </button>
              ))}
            </div>
            <button
              className="text-sm text-parchment-dim underline"
              onClick={() => setStep("side")}
            >
              {t.back}
            </button>
          </>
        ) : step === "time" ? (
          <>
            {/* The over-the-board path's one choice, and the counterpart of the
                AI path's strength step: clock or no clock, and — with a clock —
                the same preset ladder and custom bank/increment the settings
                panel offers, since it is the very same picker. Two players
                sitting down together are the ones who want a timed game, and
                the gear ⚙ modal is a poor place to have to go looking for it. */}
            <p className="text-lg font-semibold text-parchment">{t.chooseTime}</p>
            <div className="text-left" data-testid="overlay-time">
              <ClockControls
                t={t}
                enabled={chosenClock.enabled}
                onEnabled={(v) => setChosenClock((c) => ({ ...c, enabled: v }))}
                controlId={chosenClock.controlId}
                onControl={(id) => setChosenClock((c) => ({ ...c, controlId: id }))}
                customMinutes={chosenClock.customMinutes}
                onCustomMinutes={(n) => setChosenClock((c) => ({ ...c, customMinutes: n }))}
                customIncrement={chosenClock.customIncrement}
                onCustomIncrement={(n) => setChosenClock((c) => ({ ...c, customIncrement: n }))}
                categories={OTB_TIME_CATEGORIES}
              />
            </div>
            <button
              className="btn btn-primary w-full py-3 text-base"
              onClick={() => onChoose("hotseat", undefined, chosenClock)}
            >
              {t.startGame}
            </button>
            <button
              className="text-sm text-parchment-dim underline"
              onClick={() => setStep("mode")}
            >
              {t.back}
            </button>
          </>
        ) : (
          <>
            {/* "Show me how" is the primary CTA — new players see it first. */}
            <button
              type="button"
              onClick={onShowDemo}
              className="btn btn-primary flex w-full items-center justify-center gap-2 py-4 text-lg font-semibold"
            >
              <span aria-hidden className="text-xl leading-none opacity-80">
                ⓘ
              </span>
              {t.demoCta}
            </button>
            <div className="relative flex items-center gap-3">
              <span className="h-px flex-1 bg-parchment/15" />
              <span className="text-sm text-parchment-dim">{t.chooseGame}</span>
              <span className="h-px flex-1 bg-parchment/15" />
            </div>
            <div className="flex flex-col gap-3">
              <button
                className="btn py-3 text-base"
                onClick={() => setStep("side")}
              >
                {t.playVsAi}
              </button>
              <button
                className="btn py-3 text-base"
                onClick={() => setStep("time")}
              >
                {t.otbOverlay}
                <span className="block text-sm font-normal text-parchment-dim">{t.withFriend}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Card-less for the same reason as ClockControls / ZenSettings — the custom
// ruleset is configuration, so it needs a home in the gear ⚙ modal too.
function CustomRuleControls({
  t,
  rules,
  onChange,
}: {
  t: Translations;
  rules: CustomRuleSet;
  onChange: (r: CustomRuleSet) => void;
}) {
  const toggle = (key: keyof CustomRuleSet) => {
    onChange({ ...rules, [key]: !rules[key] });
  };

  const boolRules: Array<{ key: keyof CustomRuleSet; label: string; hint: string }> = [
    { key: "armedKing", label: t.ruleArmedKing, hint: t.ruleArmedKingHint },
    { key: "throneHostileToSoldiers", label: t.ruleThroneHostileSoldiers, hint: t.ruleThroneHostileSoldiersHint },
    { key: "throneHostileToKing", label: t.ruleThroneHostileKing, hint: t.ruleThroneHostileKingHint },
    { key: "kingMayReoccupyThrone", label: t.ruleKingReoccupyThrone, hint: t.ruleKingReoccupyThroneHint },
    { key: "soldiersPassThroughThrone", label: t.ruleSoldiersPassThrone, hint: t.ruleSoldiersPassThroneHint },
    { key: "cornersHostile", label: t.ruleCornersHostile, hint: t.ruleCornersHostileHint },
    { key: "strongKingOnThrone", label: t.ruleStrongKingOnThrone, hint: t.ruleStrongKingOnThroneHint },
    { key: "strongKingAdjacentToThrone", label: t.ruleStrongKingAdjacentThrone, hint: t.ruleStrongKingAdjacentThroneHint },
    { key: "shieldwallCapture", label: t.ruleShieldwall, hint: t.ruleShieldwallHint },
    { key: "encirclementWin", label: t.ruleEncirclementWin, hint: t.ruleEncirclementWinHint },
  ];

  return (
    <div>
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
            ] as [CustomRuleSet["repetitionResult"], string][]
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
  marks,
  onMoveClick,
}: {
  t: Translations;
  game: GameState;
  activeIndex: number;
  /** Per-ply annotations, index-aligned with `game.history` (Session 7d). */
  marks: (Mark | null)[] | null;
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
            {marks?.[i] && (
              // The glyph carries the meaning for anyone reading it; the colour
              // is a second channel, never the only one.
              <span className={`mark mark-${marks[i]}`} title={t[`mark_${marks[i] as Mark}`]}>
                {markGlyph(marks[i] as Mark)}
                <span className="sr-only"> {t[`mark_${marks[i] as Mark}`]}</span>
              </span>
            )}
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
