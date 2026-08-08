// ── Move tree (variations) ───────────────────────────────────────────────────
//
// The analysis timeline as a tree rather than a line. Until Session 7c the app
// had one continuation per position: a move played from a rewound cursor sliced
// the future off and replaced it (`states.slice(0, ply + 1)`), so trying a
// second idea meant destroying the first. Here a second idea becomes a
// *sibling*, and both survive.
//
// **Live play is deliberately not a tree.** A game has one history, the save and
// the export encode one move list, and a takeback is supposed to destroy moves.
// The tree is analysis's structure only — see `docs/design/lichess-ui.md`, where
// that decision and its consequences are written down. `App.tsx` derives the
// board's `states`/`cursor` from the line leading to the current node, which is
// what lets the board, move log and review controls work inside a tree without
// knowing one exists.
//
// No React in this file. The test suites here are pure-logic only, so anything
// that lives inside a component is untested by construction.

import { applyMove } from "./rules";
import type { GameState, Move, Side } from "./types";
import type { RuleSet } from "./variants";

export interface TreeNode {
  id: number;
  /** The full position at this node. */
  state: GameState;
  /** The move that reached it — null at the root, which is a position, not a move. */
  move: Move | null;
  parent: number | null;
  /**
   * Continuations, **first child first**. That order is the whole definition of
   * "the mainline": promoting a variation is precisely moving it to the front.
   */
  children: number[];
}

export interface MoveTree {
  nodes: Record<number, TreeNode>;
  rootId: number;
  /** Monotonic id source. Ids are never reused, so a stale id is always invalid
   *  rather than silently pointing at a different position. */
  nextId: number;
}

// Trees here are small — a 7×7 game with a handful of variations is tens of
// nodes — so every operation copies rather than mutating. That keeps them safe
// to hold in React state without a single defensive clone at the call sites.

export function createTree(root: GameState): MoveTree {
  return {
    nodes: { 0: { id: 0, state: root, move: null, parent: null, children: [] } },
    rootId: 0,
    nextId: 1,
  };
}

/** Build a tree with a single line — how an analysis session starts from the
 *  live game's timeline. `states[0]` becomes the root. */
export function fromLine(states: GameState[]): MoveTree {
  let tree = createTree(states[0]);
  let at = tree.rootId;
  for (let i = 1; i < states.length; i++) {
    const move = states[i].history[states[i].history.length - 1]?.move ?? null;
    if (!move) break;
    const id = tree.nextId;
    tree = {
      ...tree,
      nextId: id + 1,
      nodes: {
        ...tree.nodes,
        [id]: { id, state: states[i], move, parent: at, children: [] },
        [at]: { ...tree.nodes[at], children: [...tree.nodes[at].children, id] },
      },
    };
    at = id;
  }
  return tree;
}

export const nodeAt = (tree: MoveTree, id: number): TreeNode | null => tree.nodes[id] ?? null;

export const childrenOf = (tree: MoveTree, id: number): number[] => tree.nodes[id]?.children ?? [];

export const parentOf = (tree: MoveTree, id: number): number | null =>
  tree.nodes[id]?.parent ?? null;

const sameMove = (a: Move, b: Move): boolean =>
  a.from.row === b.from.row &&
  a.from.col === b.from.col &&
  a.to.row === b.to.row &&
  a.to.col === b.to.col;

/**
 * Play a move from `parentId`.
 *
 * A move that has been tried before does **not** duplicate the branch — it
 * returns the existing child, so wandering back down a line you have already
 * looked at navigates rather than growing a second identical subtree. That is
 * the difference between a tree that stays readable and one that fills up with
 * copies of itself.
 */
export function addMove(
  tree: MoveTree,
  parentId: number,
  move: Move,
  rules: RuleSet,
): { tree: MoveTree; nodeId: number } {
  const parent = tree.nodes[parentId];
  if (!parent) return { tree, nodeId: parentId };

  const existing = parent.children.find((c) => {
    const m = tree.nodes[c].move;
    return m !== null && sameMove(m, move);
  });
  if (existing !== undefined) return { tree, nodeId: existing };

  const id = tree.nextId;
  return {
    nodeId: id,
    tree: {
      ...tree,
      nextId: id + 1,
      nodes: {
        ...tree.nodes,
        [id]: {
          id,
          state: applyMove(parent.state, move, rules),
          move,
          parent: parentId,
          children: [],
        },
        [parentId]: { ...parent, children: [...parent.children, id] },
      },
    },
  };
}

/** Every node from the root down to `id`, inclusive. */
export function lineTo(tree: MoveTree, id: number): number[] {
  const out: number[] = [];
  let cur: number | null = id;
  while (cur !== null && tree.nodes[cur]) {
    out.push(cur);
    cur = tree.nodes[cur].parent;
  }
  return out.reverse();
}

