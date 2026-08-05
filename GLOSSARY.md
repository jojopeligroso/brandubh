# Brandubh glossary

The Irish 7×7 tafl game, played against an engine, with the teaching apparatus
that surrounds it: rules tuition, post-game review, and training exercises.

This file is the project's agreed vocabulary. One word per idea, one idea per
word, in code and in copy. An `_Avoid_` line names a synonym that is banned in
prose; where code already uses the banned word as an identifier that is noted,
and the identifier stays put until it is worth renaming.

## Playing

**Raider**:
An attacking soldier; the side that surrounds the King.
_Avoid_: attacker (used in code as `"attackers"`, but not in copy), black

**Defender**:
A soldier of the King's side.
_Avoid_: white

**King**:
The single royal piece the raiders hunt and the defenders escort to a corner.

**King's side**:
The King and his defenders taken together, as a playing side. This is the
label in copy; `"defenders"` is the code identifier for the same side.

**Soldier**:
Any piece that is not the King, of either side. The word matters because
several rules apply to soldiers but not to the King (see **Hostile**).
_Avoid_: man, pawn, piece (a piece includes the King)

**Throne**:
The centre square, which only the King may occupy.
_Avoid_: castle, centre

**Corner**:
One of the four squares the King is trying to reach. Also a hostile anvil for
every capture, in every ruleset.
_Avoid_: refuge, sanctuary

**Custodial capture**:
The standard capture: moving so an enemy soldier is caught between the moved
piece and a second hostile square, along a rank or file. Never diagonal, and
never triggered by moving *into* the sandwich.

**Anvil**:
The far side of a custodial capture, held by a friendly piece or by a hostile
square. Used when explaining captures: a corner "counts as a raider too".

**Hostile**:
Of a square: able to act as the far side of a capture without a piece on it.
The corners are always hostile; whether the empty throne is hostile, and to
whom, is what a **Ruleset** decides.

**Shieldwall**:
A Copenhagen capture of a bracketed row of two or more men along the board
edge. Not part of either authentic Brandubh ruleset; available for **Custom**
play only.

**Encirclement**:
A raider win by enclosing the King and every remaining defender in an unbroken
ring that does not lean on the board edge. WTF only.

**Escape**:
The defender win condition: the King reaches any corner.

**Ply**:
One move by one side. The move list, the review cursor and the set records all
count in plies, so "moves" in prose means plies unless a numbered move pair is
explicitly meant.

## Rules

**Ruleset**:
A named set of gameplay flags a game is played under (`walker`, `wtf`,
`custom`). Two rulesets can disagree about whether a given move is legal or
winning, so nothing verified under one ruleset is valid under another.
_Avoid_: variant (used as the id in code and as the settings label; "ruleset"
in prose)

**Walker**:
The Damian Walker / Cyningstan (2011) reconstruction, after MacWhite 1946. The
throne is not hostile, there is no strong-king rule, and repetition is a draw.

**WTF**:
The World Tafl Federation tournament ruleset. The empty throne is hostile to
soldiers and acts as the fourth wall against a King beside it; encirclement
wins; repetition is a loss for the King's side.

**Custom**:
A ruleset assembled by the player from the individual flags. A custom game
must carry its own `[Rules]` tag when exported, because the id alone says
nothing about how it was played.

**Armed King**:
The King may act as a flanking piece in a capture. Both authentic rulesets
arm him.

**Weaponless**:
The opposite of armed, and the word used in copy: "In this variant the King is
weaponless: he can never help make a capture."

**Strong king**:
A rule requiring all four sides to be hostile before the King is taken, rather
than the usual two. `strongKingOnThrone` (WTF) and
`strongKingAdjacentToThrone` (custom only) are separate flags.

**Repetition**:
A position reached three times. What follows is a ruleset decision: ignored,
a draw (Walker), or a loss for the King's side (WTF).

## A session at the board

**Game**:
One board played from the opening to a result.

**Set**:
A short series of games between the same two people, with the sides swapping
each game so each player takes each side equally. Two, four or six games.

