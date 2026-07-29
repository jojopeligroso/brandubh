export type Lang = "en" | "es" | "ga";

/** Languages shown in the UI toggle. Irish is available but hidden for now. */
export const VISIBLE_LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
];

export interface Translations {
  // Header
  subtitle: string;
  howToPlay: string;

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
  themeDefault: string;
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
}

const en: Translations = {
  subtitle: "Irish Hnefatafl \u00b7 7\u00d77",
  howToPlay: "How to play",

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
  themeDefault: "Theme default",
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
    "A calm, over-the-board board — just the pieces, whose turn it is, the clock and the move log. Game controls appear only when a game ends.",
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
  ruleThroneHostileKing: "Throne hostile to king",
  ruleThroneHostileKingHint: "the empty throne counts against the king",
  ruleKingReoccupyThrone: "King may re-enter throne",
  ruleKingReoccupyThroneHint: "the king can return to the throne",
  ruleSoldiersPassThrone: "Soldiers pass through throne",
  ruleSoldiersPassThroneHint: "soldiers may slide over the empty throne",
  ruleCornersHostile: "Corners hostile",
  ruleCornersHostileHint: "corners help capture, king included",
  ruleStrongKingOnThrone: "Strong king on throne",
  ruleStrongKingOnThroneHint: "on the throne the king needs all four sides",
  ruleStrongKingAdjacentThrone: "Strong king beside throne",
  ruleStrongKingAdjacentThroneHint: "beside the throne the king needs all four sides",
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
};

const es: Translations = {
  subtitle: "Hnefatafl Irland\u00e9s \u00b7 7\u00d77",
  howToPlay: "C\u00f3mo jugar",

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
  themeDefault: "Color del tema",
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
    "Un tablero sereno \u2014 solo las piezas, el turno, el reloj y el registro de jugadas. Los controles aparecen solo cuando termina una partida.",
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
};

