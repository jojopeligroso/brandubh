export type Lang = "en" | "es" | "ga";

/**
 * Languages shown in the UI toggle, in order. This is the single list the header
 * renders from — a language is live exactly when it appears here, and nowhere
 * else. (It used to be exported and never imported, with the header hardcoding
 * its own buttons; that is what made "unhide a locale" a two-place edit.)
 *
 * **Irish (`ga`) is deliberately not listed.** The full table exists in this
 * file and renders correctly — the cló Gaelach face and the overdot orthography
 * are exercised by the tests, and a Gaelic locale flags the document so display
 * text picks up the face (see gaelic.ts). What it has not had is a proper
 * translation review — the strings are unreviewed machine drafts — so the whole
 * Irish *interface* surface stays out of the user's reach until a human signs
 * it off (see CLAUDE.md before re-adding it). This is not about the machinery.
 *
 * Individual Gaelic words in the otherwise-English UI — the Branduḃ wordmark,
 * the Ollaṁ difficulty — are names, not translated interface, and stay as they
 * are.
 *
 * Revealing `ga` is a one-line change here, but it is not free: a third button
 * overflows the header at 360–390px and squeezes the subtitle onto three lines
 * at 430–520px, because the container is capped at `max-w-md` below the `sm`
 * breakpoint. The header fix that goes with it is on record in the history of
 * this branch.
 */
export const VISIBLE_LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
];

// ── Language choice ───────────────────────────────────────────────────────────
// Persisted like every other setting (brandubh.*); first visit falls back to
// the browser language, so a Spanish visitor starts in Spanish.
const LANG_KEY = "brandubh.lang";

export function loadLang(): Lang {
  const visible = new Set(VISIBLE_LANGS.map((l) => l.code));
  try {
    const stored = localStorage.getItem(LANG_KEY);
    // A stored language that is no longer offered (e.g. "ga" while it is
    // hidden for review) falls through to browser detection.
    if (stored && visible.has(stored as Lang)) return stored as Lang;
  } catch {
    /* localStorage unavailable */
  }
  try {
    if (navigator.language?.toLowerCase().startsWith("es")) return "es";
  } catch {
    /* navigator unavailable */
  }
  return "en";
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore persistence failures */
  }
}

export interface Translations {
  // Header
  subtitle: string;
  howToPlay: string;
  menu: string;
  language: string;
  /** Short form for the header switch, where "Zen mode" will not fit. */
  zenShort: string;

  // App drawer (the hamburger's slide-out navigation)
  drawerPlay: string;
  drawerLearn: string;
  drawerTools: string;
  about: string;
  aboutTitle: string;
  aboutBody1: string;
  aboutBody2: string;
  aboutBody3: string;

  // Side labels
  raiders: string;
  kingsSide: string;

  // Game over
  drawMessage: string;
  defendersWinEscape: string;
  attackersWinCapture: string;
  attackersWinEncirclement: string;
  attackersWinRepetition: string;
  attackersWinNoMoves: string;
  defendersWinNoMoves: string;

  // Turn status
  toMove: string;
  yourMove: string;
  thinkingSuffix: string;
  moveLabel: string;

  // Captured
  raidersLost: string;
  defendersLost: string;

  // Controls
  newGame: string;
  undo: string;
  rules: string;

  // Settings
  playAs: string;
  king: string;
  overTheBoard: string;
  aiLevel: string;
  easy: string;
  medium: string;
  hard: string;
  ollamh: string;
  variant: string;
  theme: string;
  attackerIcon: string;
  cornerIcon: string;
  kingIcon: string;
  defenderIcon: string;
  colourTheme: string;
  pieceColours: string;
  defenders: string;
  /** Reset a piece colour back to the built-in default (not theme-derived). */
  pieceColourDefault: string;
  design: string;
  done: string;
  close: string;
  // Settings sections
  settings: string;
  sectionGame: string;
  sectionMatch: string;
  sectionAppearance: string;

  // Move navigation
  prevMove: string;
  nextMove: string;
  reviewingLabel: string;
  liveLabel: string;
  /** Standing at the end of a variation in analysis — not the live game. */
  lineEndLabel: string;
  latest: string;
  playFromHere: string;
  playFromHereVsAi: string;
  proposeTakeback: string;
  takebackTitle: string;
  takebackBody: string;
  allow: string;
  decline: string;
  branchHint: string;

  // Resign
  resign: string;
  resignTitle: string;
  resignBody: string;
  attackersWinResign: string;
  defendersWinResign: string;

  // Game clock
  clock: string;
  clockOff: string;
  timeControlLabel: string;
  customTimeControl: string;
  minutesLabel: string;
  incrementLabel: string;
  pause: string;
  resume: string;
  flagLabel: string;
  attackersWinTime: string;
  defendersWinTime: string;
  catBullet: string;
  catBlitz: string;
  catRapid: string;

  // Zen mode
  zenMode: string;
  zenHint: string;
  zenShowExtras: string;
  on: string;
  off: string;
  zenElScoreboard: string;
  zenElCaptured: string;
  zenElNav: string;
  zenElRules: string;
  zenElSettings: string;

  // Custom rules
  customRulesTitle: string;
  ruleArmedKing: string;
  ruleArmedKingHint: string;
  ruleThroneHostileSoldiers: string;
  ruleThroneHostileSoldiersHint: string;
  ruleThroneHostileKing: string;
  ruleThroneHostileKingHint: string;
  ruleKingReoccupyThrone: string;
  ruleKingReoccupyThroneHint: string;
  ruleSoldiersPassThrone: string;
  ruleSoldiersPassThroneHint: string;
  ruleCornersHostile: string;
  ruleCornersHostileHint: string;
  ruleStrongKingOnThrone: string;
  ruleStrongKingOnThroneHint: string;
  ruleStrongKingAdjacentThrone: string;
  ruleStrongKingAdjacentThroneHint: string;
  ruleShieldwall: string;
  ruleShieldwallHint: string;
  ruleEncirclementWin: string;
  ruleEncirclementWinHint: string;
  repetitionResultLabel: string;
  repetitionOptionNone: string;
  repetitionOptionDraw: string;
  repetitionOptionLossDefenders: string;

  // Over-the-board set / scoreboard
  matchSet: string;
  gameWord: string;
  player1: string;
  player2: string;
  setStanding: string;
  kingCounter: string;
  raidersCounter: string;
  movesWord: string;
  drawShort: string;
  bestWin: string;
  nextGame: string;
  newSet: string;
  nextSet: string;
  newMatch: string;
  newMatchTitle: string;
  newMatchBody: string;
  newGameTitle: string;
  newGameBody: string;
  setLength: string;
  matchScore: string;
  setsWord: string;
  drawsShort: string;
  sidesSwapNext: string;
  setInProgress: string;
  winsTheSet: string;
  winsSetOnMoves: string;
  setDrawn: string;
  wonAs: string;

  // Move log
  moveLog: string;

  // Mode overlay
  chooseGame: string;
  /** Accessible name for the header wordmark, which reopens the setup overlay. */
  backToStart: string;
  playVsAi: string;
  otbOverlay: string;
  withFriend: string;
  chooseDifficulty: string;
  resumeBody: string;
  resumeGame: string;

  // Rewind
  continueFromMove: string;
  movesWillBeLost: string;
  back: string;
  confirm: string;

  // Rules modal
  rulesTitle: string;
  rulesIntro: string;
  rulesIntroNot: string;
  rulesIntroDifferent: string;
  sectionArmies: string;
  theKing: string;
  kingSitsOn: string;
  fourDefenders: string;
  outnumbered: string;
  eightAttackers: string;
  attackersRing: string;
  sectionMovement: string;
  movementRook: string;
  movementNoJumps: string;
  movementThroneOnly: string;
  throne: string;
  orA: string;
  corner: string;
  movementThronePass: string;
  sectionCapturing: string;
  captureTrap1: string;
  captureInto: string;
  captureTrap2: string;
  captureHostile: string;
  captureMultiple: string;
  weaponlessPrefix: string;
  weaponless: string;
  weaponlessSuffix: string;
  sectionWinning: string;
  defendersWinLabel: string;
  defendersWinRule: string;
  attackersWinLabel: string;
  attackersWinRule: string;
  noMoveLoses: string;
  repetitionDraw: string;
  repetitionLossDefenders: string;
  encirclementWinRule: string;
  playButton: string;

  // "Show me how" animated demo
  demoCta: string;
  demoTitle: string;
  demoGoalLabel: string;
  demoGoal: string;
  demoGoalByVariant: Record<string, string>;
  demoGoalHint: string;
  demoCapturesTitle: string;
  demoCapturesHint: string;
  demoCapHorizontal: string;
  demoCapVertical: string;
  demoCapCorner: string;
  demoCapThrone: string;
  demoThroneKing: string;

  // Variant display
  variantNames: Record<string, string>;
  variantBlurbs: Record<string, string>;
  // Export / import (PGN-style game file)
  gameFileTitle: string;
  exportLabel: string;
  exportDownload: string;
  exportCopy: string;
  exportCopied: string;
  exportCopyFailed: string;
  exportHint: string;
  exportNothingYet: string;
  importLabel: string;
  importPlaceholder: string;
  importLoad: string;
  importChooseFile: string;
  importHint: string;
  importLoaded: string;
  importNotes: string;
  importFailed: string;
  importErrNoMoves: string;
  importErrBadTag: string;
  importErrUnknownVariant: string;
  importErrMissingRules: string;
  importErrBadToken: string;
  importErrIllegalMove: string;
  importErrMovesAfterEnd: string;
  importErrCaptureMismatch: string;
  importErrUnreadableFile: string;
  zenElGameFile: string;

  // Board tools — flip + analysis (Session 7b)
  flipBoard: string;
  flipBoardH: string;
  flipBoardV: string;
  /** Engine eval (bar + best-move arrow) — Session 7a. */
  evalLabel: string;
  evalShow: string;
  evalHide: string;
  evalThinking: string;
  evalAttackersWin: string;
  evalDefendersWin: string;
  zenElEval: string;
  analysisMode: string;
  analysisExit: string;
  analysisHint: string;

  // Move tree — variations (Session 7c)
  moveTree: string;
  moveTreeEmpty: string;
  moveTreeNotSaved: string;
  promoteVariation: string;
  deleteVariation: string;

  // Post-game annotations (Session 7d)
  /** Game review (Session 7f) — the "where did I go wrong" front door. */
  /** Learn-from-your-mistakes puzzle (Session 7f). */
  puzzlePrompt: string;
  puzzleHint: string;
  puzzleThinking: string;
  puzzleWrong: string;
  puzzleTryAgain: string;
  puzzleReveal: string;
  puzzleSolved: string;
  puzzleSolvedLate: string;
  puzzleRevealed: string;
  puzzleDone: string;
  puzzlePractise: string;
  /** The sequential lesson (lichess's "Learn from your mistakes"). */
  puzzleSkip: string;
  puzzleNext: string;
  puzzleLessonDone: string;
  thinkHarder: string;
  thinkingDeeper: string;
  reviewTitle: string;
  reviewWorst: string;
  reviewYourWorst: string;
  reviewClean: string;
  evalGraphLabel: string;
  evalGraphStart: string;
  moveWord: string;
  annotateTitle: string;
  annotateRun: string;
  annotateAgain: string;
  annotateStop: string;
  annotateProgress: string;
  annotateHint: string;
  /** Singular forms — the plural ones above are for the "3 mistakes" tally, and
   *  read wrong on a single listed move. */
  /** The per-side analysis summary: mean loss per move, in the engine's own
   *  units — this game's "average centipawn loss". */
  reviewAvgLoss: string;
  /** Starts the lesson stepping through one side's mistakes in game order. */
  reviewLearn: string;
  markOne_inaccuracy: string;
  markOne_mistake: string;
  markOne_blunder: string;
  mark_inaccuracy: string;
  mark_mistake: string;
  mark_blunder: string;

  // Position setup (Session 7e)
  positionTitle: string;
  positionHint: string;
  positionCurrent: string;
  positionPaste: string;
  positionLoad: string;
  positionRejected: string;
  positionRank: string;
  positionLoaded: string;
  positionExportBlocked: string;

  // Side picker (opening overlay)
  chooseSide: string;
  sideKingVerb: string;
  sideKingHint: string;
  sideRaidersVerb: string;
  sideRaidersHint: string;

  // Learn hub ("Show me how")
  learnTitle: string;
  learnObjectives: string;
  learnObjectivesHint: string;
  learnRules: string;
  learnRulesHint: string;
  learnTutorials: string;
  learnTutorialsHint: string;

  // Quick rules (condensed view; the extended view reuses the rules-modal keys)
  quickRulesTab: string;
  fullRulesTab: string;
  quickGoalKing: string;
  quickGoalRaiders: string;
  quickMovement: string;
  quickCapture: string;
  quickKingCaptureStrong: string;
  quickKingCaptureSimple: string;
  quickSpecialSquares: string;

