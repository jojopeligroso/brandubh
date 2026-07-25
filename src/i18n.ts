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
  variant: string;

  // Move log
  moveLog: string;

  // Mode overlay
  chooseGame: string;
  playVsAi: string;
  otbOverlay: string;
  withFriend: string;

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
  playButton: string;

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
  variant: "Variant",

  moveLog: "Move log",

  chooseGame: "Choose your game",
  playVsAi: "Play vs AI",
  otbOverlay: "Over the board",
  withFriend: "with a friend in person",

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
  playButton: "Play",

  variantNames: {
    copenhagen: "Copenhagen Brandubh",
    weaponless: "Weaponless-King Brandubh",
  },
  variantBlurbs: {
    copenhagen:
      "Modern tournament reconstruction (World Tafl Federation). The king is armed and helps capture. He is caught between two raiders in the open, but must be surrounded on the throne.",
    weaponless:
      "Older \u2018historical\u2019 reading: the king carries no weapon and cannot take part in captures, so the defenders must clear his path with their four warriors alone. A tougher escape.",
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
  variant: "Variante",

  moveLog: "Registro de jugadas",

  chooseGame: "Elige tu juego",
  playVsAi: "Contra la IA",
  otbOverlay: "Frente al tablero",
  withFriend: "con un amigo en persona",

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
  playButton: "Jugar",

  variantNames: {
    copenhagen: "Brandubh de Copenhague",
    weaponless: "Brandubh del Rey Desarmado",
  },
  variantBlurbs: {
    copenhagen:
      "Reconstrucci\u00f3n moderna de torneo (Federaci\u00f3n Mundial de Tafl). El rey est\u00e1 armado y ayuda a capturar. Es atrapado entre dos asaltantes en campo abierto, pero debe ser rodeado en el trono.",
    weaponless:
      "Lectura \u2018hist\u00f3rica\u2019 m\u00e1s antigua: el rey no lleva arma y no puede participar en capturas, as\u00ed que los defensores deben despejar su camino con sus cuatro guerreros solos. Un escape m\u00e1s dif\u00edcil.",
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
  variant: "Leagan",

  moveLog: "Loga bogtha",

  chooseGame: "Roghnaigh do chluiche",
  playVsAi: "In aghaidh an r\u00edomhaire",
  otbOverlay: "Os comhair a ch\u00e9ile",
  withFriend: "le cara i bpearsa",

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
  playButton: "Imir",

  variantNames: {
    copenhagen: "Brandubh Ch\u00f3banh\u00e1van",
    weaponless: "Brandubh an R\u00ed gan Arm",
  },
  variantBlurbs: {
    copenhagen:
      "At\u00f3g\u00e1il nua-aimseartha com\u00f3rtais (Cumann Domhanda Tafl). T\u00e1 arm ag an R\u00ed agus cabbra\u00edonn s\u00e9 le gabh\u00e1il. Gabhtar \u00e9 idir dh\u00e1 fhoghlaithe san oscailt, ach caithfear \u00e9 a thimpeall\u00fa ar an r\u00edchathaoir.",
    weaponless:
      "An l\u00e9amh \u2018stairi\u00fail\u2019 n\u00edos sine: n\u00edl aon arm ag an R\u00ed agus n\u00ed f\u00e9idir leis p\u00e1irt a ghlacadh i ngabh\u00e1il, mar sin caithfidh na cosant\u00f3ir\u00ed a bhealach a ghlanadh lena gceathrar saighdi\u00fair\u00ed amh\u00e1in. \u00c9al\u00fa n\u00edos deacra.",
  },
};

export const translations: Record<Lang, Translations> = { en, es, ga };