const ga: Translations = {
  subtitle: "Hnefatafl Gaelach \u00b7 7\u00d77",
  howToPlay: "Conas imirt",

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
  aiLevel: "Leibh\u00e9al RI",
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
  themeDefault: "Dath an téama",
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
    "Clár ciúin — na píosaí, an seal, an clog agus an loga bogtha amháin. Ní thagann na rialuithe ach nuair a chríochnaíonn cluiche.",
  zenShowExtras: "Taispeáin freisin sa mhód Zen",
  on: "Air",
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
  ruleThroneHostileKingHint: "cuntar an ríchathaoir fholamh in aghaidh an rí",
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
  bestWin: "is fear",
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
    " ficheall shim\u00e9adrach \u00e9: t\u00e1 ruda\u00ed \u00e9ags\u00fala uaidh ag an d\u00e1 thaobh.",
  sectionArmies: "Na sluaite",
  theKing: "An R\u00ed",
  kingSitsOn: "ina shu\u00ed ar an r\u00edchathaoir l\u00e1r le",
  fourDefenders: "4 chosant\u00f3ir",
  outnumbered: "T\u00e1 a thaobh faoi mh\u00edbhunt\u00e1iste uimhreach.",
  eightAttackers: "8 bhfoghlaithe",
  attackersRing:
    "(creachad\u00f3ir\u00ed) timpeall na n-imeall. Bogann siad ar dt\u00fas.",
  sectionMovement: "Gluaiseacht",
  movementRook:
    "Bogann gach p\u00edosa mar chaiseal: aon l\u00edon cearn\u00f3g folamh suas, s\u00edos n\u00f3 trasna.",
  movementNoJumps:
    "N\u00ed l\u00e9imeann aon ph\u00edosa. N\u00ed chead\u00e1\u00edtear bogadh trasn\u00e1nach.",
  movementThroneOnly: "N\u00ed f\u00e9idir ach leis an R\u00ed fanacht ar an",
  throne: "r\u00edchathaoir",
  orA: "(l\u00e1r) n\u00f3",
  corner: "c\u00fainne",
  movementThronePass:
    ". F\u00e9adann saighdi\u00fair\u00ed dul thar an r\u00edchathaoir fholamh ach n\u00ed f\u00e9idir leo stopadh uirthi.",
  sectionCapturing: "Gabh\u00e1il",
  captureTrap1:
    "Cuir saighdi\u00fair namhad i ngaiste idir dh\u00e1 ph\u00edosa de do chuid f\u00e9in (n\u00f3 do ph\u00edosa agus cearn\u00f3g naimhdeach) ar l\u00edne \u2014 bainfear \u00e9. N\u00ed ghab\u00e1iltear t\u00fa ach tr\u00ed bhogadh ",
  captureInto: "isteach",
  captureTrap2:
    " sa ghaiste; t\u00e1 s\u00e9 s\u00e1bh\u00e1ilte bogadh idir dh\u00e1 namhaid.",
  captureHostile:
    "Is cearn\u00f3ga naimhdeacha iad na c\u00fainn\u00ed agus an r\u00edchathaoir fholamh a chabhra\u00edonn le gabh\u00e1il.",
  captureMultiple:
    "Is f\u00e9idir roinnt p\u00edosa\u00ed a ghab\u00e1il le bogadh amh\u00e1in.",
  weaponlessPrefix: "Sa leagan seo t\u00e1 an R\u00ed ",
  weaponless: "gan arm",
  weaponlessSuffix:
    " \u2014 n\u00ed f\u00e9idir leis cabhr\u00fa le gabh\u00e1il riamh.",
  sectionWinning: "Buachan",
  defendersWinLabel: "Cosant\u00f3ir\u00ed a bhuann",
  defendersWinRule: "m\u00e1 shroicheann an R\u00ed aon",
  attackersWinLabel: "Foghlaithe a bhuann",
  attackersWinRule:
    "m\u00e1 ghabhann siad an R\u00ed \u2014 \u00e1 thimpeall\u00fa ar dh\u00e1 thaobh os comhair a ch\u00e9ile san oscailt, n\u00f3 ar na ceithre thaobh nuair at\u00e1 s\u00e9 ina shu\u00ed ar an r\u00edchathaoir n\u00f3 in aice l\u00e9i.",
  noMoveLoses: "Cailleann imreoir gan bogadh dl\u00edthi\u00fail.",
  repetitionDraw:
    "Is cluiche cothrom \u00e9 su\u00edomh a thagann tr\u00ed huaire.",
  repetitionLossDefenders:
    "Is caillteanas \u00e9 su\u00edomh a thagann tr\u00ed huaire do thaobh an R\u00ed.",
  encirclementWinRule:
    "m\u00e1 thimpealla\u00edonn siad taobh an R\u00ed go hioml\u00e1n le fainne gan bhriseadh \u2014 gan teorainn an chlair a \u00fasaid.",
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
    custom: "Saincheap\u00faithe",
  },
  variantBlurbs: {
    walker:
      "At\u00f3g\u00e1il le Damian Walker (Cyningstan, 2011), bunaithe ar alt MacWhite 1946. N\u00ed cearn\u00f3g naimhdeach \u00ed an r\u00edchathaoir. Gan riail r\u00ed l\u00e1idir \u2014 gabhtar an r\u00ed ag d\u00e1 ph\u00edosa in \u00e1it ar bith ar an gclara\u00ed. Is cluiche cothrom an athr\u00e1.",
    wtf:
      "Rialacha oifigi\u00faila com\u00f3rtais CDT (aagenielsen.dk). T\u00e1 an r\u00edchathaoir fholamh naimhdeach do shaighdi\u00fair\u00ed ach n\u00ed don r\u00ed riamh. T\u00e1 ceithre thaobh de dh\u00edth ar an r\u00ed ar an r\u00edchathaoir. Buann timpeall\u00fa. Is caillteanas an athr\u00e1 don thaobh cosanta.",
    custom: "Do shraith rialacha f\u00e9in.",
  },
};

export const translations: Record<Lang, Translations> = { en, es, ga };
