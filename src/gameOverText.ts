// ── Why the game ended, in words ──────────────────────────────────────────────
// `GameStatus` is the one part of the domain both boardgames share verbatim — a
// king escapes, a king is captured, a side is blocked, a position repeats — so
// the sentence that names the ending is shared too. Lifted out of App.tsx when
// Tablut needed the same mapping; two copies would have drifted the moment a
// status was added.

import type { GameStatus } from "./game/types";
import type { Translations } from "./i18n";

export function gameOverText(status: GameStatus, t: Translations): string {
  switch (status) {
    case "defenders_win_escape":
      return t.defendersWinEscape;
    case "attackers_win_capture":
      return t.attackersWinCapture;
    case "attackers_win_encirclement":
      return t.attackersWinEncirclement;
    case "attackers_win_repetition":
      return t.attackersWinRepetition;
    case "defenders_win_fort":
      return t.defendersWinFort;
    case "defenders_win_repetition":
      return t.defendersWinRepetition;
    case "attackers_win_no_moves":
      return t.attackersWinNoMoves;
    case "attackers_win_resign":
      return t.attackersWinResign;
    case "defenders_win_resign":
      return t.defendersWinResign;
    case "attackers_win_time":
      return t.attackersWinTime;
    case "defenders_win_time":
      return t.defendersWinTime;
    case "draw_repetition":
      return t.drawMessage;
    default:
      return t.defendersWinNoMoves;
  }
}
