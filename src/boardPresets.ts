// ── First-visit board presets ────────────────────────────────────────────────
// Three complete looks — board theme, piece colours and all four piece emblems
// at once — offered on the very first visit only, before any other choice (the
// "board" step of ModeOverlay in App.tsx, ahead of "mode" and therefore ahead
// of "side"). Picking one applies every field together; nothing here is
// partial. The player can still change any individual piece afterwards from
// Settings — this is a starting point, not a lock-in.

import { DEFAULT_THEME, EMPTY_PIECE_COLORS, type PieceColors, type ThemeId } from "./theme";
import { DEFAULT_ATTACKER_EMBLEM, type AttackerEmblemId } from "./emblems";
import { DEFAULT_KING_EMBLEM, type KingEmblemId } from "./kingEmblems";
import { DEFAULT_DEFENDER_EMBLEM, type DefenderEmblemId } from "./defenderEmblems";
import { DEFAULT_CORNER_EMBLEM, type CornerEmblemId } from "./cornerEmblems";

export interface BoardPreset {
  id: "classic" | "everforest-ornate" | "ligreen-knotwork";
  /** Shown on the picker card; matches the board theme's own name where borrowed. */
  name: string;
  theme: ThemeId;
  pieceColors: PieceColors;
  attackerEmblem: AttackerEmblemId;
  kingEmblem: KingEmblemId;
  defenderEmblem: DefenderEmblemId;
  cornerEmblem: CornerEmblemId;
}

export const BOARD_PRESETS: BoardPreset[] = [
  {
    id: "classic",
    name: "Classic",
    // A reference, not a copy: whatever DEFAULT_THEME is, "current default"
    // means this preset follows it — it should not still say Everforest now
    // that the app-wide default has moved on to Gokstad.
    theme: DEFAULT_THEME,
    pieceColors: EMPTY_PIECE_COLORS,
    attackerEmblem: DEFAULT_ATTACKER_EMBLEM,
    kingEmblem: DEFAULT_KING_EMBLEM,
    defenderEmblem: DEFAULT_DEFENDER_EMBLEM,
    cornerEmblem: DEFAULT_CORNER_EMBLEM,
  },
  {
    id: "everforest-ornate",
    name: "Everforest",
    theme: "everforest",
    // Explicit black/white, not `null` (= "follow the app-wide default"):
    // that default used to *be* black/white but is now the wordmark's
    // red-gold/silver pair, and this preset's brief was "black and white"
    // specifically, not "whatever the default becomes". The king alone
    // trades the saturated default gold (#e8b13a, itself now superseded)
    // for Everforest's own paler accent gold, so the crown reads as part of
    // this theme rather than a universal constant sitting on top of it.
    pieceColors: { atk: "#1a1c1e", def: "#f0ece4", king: "#dbbc7f" },
    attackerEmblem: "triquetra",
    kingEmblem: "crown-sword",
    defenderEmblem: "ornate-knot",
    cornerEmblem: "tree-filigree",
  },
  {
    id: "ligreen-knotwork",
    name: "liGreen",
    theme: "lichess-green",
    pieceColors: EMPTY_PIECE_COLORS,
    attackerEmblem: "triskele",
    kingEmblem: "sword-ring",
    // Ornate Knot belongs to the Everforest preset above, and Quaternary Knot
    // is withheld app-wide — its traced artwork is incomplete, see the
    // `hidden` note in defenderEmblems.ts — so Shield Knot is the only
    // defender mark left that actually ships.
    defenderEmblem: DEFAULT_DEFENDER_EMBLEM,
    cornerEmblem: "tree-knot",
  },
];

const BOARD_PRESET_SEEN_KEY = "brandubh.boardPresetSeen";

/** True once a first-visit preset has been chosen (or the flag otherwise set). */
export function hasSeenBoardPresets(): boolean {
  try {
    return localStorage.getItem(BOARD_PRESET_SEEN_KEY) === "1";
  } catch {
    return true; // localStorage unavailable — never block the flow on it
  }
}

export function markBoardPresetsSeen(): void {
  try {
    localStorage.setItem(BOARD_PRESET_SEEN_KEY, "1");
  } catch {
    /* ignore persistence failures */
  }
}
