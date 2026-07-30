import { useEffect, useState } from "react";
import { Emblem } from "./Board";
import type { Translations } from "../i18n";
import type { RuleSet } from "../game/variants";
import type { Piece } from "../game/types";
import type { EmblemDef } from "../emblems";
import type { KingEmblemDef } from "../kingEmblems";
import type { DefenderEmblemDef } from "../defenderEmblems";
import type { CornerEmblemDef } from "../cornerEmblems";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

export type Emblems = {
  attackerEmblem: EmblemDef;
  kingEmblem: KingEmblemDef;
  defenderEmblem: DefenderEmblemDef;
  cornerEmblem: CornerEmblemDef;
};

// A single fixed square in a vignette: an empty cell, a special square (throne
// or corner), or a resting piece — optionally the piece that gets captured.
interface DemoCell {
  r: number;
  c: number;
  throne?: boolean;
  corner?: boolean;
  piece?: Piece;
  victim?: boolean; // captured when the mover completes the trap
}

interface Scene {
  cols: number;
  rows: number;
  cells: DemoCell[];
  mover: { piece: Piece; from: [number, number]; to: [number, number] };
  /** "capture" flashes the red custodial ring; "win" flashes the gold ring. */
  outcome: "capture" | "win";
}

// ── Animation timing (ms) ──────────────────────────────────────────────────
const T_HOLD_START = 480; // beat on the "before" frame before the piece sets off
const T_SLIDE = 620; // must match the .demo-mover transition
const T_FLASH = 900; // how long the capture / win ring lingers
const T_RESET = 500; // pause before the loop restarts
const LOOP = T_HOLD_START + T_SLIDE + T_FLASH + T_RESET; // ≈ 2500ms
const STAGGER = 600; // wave offset between vignettes

type Phase = "start" | "move" | "flash";

