import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearSavedGame,
  loadResumableGame,
  newGameId,
  saveGame,
  snapshotGame,
  type RestoredGame,
} from "../game/copenhagen/persist";
import Board from "./Board";
import PlayerBar from "./PlayerBar";
import { GameToolbar, GameMenuSheet } from "./GameToolbar";
import MoveLog from "./MoveLog";
import ReviewBar from "./ReviewBar";
import VictoryOverlay from "./VictoryOverlay";
import ZenSwitch from "./ZenSwitch";
import type { BoardGeometry } from "../games/geometry";
import { DIFFICULTIES, type Difficulty } from "../game/copenhagen/engine";
import {
  allMoves,
  applyMove,
  findKing,
  initialState,
  isGameOver,
  isThrone,
  movesFrom,
  moveName,
  squareName,
  winnerOf,
} from "../game/copenhagen/rules";
import { BOARD_SIZE, FILES } from "../game/copenhagen/types";
import type { GameState, Move, PlayMode, Side, Square } from "../game/copenhagen/types";
import {
  CUSTOM_RULE_DEFAULTS,
  DEFAULT_VARIANT,
  VARIANTS,
  VISIBLE_VARIANTS,
  rulesFor,
  type CustomRuleSet,
  type CopenhagenRuleSet,
} from "../game/copenhagen/variants";
import { useAiWorker } from "../game/copenhagen/useAiWorker";
import { useGameClock } from "../useGameClock";
import {
  CUSTOM_TIME_CONTROL_ID,
  DEFAULT_CUSTOM_INCREMENT,
  DEFAULT_CUSTOM_MINUTES,
  DEFAULT_TIME_CONTROL_ID,
  TIME_PRESETS,
  resolveTimeControl,
  type ClockSelection,
} from "../game/clock";
import {
  banksAt,
  initialClockLine,
  isTimeLoss,
  recordArrival,
  truncateTo,
  type ClockLine,
} from "../game/clockLine";
import { aiSideOf, clockPlacement, humanSideOf, opposite } from "../game/sides";
import { gameOverText } from "../gameOverText";
import type { ZenConfig } from "../zen";
import type { Translations } from "../i18n";
import type { CornerEmblemDef } from "../cornerEmblems";
import type { DefenderEmblemDef } from "../defenderEmblems";
import type { EmblemDef } from "../emblems";
import type { KingEmblemDef } from "../kingEmblems";
import { useDialogFocus } from "../useDialogFocus";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { useAiReveal } from "../useAiReveal";

/**
 * The Copenhagen Hnefatafl surface — a full-screen place, reached from the
 * drawer's More games section, not a mode of the Brandubh shell.
 *
 * ## Why it is a separate screen
 *
 * The same argument the Tablut screen makes, now for the third time, and ADR-0007
 * treats the repetition as the point rather than an accident. `App.tsx` is four
 * thousand lines built around a `RuleSet`, and Copenhagen's is a *different type*
 * (`CopenhagenRuleSet`: an escape condition, a first mover, a king-strength
 * ladder, an exit fort — none of them Brandubh flags). Threading three rulesets
 * through one shell means `RuleSet | TablutRuleSet | CopenhagenRuleSet` and a
 * three-way narrowing at every site that touches it, which makes the shell worse
 * for all three games. What forks is the *rules*; the furniture does not. This
 * screen renders the very same components the shell does — `PlayerBar` seats, the
 * bottom `GameToolbar` and its menu sheet, `MoveLog`, `ReviewBar`, `Board`,
 * `VictoryOverlay`, the `ZenSwitch` — wired to Copenhagen's own game state, so
 * all three boards *look and handle the same* and only the rules, the engine and
 * the board size change.
 *
 * The clock is the shell's own `useGameClock` + `clockLine` book-keeping, which
 * were boardgame-agnostic from the start. Zen is one preference across every
 * surface: App owns the config and this screen receives it, so switching it here
 * is switching it there.
 *
 * What is still the shell's alone: analysis, the eval bar, the review pass,
 * puzzles, match sets, import/export. Those are search-coupled or
 * shell-refactor-sized, and they arrive when the shell can hold more than one
 * game. That refactor is now the *largest* item this fork has deferred — see
 * ADR-0007 — because it is the one piece of duplication that grows with every
 * board rather than staying flat.
 *
 * ## Persistence
 *
 * The same contract as the Brandubh shell: a refresh must never lose a game in
 * progress. The screen restores its save silently on mount — no setup modal over
 * a game already underway — and autosaves on every move through
 * `game/copenhagen/persist.ts`, under Copenhagen's own key, with the review
 * cursor and the clock banks riding along. App keeps the surface itself
 * persistent (see `copenhagen.surface.v1`), so closing the tab mid-game lands
 * back on this board.
 *
 * A restored *finished* game is a review state, not a dead end: the final
 * position under a result line, the timeline browsable, the toolbar's new-game
 * cycle lit.
 */
