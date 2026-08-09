import { describe, expect, it } from "vitest";
import {
  addMove,
  childrenOf,
  createTree,
  fromLine,
  hasVariations,
  isMainline,
  lineTo,
  moveCount,
  nodeAt,
  parentOf,
  plyOf,
  promote,
  remove,
  siblingsOf,
  statesTo,
  tipOfLine,
  treeLines,
} from "./moveTree";
import { allMoves, applyMove, initialState } from "./rules";
import { DEFAULT_VARIANT, VARIANTS } from "./variants";
import type { GameState, Move } from "./types";

const rules = VARIANTS[DEFAULT_VARIANT];

/** The n-th legal move in a position, by the engine's own ordering. */
const nth = (state: GameState, n: number): Move => allMoves(state.board, state.turn, rules)[n];

/** A linear timeline of `count` plies, always taking the first legal move. */
function linearStates(count: number): GameState[] {
  const out = [initialState()];
  for (let i = 0; i < count; i++) out.push(applyMove(out[i], nth(out[i], 0), rules));
  return out;
}

describe("a fresh tree", () => {
  it("is a single root holding the position, with no move behind it", () => {
    const tree = createTree(initialState());
    expect(moveCount(tree)).toBe(0);
    expect(nodeAt(tree, tree.rootId)?.move).toBeNull();
    expect(parentOf(tree, tree.rootId)).toBeNull();
    expect(plyOf(tree, tree.rootId)).toBe(0);
  });

  it("seeds from the live timeline as one line", () => {
    const states = linearStates(4);
    const tree = fromLine(states);
    expect(moveCount(tree)).toBe(4);
    expect(hasVariations(tree)).toBe(false);
    const tip = tipOfLine(tree, tree.rootId);
    expect(plyOf(tree, tip)).toBe(4);
    expect(statesTo(tree, tip)).toEqual(states);
  });
});

describe("a second idea becomes a sibling, not a replacement", () => {
  // This is the whole point of 7c. Before it, a move from a rewound position
  // sliced the future off; the first line simply ceased to exist.
  it("keeps both continuations from the same position", () => {
    const root = initialState();
    let tree = createTree(root);
    const a = addMove(tree, tree.rootId, nth(root, 0), rules);
    const b = addMove(a.tree, a.tree.rootId, nth(root, 1), rules);
    tree = b.tree;

    expect(childrenOf(tree, tree.rootId)).toEqual([a.nodeId, b.nodeId]);
    expect(moveCount(tree)).toBe(2);
    expect(nodeAt(tree, a.nodeId)).not.toBeNull();
    expect(nodeAt(tree, b.nodeId)).not.toBeNull();
  });

  it("does not lose the first line's continuation when the second is added", () => {
    const root = initialState();
    let tree = createTree(root);
    const a = addMove(tree, tree.rootId, nth(root, 0), rules);
    const deep = addMove(a.tree, a.nodeId, nth(a.tree.nodes[a.nodeId].state, 0), rules);
    const b = addMove(deep.tree, deep.tree.rootId, nth(root, 1), rules);
    tree = b.tree;

    expect(lineTo(tree, deep.nodeId)).toEqual([tree.rootId, a.nodeId, deep.nodeId]);
    expect(plyOf(tree, deep.nodeId)).toBe(2);
  });

  it("navigates to an existing branch instead of duplicating it", () => {
    // Wandering back down a line already looked at must not grow a second
    // identical subtree — that is what turns a tree into a pile.
    const root = initialState();
    const tree = createTree(root);
    const first = addMove(tree, tree.rootId, nth(root, 0), rules);
    const again = addMove(first.tree, first.tree.rootId, nth(root, 0), rules);

    expect(again.nodeId).toBe(first.nodeId);
    expect(moveCount(again.tree)).toBe(1);
    expect(childrenOf(again.tree, again.tree.rootId)).toHaveLength(1);
  });

  it("reports the position each node stands in", () => {
    const root = initialState();
    const tree = createTree(root);
    const { tree: t2, nodeId } = addMove(tree, tree.rootId, nth(root, 0), rules);
    expect(nodeAt(t2, nodeId)?.state).toEqual(applyMove(root, nth(root, 0), rules));
  });

  it("ignores a move from a node that does not exist", () => {
    const tree = createTree(initialState());
    const out = addMove(tree, 999, nth(initialState(), 0), rules);
    expect(out.tree).toBe(tree);
  });
});

