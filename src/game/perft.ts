// ── Perft helper, shared across all three boardgames ────────────────────────
//
// "Perft" (performance test, borrowed from chess engine testing): count the
// leaf positions of the full legal-move tree, exactly `depth` plies deep,
// with no pruning and no shortcuts. It exists to pin what a game's own
// `allMoves`/`applyMove` pair actually produces — the witness for a later
// refactor that extracts the triplicated search core across Brandubh, Tablut
// and Copenhagen (docs/adr/0007-*.md, item 3) — so it deliberately does
// nothing clever: no memoisation, no transposition sharing between branches.
// Building a smarter oracle here would test the oracle, not the engine.
//
// A position whose status is already decided (win, loss, draw — anything
// `isGameOver` reports as not "playing") contributes exactly one leaf and is
// never expanded further: an ended game has no more plies to play out.
//
// Generic over the three games' otherwise-identical shapes (each has its own
// `Board`/`Move`/`GameState`/ruleset type, but the same four operations), so
// one implementation serves all three search-invariant test files instead of
// three near-identical copies.
//
// `Status` is its own type parameter — not hardcoded to `string` — because
// each game's `GameStatus` is a specific string-literal union and a function
// parameter is contravariant: a `(status: GameStatus) => boolean` cannot
// stand in for a `(status: string) => boolean` (it would have to accept any
// string, not just the union's members), so a `string`-typed `isGameOver`
// parameter here rejected every game's real `isGameOver` under `tsc -b`,
// caught only because vitest itself does not typecheck. Inferring `Status`
// from `GameState`'s own `status` field keeps this generic without widening
// anyone's status union.
export function perft<Board, Move, RuleSet, Side, Status, GameState extends { board: Board; turn: Side; status: Status }>(
  state: GameState,
  rules: RuleSet,
  depth: number,
  allMoves: (board: Board, turn: Side, rules: RuleSet) => Move[],
  applyMove: (state: GameState, move: Move, rules: RuleSet) => GameState,
  isGameOver: (status: Status) => boolean,
): number {
  if (isGameOver(state.status)) return 1;
  if (depth === 0) return 1;
  let total = 0;
  for (const move of allMoves(state.board, state.turn, rules)) {
    total += perft(applyMove(state, move, rules), rules, depth - 1, allMoves, applyMove, isGameOver);
  }
  return total;
}