function DemoBoard({
  scene,
  emblems,
  delay = 0,
  label,
}: {
  scene: Scene;
  emblems: Emblems;
  delay?: number;
  label: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [cycle, setCycle] = useState(0);
  const [phase, setPhase] = useState<Phase>("start");

  useEffect(() => {
    // Reduced motion: no loop — hold the finished "after" frame.
    if (reduced) {
      setPhase("flash");
      return;
    }
    setPhase("start");
    const lead = cycle === 0 ? delay : 0; // stagger only the first loop
    const t1 = setTimeout(() => setPhase("move"), lead + T_HOLD_START);
    const t2 = setTimeout(() => setPhase("flash"), lead + T_HOLD_START + T_SLIDE);
    const t3 = setTimeout(() => setCycle((n) => n + 1), lead + LOOP);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [cycle, reduced, delay]);

  const moved = phase !== "start";
  const flashing = phase === "flash";
  const [mr, mc] = moved ? scene.mover.to : scene.mover.from;

  return (
    <div
      className="demo-grid"
      style={{ ["--cols" as string]: scene.cols, ["--rows" as string]: scene.rows }}
      role="img"
      aria-label={label}
    >
      {Array.from({ length: scene.rows }, (_, r) =>
        Array.from({ length: scene.cols }, (_, c) => {
          const cell = scene.cells.find((x) => x.r === r && x.c === c);
          const special = cell?.throne || cell?.corner;
          const dark = (r + c) % 2 === 1;
          const capHere = flashing && cell?.victim;
          const winHere =
            flashing &&
            scene.outcome === "win" &&
            scene.mover.to[0] === r &&
            scene.mover.to[1] === c;
          return (
            <div
              key={`${cycle}-${r}-${c}`}
              className={[
                "cell",
                dark ? "dark" : "",
                special ? "special" : "",
                cell?.corner ? "corner" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {cell?.corner && (
                <span className="corner-emblem" aria-hidden>
                  <svg viewBox={emblems.cornerEmblem.viewBox} fill="currentColor" fillRule="evenodd">
                    <path d={emblems.cornerEmblem.path} />
                  </svg>
                </span>
              )}
              {cell?.piece && (
                <div
                  className={`piece ${cell.piece}${
                    capHere ? (reduced ? " demo-ghost" : " captured") : ""
                  }`}
                  aria-hidden
                >
                  <Emblem
                    piece={cell.piece}
                    attackerEmblem={emblems.attackerEmblem}
                    kingEmblem={emblems.kingEmblem}
                    defenderEmblem={emblems.defenderEmblem}
                  />
                </div>
              )}
              {capHere && <span className="dot capture" />}
              {winHere && <span className="dot win" />}
            </div>
          );
        }),
      )}

      {/* The sliding piece — a one-cell overlay translated by whole cells. */}
      <div className="demo-mover" style={{ ["--mr" as string]: mr, ["--mc" as string]: mc }}>
        <div className={`piece ${scene.mover.piece}`} aria-hidden>
          <Emblem
            piece={scene.mover.piece}
            attackerEmblem={emblems.attackerEmblem}
            kingEmblem={emblems.kingEmblem}
            defenderEmblem={emblems.defenderEmblem}
          />
        </div>
      </div>
    </div>
  );
}

function Vignette({
  scene,
  emblems,
  delay,
  label,
  caption,
}: {
  scene: Scene;
  emblems: Emblems;
  delay: number;
  label: string;
  caption: React.ReactNode;
}) {
  return (
    <div className="demo-vignette" role="group" aria-label={label}>
      <DemoBoard scene={scene} emblems={emblems} delay={delay} label={label} />
      <p className="demo-caption">{caption}</p>
    </div>
  );
}

// ── Scene definitions (3×3 board slices) ────────────────────────────────────
// In every capture the raider slides one square to complete a custodial trap,
// and the piece pinned between the two flankers (or a flanker and a hostile
// square) is taken. The mover always approaches perpendicular to the trap line
// — a single, legal rook move.

// Goal: the King runs the rank into the corner and wins.
const GOAL: Scene = {
  cols: 5,
  rows: 1,
  cells: [{ r: 0, c: 0, corner: true }],
  mover: { piece: "king", from: [0, 4], to: [0, 0] },
  outcome: "win",
};

// (a) Horizontal flank — raider(1,0) · defender(1,1) · raider slides (0,2)→(1,2).
const HORIZONTAL: Scene = {
  cols: 3,
  rows: 3,
  cells: [
    { r: 1, c: 0, piece: "attacker" },
    { r: 1, c: 1, piece: "defender", victim: true },
  ],
  mover: { piece: "attacker", from: [0, 2], to: [1, 2] },
  outcome: "capture",
};

// (b) Vertical flank — raider(0,1) · defender(1,1) · raider slides (2,0)→(2,1).
const VERTICAL: Scene = {
  cols: 3,
  rows: 3,
  cells: [
    { r: 0, c: 1, piece: "attacker" },
    { r: 1, c: 1, piece: "defender", victim: true },
  ],
  mover: { piece: "attacker", from: [2, 0], to: [2, 1] },
  outcome: "capture",
};

// (c) Against a corner — the hostile corner is the anvil.
const CORNER: Scene = {
  cols: 3,
  rows: 3,
  cells: [
    { r: 0, c: 0, corner: true },
    { r: 0, c: 1, piece: "defender", victim: true },
  ],
  mover: { piece: "attacker", from: [1, 2], to: [0, 2] },
  outcome: "capture",
};

// (d) Against the throne — the empty throne is the anvil (for soldiers only).
const THRONE: Scene = {
  cols: 3,
  rows: 3,
  cells: [
    { r: 1, c: 0, throne: true },
    { r: 1, c: 1, piece: "defender", victim: true },
  ],
  mover: { piece: "attacker", from: [0, 2], to: [1, 2] },
  outcome: "capture",
};

/**
 * The animated "what is this game" walkthrough — the goal strip plus the four
 * capture vignettes. Rendered inside the Learn hub (see LearnModal.tsx).
 */
export default function ObjectivesContent({
  t,
  rules,
  emblems,
}: {
  t: Translations;
  rules: RuleSet;
  emblems: Emblems;
}) {
  const goal = t.demoGoalByVariant[rules.id] ?? t.demoGoal;

  return (
    <div>
      {/* The goal */}
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-parchment-dim">
        {t.demoGoalLabel}
      </p>
      <p className="mt-1 font-display text-xl text-parchment">{goal}</p>
      <p className="mt-1 text-sm text-parchment-dim">{t.demoGoalHint}</p>
      <div className="mt-3">
        <DemoBoard scene={GOAL} emblems={emblems} label={t.demoGoal} />
      </div>

      {/* How captures work */}
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-parchment-dim">
        {t.demoCapturesTitle}
      </p>
      <p className="mt-1 text-sm text-parchment-dim">{t.demoCapturesHint}</p>
      <div className="demo mt-3">
        <Vignette
          scene={HORIZONTAL}
          emblems={emblems}
          delay={0}
          label={t.demoCapHorizontal}
          caption={t.demoCapHorizontal}
        />
        <Vignette
          scene={VERTICAL}
          emblems={emblems}
          delay={STAGGER}
          label={t.demoCapVertical}
          caption={t.demoCapVertical}
        />
        <Vignette
          scene={CORNER}
          emblems={emblems}
          delay={STAGGER * 2}
          label={t.demoCapCorner}
          caption={t.demoCapCorner}
        />
        <Vignette
          scene={THRONE}
          emblems={emblems}
          delay={STAGGER * 3}
          label={t.demoCapThrone}
          caption={
            <>
              {t.demoCapThrone} <b>{t.demoThroneKing}</b>
            </>
          }
        />
      </div>
    </div>
  );
}