describe("the mainline is the first child, all the way down", () => {
  const build = () => {
    const root = initialState();
    let tree = createTree(root);
    const main = addMove(tree, tree.rootId, nth(root, 0), rules);
    const alt = addMove(main.tree, main.tree.rootId, nth(root, 1), rules);
    tree = alt.tree;
    return { tree, main: main.nodeId, alt: alt.nodeId };
  };

  it("recognises which line a node is on", () => {
    const { tree, main, alt } = build();
    expect(isMainline(tree, main)).toBe(true);
    expect(isMainline(tree, alt)).toBe(false);
    expect(isMainline(tree, tree.rootId)).toBe(true);
  });

  it("promotes a variation to the front", () => {
    const { tree, main, alt } = build();
    const promoted = promote(tree, alt);
    expect(childrenOf(promoted, promoted.rootId)[0]).toBe(alt);
    expect(isMainline(promoted, alt)).toBe(true);
    expect(isMainline(promoted, main)).toBe(false);
  });

  it("promotes the whole path, not just the last step", () => {
    // A node promoted only within its own parent would still sit inside a
    // variation, leaving isMainline false and the button looking broken.
    const root = initialState();
    let tree = createTree(root);
    const main = addMove(tree, tree.rootId, nth(root, 0), rules);
    const alt = addMove(main.tree, main.tree.rootId, nth(root, 1), rules);
    const deepAltState = alt.tree.nodes[alt.nodeId].state;
    const deep = addMove(alt.tree, alt.nodeId, nth(deepAltState, 0), rules);
    tree = deep.tree;

    expect(isMainline(tree, deep.nodeId)).toBe(false);
    const promoted = promote(tree, deep.nodeId);
    expect(isMainline(promoted, deep.nodeId)).toBe(true);
    expect(childrenOf(promoted, promoted.rootId)[0]).toBe(alt.nodeId);
    expect(isMainline(promoted, main.nodeId)).toBe(false);
  });

  it("loses nothing when promoting — the other line is still there", () => {
    const { tree, main, alt } = build();
    const promoted = promote(tree, alt);
    expect(moveCount(promoted)).toBe(moveCount(tree));
    expect(siblingsOf(promoted, alt)).toContain(main);
  });

  it("is a no-op on a node already at the front", () => {
    const { tree, main } = build();
    expect(childrenOf(promote(tree, main), tree.rootId)).toEqual(childrenOf(tree, tree.rootId));
  });
});

describe("deleting a variation", () => {
  it("takes the whole subtree with it", () => {
    const root = initialState();
    let tree = createTree(root);
    const a = addMove(tree, tree.rootId, nth(root, 0), rules);
    const deep = addMove(a.tree, a.nodeId, nth(a.tree.nodes[a.nodeId].state, 0), rules);
    const deeper = addMove(deep.tree, deep.nodeId, nth(deep.tree.nodes[deep.nodeId].state, 0), rules);
    tree = deeper.tree;
    expect(moveCount(tree)).toBe(3);

    const pruned = remove(tree, deep.nodeId);
    expect(moveCount(pruned)).toBe(1);
    expect(nodeAt(pruned, deep.nodeId)).toBeNull();
    expect(nodeAt(pruned, deeper.nodeId)).toBeNull();
    expect(nodeAt(pruned, a.nodeId)).not.toBeNull();
  });

  it("unhooks it from its parent", () => {
    const root = initialState();
    const tree = createTree(root);
    const a = addMove(tree, tree.rootId, nth(root, 0), rules);
    const b = addMove(a.tree, a.tree.rootId, nth(root, 1), rules);
    const pruned = remove(b.tree, b.nodeId);
    expect(childrenOf(pruned, pruned.rootId)).toEqual([a.nodeId]);
  });

  it("refuses to delete the root — a tree always has a position to stand on", () => {
    const tree = fromLine(linearStates(2));
    expect(remove(tree, tree.rootId)).toBe(tree);
  });

  it("ignores an unknown id", () => {
    const tree = fromLine(linearStates(2));
    expect(remove(tree, 999)).toBe(tree);
  });

  it("never reuses an id, so a stale reference stays invalid", () => {
    const root = initialState();
    const tree = createTree(root);
    const a = addMove(tree, tree.rootId, nth(root, 0), rules);
    const pruned = remove(a.tree, a.nodeId);
    const b = addMove(pruned, pruned.rootId, nth(root, 1), rules);
    expect(b.nodeId).not.toBe(a.nodeId);
    expect(nodeAt(b.tree, a.nodeId)).toBeNull();
  });
});