**Match**:
The running series of **Sets** between those two people, holding sets won,
sets drawn and the game wins banked from completed sets. A Match contains
exactly one Set in progress at a time.
_Avoid_: tournament, series

**Over the board**:
Two people playing on one device, sharing the screen. `"hotseat"` in code.
_Avoid_: local, pass-and-play, two-player

**Side**:
Raiders or King's side. Distinct from **Player**: across a set the same player
takes each side in turn.

**Player**:
One of the two humans in an over-the-board match, `p1` or `p2`. Not a synonym
for **Side**.

## The engine

**Engine**:
The search that picks the computer's moves and evaluates positions. One
engine, shared by play, analysis and puzzle verification, so what it proves
under a ruleset is what the game plays under.

**AI level**:
How hard the computer plays: Easy, Medium, Hard or **Ollamh**. A level sets
search depth, time budget and, for Easy, a deliberate blunder rate.
_Avoid_: difficulty (the code identifier; "AI level" in copy)

**Ollamh**:
The strongest AI level. An Irish word (a master poet or professor), so it is
always set in the cló Gaelach face.

**Eval**:
The engine's score for a position, attacker-positive, shown as the bar and the
best-move arrow. Always the engine's opinion, never a proof.

**Depth** / **Nodes**:
How far ahead the search looked and how many positions it examined. Reported
for observability; both are 0 when no search ran (an opening-book hit, a
deliberate Easy blunder, or no legal move).

**Opening book**:
Precomputed best replies for early positions, stored one line per canonical D4
position so the bundled file stays small.

**Solver**:
A sound but bounded exhaustive search used to prove results, not to play. It
reuses the engine, so it solves under exactly the rules being played.

**Recognizer**:
A pattern that claims a forced win without searching for it. Recognizers must
be sound: cross-validated against the solver, and never allowed to claim an
unforced win.

## Review and analysis

**Review**:
Stepping back and forth through the moves of a game, live or finished. The
board shows a past position; the game itself is untouched.

**Tip**:
The latest position in the timeline. "At the tip" means the review cursor is
on the live position rather than a past one.

**Analysis mode**:
A mode where both sides can be moved freely. The computer and the clock are
paused and nothing is saved.

