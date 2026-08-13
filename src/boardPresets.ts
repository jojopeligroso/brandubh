// ── First-visit board presets ────────────────────────────────────────────────
// Four complete looks — board theme, piece colours and all four piece emblems
// at once — offered on the very first visit only, before any other choice (the
// "board" step of ModeOverlay in App.tsx, ahead of "mode" and therefore ahead
// of "side"). Picking one applies every field together; nothing here is
// partial. The player can still change any individual piece afterwards from
// Settings — this is a starting point, not a lock-in.

import { EMPTY_PIECE_COLORS, type PieceColors, type ThemeId } from "./theme";
import { type AttackerEmblemId } from "./emblems";
import { type KingEmblemId } from "./kingEmblems";
import { DEFAULT_DEFENDER_EMBLEM, type DefenderEmblemId } from "./defenderEmblems";
import { type CornerEmblemId } from "./cornerEmblems";

export interface BoardPreset {
  id: "gokstad" | "ballinderry" | "everforest-ornate" | "ligreen-knotwork";
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
    id: "gokstad",
    name: "Gokstad",
    // Hardcoded, not a DEFAULT_THEME/DEFAULT_* reference: this card means "the
    // Gokstad timber board and the wordmark's own red-gold/silver stones",
    // specifically — not "whatever the app currently leads with". It used to
    // sit alongside a "Classic" card that *was* that live reference, but
    // Classic was removed once it went pixel-identical to this one (Gokstad
    // is the current app-wide default); this card stays pinned to the named
    // look even if that default moves on later.
    theme: "gokstad",
    pieceColors: { atk: "#a76d11", def: "#d9d9d6", king: "#d9d9d6" },
    attackerEmblem: "crow",
    kingEmblem: "crown-triquetra",
    defenderEmblem: "shield-knot",
    cornerEmblem: "tree-oak",
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
  {
    id: "ballinderry",
    name: "Ballinderry",
    // The brief for this card was exactly Gokstad's own stones and emblems —
    // corner squares and every piece icon untouched — over the one theme that
    // changes the board's *construction* rather than its colours: holes
    // instead of squares, after the 10th-century yew board the theme is named
    // for (NMI 1932:6583; see the theme note in index.css and
    // docs/ballinderry-board.md, which also records that its ornament is
    // reconstructed from published descriptions, not traced from the object).
    // Literal values here, not a reference to the Gokstad object above, for
    // the same reason Gokstad's own are literal: this card is pinned to a
    // specific named look, not to "whatever Gokstad's card currently says".
    theme: "ballinderry",
    pieceColors: { atk: "#a76d11", def: "#d9d9d6", king: "#d9d9d6" },
    attackerEmblem: "crow",
    kingEmblem: "crown-triquetra",
    defenderEmblem: "shield-knot",
    cornerEmblem: "tree-oak",
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