  // Tutorial set plays
  tutorialProgress: string;
  tutorialYouPlayAs: string;
  tutorialShowHint: string;
  /** Heading of the full-screen refusal curtain. */
  tutorialWrongTitle: string;
  /** Label above the restated goal on that curtain. */
  tutorialGoalLabel: string;
  /** One line per TutorialMistake, keyed by its value (see game/tutorials.ts). */
  tutorialMistakes: Record<string, string>;
  tutorialTryAgain: string;
  tutorialSolvedTitle: string;
  tutorialNext: string;
  tutorialReset: string;
  tutorialBackToList: string;
  tutorialAllDone: string;
  tutorialTitles: Record<string, string>;
  tutorialGoals: Record<string, string>;
  tutorialHints: Record<string, string>;

  // Victory overlay
  victoryRaiders: string;
  victoryKing: string;
  victoryDraw: string;
  victoryReview: string;

  // Motifs and tags (Session 8c). One label per value of the `Motif` union and
  // per computed `Tag` in game/motifs.ts. The motif names are the tafl
  // community's own, not this project's, so `en` keeps the forum's spelling and
  // the other locales translate the sense rather than coining a rival term.
  motifGuillotine: string;
  motifSnapTrap: string;
  motifClamp: string;
  motifSpring: string;
  motifBalling: string;
  motifCordon: string;
  motifCornerFight: string;
  motifTwinTowers: string;
  tagAttackers: string;
  tagDefenders: string;
  tagMoves1: string;
  tagMoves2: string;
  tagMoves3: string;
  tagMoves4: string;
  tagSoldierGivenUp: string;
}

const en: Translations = {
  subtitle: "Irish Hnefatafl \u00b7 7\u00d77",
  howToPlay: "How to play",
  menu: "Menu",
  language: "Language",
  zenShort: "Zen",
  drawerPlay: "Play",
  drawerLearn: "Learn",
  drawerTools: "Tools",
  about: "About",
  aboutTitle: "About Brandubh",
  aboutBody1:
    "Brandubh (“black raven”) is the Irish member of the tafl family: an uneven fight on a 7×7 board. The king's side breaks for the corners while the raiders, twice as many, try to close every road.",
  aboutBody2:
    "No complete medieval rulebook survives, so every published ruleset is a reconstruction. The variants here follow the common modern readings; where sources genuinely disagree, the custom ruleset lets you pick a side of the argument.",
  aboutBody3:
    "Everything is free and runs in your browser — games, settings and progress stay on this device. Nothing is sent anywhere.",

  raiders: "Raiders",
  kingsSide: "King\u2019s side",

  drawMessage: "Draw \u2014 the position repeated.",
  defendersWinEscape:
    "King\u2019s side win \u2014 The King has escaped to the corner!",
  attackersWinCapture: "Raiders win \u2014 The King is taken!",
  attackersWinEncirclement: "Raiders win \u2014 The King\u2019s side is encircled!",
  attackersWinRepetition: "Raiders win \u2014 Repetition: loss for the King\u2019s side.",
  attackersWinNoMoves: "Raiders win \u2014 No moves left.",
  defendersWinNoMoves: "King\u2019s side win \u2014 No moves left.",

  toMove: "to move",
  yourMove: "Your move",
  thinkingSuffix: "thinking\u2026",
  moveLabel: "move",

  raidersLost: "Raiders lost",
  defendersLost: "Defenders lost",

  newGame: "New game",
  undo: "Undo",
  rules: "Rules",

  playAs: "Play as",
  king: "King",
  overTheBoard: "Over the board",
  aiLevel: "AI level",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  ollamh: "Ollamh",
  variant: "Variant",
  theme: "Theme",
  attackerIcon: "Raider icon",
  cornerIcon: "Corner squares",
  kingIcon: "King icon",
  defenderIcon: "Defender icon",
  colourTheme: "Colour theme",
  pieceColours: "Piece colours",
  defenders: "Defenders",
  pieceColourDefault: "Default",
  design: "Design your board",
  done: "Done",
  close: "Close",
  settings: "Settings",
  sectionGame: "Game",
  sectionMatch: "Match",
  sectionAppearance: "Appearance",

  prevMove: "Previous move",
  nextMove: "Next move",
  reviewingLabel: "Reviewing",
  liveLabel: "Live",
  lineEndLabel: "End of line",
  latest: "Latest",
  playFromHere: "Play from here",
  playFromHereVsAi: "Play from here vs Computer",
  proposeTakeback: "Propose takeback",
  takebackTitle: "Take back the last move?",
  takebackBody: "Both players should agree before a move is taken back.",
  allow: "Allow",
  decline: "Decline",
  branchHint: "Step back to an earlier move, then play on from there.",

  resign: "Resign",
  resignTitle: "Resign the game?",
  resignBody: "You concede the game to your opponent.",
  attackersWinResign: "Raiders win — The King’s side resigned.",
  defendersWinResign: "King’s side win — The Raiders resigned.",

  clock: "Clock",
  clockOff: "Off",
  timeControlLabel: "Time control",
  customTimeControl: "Custom",
  minutesLabel: "Minutes",
  incrementLabel: "Increment (s)",
  pause: "Pause",
  resume: "Resume",
  flagLabel: "Flag",
  attackersWinTime: "Raiders win — The King’s side ran out of time.",
  defendersWinTime: "King’s side win — The Raiders ran out of time.",
  catBullet: "Bullet",
  catBlitz: "Blitz",
  catRapid: "Rapid",

  zenMode: "Zen mode",
  zenHint:
    "A calm, over-the-board board — just the pieces, whose turn it is, the clock, the move log and the move navigator. Game controls appear only when a game ends.",
  zenShowExtras: "Also show in Zen",
  on: "On",
  off: "Off",
  zenElScoreboard: "Match scoreboard",
  zenElCaptured: "Captured pieces",
  zenElNav: "Move navigation",
  zenElRules: "Rules button",
  zenElSettings: "Settings panels",

  customRulesTitle: "Custom rules",
  ruleArmedKing: "Armed king",
  ruleArmedKingHint: "the king can help make captures",
  ruleThroneHostileSoldiers: "Throne hostile to soldiers",
  ruleThroneHostileSoldiersHint: "the empty throne helps capture soldiers",
  ruleThroneHostileKing: "Throne walls the king",
  ruleThroneHostileKingHint: "the empty throne acts as a wall when surrounding the king (under review)",
  ruleKingReoccupyThrone: "King may re-enter throne",
  ruleKingReoccupyThroneHint: "the king can return to the throne",
  ruleSoldiersPassThrone: "Soldiers pass through throne",
  ruleSoldiersPassThroneHint: "soldiers may slide over the empty throne",
  ruleCornersHostile: "Corners hostile",
  ruleCornersHostileHint: "corners help capture, king included",
  ruleStrongKingOnThrone: "Strong king on throne",
  ruleStrongKingOnThroneHint: "on the throne the king needs all four sides",
  ruleStrongKingAdjacentThrone: "Strong king beside throne",
  ruleStrongKingAdjacentThroneHint: "beside the throne the king needs all four sides, not a two-sided sandwich (under review)",
  ruleShieldwall: "Shieldwall capture",
  ruleShieldwallHint: "a bracketed, fronted row along the edge falls together (Copenhagen); a king in the row survives",
  ruleEncirclementWin: "Encirclement win",
  ruleEncirclementWinHint: "attackers win by fully surrounding the king’s side",
  repetitionResultLabel: "On threefold repetition",
  repetitionOptionNone: "Ignore",
  repetitionOptionDraw: "Draw",
  repetitionOptionLossDefenders: "King’s side loses",

  matchSet: "Set",
  gameWord: "Game",
  player1: "Player 1",
  player2: "Player 2",
  setStanding: "Set standing",
  kingCounter: "King’s side",
  raidersCounter: "Raiders",
  movesWord: "moves",
  drawShort: "Draw",
  bestWin: "best",
  nextGame: "Next game",
  newSet: "New set",
  nextSet: "Next set",
  newMatch: "New match",
  newMatchTitle: "Start a new match?",
  newMatchBody: "This clears the current score and starts the match over.",
  newGameTitle: "Start a new game?",
  newGameBody: "This ends the game in progress and clears the board.",
  setLength: "Set length",
  matchScore: "Match",
  setsWord: "sets",
  drawsShort: "drawn",
  sidesSwapNext: "Sides swap — start the next game.",
  setInProgress: "A set is two games; each player takes one side of each.",
  winsTheSet: "wins the set!",
  winsSetOnMoves: "wins the set — fewer moves to victory.",
  setDrawn: "Set drawn.",
  wonAs: "won as",

  moveLog: "Move log",

  chooseGame: "Choose your game",
  backToStart: "Back to the start screen",
  playVsAi: "Play vs AI",
  otbOverlay: "Over the board",
  withFriend: "with a friend in person",
  chooseDifficulty: "Choose difficulty",
  resumeBody: "You have a game in progress.",
  resumeGame: "Resume game",

  continueFromMove: "Continue from move",
  movesWillBeLost: "All subsequent moves will be lost.",
  back: "Back",
  confirm: "Confirm",

  rulesTitle: "How to play Brandubh",
  rulesIntro:
    'Brandubh (\u201cblack raven\u201d) is the Irish 7\u00d77 form of hnefatafl \u2014 an asymmetric Norse\u2013Gaelic war game. It is ',
  rulesIntroNot: "not",
  rulesIntroDifferent:
    " symmetrical chess: the two sides want different things.",
  sectionArmies: "The armies",
  theKing: "The King",
  kingSitsOn: "sits on the centre throne with",
  fourDefenders: "4 defenders",
  outnumbered: "His side is outnumbered.",
  eightAttackers: "8 attackers",
  attackersRing: "(raiders) ring the edges. They move first.",
  sectionMovement: "Movement",
  movementRook:
    "Every piece moves like a rook: any number of empty squares up, down, or across.",
  movementNoJumps: "No piece jumps. No diagonal moves.",
  movementThroneOnly: "Only the King may rest on the",
  throne: "throne",
  orA: "(centre) or a",
  corner: "corner",
  movementThronePass:
    ". Soldiers may pass over the empty throne but never stop on it.",
  sectionCapturing: "Capturing",
  captureTrap1:
    "Trap an enemy soldier between two of your own pieces (or your piece and a hostile square) along a line \u2014 it is removed. You only capture by moving ",
  captureInto: "into",
  captureTrap2: " the trap; moving between two enemies is safe.",
  captureHostile:
    "The corners and the empty throne are hostile squares that help you capture.",
  captureMultiple: "Several pieces can be captured by a single move.",
  weaponlessPrefix: "In this variant the King is ",
  weaponless: "weaponless",
  weaponlessSuffix: " \u2014 he can never help make a capture.",
  sectionWinning: "Winning",
  defendersWinLabel: "Defenders win",
  defendersWinRule: "if the King reaches any",
  attackersWinLabel: "Attackers win",
  attackersWinRule:
    "if they capture the King \u2014 surrounding him on two opposite sides in the open, or on all four sides when he sits on or beside the throne.",
  noMoveLoses: "A player with no legal move loses.",
  repetitionDraw: "A position repeated three times is a draw.",
  repetitionLossDefenders: "A position repeated three times is a loss for the King\u2019s side.",
  encirclementWinRule:
    "if they completely encircle the King\u2019s side with an unbroken ring \u2014 without using the board edge.",
  playButton: "Play",

  demoCta: "Show me how",
  demoTitle: "How to play",
  demoGoalLabel: "The goal",
  demoGoal: "Get the King to the corner.",
  demoGoalByVariant: {
    walker: "Get the King to the corner.",
    wtf: "Get the King to the corner.",
  },
  demoGoalHint: "You play the King\u2019s side. Reach any of the four corners to win.",
  demoCapturesTitle: "Capturing",
  demoCapturesHint:
    "Trap an enemy piece between two of yours \u2014 you must be the one to move into the trap.",
  demoCapHorizontal: "Caught between two raiders, side to side.",
  demoCapVertical: "\u2026or top to bottom.",
  demoCapCorner: "A corner counts as a raider too.",
  demoCapThrone: "An empty throne counts as a raider too.",
  demoThroneKing: "The throne cannot hurt the King, but the corners can.",

  variantNames: {
    walker: "Brandubh \u00b7 Walker",
    wtf: "Brandubh \u00b7 World Tafl Federation",
    custom: "Custom",
  },
  variantBlurbs: {
    walker:
      "Reconstruction by Damian Walker (Cyningstan, 2011), based on MacWhite\u2019s 1946 article. The throne is not a hostile square. No strong-king rule \u2014 the king is captured by two pieces anywhere on the board. Repetition is a draw.",
    wtf:
      "Official WTF tournament rules (aagenielsen.dk). The empty throne is hostile to soldiers but never to the king. King on the throne needs all four sides surrounded. Encirclement wins. Repetition is a loss for the defending side.",
    custom: "Your custom ruleset.",
  },
  gameFileTitle: "Export / import game",
  exportLabel: "Export this game",
  exportDownload: "Download",
  exportCopy: "Copy",
  exportCopied: "Copied",
  exportCopyFailed: "Copy failed",
  exportHint: "A plain-text .tafl file: a tag header plus the move list, like a chess PGN.",
  exportNothingYet: "Play a move first \u2014 there is nothing to export yet.",
  importLabel: "Import a game",
  importPlaceholder: "Paste a game here\u2026",
  importLoad: "Load game",
  importChooseFile: "Choose file\u2026",
  importHint: "The game loads into review, so you can step through it or play on from any position.",
  importLoaded: "Game loaded",
  importNotes: "Loaded, with notes:",
  importFailed: "Could not import that game",
  importErrNoMoves: "no moves were found in it.",
  importErrBadTag: "a header line could not be read.",
  importErrUnknownVariant: "its ruleset is not one this app knows.",
  importErrMissingRules: "a custom game has to carry its own [Rules] tag.",
  importErrBadToken: "something in the move list is not a move.",
  importErrIllegalMove: "one of the moves is not legal in that position.",
  importErrMovesAfterEnd: "the move list carries on after the game had ended.",
  importErrCaptureMismatch: "the captures do not match this ruleset.",
  importErrUnreadableFile: "that file could not be read.",
  zenElGameFile: "Export / import",

  flipBoard: "Flip board",
  flipBoardH: "Flip board left-right",
  flipBoardV: "Flip board top-bottom",
  evalLabel: "Engine eval",
  evalShow: "Show eval",
  evalHide: "Hide eval",
  evalThinking: "Evaluating\u2026",
  evalAttackersWin: "Raiders win",
  evalDefendersWin: "King wins",
  zenElEval: "Engine eval",
  analysisMode: "Analysis",
  analysisExit: "Leave analysis",
  analysisHint: "Move both sides freely \u00b7 the computer and the clock are paused \u00b7 nothing is saved",

  moveTree: "Variations",
  moveTreeEmpty: "Play a move to start a line. Going back and playing something else keeps both.",
  moveTreeNotSaved: "Variations live for this session only \u2014 they are not saved with the game.",
  promoteVariation: "Promote to main line",
  deleteVariation: "Delete variation",

  puzzlePrompt: "Find a better move",
  puzzleHint: "Play the move you think was best here.",
  puzzleThinking: "Working out the answer\u2026",
  puzzleWrong: "Not quite.",
  puzzleTryAgain: "Try again",
  puzzleReveal: "View solution",
  puzzleSolved: "Correct \u2014 that is the engine's move.",
  puzzleSolvedLate: "Found it.",
  puzzleRevealed: "The engine's move is shown on the board.",
  puzzleDone: "Done",
  puzzlePractise: "Practise",
  puzzleSkip: "Skip",
  puzzleNext: "Next",
  puzzleLessonDone: "That was the last one — lesson complete.",
  thinkHarder: "Think harder",
  thinkingDeeper: "Thinking\u2026",
  reviewTitle: "Game review",
  reviewWorst: "Costliest moves",
  reviewYourWorst: "Your costliest moves",
  reviewClean: "No mistakes worth flagging \u2014 a clean game.",
  evalGraphLabel: "How the game swung, move by move",
  evalGraphStart: "Starting position",
  moveWord: "Move",
  annotateTitle: "Game review",
  annotateRun: "Analyse game",
  annotateAgain: "Analyse again",
  annotateStop: "Stop",
  annotateProgress: "Analysing move",
  annotateHint: "Re-searches every position and marks where the game swung.",
  reviewAvgLoss: "Average loss",
  reviewLearn: "Learn from your mistakes",
  markOne_inaccuracy: "Inaccuracy",
  markOne_mistake: "Mistake",
  markOne_blunder: "Blunder",
  mark_inaccuracy: "inaccuracies",
  mark_mistake: "mistakes",
  mark_blunder: "blunders",

  positionTitle: "Set up a position",
  positionHint:
    "One line per board: seven ranks top-first, A raider \u00b7 D defender \u00b7 K king \u00b7 a digit for empty squares, then the side to move (a or d). A pasted position opens in analysis and is never saved over your game.",
  positionCurrent: "This position",
  positionPaste: "Paste a position",
  positionLoad: "Analyse this position",
  positionRejected: "That position could not be read \u2014",
  positionRank: "rank",
  positionLoaded: "Analysing a pasted position",
  positionExportBlocked:
    "Export is off while you analyse a pasted position \u2014 a game file records moves from the opening, which this position has none of.",

  chooseSide: "Which side will you play?",
  sideKingVerb: "ESCAPE",
  sideKingHint: "King + 4 warriors — guide the king to a corner",
  sideRaidersVerb: "CAPTURE",
  sideRaidersHint: "8 raiders — surround and capture the king",

  learnTitle: "Learn Brandubh",
  learnObjectives: "The goal",
  learnObjectivesHint: "Watch how each side wins and how captures work.",
  learnRules: "The rules",
  learnRulesHint: "The quick version, with the full letter of the law behind it.",
  learnTutorials: "Set plays",
  learnTutorialsHint: "Twelve short drills — find the winning move.",

  quickRulesTab: "Quick rules",
  fullRulesTab: "Full rules",
  quickGoalKing: "King’s side wins by bringing the King to any corner square.",
  quickGoalRaiders: "Raiders win by capturing the King.",
  quickMovement:
    "Every piece moves like a chess rook: any distance along a row or column, no jumping.",
  quickCapture:
    "Capture a soldier by closing it between two of your pieces in a straight line. A corner — or the empty throne — counts as one of yours.",
  quickKingCaptureStrong:
    "The King falls between two raiders — except on or beside the throne, where he must be surrounded on all four sides.",
  quickKingCaptureSimple:
    "The King falls like a soldier: caught between two raiders, anywhere on the board.",
  quickSpecialSquares:
    "Only the King may stop on the throne or a corner. Walking between two enemies is safe — a trap only springs when the enemy closes it.",

  tutorialProgress: "solved",
  tutorialYouPlayAs: "You play:",
  tutorialShowHint: "Show a hint",
  tutorialWrongTitle: "Not that move",
  tutorialGoalLabel: "This drill asks:",
  tutorialMistakes: {
    roadOpen: "The King can still reach a corner on his very next move. That is the road to bar.",
    losesGame: "That gives the game away — the other side wins at once.",
    noCapture:
      "Nothing was taken. A piece only falls when your move closes it in between two hostile squares.",
    wrongCapture: "That takes a piece, but not the capture this drill is about.",
    kingStands: "The King still stands. He falls only when the closing move is yours.",
    noEscape: "The King did not reach a corner — only the four corners count as escape.",
    notForcing: "That does not force the win: the raiders can shut the road on their reply.",
  },
  tutorialTryAgain: "Try again",
  tutorialSolvedTitle: "Solved!",
  tutorialNext: "Next drill",
  tutorialReset: "Reset",
  tutorialBackToList: "All set plays",
  tutorialAllDone: "All twelve solved — you are ready for a real game.",
  tutorialTitles: {
    "pincer": "The pincer",
    "corner-anvil": "The corner anvil",
    "throne-anvil": "The throne anvil",
    "double-take": "Two at a stroke",
    "kings-blade": "The King’s blade",
    "road-to-corner": "The open road",
    "royal-fork": "The royal fork",
    "bar-the-door": "Bar the door",
    "take-the-king": "Take the King",
    "wall-of-four": "The wall of four",
    "fourth-wall": "The fourth wall",
    "close-the-ring": "Close the ring",
  },
  tutorialGoals: {
    "pincer": "Capture a defender by closing him between two raiders.",
    "corner-anvil": "Capture the defender using a hostile corner as the second raider.",
    "throne-anvil": "Capture the defender using the empty throne as the anvil.",
    "double-take": "Capture two raiders with a single move.",
    "kings-blade": "Use the King himself to capture a raider.",
    "road-to-corner": "Escape: bring the King to a corner.",
    "royal-fork": "Threaten two corners at once, then escape (two moves).",
    "bar-the-door": "Stop the King from escaping on his next move.",
    "take-the-king": "Capture the King between two raiders.",
    "wall-of-four": "Capture the King on his throne.",
    "fourth-wall": "Capture the King beside his throne.",
    "close-the-ring": "Win by encircling the King and his last guard.",
  },
  tutorialHints: {
    "pincer": "The defender already has a raider at his back. Bring the other jaw down the c-file.",
    "corner-anvil": "A corner counts as an enemy piece. Pin the guard on b7 against it.",
    "throne-anvil": "The empty throne is hostile to soldiers. Trap the guard on c4 against it.",
    "double-take":
      "A soldier may slide across the empty throne. Land where both traps close at once.",
    "kings-blade":
      "The King is armed: he can close a trap like any soldier. One step off his throne does it.",
    "road-to-corner": "One corner road is barred. The other rank is clear — run it to the end.",
    "royal-fork":
      "From the top rank the King eyes both corners. No single raider can shut both doors.",
    "bar-the-door": "The King has one open road left. Put a raider on it.",
    "take-the-king":
      "Away from the throne, two raiders suffice — and yours must make the closing move.",
    "wall-of-four":
      "On his throne the King must be surrounded on all four sides. One wall is missing.",
    "fourth-wall":
      "Beside the throne, the empty throne itself walls one side. Close the last one.",
    "close-the-ring": "An unbroken ring of raiders wins. One gap remains — seal it.",
  },

  victoryRaiders: "The Raiders triumph",
  victoryKing: "The King prevails",
  victoryDraw: "A draw",
  victoryReview: "Review the board",

  // Session 8c
  motifGuillotine: "Guillotine",
  motifSnapTrap: "Snap trap",
  motifClamp: "Clamp",
  motifSpring: "Spring",
  motifBalling: "Balling",
  motifCordon: "Cordon",
  motifCornerFight: "Corner fight",
  motifTwinTowers: "Twin towers",
  tagAttackers: "Raiders to move",
  tagDefenders: "King's side to move",
  tagMoves1: "One move",
  tagMoves2: "Two moves",
  tagMoves3: "Three moves",
  tagMoves4: "Four moves",
  tagSoldierGivenUp: "A soldier given up",
};