**Variation**:
An alternative continuation explored from a rewound position. The timeline is
a tree, not a line, so trying a second idea never destroys the first.
_Avoid_: line (reserved for a **Puzzle**'s stored answer)

**Annotation**:
The pass that scores every move of a finished game against the engine and
marks the ones that gave something up.

**Mark**:
What annotation assigns to a move: `inaccuracy`, `mistake` or `blunder`, in
ascending severity.

**Takeback**:
Undoing the last move by agreement. Over the board both players must agree, so
it is proposed, then allowed or declined.

## Teaching

**Puzzle**:
A stored, verified exercise: a position, a side to move, and the line that
answers it. Fifty of these form the **Puzzle Bank**.
_Avoid_: problem, challenge, drill

**Puzzle Bank**:
The collection of stored, verified **Puzzles** shipped with the app.

**Attempt**:
The live runtime of one exercise in progress: its stage
(`guessing`/`wrong`/`solved`/`revealed`), how many wrong guesses have been
made, and how far through the line the solver has got.
_Avoid_: session, try

**Review Mistake**:
A move in the player's own finished game that the annotation pass marked as an
inaccuracy, mistake or blunder, offered back as an exercise.

**Goal**:
What a **Puzzle** asks the solver to achieve, and therefore how it was
verified: `regicide` and `escape` are proven by the solver; `crushing` and
`advantage` are measured against the evaluation and are never called proofs.

**Provenance**:
Where a **Puzzle**'s position came from: a mined self-play game, or a human
game someone observed and submitted. A puzzle's provenance never affects how
it is verified.

**Set Play**:
A hand-built teaching scenario in `tutorials.ts` with scripted opponent
replies and its own "why that was wrong" copy. Distinct from a **Puzzle**: a
set play teaches a named motif to a beginner, a puzzle tests recognition.
_Avoid_: tutorial (the word names the screen, not the artefact)

**Motif**:
The named idea a **Set Play** teaches: a custodial capture against the corner,
barring the King's escape, and so on.

## Files and storage

**Game file**:
A plain-text `.tafl` export: a tag header plus the move list, like a chess PGN.
It carries a whole game, replayed from the opening.

**Position**:
A one-line encoding of a board plus the side to move, for copying a single
position between places. The FEN to the game file's PGN.

**Replay-from-opening**:
The invariant that persistence and import/export replay a move list from the
standard opening and never from a custom starting board.

**Resume**:
The offer, at boot, to carry on a game found in storage rather than start a
new one.

## Interface

**Setup overlay**:
The chooser that opens the app: opponent, then side, then strength. Reopened
from the **Wordmark** or from the drawer's New game, where it can be backed
out of without disturbing the game behind it.
_Avoid_: splash, modal, landing

**Wordmark**:
The "Branduḃ" title in the header. Doubles as the way back to the **Setup
overlay**.

**Drawer**:
The slide-out menu behind the hamburger: play, learn, tools, settings, about.

**Zen mode**:
A calm, over-the-board screen stripped to the board, whose turn it is, the
clock and the move log. Everything else is an opt-in **Extra**.

**Extra**:
An individually revealable element in **Zen mode** (the scoreboard, the
captured tray, the eval, the variation tree, and so on). The move navigator is
the one Extra on by default.

**Board theme**:
A named palette for the board and the app chrome. A theme decides board
colours only: it never sets piece colours.

**Piece colours**:
The stone colours, deliberately not themed. Black raiders, off-white
defenders, a gold King on every theme, each overridable per side.

**Emblem**:
The mark carried on a piece or a corner square: raider icon, King icon,
defender icon, corner squares. Chosen independently of colour.

## Language and typography

**Cló Gaelach**:
The Gaelic face (Gadelica) used for Irish and Scottish-Gaelic text and for
nothing else. Gaelic text is set in overdot orthography, so "Brandubh" renders
"Branduḃ".
_Avoid_: Celtic font, Gaelic script

**Ponc séimhithe**:
The overdot that marks lenition in that orthography.

**Locale**:
A shipped language. `en` and `es` are visible; `ga` exists in the tables but
stays out of the language toggle until a human Irish speaker signs the copy
off.

## Relationships

- A **Puzzle** belongs to exactly one **Ruleset** and is invalid under any other
- A **Puzzle** and a **Review Mistake** both produce an **Attempt**; the Attempt
  is what the board and the puzzle panel know about
- An **Attempt** from a **Review Mistake** is a one-step line whose answer comes
  from a live engine search; an **Attempt** from a **Puzzle** walks a stored
  line of up to four moves
- A **Match** holds one **Set** in progress plus the totals from finished sets;
  a **Set** holds finished **Games**
- A **Player** is not a **Side**: across a Set each player takes each side
- A **Mark** is produced by **Annotation** and may become a **Review Mistake**
- A **Board theme** and **Piece colours** are independent: changing the theme
  never moves the stones

## Example dialogue

> **Dev:** "When a **Puzzle** is four moves long, is the learner finding all
> four?"
> **Owner:** "Yes: each is a step of the **Attempt**, and the raiders' reply
> between steps is part of the stored line, not something the engine decides
> on the day."
>
> **Dev:** "So what does a **Review Mistake** look like in the same machine?"
> **Owner:** "A line of length one, where the answer happens to arrive from the
> worker instead of from the bank."

## Flagged ambiguities

- "puzzle" named both the stored exercise and the live runtime of one.
  Resolved: **Puzzle** is the stored artefact, **Attempt** is the runtime.
  `PuzzleState` in `src/game/puzzle.ts` is the Attempt and should be renamed.
- "variant" and "ruleset" are the same thing. Resolved: **Ruleset** in prose;
  `variant` survives as the code id and as the settings label.
- "attacker" and "raider" are the same side. Resolved: **Raider** in copy,
  `"attackers"` in code. The two are not interchangeable in prose.
- "difficulty" and "AI level" are the same setting. Resolved: **AI level** in
  copy, `difficulty` in code.
- "move" is used for both a ply and a numbered pair. Unresolved: prose says
  "moves" where the code counts plies. Prefer **Ply** where the distinction
  matters.