/** The positions along that line — what the board and move log consume. */
export const statesTo = (tree: MoveTree, id: number): GameState[] =>
  lineTo(tree, id).map((n) => tree.nodes[n].state);

/** How many moves deep a node sits. The root is ply 0. */
export const plyOf = (tree: MoveTree, id: number): number => lineTo(tree, id).length - 1;

/** Follow first children from `id` to the end of its line. */
export function tipOfLine(tree: MoveTree, id: number): number {
  let cur = id;
  while (tree.nodes[cur]?.children.length) cur = tree.nodes[cur].children[0];
  return cur;
}

/** The node's siblings, itself included, in their parent's order. */
export const siblingsOf = (tree: MoveTree, id: number): number[] => {
  const p = parentOf(tree, id);
  return p === null ? [] : childrenOf(tree, p);
};

/** True when every step from the root to `id` takes the first child. */
export function isMainline(tree: MoveTree, id: number): boolean {
  const line = lineTo(tree, id);
  for (let i = 1; i < line.length; i++) {
    if (tree.nodes[line[i - 1]].children[0] !== line[i]) return false;
  }
  return true;
}

/**
 * Make the line through `id` the mainline: move it to the front of its parent's
 * children, and its parent to the front of *its* parent's, all the way up. A
 * partial promotion — front of its own parent but still inside a variation —
 * would leave `isMainline` false and make the button look broken.
 */
export function promote(tree: MoveTree, id: number): MoveTree {
  const nodes = { ...tree.nodes };
  let cur = id;
  while (true) {
    const parentId = nodes[cur]?.parent;
    if (parentId === null || parentId === undefined) break;
    const parent = nodes[parentId];
    if (parent.children[0] !== cur) {
      nodes[parentId] = {
        ...parent,
        children: [cur, ...parent.children.filter((c) => c !== cur)],
      };
    }
    cur = parentId;
  }
  return { ...tree, nodes };
}

/**
 * Delete a node and everything under it. The root cannot be deleted — a tree
 * always has a position to stand on — so that is a no-op rather than an error.
 */
export function remove(tree: MoveTree, id: number): MoveTree {
  const node = tree.nodes[id];
  if (!node || node.parent === null) return tree;

  const doomed: number[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop() as number;
    doomed.push(cur);
    stack.push(...(tree.nodes[cur]?.children ?? []));
  }

  const nodes: Record<number, TreeNode> = {};
  for (const [key, n] of Object.entries(tree.nodes)) {
    if (!doomed.includes(Number(key))) nodes[Number(key)] = n;
  }
  const parent = nodes[node.parent];
  nodes[node.parent] = { ...parent, children: parent.children.filter((c) => c !== id) };
  return { ...tree, nodes };
}

/** Total moves held in the tree, across every variation (the root is not a move). */
export const moveCount = (tree: MoveTree): number => Object.keys(tree.nodes).length - 1;

/** True when anything has been tried that is not on the mainline. */
export function hasVariations(tree: MoveTree): boolean {
  return Object.values(tree.nodes).some((n) => n.children.length > 1);
}

// ── Rendering model ──────────────────────────────────────────────────────────
// The panel's layout is computed here rather than in the component, so it can be
// tested: "does a variation appear, indented, under the move it departs from"
// is a question about this function, not about the DOM.

export interface TreeRow {
  nodeId: number;
  /** 1-based move number within the whole line from the root. */
  ply: number;
  side: Side;
  move: Move;
}

export interface TreeLine {
  /** 0 for the mainline; each nested variation is one deeper. */
  depth: number;
  rows: TreeRow[];
}

function rowFor(tree: MoveTree, id: number): TreeRow {
  const n = tree.nodes[id];
  const parent = tree.nodes[n.parent as number];
  return {
    nodeId: id,
    ply: plyOf(tree, id),
    // The side that made the move is the side to move in the position it came from.
    side: parent.state.turn,
    move: n.move as Move,
  };
}

/**
 * Flatten the tree into lines for display: the mainline first, then each
 * variation as its own indented line, in the order the branches occur.
 */
export function treeLines(tree: MoveTree): TreeLine[] {
  const out: TreeLine[] = [];

  const emit = (firstId: number, depth: number) => {
    const rows: TreeRow[] = [rowFor(tree, firstId)];
    const alts: number[] = [];
    let cur = firstId;
    while (tree.nodes[cur].children.length) {
      const [first, ...rest] = tree.nodes[cur].children;
      rows.push(rowFor(tree, first));
      alts.push(...rest);
      cur = first;
    }
    out.push({ depth, rows });
    for (const a of alts) emit(a, depth + 1);
  };

  const roots = childrenOf(tree, tree.rootId);
  if (roots.length) {
    emit(roots[0], 0);
    for (const alt of roots.slice(1)) emit(alt, 1);
  }
  return out;
}
