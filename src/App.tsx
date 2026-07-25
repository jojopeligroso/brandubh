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
import { DEFAULT_VARIANT, VARIANTS } from "./game/variants";

type PlayMode = "attackers" | "defenders" | "hotseat";

const opposite = (s: Side): Side => (s === "attackers" ? "defenders" : "attackers");

export default function App() {
  const [variantId, setVariantId] = useState(DEFAULT_VARIANT);
  const [playMode, setPlayMode] = useState<PlayMode>("defenders");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  const [game, setGame] = useState<GameState>(() => initialState());
  const [undoStack, setUndoStack] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [fadingCaptures, setFadingCaptures] = useState<Square[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [showModeOverlay, setShowModeOverlay] = useState(true);

  const rules = VARIANTS[variantId];
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
      <Header onShowRules={() => setShowRules(true)} />

      <StatusBar game={game} thinking={thinking} humanSide={humanSide} aiSide={aiSide} />

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

      <CapturedTray game={game} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={newGame}>
          Cluiche nua
        </button>
        <button className="btn" onClick={undo} disabled={undoStack.length === 0 || thinking}>
          Cealaigh
        </button>
        <button className="btn" onClick={() => setShowRules(true)}>
          Rialacha
        </button>
      </div>

      <Settings
        variantId={variantId}
        onVariant={changeVariant}
        playMode={playMode}
        onMode={changeMode}
        difficulty={difficulty}
        onDifficulty={setDifficulty}
      />

      <MoveLog game={game} />

      {showRules && <RulesModal rules={rules} onClose={() => setShowRules(false)} />}

      {showModeOverlay && (
        <ModeOverlay
          onChoose={(m) => {
            changeMode(m);
            setShowModeOverlay(false);
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────
function Header({ onShowRules }: { onShowRules: () => void }) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="font-display text-3xl leading-none text-parchment">
          Brand<span className="text-gold">ubh</span>
        </h1>
        <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-parchment-dim">
          Hnefatafl Gaelach · 7×7
        </p>
      </div>
      <button className="btn" onClick={onShowRules}>
        Conas imirt
      </button>
    </header>
  );
}

function sideLabel(s: Side): string {
  return s === "attackers" ? "Foghlaithe" : "Taobh an Rí";
}

function StatusBar({
  game,
  thinking,
  humanSide,
  aiSide,
}: {
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
      text = "Cluiche cothrom — tháinig an suíomh arís.";
    } else {
      const how =
        game.status === "defenders_win_escape"
          ? "D'éalaigh an Rí go dtí an cúinne!"
          : game.status === "attackers_win_capture"
            ? "Gabhadh an Rí!"
            : "Níl bogadh ar bith fágtha.";
      text = `${sideLabel(w as Side)} a bhuaigh — ${how}`;
      tone = w === "defenders" ? "text-gold" : "text-blood";
    }
  } else {
    const toMove = sideLabel(game.turn);
    const who =
      humanSide === null
        ? `${toMove} le bogadh`
        : game.turn === humanSide
          ? `Do sheal · ${toMove}`
          : thinking
            ? `${toMove} ag smaoineamh…`
            : `${toMove} le bogadh`;
    text = who;
    if (aiSide && game.turn === aiSide) tone = "text-parchment-dim";
  }

  return (
    <div className="card mt-4 flex items-center justify-between px-4 py-2.5">
      <span className={`font-display text-lg ${tone}`}>{text}</span>
      <span className="font-mono text-xs text-parchment-dim">bogadh {game.moveCount}</span>
    </div>
  );
}

function CapturedTray({ game }: { game: GameState }) {
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-parchment-dim">
      <span>
        Foghlaithe caillte <b className="text-parchment">{game.captured.attackers}</b>
      </span>
      <span>
        Cosantóirí caillte <b className="text-parchment">{game.captured.defenders}</b>
      </span>
    </div>
  );
}

function Settings({
  variantId,
  onVariant,
  playMode,
  onMode,
  difficulty,
  onDifficulty,
}: {
  variantId: string;
  onVariant: (id: string) => void;
  playMode: PlayMode;
  onMode: (m: PlayMode) => void;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
}) {
  return (
    <div className="card mt-4 space-y-3 p-4">
      <Row label="Imir mar">
        <div className="seg">
          {(
            [
              ["defenders", "Rí"],
              ["attackers", "Foghlaithe"],
              ["hotseat", "Os comhair a chéile"],
            ] as [PlayMode, string][]
          ).map(([m, l]) => (
            <button key={m} className={playMode === m ? "on" : ""} onClick={() => onMode(m)}>
              {l}
            </button>
          ))}
        </div>
      </Row>

      {playMode !== "hotseat" && (
        <Row label="Leibhéal RI">
          <div className="seg">
            {(([["easy", "Éasca"], ["medium", "Meánach"], ["hard", "Deacair"]] as [Difficulty, string][]).map(([d, label]) => (
              <button key={d} className={difficulty === d ? "on" : ""} onClick={() => onDifficulty(d)}>
                {label}
              </button>
            )))}
          </div>
        </Row>
      )}

      <Row label="Leagan">
        <select
          className="btn"
          value={variantId}
          onChange={(e) => onVariant(e.target.value)}
        >
          {Object.values(VARIANTS).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
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

function ModeOverlay({ onChoose }: { onChoose: (m: PlayMode) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="card mx-4 w-full max-w-sm space-y-6 p-8 text-center">
        <h2 className="font-display text-2xl text-parchment">
          Brand<span className="text-gold">ubh</span>
        </h2>
        <p className="text-sm text-parchment-dim">Roghnaigh do chluiche</p>
        <div className="flex flex-col gap-3">
          <button
            className="btn btn-primary py-3 text-base"
            onClick={() => onChoose("defenders")}
          >
            In aghaidh an ríomhaire
          </button>
          <button
            className="btn py-3 text-base"
            onClick={() => onChoose("hotseat")}
          >
            Os comhair a chéile
            <span className="block text-xs font-normal text-parchment-dim">le cara i bpearsa</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MoveLog({ game }: { game: GameState }) {
  if (game.history.length === 0) return null;
  return (
    <details className="card mt-4 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-parchment-dim">
        Loga bogtha ({game.history.length})
      </summary>
      <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-parchment-dim sm:grid-cols-3">
        {game.history.map((h, i) => (
          <li key={i}>
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
