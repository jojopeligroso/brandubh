import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearSavedGame,
  loadResumableGame,
  newGameId,
  saveGame,
  snapshotGame,
  type RestoredGame,
} from "../game/tablut/persist";
import Board from "./Board";
import VictoryOverlay from "./VictoryOverlay";
import type { BoardGeometry } from "../games/geometry";
import { DIFFICULTIES, type Difficulty } from "../game/tablut/engine";
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
} from "../game/tablut/rules";
import { BOARD_SIZE, FILES } from "../game/tablut/types";
import type { GameState, Move, PlayMode, Side, Square } from "../game/tablut/types";
import {
  CUSTOM_RULE_DEFAULTS,
  DEFAULT_VARIANT,
  VARIANTS,
  VISIBLE_VARIANTS,
  rulesFor,
  type CustomRuleSet,
  type TablutRuleSet,
} from "../game/tablut/variants";
import { useAiWorker } from "../game/tablut/useAiWorker";
import { aiSideOf, humanSideOf, opposite } from "../game/sides";
import { gameOverText } from "../gameOverText";
import type { Translations } from "../i18n";
import type { CornerEmblemDef } from "../cornerEmblems";
import type { DefenderEmblemDef } from "../defenderEmblems";
import type { EmblemDef } from "../emblems";
import type { KingEmblemDef } from "../kingEmblems";
import { useDialogFocus } from "../useDialogFocus";

/**
 * The Tablut surface — a full-screen place, reached from the drawer's More games
 * section, not a mode of the Brandubh shell.
 *
 * ## Why it is a separate screen
 *
 * `App.tsx` is four thousand lines built around a `RuleSet`, and Tablut's ruleset
 * is a *different type* (`TablutRuleSet`: it has an escape condition and a first
 * mover, which are not Brandubh flags). Threading both through one shell means
 * `rules: RuleSet | TablutRuleSet` and a narrowing at every site that touches it,
 * which would make the shell worse for both games. The alternative — making `App`
 * generic in its ruleset — is the right long-term move and a large mechanical
 * refactor; until then this screen owns its own state and reuses the components
 * that are genuinely game-agnostic (`Board`, `VictoryOverlay`) through the
 * geometry contract in `src/games/geometry.ts`.
 *
 * What that costs today is honest to state: no clock, no analysis or eval bar, no
 * review pass, no match sets, no import/export, no puzzles or tutorials on this
 * side yet. Those live in the shell, and they arrive when the shell can hold two
 * games. What is here is a complete game of Tablut — every shipped variant, the
 * custom rule editor, both seats against the engine or two people sharing the
 * board, undo, and a legal conclusion.
 *
 * ## Persistence
 *
 * The same contract as the Brandubh shell: a refresh must never lose a game in
 * progress. The screen restores its save silently on mount — no setup modal over
 * a game already underway — and autosaves on every move through
 * `game/tablut/persist.ts`, under Tablut's own key. App keeps the surface itself
 * persistent (see `tablut.surface.v1`), so closing the tab mid-game and coming
 * back lands on this board, not the 7×7 one.
 */