describe("navigation helpers", () => {
  it("walks the line to a node, root first", () => {
    const states = linearStates(3);
    const tree = fromLine(states);
    const tip = tipOfLine(tree, tree.rootId);
    const line = lineTo(tree, tip);
    expect(line[0]).toBe(tree.rootId);
    expect(line).toHaveLength(4);
    expect(statesTo(tree, tip)).toEqual(states);
  });

  it("follows first children to the end of a line", () => {
    const root = initialState();
    const tree = createTree(root);
    const a = addMove(tree, tree.rootId, nth(root, 0), rules);
    const b = addMove(a.tree, a.nodeId, nth(a.tree.nodes[a.nodeId].state, 0), rules);
    expect(tipOfLine(b.tree, b.tree.rootId)).toBe(b.nodeId);
    expect(tipOfLine(b.tree, b.nodeId)).toBe(b.nodeId);
  });

  it("lists siblings in their parent's order", () => {
    const root = initialState();
    const tree = createTree(root);
    const a = addMove(tree, tree.rootId, nth(root, 0), rules);
    const b = addMove(a.tree, a.tree.rootId, nth(root, 1), rules);
    expect(siblingsOf(b.tree, a.nodeId)).toEqual([a.nodeId, b.nodeId]);
    expect(siblingsOf(b.tree, b.tree.rootId)).toEqual([]);
  });
});

describe("laying the tree out for display", () => {
  it("gives a plain line one row per move, at depth 0", () => {
    const tree = fromLine(linearStates(3));
    const lines = treeLines(tree);
    expect(lines).toHaveLength(1);
    expect(lines[0].depth).toBe(0);
    expect(lines[0].rows).toHaveLength(3);
    expect(lines[0].rows.map((r) => r.ply)).toEqual([1, 2, 3]);
  });

  it("numbers plies from the root, not from the start of the variation", () => {
    const states = linearStates(2);
    let tree = fromLine(states);
    const firstMove = tree.nodes[tree.rootId].children[0];
    const after = tree.nodes[firstMove].state;
    tree = addMove(tree, firstMove, nth(after, 1), rules).tree;
    const variation = treeLines(tree).find((l) => l.depth === 1);
    expect(variation?.rows[0].ply).toBe(2);
  });

  it("puts a variation on its own indented line", () => {
    const root = initialState();
    let tree = createTree(root);
    tree = addMove(tree, tree.rootId, nth(root, 0), rules).tree;
    tree = addMove(tree, tree.rootId, nth(root, 1), rules).tree;

    const lines = treeLines(tree);
    expect(lines).toHaveLength(2);
    expect(lines[0].depth).toBe(0);
    expect(lines[1].depth).toBe(1);
    expect(lines[1].rows).toHaveLength(1);
  });

  it("records which side made each move", () => {
    const tree = fromLine(linearStates(2));
    const rows = treeLines(tree)[0].rows;
    // The raiders always move first in Brandubh.
    expect(rows[0].side).toBe("attackers");
    expect(rows[1].side).toBe("defenders");
  });

  it("shows nothing for a tree with no moves in it", () => {
    expect(treeLines(createTree(initialState()))).toEqual([]);
  });

  it("reaches every move in the tree exactly once", () => {
    const root = initialState();
    let tree = createTree(root);
    tree = addMove(tree, tree.rootId, nth(root, 0), rules).tree;
    tree = addMove(tree, tree.rootId, nth(root, 1), rules).tree;
    const firstId = childrenOf(tree, tree.rootId)[0];
    tree = addMove(tree, firstId, nth(tree.nodes[firstId].state, 0), rules).tree;
    tree = addMove(tree, firstId, nth(tree.nodes[firstId].state, 1), rules).tree;

    const seen = treeLines(tree).flatMap((l) => l.rows.map((r) => r.nodeId));
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(moveCount(tree));
  });
});