export default function CopenhagenScreen({
  t,
  zen,
  onZenEnabled,
  attackerEmblem,
  kingEmblem,
  defenderEmblem,
  cornerEmblem,
  onClose,
}: {
  t: Translations;
  /** The shared Zen preference — App owns it; both surfaces obey it. */
  zen: ZenConfig;
  onZenEnabled: (v: boolean) => void;
  attackerEmblem: EmblemDef;
  kingEmblem: KingEmblemDef;
  defenderEmblem: DefenderEmblemDef;
  cornerEmblem: CornerEmblemDef;
  onClose: () => void;
}) {
  const screenRef = useDialogFocus<HTMLDivElement>();

  // The saved game, restored once per mount. Restoring is silent — the player
  // left a board and gets the same board back; only a first visit (or a game
  // already concluded and replaced) opens on the setup sheet.
  const [restored] = useState<RestoredGame | null>(loadResumableGame);

  const [variantId, setVariantId] = useState<string>(restored?.variantId ?? DEFAULT_VARIANT);
  const [customRules, setCustomRules] = useState<CustomRuleSet>(
    restored?.customRules ?? CUSTOM_RULE_DEFAULTS,
  );
  const [playMode, setPlayMode] = useState<PlayMode>(restored?.playMode ?? "defenders");
  const [difficulty, setDifficulty] = useState<Difficulty>(restored?.difficulty ?? "medium");

  const rules = useMemo(() => rulesFor(variantId, customRules), [variantId, customRules]);

  // ── Move timeline ───────────────────────────────────────────────────────────
  // `states[k]` is the position after k moves; `cursor` is the position on
  // screen — the same model the shell uses, so browsing with the arrows only
  // moves the cursor and never discards moves.
  const [states, setStates] = useState<GameState[]>(
    () => restored?.states ?? [initialState(rulesFor(DEFAULT_VARIANT, CUSTOM_RULE_DEFAULTS))],
  );
  const [cursor, setCursor] = useState<number>(() =>
    restored ? Math.min(restored.cursor, restored.states.length - 1) : 0,
  );
  const [selected, setSelected] = useState<Square | null>(null);
  const [thinking, setThinking] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const [showSetup, setShowSetup] = useState(restored === null);
  // Restart over an unfinished game is destructive — the autosave is replaced —
  // so it asks first, exactly as the Brandubh shell's new-game path does.
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);

  const tip = states.length - 1;
  const atTip = cursor === tip;
  const reviewing = !atTip;
  const game = states[cursor];
  const tipState = states[tip];
  const gameOver = isGameOver(tipState.status);
  const viewedOver = isGameOver(game.status);
  const humanSide = humanSideOf(playMode);
  const aiSide = aiSideOf(playMode);

  // An optional extra shows when Zen is off, or when it has been opted in —
  // the same predicate the shell applies to the same shared config.
  const showNav = !zen.enabled || zen.extras["nav"];

  // The game's identity for the autosave: a resumed game keeps its id and start
  // time — it is the same game, not a copy — and `startGame` mints fresh ones.
  const gameId = useRef<string>(restored?.id ?? newGameId());
  const gameStartedAt = useRef<number>(restored?.createdAt ?? Date.now());

  // Which position the engine was already asked about — see the engine effect.
  const askedFor = useRef<string>("");
  // Whether the previous render was already a finished game. Seeded from the
  // restore so re-entering a concluded game shows the final board quietly
  // rather than replaying the victory curtain.
  const wasOver = useRef(
    restored ? isGameOver(restored.states[restored.states.length - 1].status) : false,
  );

  const { requestMove, cancel } = useAiWorker();
  const reducedMotion = usePrefersReducedMotion();
  // How the engine's move is shown — the same reveal the 7×7 board uses; it is
  // presentation over a committed position, so it is shared rather than forked.
  const {
    slide: aiSlide,
    origin: aiOrigin,
    reveal: revealAiMove,
    endSlide: endAiSlide,
    clear: clearAiReveal,
  } = useAiReveal(reducedMotion);
  /** How long the move just pushed is still being shown for. See `push`. */
  const revealDelay = useRef(0);

  // ── Clock (the shell's own hook and book-keeping, reused whole) ─────────────
  // The selection is seeded from the restored game's control, so a timed game
  // resumes timed; a fresh visit starts untimed until the setup sheet says
  // otherwise.
  const [clockSel, setClockSel] = useState<ClockSelection>(() => {
    const c = restored?.clock;
    if (!c)
      return {
        enabled: false,
        controlId: DEFAULT_TIME_CONTROL_ID,
        customMinutes: DEFAULT_CUSTOM_MINUTES,
        customIncrement: DEFAULT_CUSTOM_INCREMENT,
      };
    const preset = TIME_PRESETS.find(
      (p) => p.initialSeconds === c.initialSeconds && p.incrementSeconds === c.incrementSeconds,
    );
    return preset
      ? {
          enabled: true,
          controlId: preset.id,
          customMinutes: DEFAULT_CUSTOM_MINUTES,
          customIncrement: DEFAULT_CUSTOM_INCREMENT,
        }
      : {
          enabled: true,
          controlId: CUSTOM_TIME_CONTROL_ID,
          customMinutes: Math.max(1, Math.round(c.initialSeconds / 60)),
          customIncrement: c.incrementSeconds,
        };
  });
  const timeControl = useMemo(
    () =>
      resolveTimeControl(
        clockSel.enabled,
        clockSel.controlId,
        clockSel.customMinutes,
        clockSel.customIncrement,
      ),
    [clockSel],
  );

  // A flag (bank hits zero) is a loss on time for that side, applied to the tip.
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
  const clock = useGameClock(timeControl, atTip && !gameOver && !showSetup, onFlag);

  const [clockLine, setClockLine] = useState<ClockLine>(() => initialClockLine(timeControl));
  // A new bank/increment re-arms the live clock; the recorded line starts over
  // with it. Declared before the mount-restore effect so on mount the restore
  // runs second and wins.
  useEffect(() => {
    setClockLine(initialClockLine(timeControl));
  }, [timeControl]);

  // Put a restored game's banks back, once, on mount — only onto the matching
  // control (which it is by construction: the selection above came from it).
  const clockRestored = useRef(false);
  useEffect(() => {
    if (clockRestored.current) return;
    clockRestored.current = true;
    const c = restored?.clock;
    if (!c || !timeControl) return;
    if (
      c.initialSeconds !== timeControl.initialSeconds ||
      c.incrementSeconds !== timeControl.incrementSeconds
    )
      return;
    clock.restore(c);
    setClockLine(c.line.length ? c.line : initialClockLine(timeControl));
    // Mount-only by design; the guards above make a re-run harmless anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each new move at the tip presses the mover's clock; the resulting banks are
  // the arrival time of the position just reached — same wiring as the shell.
  const prevTipRef = useRef(tip);
  useEffect(() => {
    const prev = prevTipRef.current;
    prevTipRef.current = tip;
    if (!clock.enabled) return;
    if (tip !== prev + 1) return; // rewinds are handled by rewindTo
    const banks = clock.press(opposite(states[tip].turn));
    setClockLine((line) => recordArrival(line, tip, banks));
    // Only react to timeline length changes, not cursor scrubbing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tip]);

  /**
   * Begin a fresh game under the given setup, committed in one step. The setup
   * sheet drafts these values locally, so browsing it — toggling a seat, reading
   * a variant blurb — never touches the game behind it; the old wiring reset the
   * live board the moment anything was clicked, which lost games. A new ruleset
   * is necessarily a new game (the opening depends on `firstMove`), and a new
   * game is a new identity, so the previous save is superseded rather than
   * silently continued.
   */
  const startGame = useCallback(
    (setup: GameSetup) => {
      cancel();
      setVariantId(setup.variantId);
      setCustomRules(setup.customRules);
      setPlayMode(setup.playMode);
      setDifficulty(setup.difficulty);
      setClockSel(setup.clock);
      gameId.current = newGameId();
      gameStartedAt.current = Date.now();
      setStates([initialState(rulesFor(setup.variantId, setup.customRules))]);
      setCursor(0);
      setSelected(null);
      clearAiReveal();
      setThinking(false);
      setShowVictory(false);
      setShowSetup(false);
      setGameMenuOpen(false);
      // The board arrives whole; the clock must not read it as a move played.
      prevTipRef.current = 0;
      const tc = resolveTimeControl(
        setup.clock.enabled,
        setup.clock.controlId,
        setup.clock.customMinutes,
        setup.clock.customIncrement,
      );
      setClockLine(initialClockLine(tc));
      clock.reset();
      // A fresh opening can repeat an old key (same length, same turn), so the
      // engine must be free to be asked again — this is what un-stalls Restart
      // when the engine has the first move.
      askedFor.current = "";
      wasOver.current = false;
    },
    [cancel, clearAiReveal, clock],
  );

  // Live play only ever commits from the tip, so this appends and follows.
  // `revealMs` is how long the move is still being *shown* for afterwards — the
  // engine's travelling stone (see useAiReveal), zero for a human move. The
  // curtain below waits it out so a game that ends on the engine's move is not
  // curtained over a stone still in the air.
  const push = useCallback(
    (move: Move, from: GameState, rs: CopenhagenRuleSet, revealMs = 0) => {
      revealDelay.current = revealMs;
      setStates((prev) => [...prev, applyMove(from, move, rs)]);
      setCursor((c) => c + 1);
      setSelected(null);
    },
    [],
  );

  // ── Autosave ────────────────────────────────────────────────────────────────
  // Written on every move and cursor step, exactly as the Brandubh shell does,
  // with the clock banks riding along. An untouched opening is nothing worth
  // resuming, so it clears instead — which is also how a superseded game's save
  // is forgotten when a new one starts.
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const clockLineRef = useRef(clockLine);
  clockLineRef.current = clockLine;
  const persistGame = useCallback(() => {
    if (states.length <= 1) {
      clearSavedGame();
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
        recorded: false,
        clock: timeControl
          ? {
              initialSeconds: timeControl.initialSeconds,
              incrementSeconds: timeControl.incrementSeconds,
              remaining: c.remaining,
              active: c.active,
              started: c.started,
              flagged: c.flagged,
              line: clockLineRef.current,
            }
          : null,
        // No match sets on this surface yet; the save format carries them for
        // the day the shell holds two games.
        match: null,
        gamesPerSet: 1,
        names: { p1: "", p2: "" },
      }),
    );
  }, [states, cursor, variantId, customRules, playMode, difficulty, timeControl]);
  useEffect(() => {
    persistGame();
  }, [persistGame]);
  // Leaving the page is the one moment the ticking clock has to be captured —
  // the same pagehide/visibilitychange pair the shell listens for.
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

  // ── The engine's turn ───────────────────────────────────────────────────────
  // Keyed on the game's identity and position rather than on a move counter, so
  // an undo that lands back on the engine's turn asks again rather than sitting
  // still — and a fresh game can never be confused with the one before it. Gated
  // on `atTip`: the engine never plays under a reviewer's feet.
  useEffect(() => {
    if (gameOver || aiSide === null || tipState.turn !== aiSide || showSetup || !atTip) return;
    const key = `${gameId.current}:${states.length}:${tipState.turn}`;
    if (askedFor.current === key) return;
    askedFor.current = key;
    let live = true;
    setThinking(true);
    requestMove(tipState, difficulty, rules).then((info) => {
      if (!live) return;
      setThinking(false);
      if (!info.move) return;
      // Announced against the position it is played from — the stone, and
      // anything it takes, are still standing there. The move itself commits
      // immediately, exactly as before.
      const travelMs = revealAiMove(info.move, tipState.board);
      push(info.move, tipState, rules, travelMs);
    });
    return () => {
      live = false;
    };
  }, [
    tipState,
    states.length,
    atTip,
    aiSide,
    gameOver,
    difficulty,
    rules,
    requestMove,
    revealAiMove,
    push,
    showSetup,
  ]);

  // The victory curtain fires once, on the transition into a finished game.
  // (`wasOver` is seeded from the restore above, so a game that was already
  // finished when the screen mounted stays quiet.)
  useEffect(() => {
    const rising = gameOver && !wasOver.current;
    wasOver.current = gameOver;
    if (!rising) return;
    if (!revealDelay.current) {
      setShowVictory(true);
      return;
    }
    const id = window.setTimeout(() => setShowVictory(true), revealDelay.current);
    return () => window.clearTimeout(id);
  }, [gameOver]);

  // Escape unwinds one layer at a time — curtain, menu, confirms, then sheet,
  // then the surface itself — rather than dropping the player back to the 7×7
  // board from under a modal. Leaving the game space is only ever the player's
  // own deliberate step.
  const canCancelSetup = states.length > 1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showVictory) {
        setShowVictory(false);
        return;
      }
      if (gameMenuOpen) {
        // The sheet closes itself on Escape; swallow the layer here too so the
        // press cannot fall through to the surface below.
        return;
      }
      if (confirmRestart) {
        setConfirmRestart(false);
        return;
      }
      if (confirmResign) {
        setConfirmResign(false);
        return;
      }
      if (showSetup && canCancelSetup) {
        setShowSetup(false);
        return;
      }
      if (showSetup) return; // first visit: the sheet is the room
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, showVictory, gameMenuOpen, confirmRestart, confirmResign, showSetup, canCancelSetup]);

  // ── Returning the live game to an earlier position ──────────────────────────
  // Takebacks and "play from here" both land here — the shell's rewind, minus
  // the analysis tree it does not have. The clocks are put back to the times
  // that position was first offered with, which also lifts a fallen flag.
  const rewindTo = useCallback(
    (ply: number) => {
      cancel();
      setThinking(false);
      setShowVictory(false);
      setStates((prev) => {
        const next = prev.slice(0, ply + 1);
        if (isTimeLoss(next[ply].status)) next[ply] = { ...next[ply], status: "playing" };
        return next;
      });
      setCursor(ply);
      setClockLine((line) => truncateTo(line, ply));
      prevTipRef.current = ply;
      if (clock.enabled && timeControl) {
        clock.resumeAt(banksAt(clockLine, ply, timeControl), states[ply].turn, ply > 0);
      }
      setSelected(null);
      // The engine's reveal describes a position this rewind has just replaced.
      clearAiReveal();
      askedFor.current = "";
    },
    [cancel, clearAiReveal, clock, clockLine, states, timeControl],
  );

  // Step back past the engine's reply as well as your own move, so a takeback
  // returns you to a position you can actually act on.
  const takeback = useCallback(() => {
    const back = aiSide !== null && tip >= 2 ? 2 : 1;
    if (tip < back) return;
    rewindTo(tip - back);
  }, [aiSide, tip, rewindTo]);

  const resign = useCallback(() => {
    setConfirmResign(false);
    if (gameOver || !atTip) return;
    const loser: Side = humanSide === null ? tipState.turn : humanSide;
    const status: GameState["status"] =
      opposite(loser) === "attackers" ? "attackers_win_resign" : "defenders_win_resign";
    cancel();
    setThinking(false);
    setSelected(null);
    setStates((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1], status };
      return copy;
    });
  }, [gameOver, atTip, humanSide, tipState.turn, cancel]);

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

  // ── Interaction ─────────────────────────────────────────────────────────────
  const controllable: Side | null = humanSide;
  const interactive = atTip && !gameOver && !thinking && !showSetup;

  const onSquareClick = (sq: Square) => {
    if (!interactive) return;
    const piece = game.board[sq.row][sq.col];
    // A second click on the selected piece deselects; a click on a legal
    // destination moves; anything else re-selects or clears.
    if (selected && selected.row === sq.row && selected.col === sq.col) {
      setSelected(null);
      return;
    }
    if (selected) {
      const move = movesFrom(game.board, selected.row, selected.col, rules).some(
        (d) => d.row === sq.row && d.col === sq.col,
      )
        ? { from: selected, to: sq }
        : null;
      if (move) {
        push(move, game, rules);
        return;
      }
    }
    const side = piece === "attacker" ? "attackers" : piece ? "defenders" : null;
    setSelected(side === game.turn && (controllable === null || controllable === side) ? sq : null);
  };

  // ── Geometry ────────────────────────────────────────────────────────────────
  const geom = useMemo<BoardGeometry>(
    () => ({
        size: BOARD_SIZE,
        files: FILES,
        label: "Copenhagen Hnefatafl board",
        isThrone,
        // Only marked when the variant makes them so — under the baseline a
        // corner is ordinary ground and must draw that way.
        isSpecialCorner: (r: number, c: number) =>
          rules.cornersRestricted || rules.cornersHostile
            ? (r === 0 || r === BOARD_SIZE - 1) && (c === 0 || c === BOARD_SIZE - 1)
            : false,
        squareName,
      }),
    [rules.cornersRestricted, rules.cornersHostile],
  );
  const legalFrom = useCallback(
    (board: GameState["board"], r: number, c: number) => movesFrom(board, r, c, rules),
    [rules],
  );

  const lastMove = game.history.length ? game.history[game.history.length - 1].move : null;
  const winner = winnerOf(tipState.status);
  const king = findKing(game.board);
  const legalCount = viewedOver ? 0 : allMoves(game.board, game.turn, rules).length;

  const variantLabel = t.variantNames[rules.id] ?? rules.name;
  const currentSetup: GameSetup = { variantId, customRules, playMode, difficulty, clock: clockSel };

  // A finished game (or an untouched board) has nothing to lose; mid-game the
  // restart asks first.
  const requestRestart = () =>
    !gameOver && states.length > 1 ? setConfirmRestart(true) : startGame(currentSetup);

  // ── Seats (the shell's PlayerBar, seated the shell's way) ───────────────────
  // Browsing the game shows each position's own clocks — the times it was first
  // offered with — rather than the live banks.
  const viewedBanks = reviewing ? banksAt(clockLine, cursor, timeControl) : clock.remaining;
  const { top: topSide, bottom: bottomSide } = clockPlacement(playMode);
  // The AI seat reads tier over side ("Medium / White…"); a human seat's name
  // *is* the side, so its sub line stays empty rather than repeating it.
  const sideName = (side: Side): string =>
    side === "defenders" ? t.taflWhite : t.taflBlack;
  const seatName = (side: Side): string =>
    side === aiSide ? t.taflDifficulties[difficulty] : sideName(side);
  const renderPlayerBar = (side: Side, position: "top" | "bottom") => (
    <PlayerBar
      name={seatName(side)}
      sub={side === aiSide ? sideName(side) : ""}
      side={side}
      captures={side === "attackers" ? game.captured.defenders : game.captured.attackers}
      clockEnabled={clock.enabled}
      ms={viewedBanks[side]}
      active={
        !isGameOver(game.status) &&
        (reviewing || !clock.enabled || !clock.started
          ? game.turn === side
          : clock.active === side)
      }
      running={clock.running}
      flagged={!reviewing && clock.flagged === side}
      increment={timeControl?.incrementSeconds ?? 0}
      flagLabel={t.flagLabel}
      thinking={thinking && side === aiSide}
      moveCount={position === "bottom" ? game.moveCount : undefined}
    />
  );

  // Everything wordy lives behind the toolbar's list icon, as in the shell.
  const menuItems = [
    { label: t.newGame, onClick: () => setShowSetup(true) },
    { label: t.taflRestart, onClick: requestRestart },
    ...(atTip && !gameOver && tip >= 1 ? [{ label: t.taflUndo, onClick: takeback }] : []),
    ...(clock.enabled && clock.started && atTip && !gameOver
      ? [{ label: clock.paused ? t.resume : t.pause, onClick: clock.togglePause }]
      : []),
    ...(atTip && !gameOver && tip >= 1
      ? [{ label: t.resign, danger: true, onClick: () => setConfirmResign(true) }]
      : []),
  ];

  return (
    <div className="copenhagen-screen fixed inset-0 z-50 overflow-y-auto" ref={screenRef} tabIndex={-1}>
      <div className="mx-auto flex min-h-full max-w-md flex-col px-3 pb-24 pt-3">
        <header className="flex items-center justify-between gap-2">
          <button className="iconbtn" onClick={onClose} aria-label={t.back}>
            ‹
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate font-display text-lg text-parchment">{t.gameCopenhagen}</p>
            <p className="truncate text-xs text-parchment-dim">{variantLabel}</p>
          </div>
          <ZenSwitch t={t} on={zen.enabled} onChange={onZenEnabled} testId="copenhagen-zen-toggle" />
        </header>

        <div className="mt-3">{renderPlayerBar(topSide, "top")}</div>

        <div className="mt-3">
          <Board
            board={game.board}
            geom={geom}
            legalFrom={legalFrom}
            turn={game.turn}
            selected={selected}
            lastMove={lastMove}
            fadingCaptures={[]}
            aiSlide={aiSlide}
            aiOrigin={aiOrigin}
            onAiSlideEnd={endAiSlide}
            interactive={interactive}
            controllable={controllable}
            attackerEmblem={attackerEmblem}
            kingEmblem={kingEmblem}
            defenderEmblem={defenderEmblem}
            cornerEmblem={cornerEmblem}
            onSquareClick={onSquareClick}
          />
        </div>

        <div className="mt-3">{renderPlayerBar(bottomSide, "bottom")}</div>

        {/* The result, said in place — a restored finished game has no curtain
            to say it, and a browsed terminal position deserves the line too. */}
        {viewedOver && (
          <p className="mt-2 text-center text-sm text-parchment">
            {gameOverText(game.status, t)}
          </p>
        )}

        {!zen.enabled && (
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-parchment-dim">
            <span>
              {t.taflMoves}: {game.moveCount}
            </span>
            {king && (
              <span>
                {t.taflKingAt} {squareName(king)}
              </span>
            )}
            <span>
              {t.taflLegalMoves}: {legalCount}
            </span>
          </div>
        )}

        {(showNav || gameOver) && (
          <>
            <GameToolbar
              menuOpen={gameMenuOpen}
              menuLabel={t.menu}
              onMenu={() => setGameMenuOpen((v) => !v)}
              cycleLabel={t.newGame}
              cycleEnabled={gameOver}
              onCycle={() => setShowSetup(true)}
              analysisShown={false}
              analysisOn={false}
              analysisEnabled={false}
              analysisLabel={t.analysisMode}
              onAnalysis={() => {}}
              canPrev={cursor > 0}
              canNext={cursor < tip}
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
        )}

        {(reviewing || gameOver) && showNav && (
          <ReviewBar
            t={t}
            reviewing={reviewing}
            moveNumber={cursor}
            totalMoves={tip}
            viewedTerminal={viewedOver && !isTimeLoss(game.status)}
            showVsAi={false}
            onLatest={goLatest}
            onPlay={() => rewindTo(cursor)}
            onPlayVsAi={() => {}}
          />
        )}

        <MoveLog
          t={t}
          game={tipState}
          activeIndex={cursor - 1}
          moveName={moveName}
          onMoveClick={(i) => {
            setSelected(null);
            setCursor(i + 1);
          }}
        />

        {/* The second way out of Zen, at the foot of everything that scrolls —
            same rule as the shell: no Zen setting may lock you out of the
            control that would undo it. */}
        {zen.enabled && (
          <div className="zen-foot">
            <ZenSwitch t={t} on={zen.enabled} onChange={onZenEnabled} testId="copenhagen-zen-foot" />
          </div>
        )}
      </div>

      {showSetup && (
        <CopenhagenSetup
          t={t}
          initial={currentSetup}
          onStart={startGame}
          // Backing out is only offered over a game worth returning to; the
          // first visit has nothing behind the sheet.
          onCancel={canCancelSetup ? () => setShowSetup(false) : null}
        />
      )}

      {confirmRestart && (
        <CopenhagenConfirm
          title={t.newGameTitle}
          body={t.newGameBody}
          confirmLabel={t.taflRestart}
          cancelLabel={t.back}
          onConfirm={() => {
            setConfirmRestart(false);
            startGame(currentSetup);
          }}
          onCancel={() => setConfirmRestart(false)}
        />
      )}

      {confirmResign && (
        <CopenhagenConfirm
          title={t.resignTitle}
          body={t.resignBody}
          confirmLabel={t.resign}
          cancelLabel={t.back}
          onConfirm={resign}
          onCancel={() => setConfirmResign(false)}
        />
      )}

      {showVictory && winner && (
        <VictoryOverlay
          t={t}
          winner={winner}
          reason={gameOverText(tipState.status, t)}
          moveCount={tipState.moveCount}
          emblems={{ attackerEmblem, kingEmblem, defenderEmblem, cornerEmblem }}
          primaryLabel={t.newGame}
          onPrimary={() => {
            setShowVictory(false);
            setShowSetup(true);
          }}
          onDismiss={() => setShowVictory(false)}
          // There is no review pass on this side yet, so "review" is just
          // dismissing the curtain to look at the final position.
          onReview={() => setShowVictory(false)}
        />
      )}
    </div>
  );
}

