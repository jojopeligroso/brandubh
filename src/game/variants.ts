// ── Rule variants ─────────────────────────────────────────────────────────────
// Brandubh's medieval rules were never fully recorded, so several reconstructions
// coexist. These two presets mirror the pair of Brandubh rule-sets used for
// recorded play on Aage Nielsen's hnefatafl site (aagenielsen.dk): the modern
// tournament ("Copenhagen"/World Tafl Federation) reconstruction with an *armed*
// king, and the older *weaponless-king* reading drawn from the Hervarar saga
// riddle. Everything a rule actually toggles lives here so the engine stays
// declarative and both variants share one code path.

export interface RuleSet {
  id: string;
  name: string;
  blurb: string;
  /** King may take part in captures (act as a flanking piece). */
  armedKing: boolean;
  /**
   * King on / next to the throne must be fully surrounded to be captured.
   * When false the king is captured everywhere like a soldier (two sides).
   */
  strongKingByThrone: boolean;
  /** Empty throne is a hostile square that helps capture *soldiers*. */
  throneHostileToSoldiers: boolean;
  /** Corner squares are hostile squares that help capture (both sides). */
  cornersHostile: boolean;
  /** Once the king leaves the throne he may not move back onto it. */
  kingMayReoccupyThrone: boolean;
  /** Soldiers may pass *over* (never stop on) the empty throne. */
  soldiersPassThroughThrone: boolean;
  /** Threefold repetition is scored as a draw (otherwise ignored). */
  repetitionIsDraw: boolean;
}

export const VARIANTS: Record<string, RuleSet> = {
  copenhagen: {
    id: "copenhagen",
    name: "Brandubh Chóbanhávan",
    blurb:
      "Atógáil nua-aimseartha comórtais (Cumann Domhanda Tafl). Tá arm ag an Rí agus cabhraíonn sé le gabháil. Gabhtar é idir dhá fhoghlaithe san oscailt, ach caithfear é a thimpeallú ar an ríchathaoir.",
    armedKing: true,
    strongKingByThrone: true,
    throneHostileToSoldiers: true,
    cornersHostile: true,
    kingMayReoccupyThrone: false,
    soldiersPassThroughThrone: true,
    repetitionIsDraw: true,
  },
  weaponless: {
    id: "weaponless",
    name: "Brandubh an Rí gan Arm",
    blurb:
      "An léamh 'stairiúil' níos sine: níl aon arm ag an Rí agus ní féidir leis páirt a ghlacadh i ngabháil, mar sin caithfidh na cosantóirí a bhealach a ghlanadh lena gceathrar saighdiúirí amháin. Éalú níos deacra.",
    armedKing: false,
    strongKingByThrone: true,
    throneHostileToSoldiers: true,
    cornersHostile: true,
    kingMayReoccupyThrone: false,
    soldiersPassThroughThrone: true,
    repetitionIsDraw: true,
  },
};

export const DEFAULT_VARIANT = "copenhagen";