const es: Translations = {
  subtitle: "Hnefatafl Irland\u00e9s \u00b7 7\u00d77",
  howToPlay: "C\u00f3mo jugar",
  menu: "Men\u00fa",
  language: "Idioma",
  zenShort: "Zen",
  drawerPlay: "Jugar",
  drawerLearn: "Aprender",
  drawerTools: "Herramientas",
  about: "Acerca de",
  aboutTitle: "Acerca de Brandubh",
  aboutBody1:
    "Brandubh (\u201ccuervo negro\u201d) es el miembro irland\u00e9s de la familia tafl: una lucha desigual en un tablero de 7\u00d77. El bando del rey corre hacia las esquinas mientras los asaltantes, el doble en n\u00famero, intentan cerrar todos los caminos.",
  aboutBody2:
    "No sobrevive ning\u00fan reglamento medieval completo, as\u00ed que todo reglamento publicado es una reconstrucci\u00f3n. Las variantes de aqu\u00ed siguen las lecturas modernas m\u00e1s comunes; donde las fuentes discrepan de verdad, el reglamento personalizado te deja elegir un lado de la discusi\u00f3n.",
  aboutBody3:
    "Todo es gratuito y funciona en tu navegador: partidas, ajustes y progreso se quedan en este dispositivo. No se env\u00eda nada a ninguna parte.",

  raiders: "Asaltantes",
  kingsSide: "Bando del Rey",

  drawMessage: "Tablas \u2014 la posici\u00f3n se repiti\u00f3.",
  defendersWinEscape:
    "\u00a1El Bando del Rey gana! \u2014 \u00a1El Rey ha escapado a la esquina!",
  attackersWinCapture:
    "\u00a1Los Asaltantes ganan! \u2014 \u00a1El Rey ha sido capturado!",
  attackersWinEncirclement:
    "\u00a1Los Asaltantes ganan! \u2014 \u00a1El bando del Rey est\u00e1 cercado!",
  attackersWinRepetition:
    "\u00a1Los Asaltantes ganan! \u2014 Repetici\u00f3n: p\u00e9rdida para el bando del Rey.",
  attackersWinNoMoves:
    "\u00a1Los Asaltantes ganan! \u2014 No quedan movimientos.",
  defendersWinNoMoves:
    "\u00a1El Bando del Rey gana! \u2014 No quedan movimientos.",

  toMove: "mueve",
  yourMove: "Tu turno",
  thinkingSuffix: "pensando\u2026",
  moveLabel: "movimiento",

  raidersLost: "Asaltantes perdidos",
  defendersLost: "Defensores perdidos",

  newGame: "Nuevo juego",
  undo: "Deshacer",
  rules: "Reglas",

  playAs: "Jugar como",
  king: "Rey",
  overTheBoard: "Frente al tablero",
  aiLevel: "Nivel IA",
  easy: "F\u00e1cil",
  medium: "Medio",
  hard: "Dif\u00edcil",
  ollamh: "Ollamh",
  variant: "Variante",
  theme: "Tema",
  attackerIcon: "Icono de asaltante",
  cornerIcon: "Esquinas",
  kingIcon: "Icono del rey",
  defenderIcon: "Icono del defensor",
  colourTheme: "Tema de color",
  pieceColours: "Colores de las piezas",
  defenders: "Defensores",
  pieceColourDefault: "Predeterminado",
  design: "Diseña tu tablero",
  done: "Listo",
  close: "Cerrar",
  settings: "Ajustes",
  sectionGame: "Juego",
  sectionMatch: "Encuentro",
  sectionAppearance: "Apariencia",

  prevMove: "Jugada anterior",
  nextMove: "Jugada siguiente",
  reviewingLabel: "Revisando",
  liveLabel: "En vivo",
  lineEndLabel: "Fin de la l\u00ednea",
  latest: "\u00daltima",
  playFromHere: "Jugar desde aqu\u00ed",
  playFromHereVsAi: "Jugar desde aqu\u00ed vs Ordenador",
  proposeTakeback: "Proponer devoluci\u00f3n",
  takebackTitle: "\u00bfDeshacer la \u00faltima jugada?",
  takebackBody: "Ambos jugadores deben estar de acuerdo antes de deshacer una jugada.",
  allow: "Permitir",
  decline: "Rechazar",
  branchHint: "Retrocede a una jugada anterior y contin\u00faa desde ah\u00ed.",

  resign: "Rendirse",
  resignTitle: "\u00bfRendir la partida?",
  resignBody: "Concedes la partida a tu oponente.",
  attackersWinResign: "Los Asaltantes ganan \u2014 El bando del Rey se rindi\u00f3.",
  defendersWinResign: "El Bando del Rey gana \u2014 Los Asaltantes se rindieron.",

  clock: "Reloj",
  clockOff: "Apagado",
  timeControlLabel: "Control de tiempo",
  customTimeControl: "Personalizado",
  minutesLabel: "Minutos",
  incrementLabel: "Incremento (s)",
  pause: "Pausar",
  resume: "Reanudar",
  flagLabel: "Sin tiempo",
  attackersWinTime: "Los Asaltantes ganan \u2014 El bando del Rey se qued\u00f3 sin tiempo.",
  defendersWinTime: "El Bando del Rey gana \u2014 Los Asaltantes se quedaron sin tiempo.",
  catBullet: "Bala",
  catBlitz: "Rel\u00e1mpago",
  catRapid: "R\u00e1pido",

  zenMode: "Modo zen",
  zenHint:
    "Un tablero sereno \u2014 solo las piezas, el turno, el reloj, el registro de jugadas y la navegaci\u00f3n de jugadas. Los controles aparecen solo cuando termina una partida.",
  zenShowExtras: "Mostrar tambi\u00e9n en Zen",
  on: "Activado",
  off: "Apagado",
  zenElScoreboard: "Marcador de la serie",
  zenElCaptured: "Piezas capturadas",
  zenElNav: "Navegaci\u00f3n de jugadas",
  zenElRules: "Bot\u00f3n de reglas",
  zenElSettings: "Paneles de ajustes",

  customRulesTitle: "Reglas personalizadas",
  ruleArmedKing: "Rey armado",
  ruleArmedKingHint: "el rey puede ayudar a capturar",
  ruleThroneHostileSoldiers: "Trono hostil a soldados",
  ruleThroneHostileSoldiersHint: "el trono vac\u00edo ayuda a capturar soldados",
  ruleThroneHostileKing: "Trono hostil al rey",
  ruleThroneHostileKingHint: "el trono vac\u00edo cuenta contra el rey",
  ruleKingReoccupyThrone: "El rey puede volver al trono",
  ruleKingReoccupyThroneHint: "el rey puede regresar al trono",
  ruleSoldiersPassThrone: "Soldados cruzan el trono",
  ruleSoldiersPassThroneHint: "los soldados pueden pasar sobre el trono vac\u00edo",
  ruleCornersHostile: "Esquinas hostiles",
  ruleCornersHostileHint: "las esquinas ayudan a capturar, incluido el rey",
  ruleStrongKingOnThrone: "Rey fuerte en el trono",
  ruleStrongKingOnThroneHint: "en el trono el rey necesita los cuatro lados",
  ruleStrongKingAdjacentThrone: "Rey fuerte junto al trono",
  ruleStrongKingAdjacentThroneHint: "junto al trono el rey necesita los cuatro lados",
  ruleShieldwall: "Captura en muro de escudos",
  ruleShieldwallHint: "una fila en el borde, cerrada y encarada, cae entera (Copenhague); el rey en la fila sobrevive",
  ruleEncirclementWin: "Victoria por cerco",
  ruleEncirclementWinHint: "los asaltantes ganan rodeando por completo al bando del rey",
  repetitionResultLabel: "En triple repetici\u00f3n",
  repetitionOptionNone: "Ignorar",
  repetitionOptionDraw: "Tablas",
  repetitionOptionLossDefenders: "El bando del Rey pierde",

  matchSet: "Serie",
  gameWord: "Partida",
  player1: "Jugador 1",
  player2: "Jugador 2",
  setStanding: "Marcador de la serie",
  kingCounter: "Bando del Rey",
  raidersCounter: "Asaltantes",
  movesWord: "jugadas",
  drawShort: "Tablas",
  bestWin: "mejor",
  nextGame: "Siguiente partida",
  newSet: "Nueva serie",
  nextSet: "Siguiente serie",
  newMatch: "Nuevo encuentro",
  newMatchTitle: "¿Empezar un nuevo encuentro?",
  newMatchBody: "Esto borra la puntuación actual y reinicia el encuentro.",
  newGameTitle: "¿Empezar un nuevo juego?",
  newGameBody: "Esto termina el juego en curso y limpia el tablero.",
  setLength: "Partidas por serie",
  matchScore: "Encuentro",
  setsWord: "series",
  drawsShort: "empatadas",
  sidesSwapNext: "Cambian los bandos — empieza la siguiente partida.",
  setInProgress: "Una serie son dos partidas; cada jugador toma un bando en cada una.",
  winsTheSet: "¡gana la serie!",
  winsSetOnMoves: "gana la serie — menos jugadas para la victoria.",
  setDrawn: "Serie empatada.",
  wonAs: "ganó con",

  moveLog: "Registro de jugadas",

  chooseGame: "Elige tu juego",
  backToStart: "Volver a la pantalla de inicio",
  playVsAi: "Contra la IA",
  otbOverlay: "Frente al tablero",
  withFriend: "con un amigo en persona",
  chooseDifficulty: "Elige la dificultad",
  resumeBody: "Tienes una partida en curso.",
  resumeGame: "Reanudar partida",

  continueFromMove: "\u00bfContinuar desde el movimiento",
  movesWillBeLost:
    "Se perder\u00e1n todos los movimientos posteriores.",
  back: "Volver",
  confirm: "Confirmar",

  rulesTitle: "C\u00f3mo jugar a Brandubh",
  rulesIntro:
    'Brandubh (\u201ccuervo negro\u201d) es la versi\u00f3n irlandesa 7\u00d77 de hnefatafl \u2014 un juego de guerra asim\u00e9trico n\u00f3rdico-ga\u00e9lico. ',
  rulesIntroNot: "No",
  rulesIntroDifferent:
    " es ajedrez sim\u00e9trico: los dos bandos quieren cosas diferentes.",
  sectionArmies: "Los ej\u00e9rcitos",
  theKing: "El Rey",
  kingSitsOn: "se sienta en el trono central con",
  fourDefenders: "4 defensores",
  outnumbered: "Su bando est\u00e1 en inferioridad num\u00e9rica.",
  eightAttackers: "8 asaltantes",
  attackersRing: "(invasores) rodean los bordes. Mueven primero.",
  sectionMovement: "Movimiento",
  movementRook:
    "Cada pieza se mueve como una torre: cualquier n\u00famero de casillas vac\u00edas arriba, abajo o a los lados.",
  movementNoJumps:
    "Ninguna pieza salta. No hay movimientos diagonales.",
  movementThroneOnly: "Solo el Rey puede descansar en el",
  throne: "trono",
  orA: "(centro) o una",
  corner: "esquina",
  movementThronePass:
    ". Los soldados pueden pasar sobre el trono vac\u00edo pero nunca detenerse en \u00e9l.",
  sectionCapturing: "Captura",
  captureTrap1:
    "Atrapa a un soldado enemigo entre dos de tus piezas (o tu pieza y una casilla hostil) en l\u00ednea \u2014 ser\u00e1 eliminado. Solo capturas al moverte ",
  captureInto: "hacia",
  captureTrap2: " la trampa; moverte entre dos enemigos es seguro.",
  captureHostile:
    "Las esquinas y el trono vac\u00edo son casillas hostiles que ayudan a capturar.",
  captureMultiple:
    "Se pueden capturar varias piezas con un solo movimiento.",
  weaponlessPrefix: "En esta variante el Rey est\u00e1 ",
  weaponless: "desarmado",
  weaponlessSuffix:
    " \u2014 nunca puede ayudar a realizar una captura.",
  sectionWinning: "Victoria",
  defendersWinLabel: "Los Defensores ganan",
  defendersWinRule: "si el Rey llega a cualquier",
  attackersWinLabel: "Los Asaltantes ganan",
  attackersWinRule:
    "si capturan al Rey \u2014 rode\u00e1ndolo por dos lados opuestos en campo abierto, o por los cuatro lados cuando est\u00e1 en o junto al trono.",
  noMoveLoses: "Un jugador sin movimiento legal pierde.",
  repetitionDraw: "Una posici\u00f3n repetida tres veces es tablas.",
  repetitionLossDefenders:
    "Una posici\u00f3n repetida tres veces es una derrota para el bando del Rey.",
  encirclementWinRule:
    "si rodean completamente al bando del Rey con un anillo ininterrumpido \u2014 sin usar el borde del tablero.",
  playButton: "Jugar",

  demoCta: "Mu\u00e9strame c\u00f3mo",
  demoTitle: "C\u00f3mo jugar",
  demoGoalLabel: "El objetivo",
  demoGoal: "Lleva al Rey a la esquina.",
  demoGoalByVariant: {
    walker: "Lleva al Rey a la esquina.",
    wtf: "Lleva al Rey a la esquina.",
  },
  demoGoalHint: "Juegas con el bando del Rey. Llega a cualquiera de las cuatro esquinas para ganar.",
  demoCapturesTitle: "Capturas",
  demoCapturesHint:
    "Atrapa una pieza enemiga entre dos de las tuyas \u2014 t\u00fa debes ser quien entra en la trampa.",
  demoCapHorizontal: "Atrapada entre dos asaltantes, de lado a lado.",
  demoCapVertical: "\u2026o de arriba abajo.",
  demoCapCorner: "Una esquina cuenta como un asaltante m\u00e1s.",
  demoCapThrone: "El trono vac\u00edo cuenta como un asaltante m\u00e1s.",
  demoThroneKing: "El trono no puede da\u00f1ar al Rey, pero las esquinas s\u00ed.",

  variantNames: {
    walker: "Brandubh \u00b7 Walker",
    wtf: "Brandubh \u00b7 Federaci\u00f3n Mundial de Tafl",
    custom: "Personalizado",
  },
  variantBlurbs: {
    walker:
      "Reconstrucci\u00f3n de Damian Walker (Cyningstan, 2011), basada en el art\u00edculo de MacWhite de 1946. El trono no es una casilla hostil. Sin regla de rey fuerte \u2014 el rey es capturado por dos piezas en cualquier lugar del tablero. La repetici\u00f3n es tablas.",
    wtf:
      "Reglas oficiales del torneo FMT (aagenielsen.dk). El trono vac\u00edo es hostil para los soldados pero nunca para el rey. El rey en el trono necesita los cuatro lados rodeados. El cerco gana. La repetici\u00f3n es una derrota para el bando defensor.",
    custom: "Tu conjunto de reglas personalizado.",
  },
  gameFileTitle: "Exportar / importar partida",
  exportLabel: "Exportar esta partida",
  exportDownload: "Descargar",
  exportCopy: "Copiar",
  exportCopied: "Copiado",
  exportCopyFailed: "Fall\u00f3 la copia",
  exportHint: "Un archivo .tafl de texto: cabecera de etiquetas m\u00e1s la lista de jugadas, como un PGN de ajedrez.",
  exportNothingYet: "Haz una jugada primero \u2014 a\u00fan no hay nada que exportar.",
  importLabel: "Importar una partida",
  importPlaceholder: "Pega una partida aqu\u00ed\u2026",
  importLoad: "Cargar partida",
  importChooseFile: "Elegir archivo\u2026",
  importHint: "La partida se carga en modo revisi\u00f3n: puedes recorrerla o seguir jugando desde cualquier posici\u00f3n.",
  importLoaded: "Partida cargada",
  importNotes: "Cargada, con avisos:",
  importFailed: "No se pudo importar esa partida",
  importErrNoMoves: "no se encontr\u00f3 ninguna jugada.",
  importErrBadTag: "no se pudo leer una l\u00ednea de la cabecera.",
  importErrUnknownVariant: "su reglamento no es uno que esta app conozca.",
  importErrMissingRules: "una partida personalizada debe llevar su propia etiqueta [Rules].",
  importErrBadToken: "algo en la lista de jugadas no es una jugada.",
  importErrIllegalMove: "una de las jugadas no es legal en esa posici\u00f3n.",
  importErrMovesAfterEnd: "la lista de jugadas contin\u00faa despu\u00e9s de terminar la partida.",
  importErrCaptureMismatch: "las capturas no cuadran con este reglamento.",
  importErrUnreadableFile: "no se pudo leer ese archivo.",
  zenElGameFile: "Exportar / importar",

  flipBoard: "Girar el tablero",
  flipBoardH: "Girar el tablero izquierda-derecha",
  flipBoardV: "Girar el tablero arriba-abajo",
  evalLabel: "Evaluaci\u00f3n",
  evalShow: "Mostrar evaluaci\u00f3n",
  evalHide: "Ocultar evaluaci\u00f3n",
  evalThinking: "Evaluando\u2026",
  evalAttackersWin: "Ganan los asaltantes",
  evalDefendersWin: "Gana el rey",
  zenElEval: "Evaluaci\u00f3n del motor",
  analysisMode: "An\u00e1lisis",
  analysisExit: "Salir del an\u00e1lisis",
  analysisHint: "Mueve los dos bandos libremente \u00b7 la m\u00e1quina y el reloj est\u00e1n en pausa \u00b7 no se guarda nada",

  moveTree: "Variantes",
  moveTreeEmpty: "Haz una jugada para empezar una l\u00ednea. Si retrocedes y juegas otra cosa, se guardan las dos.",
  moveTreeNotSaved: "Las variantes solo duran esta sesi\u00f3n \u2014 no se guardan con la partida.",
  promoteVariation: "Convertir en l\u00ednea principal",
  deleteVariation: "Borrar la variante",

  puzzlePrompt: "Encuentra una jugada mejor",
  puzzleHint: "Juega la que creas que era la mejor aqu\u00ed.",
  puzzleThinking: "Calculando la respuesta\u2026",
  puzzleWrong: "No exactamente.",
  puzzleTryAgain: "Int\u00e9ntalo de nuevo",
  puzzleReveal: "Ver la soluci\u00f3n",
  puzzleSolved: "Correcto \u2014 es la jugada del motor.",
  puzzleSolvedLate: "La encontraste.",
  puzzleRevealed: "La jugada del motor se muestra en el tablero.",
  puzzleDone: "Listo",
  puzzlePractise: "Practicar",
  puzzleSkip: "Saltar",
  puzzleNext: "Siguiente",
  puzzleLessonDone: "Era el último — lección completada.",
  thinkHarder: "Pensar m\u00e1s",
  thinkingDeeper: "Pensando\u2026",
  reviewTitle: "Revisi\u00f3n de la partida",
  reviewWorst: "Jugadas m\u00e1s costosas",
  reviewYourWorst: "Tus jugadas m\u00e1s costosas",
  reviewClean: "Sin errores rese\u00f1ables \u2014 partida limpia.",
  evalGraphLabel: "C\u00f3mo cambi\u00f3 la partida, jugada a jugada",
  evalGraphStart: "Posici\u00f3n inicial",
  moveWord: "Jugada",
  annotateTitle: "Revisi\u00f3n de la partida",
  annotateRun: "Analizar la partida",
  annotateAgain: "Analizar otra vez",
  annotateStop: "Detener",
  annotateProgress: "Analizando la jugada",
  annotateHint: "Vuelve a calcular cada posici\u00f3n y marca d\u00f3nde cambi\u00f3 la partida.",
  reviewAvgLoss: "P\u00e9rdida media",
  reviewLearn: "Aprende de tus errores",
  markOne_inaccuracy: "Imprecisi\u00f3n",
  markOne_mistake: "Error",
  markOne_blunder: "Error grave",
  mark_inaccuracy: "imprecisiones",
  mark_mistake: "errores",
  mark_blunder: "errores graves",

  positionTitle: "Componer una posici\u00f3n",
  positionHint:
    "Una l\u00ednea por tablero: siete filas empezando por arriba, A asaltante \u00b7 D defensor \u00b7 K rey \u00b7 un d\u00edgito por casillas vac\u00edas, y luego el bando que mueve (a o d). Una posici\u00f3n pegada se abre en an\u00e1lisis y nunca se guarda sobre tu partida.",
  positionCurrent: "Esta posici\u00f3n",
  positionPaste: "Pega una posici\u00f3n",
  positionLoad: "Analizar esta posici\u00f3n",
  positionRejected: "No se pudo leer esa posici\u00f3n \u2014",
  positionRank: "fila",
  positionLoaded: "Analizando una posici\u00f3n pegada",
  positionExportBlocked:
    "La exportaci\u00f3n est\u00e1 desactivada mientras analizas una posici\u00f3n pegada: un archivo de partida guarda jugadas desde la apertura, y esta posici\u00f3n no tiene ninguna.",

  chooseSide: "¿Con qué bando jugarás?",
  sideKingVerb: "ESCAPAR",
  sideKingHint: "Rey + 4 guerreros — lleva al rey hasta una esquina",
  sideRaidersVerb: "CAPTURAR",
  sideRaidersHint: "8 asaltantes — rodea y captura al rey",

  learnTitle: "Aprende Brandubh",
  learnObjectives: "El objetivo",
  learnObjectivesHint: "Mira cómo gana cada bando y cómo funcionan las capturas.",
  learnRules: "Las reglas",
  learnRulesHint: "La versión rápida, con la letra completa de la ley detrás.",
  learnTutorials: "Jugadas de manual",
  learnTutorialsHint: "Doce ejercicios breves: encuentra la jugada ganadora.",

  quickRulesTab: "Reglas rápidas",
  fullRulesTab: "Reglas completas",
  quickGoalKing: "El bando del Rey gana llevando al Rey a cualquier esquina.",
  quickGoalRaiders: "Los Asaltantes ganan capturando al Rey.",
  quickMovement:
    "Todas las piezas mueven como una torre de ajedrez: cualquier distancia en fila o columna, sin saltar.",
  quickCapture:
    "Captura un soldado encerrándolo en línea recta entre dos piezas tuyas. Una esquina — o el trono vacío — cuenta como una de las tuyas.",
  quickKingCaptureStrong:
    "El Rey cae entre dos asaltantes, salvo en el trono o junto a él, donde debe quedar rodeado por los cuatro lados.",
  quickKingCaptureSimple:
    "El Rey cae como un soldado: atrapado entre dos asaltantes, en cualquier parte del tablero.",
  quickSpecialSquares:
    "Solo el Rey puede detenerse en el trono o en una esquina. Pasar entre dos enemigos es seguro: la trampa solo se cierra cuando la cierra el enemigo.",

  tutorialProgress: "resueltas",
  tutorialYouPlayAs: "Juegas con:",
  tutorialShowHint: "Ver una pista",
  tutorialWrongTitle: "Ese movimiento no",
  tutorialGoalLabel: "Esta jugada pide:",
  tutorialMistakes: {
    roadOpen:
      "El Rey todavía puede llegar a una esquina en su próximo movimiento. Ese es el camino que hay que cerrar.",
    losesGame: "Eso entrega la partida: el otro bando gana de inmediato.",
    noCapture:
      "No capturaste nada. Una pieza solo cae cuando tu movimiento la encierra entre dos casillas hostiles.",
    wrongCapture: "Eso captura una pieza, pero no es la captura de la que trata esta jugada.",
    kingStands: "El Rey sigue en pie. Solo cae cuando el movimiento que cierra la trampa es tuyo.",
    noEscape: "El Rey no llegó a una esquina: solo las cuatro esquinas cuentan como escape.",
    notForcing:
      "Eso no fuerza la victoria: los asaltantes pueden cerrar el camino en su respuesta.",
  },
  tutorialTryAgain: "Inténtalo otra vez",
  tutorialSolvedTitle: "¡Resuelta!",
  tutorialNext: "Siguiente jugada",
  tutorialReset: "Reiniciar",
  tutorialBackToList: "Todas las jugadas",
  tutorialAllDone: "Las doce resueltas: ya estás listo para una partida de verdad.",
  tutorialTitles: {
    "pincer": "La tenaza",
    "corner-anvil": "El yunque de la esquina",
    "throne-anvil": "El yunque del trono",
    "double-take": "Dos de un golpe",
    "kings-blade": "La espada del Rey",
    "road-to-corner": "El camino abierto",
    "royal-fork": "La horquilla real",
    "bar-the-door": "Atranca la puerta",
    "take-the-king": "Captura al Rey",
    "wall-of-four": "El muro de cuatro",
    "fourth-wall": "La cuarta muralla",
    "close-the-ring": "Cierra el anillo",
  },
  tutorialGoals: {
    "pincer": "Captura a un defensor encerrándolo entre dos asaltantes.",
    "corner-anvil": "Captura al defensor usando una esquina hostil como segundo asaltante.",
    "throne-anvil": "Captura al defensor usando el trono vacío como yunque.",
    "double-take": "Captura dos asaltantes con un solo movimiento.",
    "kings-blade": "Usa al propio Rey para capturar a un asaltante.",
    "road-to-corner": "Escapa: lleva al Rey a una esquina.",
    "royal-fork": "Amenaza dos esquinas a la vez y escapa (dos movimientos).",
    "bar-the-door": "Impide que el Rey escape en su próximo movimiento.",
    "take-the-king": "Captura al Rey entre dos asaltantes.",
    "wall-of-four": "Captura al Rey en su trono.",
    "fourth-wall": "Captura al Rey junto a su trono.",
    "close-the-ring": "Gana cercando al Rey y a su último guardia.",
  },
  tutorialHints: {
    "pincer":
      "El defensor ya tiene un asaltante a la espalda. Cierra la otra mordaza por la columna c.",
    "corner-anvil": "Una esquina cuenta como pieza enemiga. Aprisiona contra ella al guardia de b7.",
    "throne-anvil": "El trono vacío es hostil a los soldados. Atrapa contra él al guardia de c4.",
    "double-take":
      "Un soldado puede deslizarse sobre el trono vacío. Cae donde ambas trampas se cierren a la vez.",
    "kings-blade":
      "El Rey está armado: puede cerrar una trampa como cualquier soldado. Un paso desde el trono basta.",
    "road-to-corner": "Un camino está cortado. La otra fila está libre: recórrela hasta el final.",
    "royal-fork":
      "Desde la fila superior el Rey mira ambas esquinas. Ningún asaltante puede cerrar las dos puertas.",
    "bar-the-door": "Al Rey le queda un solo camino abierto. Pon un asaltante en él.",
    "take-the-king":
      "Lejos del trono bastan dos asaltantes — y el tuyo debe hacer el movimiento que cierra.",
    "wall-of-four":
      "En su trono, el Rey debe quedar rodeado por los cuatro lados. Falta un muro.",
    "fourth-wall": "Junto al trono, el propio trono vacío cierra un lado. Cierra el último.",
    "close-the-ring": "Un anillo intacto de asaltantes gana. Queda un hueco: séllalo.",
  },

  victoryRaiders: "Triunfan los Asaltantes",
  victoryKing: "El Rey prevalece",
  victoryDraw: "Tablas",
  victoryReview: "Revisar el tablero",

  // Session 8c
  motifGuillotine: "Guillotina",
  motifSnapTrap: "Cepo",
  motifClamp: "Mordaza",
  motifSpring: "Resorte",
  motifBalling: "Enjambre",
  motifCordon: "Cordón",
  motifCornerFight: "Lucha de esquina",
  motifTwinTowers: "Torres gemelas",
  tagAttackers: "Juegan los asaltantes",
  tagDefenders: "Juega el bando del Rey",
  tagMoves1: "Una jugada",
  tagMoves2: "Dos jugadas",
  tagMoves3: "Tres jugadas",
  tagMoves4: "Cuatro jugadas",
  tagSoldierGivenUp: "Se entrega un soldado",
};

