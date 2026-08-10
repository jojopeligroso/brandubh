import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const [variantId, setVariantId] = useState<string>(DEFAULT_VARIANT);
  const [customRules, setCustomRules] = useState<CustomRuleSet>(CUSTOM_RULE_DEFAULTS);
  const [playMode, setPlayMode] = useState<PlayMode>("defenders");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  const rules = useMemo(() => rulesFor(variantId, customRules), [variantId, customRules]);

  const [states, setStates] = useState<GameState[]>(() => [initialState(rules)]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [thinking, setThinking] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const [showSetup, setShowSetup] = useState(true);

  const { requestMove, cancel } = useAiWorker();

  const game = states[states.length - 1];
  const gameOver = isGameOver(game.status);
  const humanSide = humanSideOf(playMode);
  const aiSide = aiSideOf(playMode);

  // A new ruleset is a new game: the opening position itself depends on it
  // (`firstMove`), so keeping the old timeline would be describing a game nobody
  // played. Same reasoning as `changeVariant` in App.
  const reset = useCallback(
    (next: TablutRuleSet) => {
      cancel();
      setStates([initialState(next)]);
      setSelected(null);
      setThinking(false);
      setShowVictory(false);
    },
    [cancel],
  );

  const changeVariant = (id: string) => {
    setVariantId(id);
    reset(rulesFor(id, customRules));
  };
  const changeCustomRules = (flags: CustomRuleSet) => {
    setCustomRules(flags);
    if (variantId === "custom") reset(rulesFor("custom", flags));
  };

  const push = useCallback((move: Move, from: GameState, rs: TablutRuleSet) => {
    setStates((prev) => [...prev, applyMove(from, move, rs)]);
    setSelected(null);
  }, []);

  // ── The engine's turn ───────────────────────────────────────────────────────
  // Keyed on the position rather than on a move counter, so an undo that lands
  // back on the engine's turn asks again rather than sitting still.
  const askedFor = useRef<string>("");
  useEffect(() => {
    if (gameOver || aiSide === null || game.turn !== aiSide || showSetup) return;
    const key = `${states.length}:${game.turn}`;
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
  const wasOver = useRef(false);
  useEffect(() => {
    if (gameOver && !wasOver.current) setShowVictory(true);
    wasOver.current = gameOver;
  }, [gameOver]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          rules={rules}
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
          rules={rules}
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
          <button className="btn flex-1" onClick={() => reset(rules)}>
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
          variantId={variantId}
          customRules={customRules}
          playMode={playMode}
          difficulty={difficulty}
          onVariant={changeVariant}
          onCustomRules={changeCustomRules}
          onPlayMode={(m) => {
            setPlayMode(m);
            reset(rules);
          }}
          onDifficulty={setDifficulty}
          onStart={() => {
            setShowSetup(false);
            reset(rules);
            askedFor.current = "";
          }}
        />
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
  rules: TablutRuleSet;
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

/** Opponent, seat, strength and rules — everything chosen before the first move. */
function TablutSetup({
  t,
  variantId,
  customRules,
  playMode,
  difficulty,
  onVariant,
  onCustomRules,
  onPlayMode,
  onDifficulty,
  onStart,
}: {
  t: Translations;
  variantId: string;
  customRules: CustomRuleSet;
  playMode: PlayMode;
  difficulty: Difficulty;
  onVariant: (id: string) => void;
  onCustomRules: (flags: CustomRuleSet) => void;
  onPlayMode: (m: PlayMode) => void;
  onDifficulty: (d: Difficulty) => void;
  onStart: () => void;
}) {
  const ref = useDialogFocus<HTMLDivElement>();
  const rules = rulesFor(variantId, customRules);
  return (
    <div className="modal-backdrop">
      <div className="modal" ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
        <h2 className="font-display text-xl text-parchment">{t.gameTablut}</h2>
        <p className="mt-1 text-sm text-parchment-dim">{t.tablutBlurb}</p>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-parchment-dim">
          {t.variant}
        </label>
        <select className="btn mt-1 w-full" value={variantId} onChange={(e) => onVariant(e.target.value)}>
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
          <TablutRuleEditor t={t} rules={customRules} onChange={onCustomRules} />
        )}

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-parchment-dim">
          {t.tablutOpponent}
        </label>
        <div className="seg mt-1">
          {(["defenders", "attackers", "hotseat"] as const).map((m) => (
            <button
              key={m}
              className={playMode === m ? "on" : ""}
              onClick={() => onPlayMode(m)}
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
                  onClick={() => onDifficulty(d)}
                  aria-pressed={difficulty === d}
                >
                  {t.tablutDifficulties[d]}
                </button>
              ))}
            </div>
          </>
        )}

        <button className="btn primary mt-5 w-full" onClick={onStart}>
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
