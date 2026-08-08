import { moveName } from "../game/rules";
import {
  isMainline,
  lineTo,
  moveCount,
  treeLines,
  type MoveTree,
} from "../game/moveTree";
import type { Translations } from "../i18n";

/**
 * The variation tree (Session 7c) — the mainline first, then each variation on
 * its own indented line, every move clickable.
 *
 * The layout comes from `treeLines` in `game/moveTree.ts` rather than being
 * computed here, so "does a variation appear, indented, under the move it
 * departs from" is a question a unit test can answer.
 *
 * Trees are **not saved**. Analysis has never written to storage (Session 7b),
 * and variations are no exception — so the panel says so out loud rather than
 * letting a player discover it by reloading.
 */
export default function MoveTreePanel({
  t,
  tree,
  currentId,
  onSelect,
  onPromote,
  onDelete,
}: {
  t: Translations;
  tree: MoveTree;
  currentId: number;
  onSelect: (nodeId: number) => void;
  onPromote: () => void;
  onDelete: () => void;
}) {
  const lines = treeLines(tree);
  // The line currently on the board, so every move leading to the position on
  // screen reads as active rather than only the last one.
  const activePath = new Set(lineTo(tree, currentId));
  const offMainline = !isMainline(tree, currentId);
  const isRoot = currentId === tree.rootId;

  return (
    <details className="card mt-4 p-4" open>
      <summary className="cursor-pointer text-sm font-semibold text-parchment-dim">
        {t.moveTree} ({moveCount(tree)})
      </summary>

      {lines.length === 0 ? (
        <p className="mt-2 text-xs text-parchment-dim">{t.moveTreeEmpty}</p>
      ) : (
        <div className="movetree mt-2">
          {lines.map((line, i) => (
            <div
              key={i}
              className={`movetree-line${line.depth > 0 ? " movetree-variation" : ""}`}
              style={line.depth > 0 ? { marginInlineStart: `${line.depth * 0.9}rem` } : undefined}
            >
              {line.depth > 0 && (
                <span className="movetree-bracket" aria-hidden>
                  ⌐
                </span>
              )}
              {line.rows.map((row) => (
                <button
                  key={row.nodeId}
                  type="button"
                  className={[
                    "movetree-move",
                    row.side === "attackers" ? "is-attacker" : "is-defender",
                    row.nodeId === currentId ? "is-current" : "",
                    activePath.has(row.nodeId) ? "is-onpath" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={row.nodeId === currentId ? "true" : undefined}
                  onClick={() => onSelect(row.nodeId)}
                >
                  <span className="movetree-ply">{row.ply}.</span> {moveName(row.move)}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={onPromote} disabled={isRoot || !offMainline}>
          {t.promoteVariation}
        </button>
        <button className="btn btn-sm" onClick={onDelete} disabled={isRoot}>
          {t.deleteVariation}
        </button>
      </div>
      <p className="mt-2 text-xs text-parchment-dim">{t.moveTreeNotSaved}</p>
    </details>
  );
}