const ga: Translations = {
  subtitle: "Hnefatafl Gaelach \u00b7 7\u00d77",
  howToPlay: "Conas imirt",
  // DRAFT — unreviewed, like the rest of this table.
  menu: "Roghchlár",
  language: "Teanga",
  // "Zen" is a name here, not translated interface — same in all three tables.
  zenShort: "Zen",
  // DRAFT (app drawer) — unreviewed, like the rest of this table.
  drawerPlay: "Imir",
  drawerLearn: "Foghlaim",
  drawerTools: "Uirlisí",
  about: "Maidir leis",
  aboutTitle: "Maidir le Brandubh",
  aboutBody1:
    "Is é Brandubh (“fiach dubh”) ball Éireannach an teaghlaigh tafl: troid éagothrom ar chlár 7×7. Briseann taobh an rí i dtreo na gcúinní agus déanann na creachadóirí, dhá oiread acu, iarracht gach bóthar a dhúnadh.",
  aboutBody2:
    "Ní mhaireann aon leabhar rialacha meánaoiseach iomlán, mar sin is atógáil gach riail fhoilsithe. Leanann na leaganacha anseo na léamha nua-aimseartha is coitianta; nuair a easaontaíonn na foinsí dáiríre, ligeann na rialacha saincheaptha duit taobh a roghnú.",
  aboutBody3:
    "Tá gach rud saor in aisce agus ritheann sé i do bhrabhsálaí — fanann cluichí, socruithe agus dul chun cinn ar an ngléas seo. Ní sheoltar aon rud áit ar bith.",

  raiders: "Foghlaithe",
  kingsSide: "Taobh an R\u00ed",

  drawMessage: "Cluiche cothrom \u2014 th\u00e1inig an su\u00edomh ar\u00eds.",
  defendersWinEscape:
    "Taobh an R\u00ed a bhuaigh \u2014 D'\u00e9alaigh an R\u00ed go dt\u00ed an c\u00fainne!",
  attackersWinCapture:
    "Foghlaithe a bhuaigh \u2014 Gabhadh an R\u00ed!",
  attackersWinEncirclement:
    "Foghlaithe a bhuaigh \u2014 T\u00e1 taobh an R\u00ed timpeallaithe!",
  attackersWinRepetition:
    "Foghlaithe a bhuaigh \u2014 Athr\u00e1: caillteanas do thaobh an R\u00ed.",
  attackersWinNoMoves:
    "Foghlaithe a bhuaigh \u2014 N\u00edl bogadh ar bith f\u00e1gtha.",
  defendersWinNoMoves:
    "Taobh an R\u00ed a bhuaigh \u2014 N\u00edl bogadh ar bith f\u00e1gtha.",

  toMove: "le bogadh",
  yourMove: "Do sheal",
  thinkingSuffix: "ag smaoineamh\u2026",
  moveLabel: "bogadh",

  raidersLost: "Foghlaithe caillte",
  defendersLost: "Cosant\u00f3ir\u00ed caillte",

  newGame: "Cluiche nua",
  undo: "Cealaigh",
  rules: "Rialacha",

  playAs: "Imir mar",
  king: "R\u00ed",
  overTheBoard: "Os comhair a ch\u00e9ile",
  aiLevel: "Deacracht",
  easy: "\u00c9asca",
  medium: "Me\u00e1nach",
  hard: "Deacair",
  ollamh: "Ollamh",
  variant: "Leagan",
  theme: "Téama",
  attackerIcon: "Deilbhín foghlaí",
  cornerIcon: "Cúinní",
  kingIcon: "Deilbhín rí",
  defenderIcon: "Deilbhín cosantóra",
  colourTheme: "Téama datha",
  pieceColours: "Dathanna na bhfear",
  defenders: "Cosantóirí",
  pieceColourDefault: "Réamhshocrú",
  design: "Dear do chlár",
  done: "Déanta",
  close: "Dún",
  settings: "Socruithe",
  sectionGame: "Cluiche",
  sectionMatch: "Comórtas",
  sectionAppearance: "Cuma",

  prevMove: "An bogadh roimhe seo",
  nextMove: "An chéad bhogadh eile",
  reviewingLabel: "Ag athbhreithniú",
  liveLabel: "Beo",
  // DRAFT (unreviewed) \u2014 like the rest of this table.
  lineEndLabel: "Deireadh na l\u00edne",
  latest: "Is déanaí",
  playFromHere: "Imir as seo",
  playFromHereVsAi: "Imir as seo in aghaidh an ríomhaire",
  proposeTakeback: "Mol aisghlacadh",
  takebackTitle: "An bogadh deireanach a aisghlacadh?",
  takebackBody: "Ba cheart don bheirt imreoir aontú sula n-aisghlactar bogadh.",
  allow: "Ceadaigh",
  decline: "Diúltaigh",
  branchHint: "Téigh siar go bogadh níos luaithe, agus lean ar aghaidh as sin.",

  resign: "Géill",
  resignTitle: "An gcluiche a ghéilleadh?",
  resignBody: "Géilleann tú an cluiche do do chéile comhraic.",
  attackersWinResign: "Foghlaithe a bhuaigh — Ghéill taobh an Rí.",
  defendersWinResign: "Taobh an Rí a bhuaigh — Ghéill na Foghlaithe.",

  clock: "Clog",
  clockOff: "Múchta",
  timeControlLabel: "Rialú ama",
  customTimeControl: "Saincheaptha",
  minutesLabel: "Nóiméid",
  incrementLabel: "Incrimint (s)",
  pause: "Sos",
  resume: "Lean ar aghaidh",
  flagLabel: "Ama caite",
  attackersWinTime: "Foghlaithe a bhuaigh — Rith taobh an Rí as am.",
  defendersWinTime: "Taobh an Rí a bhuaigh — Rith na Foghlaithe as am.",
  catBullet: "Piléar",
  catBlitz: "Splanc",
  catRapid: "Tapa",

  zenMode: "Mód zen",
  zenHint:
    // DRAFT — unreviewed, like the rest of this table.
    "Clár ciúin — na píosaí, an seal, an clog, an loga bogtha agus an nascleanúint bogtha amháin. Ní thagann na rialuithe ach nuair a chríochnaíonn cluiche.",
  zenShowExtras: "Taispeáin freisin sa mhód Zen",
  on: "Ar si\u00fal",
  off: "As",
  zenElScoreboard: "Scórchlár na sraithe",
  zenElCaptured: "Píosaí gafa",
  zenElNav: "Nascleanúint bogtha",
  zenElRules: "Cnaipe rialacha",
  zenElSettings: "Painéil socruithe",

  customRulesTitle: "Rialacha saincheaptha",
  ruleArmedKing: "Rí armtha",
  ruleArmedKingHint: "is féidir leis an rí cabhrú le gabháil",
  ruleThroneHostileSoldiers: "Ríchathaoir naimhdeach do shaighdiúirí",
  ruleThroneHostileSoldiersHint: "cabhraíonn an ríchathaoir fholamh le saighdiúirí a ghabháil",
  ruleThroneHostileKing: "Ríchathaoir naimhdeach don rí",
  ruleThroneHostileKingHint: "áirítear an ríchathaoir fholamh mar bhalla in aghaidh an rí",
  ruleKingReoccupyThrone: "Féadann an rí filleadh ar an ríchathaoir",
  ruleKingReoccupyThroneHint: "is féidir leis an rí filleadh ar an ríchathaoir",
  ruleSoldiersPassThrone: "Saighdiúirí thar an ríchathaoir",
  ruleSoldiersPassThroneHint: "féadann saighdiúirí sleamhnú thar an ríchathaoir fholamh",
  ruleCornersHostile: "Cúinní naimhdeach",
  ruleCornersHostileHint: "cabhraíonn na cúinní le gabháil, an rí san áireamh",
  ruleStrongKingOnThrone: "Rí láidir ar an ríchathaoir",
  ruleStrongKingOnThroneHint: "ar an ríchathaoir teastaíonn na ceithre thaobh ón rí",
  ruleStrongKingAdjacentThrone: "Rí láidir in aice na ríchathaoireach",
  ruleStrongKingAdjacentThroneHint: "in aice na ríchathaoireach teastaíonn na ceithre thaobh ón rí",
  // DRAFT (unreviewed) — like the rest of this table.
  ruleShieldwall: "Gabháil bhalla sciath",
  ruleShieldwallHint: "titeann sraith ar an imeall, dúnta agus os comhair a chéile, le chéile (Cóbanhávan); maireann an rí sa tsraith",
  ruleEncirclementWin: "Bua trí thimpeallú",
  ruleEncirclementWinHint: "buann na foghlaithe trí thaobh an rí a thimpeallú go hiomlán",
  repetitionResultLabel: "Ar athrá faoi thrí",
  repetitionOptionNone: "Déan neamhaird",
  repetitionOptionDraw: "Cluiche cothrom",
  repetitionOptionLossDefenders: "Cailleann taobh an Rí",

  matchSet: "Sraith",
  gameWord: "Cluiche",
  player1: "Imreoir 1",
  player2: "Imreoir 2",
  setStanding: "Staid na sraithe",
  kingCounter: "Taobh an Rí",
  raidersCounter: "Foghlaithe",
  movesWord: "bogadh",
  drawShort: "Cothrom",
  bestWin: "is fearr",
  nextGame: "An chéad chluiche eile",
  newSet: "Sraith nua",
  nextSet: "An chéad sraith eile",
  newMatch: "Comórtas nua",
  newMatchTitle: "Comórtas nua a thosú?",
  newMatchBody: "Glanann sé seo an scór reatha agus tosaíonn an comórtas as an nua.",
  newGameTitle: "Cluiche nua a thosú?",
  newGameBody: "Cuireann sé seo deireadh leis an gcluiche reatha agus glanann an clár.",
  setLength: "Cluichí sa sraith",
  matchScore: "Comórtas",
  setsWord: "sraith",
  drawsShort: "cothrom",
  sidesSwapNext: "Malartaítear na taobhanna — tosaigh an chéad chluiche eile.",
  setInProgress: "Dhá chluiche is ea sraith; glacann gach imreoir taobh amháin i ngach ceann.",
  winsTheSet: "buann an tsraith!",
  winsSetOnMoves: "buann an tsraith — níos lú bogadh chun na bua.",
  setDrawn: "Sraith cothrom.",
  wonAs: "bhuaigh mar",

  moveLog: "Loga bogtha",

  chooseGame: "Roghnaigh do chluiche",
  backToStart: "Ar ais go dtí an scáileán tosaigh",
  playVsAi: "In aghaidh an r\u00edomhaire",
  otbOverlay: "Os comhair a ch\u00e9ile",
  withFriend: "le cara i bpearsa",
  chooseDifficulty: "Roghnaigh an deacracht",
  resumeBody: "Tá cluiche ar siúl agat.",
  resumeGame: "Lean ar aghaidh leis an gcluiche",

  continueFromMove: "Lean ar aghaidh \u00f3 bhogadh",
  movesWillBeLost: "Caillfear gach bogadh ina dhiaidh seo.",
  back: "Ar ais",
  confirm: "Deimhnigh",

  rulesTitle: "Conas Brandubh a imirt",
  rulesIntro:
    'Is \u00e9 Brandubh (\u201cfiach dubh\u201d) an leagan Gaelach 7\u00d77 de hnefatafl \u2014 cluiche cogaidh Lochlannach-Gaelach neamhshim\u00e9adrach. ',
  rulesIntroNot: "N\u00ed",
  rulesIntroDifferent:
    " ficheall shim\u00e9adrach \u00e9: t\u00e1 ruda\u00ed \u00e9ags\u00fala ag teast\u00e1il \u00f3n d\u00e1 thaobh.",
  sectionArmies: "Na sluaite",
  theKing: "An R\u00ed",
  kingSitsOn: "ina shu\u00ed ar an r\u00edchathaoir sa l\u00e1r le",
  fourDefenders: "4 chosant\u00f3ir",
  outnumbered: "T\u00e1 a thaobh faoi mh\u00edbhunt\u00e1iste uimhreach.",
  eightAttackers: "8 bhfoghla\u00ed",
  attackersRing:
    "(creachad\u00f3ir\u00ed) timpeall na n-imeall. Bogann siad ar dt\u00fas.",
  sectionMovement: "Gluaiseacht",
  movementRook:
    "Bogann gach p\u00edosa mar chaiseal: aon l\u00edon cearn\u00f3g folamh suas, s\u00edos n\u00f3 trasna.",
  movementNoJumps:
    "N\u00ed l\u00e9imeann aon ph\u00edosa. N\u00ed cheada\u00edtear bogadh trasn\u00e1nach.",
  movementThroneOnly: "N\u00ed f\u00e9idir ach leis an R\u00ed fanacht ar an",
  throne: "r\u00edchathaoir",
  orA: "(l\u00e1r) n\u00f3",
  corner: "c\u00fainne",
  movementThronePass:
    ". F\u00e9adann saighdi\u00fair\u00ed dul thar an r\u00edchathaoir fholamh ach n\u00ed f\u00e9idir leo stopadh uirthi.",
  sectionCapturing: "Gabh\u00e1il",
  captureTrap1:
    "Cuir saighdi\u00fair namhad i ngaiste idir dh\u00e1 ph\u00edosa de do chuid f\u00e9in (n\u00f3 do ph\u00edosa agus cearn\u00f3g naimhdeach) ar l\u00edne \u2014 bainfear \u00e9. N\u00ed ghabhtar th\u00fa ach tr\u00ed bhogadh ",
  captureInto: "isteach",
  captureTrap2:
    " sa ghaiste; t\u00e1 s\u00e9 s\u00e1bh\u00e1ilte bogadh idir dh\u00e1 namhaid.",
  captureHostile:
    "Is cearn\u00f3ga naimhdeacha iad na c\u00fainn\u00ed agus an r\u00edchathaoir fholamh a chabhra\u00edonn le gabh\u00e1il.",
  captureMultiple:
    "Is f\u00e9idir roinnt p\u00edosa\u00ed a ghabh\u00e1il le bogadh amh\u00e1in.",
  weaponlessPrefix: "Sa leagan seo t\u00e1 an R\u00ed ",
  weaponless: "gan arm",
  weaponlessSuffix:
    " \u2014 n\u00ed f\u00e9idir leis cabhr\u00fa le gabh\u00e1il riamh.",
  sectionWinning: "Buachan",
  defendersWinLabel: "Cosant\u00f3ir\u00ed a bhuann",
  defendersWinRule: "m\u00e1 shroicheann an R\u00ed aon",
  attackersWinLabel: "Foghlaithe a bhuann",
  attackersWinRule:
    "m\u00e1 ghabhann siad an R\u00ed \u2014 \u00e1 thimpeall\u00fa ar dh\u00e1 thaobh os comhair a ch\u00e9ile amuigh ar an gcl\u00e1r, n\u00f3 ar na ceithre thaobh nuair at\u00e1 s\u00e9 ina shu\u00ed ar an r\u00edchathaoir n\u00f3 in aice l\u00e9i.",
  noMoveLoses: "Cailleann imreoir gan bogadh dl\u00edthi\u00fail.",
  repetitionDraw:
    "Is cluiche cothrom \u00e9 su\u00edomh a thagann tr\u00ed huaire.",
  repetitionLossDefenders:
    "Is caillteanas \u00e9 su\u00edomh a thagann tr\u00ed huaire do thaobh an R\u00ed.",
  encirclementWinRule:
    "m\u00e1 thimpealla\u00edonn siad taobh an R\u00ed go hioml\u00e1n le f\u00e1inne gan bhriseadh \u2014 gan teorainn an chl\u00e1ir a \u00fas\u00e1id.",
  playButton: "Imir",

  demoCta: "Taispe\u00e1in dom conas",
  demoTitle: "Conas imirt",
  demoGoalLabel: "An sprioc",
  demoGoal: "Faigh an R\u00ed go dt\u00ed an c\u00fainne.",
  demoGoalByVariant: {
    walker: "Faigh an R\u00ed go dt\u00ed an c\u00fainne.",
    wtf: "Faigh an R\u00ed go dt\u00ed an c\u00fainne.",
  },
  demoGoalHint: "Imr\u00edonn t\u00fa taobh an R\u00ed. Sroich aon cheann de na ceithre ch\u00fainne chun an bua a fh\u00e1il.",
  demoCapturesTitle: "Gabh\u00e1il",
  demoCapturesHint:
    "S\u00e1innigh p\u00edosa namhad idir dh\u00e1 cheann de do chuidse \u2014 caithfidh tusa bogadh isteach sa s\u00e1inn.",
  demoCapHorizontal: "S\u00e1innithe idir dh\u00e1 fhoghla\u00ed, \u00f3 thaobh go taobh.",
  demoCapVertical: "\u2026n\u00f3 \u00f3 bhun go barr.",
  demoCapCorner: "\u00c1ir\u00edtear c\u00fainne mar fhoghla\u00ed freisin.",
  demoCapThrone: "\u00c1ir\u00edtear r\u00edchathaoir fholamh mar fhoghla\u00ed freisin.",
  demoThroneKing: "N\u00ed f\u00e9idir leis an r\u00edchathaoir dochar a dh\u00e9anamh don R\u00ed, ach is f\u00e9idir leis na c\u00fainn\u00ed.",

  variantNames: {
    walker: "Brandubh \u00b7 Walker",
    wtf: "Brandubh \u00b7 Cumann Domhanda Tafl",
    custom: "Saincheaptha",
  },
  variantBlurbs: {
    walker:
      "At\u00f3g\u00e1il le Damian Walker (Cyningstan, 2011), bunaithe ar alt MacWhite 1946. N\u00ed cearn\u00f3g naimhdeach \u00ed an r\u00edchathaoir. Gan riail r\u00ed l\u00e1idir \u2014 gabhtar an r\u00ed ag d\u00e1 ph\u00edosa in \u00e1it ar bith ar an gcl\u00e1r. Is cluiche cothrom an athr\u00e1.",
    wtf:
      "Rialacha oifigi\u00fala com\u00f3rtais CDT (aagenielsen.dk). T\u00e1 an r\u00edchathaoir fholamh naimhdeach do shaighdi\u00fair\u00ed ach n\u00ed don r\u00ed riamh. T\u00e1 ceithre thaobh de dh\u00edth ar an r\u00ed ar an r\u00edchathaoir. Buann timpeall\u00fa. Is caillteanas an athr\u00e1 don taobh cosanta.",
    custom: "Do shraith rialacha f\u00e9in.",
  },
  gameFileTitle: "Easp\u00f3rt\u00e1il / iomp\u00f3rt\u00e1il cluiche",
  exportLabel: "Easp\u00f3rt\u00e1il an cluiche seo",
  exportDownload: "\u00cdosl\u00f3d\u00e1il",
  exportCopy: "C\u00f3ipe\u00e1il",
  exportCopied: "C\u00f3ipe\u00e1ilte",
  exportCopyFailed: "Theip ar an gc\u00f3ipe\u00e1il",
  exportHint: "Comhad t\u00e9acs .tafl: ceannt\u00e1sc clibeanna agus liosta na mbeart, ar n\u00f3s PGN fichille.",
  exportNothingYet: "D\u00e9an beart ar dt\u00fas \u2014 n\u00edl aon rud le heasp\u00f3rt\u00e1il go f\u00f3ill.",
  importLabel: "Iomp\u00f3rt\u00e1il cluiche",
  importPlaceholder: "Greamaigh cluiche isteach anseo\u2026",
  importLoad: "Luchtaigh cluiche",
  importChooseFile: "Roghnaigh comhad\u2026",
  importHint: "Luchta\u00edtear an cluiche i m\u00f3d athbhreithnithe: is f\u00e9idir si\u00fal tr\u00edd n\u00f3 imirt ar aghaidh \u00f3 aon su\u00edomh.",
  importLoaded: "Cluiche luchtaithe",
  importNotes: "Luchtaithe, le n\u00f3ta\u00ed:",
  importFailed: "N\u00edorbh fh\u00e9idir an cluiche sin a iomp\u00f3rt\u00e1il",
  importErrNoMoves: "n\u00edor aims\u00edodh aon bheart ann.",
  importErrBadTag: "n\u00edorbh fh\u00e9idir l\u00edne den cheannt\u00e1sc a l\u00e9amh.",
  importErrUnknownVariant: "n\u00edl an sraith rialacha sin ar eolas ag an aip seo.",
  importErrMissingRules: "n\u00ed m\u00f3r do chluiche saincheaptha a chlib [Rules] f\u00e9in a bheith leis.",
  importErrBadToken: "n\u00edl rud \u00e9igin i liosta na mbeart ina bheart.",
  importErrIllegalMove: "n\u00edl ceann de na bearta dleathach sa su\u00edomh sin.",
  importErrMovesAfterEnd: "leanann liosta na mbeart ar aghaidh tar \u00e9is dheireadh an chluiche.",
  importErrCaptureMismatch: "n\u00ed r\u00e9it\u00edonn na gabh\u00e1lacha leis an sraith rialacha seo.",
  importErrUnreadableFile: "n\u00edorbh fh\u00e9idir an comhad sin a l\u00e9amh.",
  zenElGameFile: "Easp\u00f3rt\u00e1il / iomp\u00f3rt\u00e1il",

  // DRAFT (Session 7b) \u2014 unreviewed, like the rest of this table. Present so
  // the locale stays complete while it waits for review; `ga` is not offered.
  flipBoard: "Iompaigh an cl\u00e1r",
  flipBoardH: "Iompaigh an cl\u00e1r \u00f3 chl\u00e9 go deas",
  flipBoardV: "Iompaigh an cl\u00e1r \u00f3 bharr go bun",
  // DRAFT (unreviewed machine translation) \u2014 `ga` stays out of VISIBLE_LANGS.
  evalLabel: "Luach\u00e1il an innill",
  evalShow: "Taispe\u00e1in an luach\u00e1il",
  evalHide: "Folaigh an luach\u00e1il",
  evalThinking: "\u00c1 luach\u00e1il\u2026",
  evalAttackersWin: "Buann na foghlaithe",
  evalDefendersWin: "Buann an r\u00ed",
  zenElEval: "Luach\u00e1il an innill",
  analysisMode: "Anail\u00eds",
  analysisExit: "F\u00e1g an anail\u00eds",
  analysisHint: "Bog an d\u00e1 thaobh gan bhac \u00b7 t\u00e1 an r\u00edomhaire agus an clog ar sos \u00b7 n\u00ed sh\u00e1bh\u00e1iltear faic",

  // DRAFT (Session 7c) — unreviewed, like the rest of this table.
  moveTree: "Malairt\u00ed",
  moveTreeEmpty: "Imir beart chun l\u00edne a thos\u00fa. M\u00e1 th\u00e9ann t\u00fa siar agus imirt rud eile, coime\u00e1dtar an dá cheann.",
  moveTreeNotSaved: "N\u00ed mhaireann na malairt\u00ed ach don seisi\u00fan seo \u2014 n\u00ed sh\u00e1bh\u00e1iltear leis an gcluiche iad.",
  promoteVariation: "D\u00e9an an phr\u00edomhl\u00edne de",
  deleteVariation: "Scrios an mhalairt",

  // DRAFT (Session 7d) — unreviewed, like the rest of this table.
  // DRAFT (unreviewed) \u2014 like the rest of this table.
  // DRAFT (unreviewed) \u2014 like the rest of this table.
  puzzlePrompt: "Aimsigh beart n\u00edos fearr",
  puzzleHint: "Imir an beart a cheap t\u00fa ab fhearr anseo.",
  puzzleThinking: "Ag oibri\u00fa amach an fhreagra\u2026",
  puzzleWrong: "N\u00ed hea, go d\u00edreach.",
  puzzleTryAgain: "Bain triail eile as",
  puzzleReveal: "Taispe\u00e1in an r\u00e9iteach",
  puzzleSolved: "Ceart \u2014 sin beart an innill.",
  puzzleSolvedLate: "Fuair t\u00fa \u00e9.",
  puzzleRevealed: "T\u00e1 beart an innill ar an gcl\u00e1r.",
  puzzleDone: "Cr\u00edochnaithe",
  puzzlePractise: "Cleachtadh",
  // DRAFT (unreviewed) \u2014 like the rest of this table.
  puzzleSkip: "L\u00e9im thairis",
  puzzleNext: "Ar aghaidh",
  puzzleLessonDone: "B'in an ceann deireanach \u2014 ceacht cr\u00edochnaithe.",
  thinkHarder: "Smaoinigh n\u00edos doimhne",
  thinkingDeeper: "Ag smaoineamh\u2026",
  reviewTitle: "Athbhreithni\u00fa ar an gcluiche",
  reviewWorst: "Na bearta ba chostasa\u00ed",
  reviewYourWorst: "Do bhearta ba chostasa\u00ed",
  reviewClean: "Gan both\u00fan is fi\u00fa a lua \u2014 cluiche glan.",
  evalGraphLabel: "Mar a luaigh an cluiche, beart ar bheart",
  evalGraphStart: "Su\u00edomh tosaigh",
  moveWord: "Beart",
  annotateTitle: "Athbhreithni\u00fa ar an gcluiche",
  annotateRun: "D\u00e9an anail\u00eds ar an gcluiche",
  annotateAgain: "D\u00e9an anail\u00eds ar\u00eds",
  annotateStop: "Stad",
  annotateProgress: "Ag d\u00e9anamh anail\u00edse ar bheart",
  annotateHint: "Cuardaítear gach su\u00edomh ar\u00eds agus marc\u00e1iltear na h\u00e1iteanna ar iompaigh an cluiche.",
  // DRAFT (unreviewed) \u2014 like the rest of this table.
  reviewAvgLoss: "Me\u00e1nchaillteanas",
  reviewLearn: "Foghlaim \u00f3 do bhot\u00fain",
  markOne_inaccuracy: "M\u00edchruinneas",
  markOne_mistake: "Both\u00fan",
  markOne_blunder: "Droch-bhoth\u00fan",
  mark_inaccuracy: "m\u00edchruinneas",
  mark_mistake: "botúin",
  mark_blunder: "botúin mh\u00f3ra",

  // DRAFT (Session 7e) — unreviewed, like the rest of this table.
  positionTitle: "Cum su\u00edomh",
  positionHint:
    "L\u00edne amh\u00e1in in aghaidh an chl\u00e1ir: seacht r\u00e9im\u00edr \u00f3 bharr, A foghlaí \u00b7 D cosant\u00f3ir \u00b7 K r\u00ed \u00b7 digit do ch\u00e9imeanna folmha, ansin an taobh a bhogann (a n\u00f3 d). Osclaítear su\u00edomh greamaithe san anail\u00eds agus n\u00ed sh\u00e1bh\u00e1iltear thar do chluiche \u00e9 riamh.",
  positionCurrent: "An su\u00edomh seo",
  positionPaste: "Greamaigh su\u00edomh",
  positionLoad: "D\u00e9an anail\u00eds ar an su\u00edomh seo",
  positionRejected: "N\u00edorbh fh\u00e9idir an su\u00edomh sin a l\u00e9amh \u2014",
  positionRank: "r\u00e9im\u00edr",
  positionLoaded: "Ag d\u00e9anamh anail\u00edse ar shu\u00edomh greamaithe",
  positionExportBlocked:
    "T\u00e1 an easp\u00f3rt\u00e1il m\u00fachta agus t\u00fa ag anail\u00edsiú su\u00edomh greamaithe \u2014 taifead\u00e1nn comhad cluiche bearta \u00f3n oscailt, agus n\u00edl aon cheann acu sin ag an su\u00edomh seo.",

  chooseSide: "C\u00e9n taobh a imreoidh t\u00fa?",
  sideKingVerb: "ÉALAIGH",
  sideKingHint: "An rí + 4 laoch — treoraigh an rí go cúinne",
  sideRaidersVerb: "GABH",
  sideRaidersHint: "8 foghlaithe — iadh timpeall ar an rí agus gabh é",

  // \u2500\u2500 MACHINE DRAFT \u2014 pending human review \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Everything below (like the rest of this ga table) is an unreviewed draft;
  // the ga locale stays out of VISIBLE_LANGS until it is signed off.
  learnTitle: "Foghlaim Brandubh",
  learnObjectives: "An sprioc",
  learnObjectivesHint: "F\u00e9ach conas a bhuann gach taobh agus conas a oibr\u00edonn gabh\u00e1lacha.",
  learnRules: "Na rialacha",
  learnRulesHint: "An leagan gasta, agus na rialacha ioml\u00e1na taobh thiar de.",
  learnTutorials: "Bearta r\u00e9amhshocraithe",
  learnTutorialsHint: "Dh\u00e1 chleachtadh d\u00e9ag ghearra \u2014 aimsigh an beart buach.",

  quickRulesTab: "Rialacha gasta",
  fullRulesTab: "Rialacha ioml\u00e1na",
  quickGoalKing: "Buann taobh an R\u00ed ach an R\u00ed a thabhairt chuig c\u00fainne ar bith.",
  quickGoalRaiders: "Buann na foghlaithe ach an R\u00ed a ghabh\u00e1il.",
  quickMovement:
    "Bogann gach p\u00edosa ar n\u00f3s caisle\u00e1in fichille: fad ar bith feadh sraithe n\u00f3 col\u00fain, gan l\u00e9im.",
  quickCapture:
    "Gabh saighdi\u00fair ach \u00e9 a dh\u00fanadh idir dh\u00e1 ph\u00edosa de do chuid i l\u00edne dh\u00edreach. Cuntar c\u00fainne \u2014 n\u00f3 an r\u00edchathaoir fholamh \u2014 mar cheann de do chuid.",
  quickKingCaptureStrong:
    "Titeann an R\u00ed idir bheirt fhoghlaithe \u2014 ach ar an r\u00edchathaoir n\u00f3 lena taobh, n\u00ed m\u00f3r \u00e9 a thimpeall\u00fa ar na ceithre thaobh.",
  quickKingCaptureSimple:
    "Titeann an R\u00ed mar shaighdi\u00fair: gafa idir bheirt fhoghlaithe, \u00e1it ar bith ar an gcl\u00e1r.",
  quickSpecialSquares:
    "N\u00ed fh\u00e9adann ach an R\u00ed stopadh ar an r\u00edchathaoir n\u00f3 ar ch\u00fainne. T\u00e1 s\u00e9 s\u00e1bh\u00e1ilte si\u00fal idir bheirt naimhde \u2014 n\u00ed dh\u00fanann gaiste ach nuair a dh\u00fanann an namhaid \u00e9.",

  tutorialProgress: "r\u00e9itithe",
  tutorialYouPlayAs: "Imr\u00edonn t\u00fa:",
  tutorialShowHint: "Taispe\u00e1in leid",
  // Draft, like the rest of this table \u2014 not signed off by an Irish speaker.
  tutorialWrongTitle: "N\u00ed h\u00e9 sin an beart",
  tutorialGoalLabel: "Iarrann an cleachtadh seo:",
  tutorialMistakes: {
    roadOpen:
      "F\u00e9adann an R\u00ed c\u00fainne a bhaint amach lena ch\u00e9ad bheart eile f\u00f3s. Sin \u00e9 an b\u00f3thar le dh\u00fanadh.",
    losesGame: "Tugann sin an cluiche uait \u2014 buann an taobh eile l\u00e1ithreach.",
    noCapture:
      "N\u00edor gabhadh aon rud. N\u00ed thiteann p\u00edosa ach nuair a dh\u00fanann do bheart isteach idir dh\u00e1 chearn\u00f3g naimhdeacha \u00e9.",
    wrongCapture: "Gabhann sin p\u00edosa, ach n\u00ed h\u00ed sin an gabh\u00e1il at\u00e1 i gceist anseo.",
    kingStands:
      "T\u00e1 an R\u00ed ina sheasamh f\u00f3s. N\u00ed thiteann s\u00e9 ach nuair is leatsa an beart d\u00fanta.",
    noEscape:
      "N\u00edor bhain an R\u00ed c\u00fainne amach \u2014 n\u00ed chuntar mar \u00e9al\u00fa ach na ceithre ch\u00fainne.",
    notForcing:
      "N\u00ed chuireann sin iallach ar an mbua: f\u00e9adann na foghlaithe an b\u00f3thar a dh\u00fanadh ina bhfreagra.",
  },
  tutorialTryAgain: "Bain triail eile as",
  tutorialSolvedTitle: "R\u00e9itithe!",
  tutorialNext: "An ch\u00e9ad chleachtadh eile",
  tutorialReset: "Athshocraigh",
  tutorialBackToList: "Gach beart",
  tutorialAllDone: "An d\u00e1 cheann d\u00e9ag r\u00e9itithe \u2014 t\u00e1 t\u00fa r\u00e9idh do chluiche ceart.",
  tutorialTitles: {
    "pincer": "An teanchair",
    "corner-anvil": "Inneoin an ch\u00fainne",
    "throne-anvil": "Inneoin na r\u00edchathaoireach",
    "double-take": "Dh\u00e1 cheann d'aon bhuille",
    "kings-blade": "Lann an R\u00ed",
    "road-to-corner": "An b\u00f3thar oscailte",
    "royal-fork": "An gabhal r\u00edoga",
    "bar-the-door": "Cuir barra ar an doras",
    "take-the-king": "Gabh an R\u00ed",
    "wall-of-four": "Balla an cheathrair",
    "fourth-wall": "An ceathr\u00fa balla",
    "close-the-ring": "D\u00fan an f\u00e1inne",
  },
  tutorialGoals: {
    "pincer": "Gabh cosant\u00f3ir ach \u00e9 a dh\u00fanadh idir bheirt fhoghlaithe.",
    "corner-anvil": "Gabh an cosant\u00f3ir le c\u00fainne naimhdeach mar dhara foghla\u00ed.",
    "throne-anvil": "Gabh an cosant\u00f3ir leis an r\u00edchathaoir fholamh mar inneoin.",
    "double-take": "Gabh dh\u00e1 fhoghla\u00ed le beart amh\u00e1in.",
    "kings-blade": "Bain \u00fas\u00e1id as an R\u00ed f\u00e9in chun foghla\u00ed a ghabh\u00e1il.",
    "road-to-corner": "\u00c9alaigh: tabhair an R\u00ed chuig c\u00fainne.",
    "royal-fork": "Bagair dh\u00e1 ch\u00fainne in \u00e9ineacht, ansin \u00e9alaigh (dh\u00e1 bheart).",
    "bar-the-door": "Coisc an R\u00ed \u00f3 \u00e9al\u00fa ar a ch\u00e9ad bheart eile.",
    "take-the-king": "Gabh an R\u00ed idir bheirt fhoghlaithe.",
    "wall-of-four": "Gabh an R\u00ed ar a r\u00edchathaoir.",
    "fourth-wall": "Gabh an R\u00ed le taobh a r\u00edchathaoireach.",
    "close-the-ring": "Buaigh ach an R\u00ed agus a gharda deireanach a thimpeall\u00fa.",
  },
  tutorialHints: {
    "pincer": "T\u00e1 foghla\u00ed ar ch\u00fal an chosant\u00f3ra cheana. Tabhair an ghialla eile s\u00edos col\u00fan c.",
    "corner-anvil": "Cuntar c\u00fainne mar ph\u00edosa namhad. Br\u00faigh garda b7 ina choinne.",
    "throne-anvil":
      "T\u00e1 an r\u00edchathaoir fholamh naimhdeach do shaighdi\u00fair\u00ed. S\u00e1innigh garda c4 ina coinne.",
    "double-take":
      "F\u00e9adann saighdi\u00fair sleamhn\u00fa thar an r\u00edchathaoir fholamh. Tuirling san \u00e1it a nd\u00fanann an d\u00e1 ghaiste in \u00e9ineacht.",
    "kings-blade":
      "T\u00e1 an R\u00ed armtha: f\u00e9adann s\u00e9 gaiste a dh\u00fanadh mar aon saighdi\u00fair. Is leor c\u00e9im amh\u00e1in \u00f3n r\u00edchathaoir.",
    "road-to-corner":
      "T\u00e1 b\u00f3thar amh\u00e1in d\u00fanta. T\u00e1 an tsraith eile saor \u2014 rith go dt\u00ed a deireadh \u00ed.",
    "royal-fork":
      "\u00d3n tsraith uachtarach feiceann an R\u00ed an d\u00e1 ch\u00fainne. N\u00ed f\u00e9idir le foghla\u00ed amh\u00e1in an d\u00e1 dhoras a dh\u00fanadh.",
    "bar-the-door": "N\u00edl ach b\u00f3thar amh\u00e1in oscailte ag an R\u00ed. Cuir foghla\u00ed air.",
    "take-the-king":
      "I bhfad \u00f3n r\u00edchathaoir is leor beirt fhoghlaithe \u2014 agus caithfidh do cheannsa an beart d\u00fanta a dh\u00e9anamh.",
    "wall-of-four":
      "Ar a r\u00edchathaoir n\u00ed m\u00f3r an R\u00ed a thimpeall\u00fa ar na ceithre thaobh. T\u00e1 balla amh\u00e1in in easnamh.",
    "fourth-wall":
      "Le taobh na r\u00edchathaoireach, d\u00fanann an r\u00edchathaoir fholamh f\u00e9in taobh amh\u00e1in. D\u00fan an ceann deireanach.",
    "close-the-ring": "Buann f\u00e1inne sl\u00e1n foghlaithe. T\u00e1 bearna amh\u00e1in f\u00e1gtha \u2014 d\u00fan \u00ed.",
  },

  victoryRaiders: "Bua na bhFoghlaithe",
  victoryKing: "An R\u00ed i r\u00e9im",
  victoryDraw: "Cluiche cothrom",
  victoryReview: "Athbhreithnigh an cl\u00e1r",

  // DRAFT (Session 8c) \u2014 unreviewed machine drafts, like the rest of this
  // table. Present so the locale stays complete; `ga` stays out of VISIBLE_LANGS.
  motifGuillotine: "An Ghilit\u00edn",
  motifSnapTrap: "Gaiste tobann",
  motifClamp: "Teannt\u00e1n",
  motifSpring: "Sprionga",
  motifBalling: "Saithe timpeall an R\u00ed",
  motifCordon: "Cord\u00fan",
  motifCornerFight: "Troid c\u00fainne",
  motifTwinTowers: "An d\u00e1 th\u00fair",
  tagAttackers: "Na foghlaithe le bogadh",
  tagDefenders: "Taobh an R\u00ed le bogadh",
  tagMoves1: "Beart amh\u00e1in",
  tagMoves2: "Dh\u00e1 bheart",
  tagMoves3: "Tr\u00ed bheart",
  tagMoves4: "Ceithre bheart",
  tagSoldierGivenUp: "Saighdi\u00fair \u00e1 thabhairt suas",
};

export const translations: Record<Lang, Translations> = { en, es, ga };