/** Everything the setup sheet chooses, committed in one step when Play is pressed. */
interface GameSetup {
  variantId: string;
  customRules: CustomRuleSet;
  playMode: PlayMode;
  difficulty: Difficulty;
  clock: ClockSelection;
}

/** The surface's own confirm card — the same shape the shell's ConfirmDialog has. */
function CopenhagenConfirm({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
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

/**
 * Opponent, seat, strength, rules and clock — everything chosen before the
 * first move.
 *
 * The sheet drafts its choices locally and commits them all at once through
 * `onStart`. Nothing here reaches the live game while the sheet is open, so it
 * can be browsed — and backed out of, when `onCancel` is offered — over a game
 * in progress without disturbing it.
 */
function CopenhagenSetup({
  t,
  initial,
  onStart,
  onCancel,
}: {
  t: Translations;
  initial: GameSetup;
  onStart: (setup: GameSetup) => void;
  onCancel: (() => void) | null;
}) {
  const ref = useDialogFocus<HTMLDivElement>();
  const [variantId, setVariantId] = useState(initial.variantId);
  const [customRules, setCustomRules] = useState(initial.customRules);
  const [playMode, setPlayMode] = useState(initial.playMode);
  const [difficulty, setDifficulty] = useState(initial.difficulty);
  const [clock, setClock] = useState<ClockSelection>(initial.clock);
  const rules = rulesFor(variantId, customRules);
  return (
    <div
      className="settings-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onCancel ?? undefined}
    >
      <div
        className="settings-sheet card max-h-[88vh] w-full overflow-y-auto rounded-b-none p-6 sm:max-w-lg sm:rounded-2xl"
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-xl text-parchment">{t.gameCopenhagen}</h2>
          {onCancel && (
            <button className="btn" onClick={onCancel} aria-label={t.close}>
              ✕
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-parchment-dim">{t.copenhagenBlurb}</p>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-parchment-dim">
          {t.variant}
        </label>
        <select
          className="btn mt-1 w-full"
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
        >
          {/* Driven by VISIBLE_VARIANTS, so hiding a preset is a one-line change
              in game/copenhagen/variants.ts rather than a hand-edit here. */}
          {VISIBLE_VARIANTS.map((id) => (
            <option key={id} value={id}>
              {t.variantNames[id] ?? VARIANTS[id].name}
            </option>
          ))}
          <option value="custom">{t.variantNames["custom"] ?? "Custom"}</option>
        </select>
        <p className="mt-1 text-xs text-parchment-dim">{t.variantBlurbs[rules.id] ?? rules.blurb}</p>

        {variantId === "custom" && (
          <CopenhagenRuleEditor t={t} rules={customRules} onChange={setCustomRules} />
        )}

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-parchment-dim">
          {t.taflOpponent}
        </label>
        <div className="seg mt-1">
          {(["defenders", "attackers", "hotseat"] as const).map((m) => (
            <button
              key={m}
              className={playMode === m ? "on" : ""}
              onClick={() => setPlayMode(m)}
              aria-pressed={playMode === m}
            >
              {m === "hotseat" ? t.taflHotseat : m === "defenders" ? t.taflWhite : t.taflBlack}
            </button>
          ))}
        </div>

        {playMode !== "hotseat" && (
          <>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-parchment-dim">
              {t.taflStrength}
            </label>
            <div className="seg mt-1">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  className={difficulty === d ? "on" : ""}
                  onClick={() => setDifficulty(d)}
                  aria-pressed={difficulty === d}
                >
                  {t.taflDifficulties[d]}
                </button>
              ))}
            </div>
          </>
        )}

        {/* The clock — the shell's preset ladder, chosen before the game it
            belongs to exists, so it travels with the rest of the setup. */}
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-parchment-dim">
          {t.chooseTime}
        </label>
        <select
          className="btn mt-1 w-full"
          value={clock.enabled ? clock.controlId : "off"}
          onChange={(e) =>
            setClock((c) =>
              e.target.value === "off"
                ? { ...c, enabled: false }
                : { ...c, enabled: true, controlId: e.target.value },
            )
          }
          aria-label={t.chooseTime}
        >
          <option value="off">{t.off}</option>
          {TIME_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}
            </option>
          ))}
        </select>

        <button
          className="btn primary mt-5 w-full"
          onClick={() => onStart({ variantId, customRules, playMode, difficulty, clock })}
        >
          {t.taflPlay}
        </button>
      </div>
    </div>
  );
}

