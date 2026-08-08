/* Headless sanity checks for the Brandubh engine. Run: npx tsx scripts/selftest.ts */
import { chooseMove } from "../src/game/engine";
import {
  allMoves,
  applyMove,
  findKing,
  initialState,
  isGameOver,
  kingIsCaptured,
  movesFrom,
  winnerOf,
} from "../src/game/rules";
import type { Board, GameState, Move, Piece } from "../src/game/types";
import { VARIANTS } from "../src/game/variants";

const rules = VARIANTS.wtf;
let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

function emptyBoard(): Board {
  return Array.from({ length: 7 }, () => Array<Piece | null>(7).fill(null));
}
function stateFrom(b: Board, turn: GameState["turn"]): GameState {
  return { board: b, turn, status: "playing", moveCount: 0, history: [], captured: { attackers: 0, defenders: 0 } };
}

console.log("Setup:");
const s0 = initialState();
let a = 0,
  d = 0,
  k = 0;
for (const row of s0.board)
  for (const p of row) {
    if (p === "attacker") a++;
    else if (p === "defender") d++;
    else if (p === "king") k++;
  }
check("8 attackers, 4 defenders, 1 king", a === 8 && d === 4 && k === 1);
check("attackers move first", s0.turn === "attackers");
check("king starts on the throne", findKing(s0.board)?.row === 3 && findKing(s0.board)?.col === 3);

console.log("Movement:");
// A defender at (2,3) is blocked upward by attacker at (1,3); can slide sideways.
check(
  "blocked piece cannot pass another",
  !movesFrom(s0.board, 2, 3, rules).some((m) => m.row < 1),
);
// King cannot move initially (surrounded by its 4 defenders).
check("boxed-in king has no moves", movesFrom(s0.board, 3, 3, rules).length === 0);

console.log("Soldier capture:");
{
  const b = emptyBoard();
  b[3][3] = "king";
  b[2][3] = "attacker"; // the standing anvil on the far side of the victim
  b[2][4] = "defender"; // victim
  b[2][6] = "attacker"; // moves to (2,5) to complete the sandwich (2,3)_(2,4)_(2,5)
  const st = stateFrom(b, "attackers");
  const move: Move = { from: { row: 2, col: 6 }, to: { row: 2, col: 5 } };
  const after = applyMove(st, move, rules);
  check("attacker sandwiches defender (a4-a5 style)", after.board[2][4] === null);
  check("capture counted", after.captured.defenders === 1);
}

console.log("Corner is a hostile anvil:");
{
  const b = emptyBoard();
  b[3][3] = "king";
  b[0][1] = "defender"; // victim next to corner (0,0)
  b[0][3] = "attacker"; // slides to (0,2) to pin defender against the corner
  const st = stateFrom(b, "attackers");
  const after = applyMove(st, { from: { row: 0, col: 3 }, to: { row: 0, col: 2 } }, rules);
  check("defender pinned against hostile corner is captured", after.board[0][1] === null);
}

console.log("King escape (defenders win):");
{
  const b = emptyBoard();
  b[0][3] = "king"; // top edge, clear run to corner (0,0)
  const st = stateFrom(b, "defenders");
  const after = applyMove(st, { from: { row: 0, col: 3 }, to: { row: 0, col: 0 } }, rules);
  check("king reaching a corner wins", after.status === "defenders_win_escape");
  check("winner is defenders", winnerOf(after.status) === "defenders");
}

console.log("King capture in the open (two sides):");
{
  const b = emptyBoard();
  b[1][3] = "king"; // away from throne so custodial rules apply
  b[1][2] = "attacker";
  b[0][4] = "attacker"; // will move to (1,4) to complete the sandwich
  const st = stateFrom(b, "attackers");
  check("king not yet captured", !kingIsCaptured(b, rules, { row: 0, col: 4 }));
  const after = applyMove(st, { from: { row: 0, col: 4 }, to: { row: 1, col: 4 } }, rules);
  check("king flanked on two sides is captured", after.status === "attackers_win_capture");
}

console.log("Strong king by the throne needs four sides:");
{
  const b = emptyBoard();
  b[3][3] = "king"; // on the throne
  b[2][3] = "attacker";
  b[4][3] = "attacker";
  b[3][2] = "attacker";
  check("three attackers around throne = not captured", !kingIsCaptured(b, rules, { row: 3, col: 2 }));
  b[3][4] = "attacker";
  check("four attackers around throne = captured", kingIsCaptured(b, rules, { row: 3, col: 4 }));
}

console.log("Full random/AI games terminate without error:");
{
  let ok = true;
  let escapes = 0,
    captures = 0,
    other = 0;
  for (let g = 0; g < 20; g++) {
    let st = initialState();
    let guard = 0;
    while (!isGameOver(st.status) && guard < 400) {
      const mv = chooseMove(st, g % 2 ? "medium" : "easy", rules);
      if (!mv) {
        ok = false;
        break;
      }
      const legal = allMoves(st.board, st.turn, rules).some(
        (m) =>
          m.from.row === mv.from.row &&
          m.from.col === mv.from.col &&
          m.to.row === mv.to.row &&
          m.to.col === mv.to.col,
      );
      if (!legal) {
        ok = false;
        break;
      }
      st = applyMove(st, mv, rules);
      guard++;
    }
    if (st.status === "defenders_win_escape") escapes++;
    else if (st.status === "attackers_win_capture") captures++;
    else other++;
  }
  check("20 AI games ran with only legal moves", ok);
  console.log(`     → escapes:${escapes} captures:${captures} other/draw/block:${other}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