export default function TablutScreen({
  t,
  attackerEmblem,
  kingEmblem,
  defenderEmblem,
  cornerEmblem,
  onClose,
}: {
  t: Translations;
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

  const [states, setStates] = useState<GameState[]>(
    () => restored?.states ?? [initialState(rulesFor(DEFAULT_VARIANT, CUSTOM_RULE_DEFAULTS))],
  );
  const [selected, setSelected] = useState<Square | null>(null);
  const [thinking, setThinking] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const [showSetup, setShowSetup] = useState(restored === null);
  // Restart over an unfinished game is destructive — the autosave is replaced —
  // so it asks first, exactly as the Brandubh shell's new-game path does.
  const [confirmRestart, setConfirmRestart] = useState(false);

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

  const game = states[states.length - 1];
  const gameOver = isGameOver(game.status);
  const humanSide = humanSideOf(playMode);
  const aiSide = aiSideOf(playMode);

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
      gameId.current = newGameId();
      gameStartedAt.current = Date.now();
      setStates([initialState(rulesFor(setup.variantId, setup.customRules))]);
      setSelected(null);
      setThinking(false);
      setShowVictory(false);
      setShowSetup(false);
      // A fresh opening can repeat an old key (same length, same turn), so the
      // engine must be free to be asked again — this is what un-stalls Restart
      // when the engine has the first move.
      askedFor.current = "";
      wasOver.current = false;
    },
    [cancel],
  );

  const push = useCallback((move: Move, from: GameState, rs: TablutRuleSet) => {
    setStates((prev) => [...prev, applyMove(from, move, rs)]);
    setSelected(null);
  }, []);

  // ── Autosave ────────────────────────────────────────────────────────────────
  // Written on every move, exactly as the Brandubh shell does. An untouched
  // opening is nothing worth resuming, so it clears instead — which is also how
  // a superseded game's save is forgotten when a new one starts.
  useEffect(() => {
    if (states.length <= 1) {
      clearSavedGame();
      return;
    }
    saveGame(
      snapshotGame({
        id: gameId.current,
        createdAt: gameStartedAt.current,
        states,
        cursor: states.length - 1,
        variantId,
        customRules,
        playMode,
        difficulty,
        recorded: false,
        // No clock and no match sets on this surface yet; the save format
        // carries both for the day the shell holds two games.
        clock: null,
        match: null,
        gamesPerSet: 1,
        names: { p1: "", p2: "" },
      }),
    );
  }, [states, variantId, customRules, playMode, difficulty]);

  // ── The engine's turn ───────────────────────────────────────────────────────
  // Keyed on the game's identity and position rather than on a move counter, so
  // an undo that lands back on the engine's turn asks again rather than sitting
  // still — and a fresh game can never be confused with the one before it.
  useEffect(() => {
    if (gameOver || aiSide === null || game.turn !== aiSide || showSetup) return;
    const key = `${gameId.current}:${states.length}:${game.turn}`;
    if (askedFor.current === key) return;
    askedFor.current = key;
    let live = true;
    setThinking(true);
    requestMove(game, difficulty, rules).then((info) => {
      if (!live) return;
      setThinking(false);
      if (info.move) push(info.move, game, rules);
    });
    return () => {
      live = false;
    };
  }, [game, states.length, aiSide, gameOver, difficulty, rules, requestMove, push, showSetup]);

  // The victory curtain fires once, on the transition into a finished game.
  // (`wasOver` is seeded from the restore above, so a game that was already
  // finished when the screen mounted stays quiet.)
  useEffect(() => {
    if (gameOver && !wasOver.current) setShowVictory(true);
    wasOver.current = gameOver;
  }, [gameOver]);

  // Escape unwinds one layer at a time — curtain, then sheet, then the surface
  // itself — rather than dropping the player back to the 7×7 board from under a
  // modal. Leaving the game space is only ever the player's own deliberate step.
  const canCancelSetup = states.length > 1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showVictory) {
        setShowVictory(false);
        return;
      }
      if (confirmRestart) {
        setConfirmRestart(false);
        return;
      }
      if (showSetup && canCancelSetup) {
        setShowSetup(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, showVictory, confirmRestart, showSetup, canCancelSetup]);

  // ── Interaction ─────────────────────────────────────────────────────────────
  const controllable: Side | null = humanSide;
  const interactive = !gameOver && !thinking && !showSetup;

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

  const undo = () => {
    cancel();
    setThinking(false);
    setShowVictory(false);
    // Step back past the engine's reply as well as your own move, so undo returns
    // you to a position you can actually act on.
    setStates((prev) => {
      const back = aiSide !== null && prev.length > 2 ? 2 : 1;
      return prev.length > back ? prev.slice(0, prev.length - back) : prev;
    });
    setSelected(null);
    askedFor.current = "";
  };

  // ── Geometry ────────────────────────────────────────────────────────────────
  const geom = useMemo<BoardGeometry>(
    () => ({
        size: BOARD_SIZE,
        files: FILES,
        label: "Tablut board",
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
  const winner = winnerOf(game.status);
  const king = findKing(game.board);
  const legalCount = gameOver ? 0 : allMoves(game.board, game.turn, rules).length;

  const variantLabel = t.variantNames[rules.id] ?? rules.name;

  return (
    <div className="tablut-screen fixed inset-0 z-50 overflow-y-auto" ref={screenRef} tabIndex={-1}>
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-3">
        <header className="flex items-center justify-between gap-2">
          <button className="iconbtn" onClick={onClose} aria-label={t.back}>
            ‹
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate font-display text-lg text-parchment">{t.gameTablut}</p>
            <p className="truncate text-xs text-parchment-dim">{variantLabel}</p>
          </div>
          <button className="btn" onClick={() => setShowSetup(true)}>
            {t.newGame}
          </button>
        </header>

        <TablutSeat
          t={t}
          side={opposite(seatSideOf(playMode))}
          game={game}
          thinking={thinking && aiSide === opposite(seatSideOf(playMode))}
          aiSide={aiSide}
          difficulty={difficulty}
        />

        <Board
          board={game.board}
          geom={geom}
          legalFrom={legalFrom}
          turn={game.turn}
          selected={selected}
          lastMove={lastMove}
          fadingCaptures={[]}
          interactive={interactive}
          controllable={controllable}
          attackerEmblem={attackerEmblem}
          kingEmblem={kingEmblem}
          defenderEmblem={defenderEmblem}
          cornerEmblem={cornerEmblem}
          onSquareClick={onSquareClick}
        />

        <TablutSeat
          t={t}
          side={seatSideOf(playMode)}
          game={game}
          thinking={thinking && aiSide === seatSideOf(playMode)}
          aiSide={aiSide}
          difficulty={difficulty}
        />

        <div className="flex items-center justify-between gap-2 text-xs text-parchment-dim">
          <span>
            {t.tablutMoves}: {game.moveCount}
          </span>
          {king && (
            <span>
              {t.tablutKingAt} {squareName(king)}
            </span>
          )}
          <span>
            {t.tablutLegalMoves}: {legalCount}
          </span>
        </div>

        <div className="flex gap-2">
          <button className="btn flex-1" onClick={undo} disabled={states.length <= 1}>
            {t.tablutUndo}
          </button>
          <button
            className="btn flex-1"
            onClick={() =>
              // A finished game (or an untouched board) has nothing to lose;
              // mid-game the restart asks first.
              !gameOver && states.length > 1
                ? setConfirmRestart(true)
                : startGame({ variantId, customRules, playMode, difficulty })
            }
          >
            {t.tablutRestart}
          </button>
        </div>

        {lastMove && (
          <p className="text-center text-xs text-parchment-dim">
            {t.tablutLastMove}: <span className="font-mono">{moveName(lastMove)}</span>
          </p>
        )}
      </div>

      {showSetup && (
        <TablutSetup
          t={t}
          initial={{ variantId, customRules, playMode, difficulty }}
          onStart={startGame}
          // Backing out is only offered over a game worth returning to; the
          // first visit has nothing behind the sheet.
          onCancel={canCancelSetup ? () => setShowSetup(false) : null}
        />
      )}

      {confirmRestart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="card mx-4 w-full max-w-sm space-y-5 p-8 text-center">
            <p className="font-display text-lg text-parchment">{t.newGameTitle}</p>
            <p className="text-sm text-parchment-dim">{t.newGameBody}</p>
            <div className="flex justify-center gap-3">
              <button className="btn" onClick={() => setConfirmRestart(false)}>
                {t.back}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setConfirmRestart(false);
                  startGame({ variantId, customRules, playMode, difficulty });
                }}
              >
                {t.tablutRestart}
              </button>
            </div>
          </div>
        </div>
      )}

      {showVictory && winner && (
        <VictoryOverlay
          t={t}
          winner={winner}
          reason={gameOverText(game.status, t)}
          moveCount={game.moveCount}
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

/** Which side sits at the bottom of the board — the human's, or White in hotseat. */
const seatSideOf = (mode: PlayMode): Side => (mode === "hotseat" ? "defenders" : mode);

/** Everything the setup sheet chooses, committed in one step when Play is pressed. */
interface GameSetup {
  variantId: string;
  customRules: CustomRuleSet;
  playMode: PlayMode;
  difficulty: Difficulty;
}

/** One seat: who it is, and what they have taken. */
function TablutSeat({
  t,
  side,
  game,
  thinking,
  aiSide,
  difficulty,
}: {
  t: Translations;
  side: Side;
  game: GameState;
  thinking: boolean;
  aiSide: Side | null;
  difficulty: Difficulty;
}) {
  const isAi = aiSide === side;
  const name = isAi ? t.tablutDifficulties[difficulty] : side === "defenders" ? t.tablutWhite : t.tablutBlack;
  const taken = side === "defenders" ? game.captured.attackers : game.captured.defenders;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2">
      <span className="flex items-center gap-2 text-sm text-parchment">
        <span className={`seat-dot ${side}`} aria-hidden />
        {name}
        {game.turn === side && <span className="text-gold">•</span>}
      </span>
      <span className="text-xs text-parchment-dim">
        {thinking ? "…" : taken > 0 ? `+${taken}` : ""}
      </span>
    </div>
  );
}

/**
 * Opponent, seat, strength and rules — everything chosen before the first move.
 *
 * The sheet drafts its choices locally and commits them all at once through
 * `onStart`. Nothing here reaches the live game while the sheet is open, so it
 * can be browsed — and backed out of, when `onCancel` is offered — over a game
 * in progress without disturbing it.
 */
function TablutSetup({
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
  const rules = rulesFor(variantId, customRules);
  return (
    <div className="modal-backdrop">
      <div className="modal" ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-xl text-parchment">{t.gameTablut}</h2>
          {onCancel && (
            <button className="btn" onClick={onCancel} aria-label={t.close}>
              ✕
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-parchment-dim">{t.tablutBlurb}</p>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-parchment-dim">
          {t.variant}
        </label>
        <select
          className="btn mt-1 w-full"
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
        >
          {/* Driven by VISIBLE_VARIANTS, so hiding a preset is a one-line change
              in game/tablut/variants.ts rather than a hand-edit here. */}
          {VISIBLE_VARIANTS.map((id) => (
            <option key={id} value={id}>
              {t.variantNames[id] ?? VARIANTS[id].name}
            </option>
          ))}
          <option value="custom">{t.variantNames["custom"] ?? "Custom"}</option>
        </select>
        <p className="mt-1 text-xs text-parchment-dim">{t.variantBlurbs[rules.id] ?? rules.blurb}</p>

        {variantId === "custom" && (
          <TablutRuleEditor t={t} rules={customRules} onChange={setCustomRules} />
        )}

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-parchment-dim">
          {t.tablutOpponent}
        </label>
        <div className="seg mt-1">
          {(["defenders", "attackers", "hotseat"] as const).map((m) => (
            <button
              key={m}
              className={playMode === m ? "on" : ""}
              onClick={() => setPlayMode(m)}
              aria-pressed={playMode === m}
            >
              {m === "hotseat" ? t.tablutHotseat : m === "defenders" ? t.tablutWhite : t.tablutBlack}
            </button>
          ))}
        </div>

        {playMode !== "hotseat" && (
          <>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-parchment-dim">
              {t.tablutStrength}
            </label>
            <div className="seg mt-1">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  className={difficulty === d ? "on" : ""}
                  onClick={() => setDifficulty(d)}
                  aria-pressed={difficulty === d}
                >
                  {t.tablutDifficulties[d]}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          className="btn primary mt-5 w-full"
          onClick={() => onStart({ variantId, customRules, playMode, difficulty })}
        >
          {t.tablutPlay}
        </button>
      </div>
    </div>
  );
}

/**
 * The custom rule editor.
 *
 * Built from the ruleset's own shape rather than a hand-written list, so a rule
 * added to `TablutRuleSet` shows up here without anyone remembering to add it —
 * the same property `gameFile.ts` gets from deriving its `Rules` tag. The labels
 * and hints come from i18n, keyed by flag name, and `tsc` is what notices a
 * missing one.
 */
function TablutRuleEditor({
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
          <p className="text-xs font-semibold text-parchment">{t.tablutRules[k]}</p>
          <p className="mb-1 text-xs text-parchment-dim">{t.tablutRuleHints[k]}</p>
          <div className="seg">
            {ENUM_CHOICES[k].map((v) => (
              <button
                key={v}
                className={rules[k] === v ? "on" : ""}
                onClick={() => onChange({ ...rules, [k]: v })}
                aria-pressed={rules[k] === v}
              >
                {t.tablutRuleValues[v] ?? v}
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
            <span className="font-semibold text-parchment">{t.tablutRules[k]}</span>
            <br />
            <span className="text-parchment-dim">{t.tablutRuleHints[k]}</span>
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