/**
 * The custom rule editor.
 *
 * Built from the ruleset's own shape rather than a hand-written list, so a rule
 * added to `CopenhagenRuleSet` shows up here without anyone remembering to add it —
 * the same property `gameFile.ts` gets from deriving its `Rules` tag. The labels
 * and hints come from i18n, keyed by flag name, and `tsc` is what notices a
 * missing one.
 */
function CopenhagenRuleEditor({
  t,
  rules,
  onChange,
}: {
  t: Translations;
  rules: CustomRuleSet;
  onChange: (flags: CustomRuleSet) => void;
}) {
  const keys = Object.keys(CUSTOM_RULE_DEFAULTS) as Array<keyof CustomRuleSet>;
  const bools = keys.filter((k) => typeof CUSTOM_RULE_DEFAULTS[k] === "boolean");
  const enums = keys.filter((k) => typeof CUSTOM_RULE_DEFAULTS[k] === "string");
  return (
    <div className="mt-3 rounded-lg bg-black/20 p-3">
      {enums.map((k) => (
        <div key={k} className="mb-3">
          <p className="text-xs font-semibold text-parchment">{t.taflRules[k]}</p>
          <p className="mb-1 text-xs text-parchment-dim">{t.taflRuleHints[k]}</p>
          <div className="seg">
            {ENUM_CHOICES[k].map((v) => (
              <button
                key={v}
                className={rules[k] === v ? "on" : ""}
                onClick={() => onChange({ ...rules, [k]: v })}
                aria-pressed={rules[k] === v}
              >
                {t.taflRuleValues[v] ?? v}
              </button>
            ))}
          </div>
        </div>
      ))}
      {bools.map((k) => (
        <label key={k} className="mb-2 flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={rules[k] as boolean}
            onChange={(e) => onChange({ ...rules, [k]: e.target.checked })}
          />
          <span>
            <span className="font-semibold text-parchment">{t.taflRules[k]}</span>
            <br />
            <span className="text-parchment-dim">{t.taflRuleHints[k]}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** The values each enum rule offers, in the order they read as a spectrum. Kept
 *  beside the editor because it is a UI ordering, not a rule. */
const ENUM_CHOICES: Record<string, readonly string[]> = {
  escape: ["edges", "corners"],
  firstMove: ["defenders", "attackers"],
  throneBlocks: ["none", "attackers", "soldiers"],
  throneAnvil: ["none", "defenders", "both"],
  repetitionResult: ["none", "draw", "loss_for_defenders"],
};
