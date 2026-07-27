# Brandubh · Irish Hnefatafl

A slick, fully playable browser version of **Brandubh** — the Irish 7×7 form of
hnefatafl, the asymmetric Norse–Gaelic “king’s table” war game. Play the King’s
desperate escape or the raiders’ hunt, against a friend (over the board) or a
built-in AI, with two historical rule variants and a custom rule editor.

![Brandubh board](docs/screenshot.png)

- ⚔️ Correct, tested tafl engine (custodial capture, hostile corners & throne, strong-king throne capture)
- 🤖 Minimax + alpha–beta AI with three difficulty levels
- 👑 Two rule variants: **World Tafl Federation** and **Walker** — plus a custom rule editor
- 🌐 Localised in English and Spanish
- 📱 Mobile-first, no backend, works offline — pure static SPA
- 🎨 Carved-wood board, crown / shield / axe piece emblems, move log, undo

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static bundle in ./dist  (deploy to Vercel / Netlify / GH Pages)
npm run preview   # preview the production build
npx tsx scripts/selftest.ts   # headless engine sanity checks
```

The build is a self-contained static site (`base: "./"`), so `dist/` can be
dropped onto any static host.

---

## The rules of Brandubh

Brandubh (*“black raven”*, also spelt **brandub / brannumh**) is the Irish
variant of hnefatafl, played on a **7×7** board with just **thirteen pieces**.
Like most hnefatafl games its medieval rules were never written down — they
survive only in poetry, legend, and a scatter of archaeological board finds — so
what follows is the widely-used modern reconstruction (the version played
competitively on Aage Nielsen’s hnefatafl site and by the World Tafl Federation).

### The board and armies

```
   a  b  c  d  e  f  g
7  ◉  .  .  A  .  .  ◉      A = attacker (raider)   × 8
6  .  .  .  A  .  .  .      D = defender (warrior)  × 4
5  .  .  .  D  .  .  .      K = king                × 1
4  A  A  D  K  D  A  A      ◉ = corner (restricted + hostile)
3  .  .  .  D  .  .  .      ⊕ = throne (centre, restricted)
2  .  .  .  A  .  .  .
1  ◉  .  .  A  .  .  ◉
```

- **The King’s side** — the King on the central **throne**, ringed by **4
  defenders**. Outnumbered two-to-one.
- **The attackers** — **8 raiders** massed at the middle of each edge, forming a
  cross with the defenders.
- The **attackers move first**. Turns then alternate.

### Movement

- Every piece moves like a **rook in chess**: any number of empty squares
  orthogonally (up, down, left, right). **No diagonals, no jumping.**
- Only the **King** may stop on the **throne** or a **corner**. Ordinary
  soldiers may pass *over* the empty throne but may never rest on it, and may
  never enter a corner.
- In both reconstructions the King may return to the throne after leaving it.

### Capturing

- You capture an enemy **soldier** by **flanking** it: move a piece so the enemy
  is trapped between two of your own pieces along a rank or file. The trapped
  piece is removed immediately.
- **You must move into the trap.** A piece that *moves between* two enemies of
  its own accord is **safe** — captures only happen on the capturing player’s
  move.
- The **four corners** and the **empty throne** are **hostile squares**: they
  count as “your piece” for the purpose of completing a capture, for both sides.
- A single move can capture several pieces at once (one in each direction).

### Winning

| Side | Wins by |
|------|---------|
| 👑 **King’s side (defenders)** | Getting the **King to any corner**. |
| ⚔️ **Attackers (raiders)** | **Capturing the King**. |

- The King is captured by being surrounded **on two opposite sides** in the open
  (a raider, a hostile corner, or the board edge does **not** help here — the
  king needs actual flanking).
- **Strong king by the throne:** when the King stands **on the throne or on a
  square next to it**, the attackers must surround him on **all four sides**
  (the empty throne counts as one hostile side).
- A player who has **no legal move** loses.
- A position repeated three times ends the game (draw in Walker rules, loss
  for defenders in WTF rules).

> Some tournament rule-sets add a *shieldwall* capture (bracketing a whole row of
> pieces against the edge) and an *exit-fort* win for the King. This
> implementation keeps to the core Brandubh rules above; those extensions are
> noted here for completeness and are candidate future options.

---

## The two variants

Brandubh has been reconstructed more than one way. The app ships two
rule-sets sourced from [aagenielsen.dk](https://aagenielsen.dk), selectable
in the settings, plus a custom rule editor for mixing and matching flags:

1. **Brandubh · World Tafl Federation** *(default)* — official WTF tournament
   rules. The empty throne is hostile to soldiers but never to the king. The
   king on the throne requires all four sides surrounded. Encirclement wins.
   Threefold repetition is a loss for the defending side.

2. **Brandubh · Walker** — Damian Walker’s reconstruction (Cyningstan, 2011),
   based on MacWhite’s 1946 article. The throne is not hostile. The king is
   captured by two pieces anywhere on the board (no strong-king rule).
   Threefold repetition is a draw.

Both variants use an armed king (the king can participate in captures). They
share the same board, setup, movement, and corner rules; they differ in throne
hostility, strong-king behaviour, encirclement, and repetition handling. All
flags are wired through a declarative `RuleSet` in `src/game/variants.ts`, so
adding further variants is a matter of flipping flags — or use the in-app
custom rule editor to experiment live.

---

## A note on the recorded-games archive

The original brief was to also scrape every recorded game of the two Brandubh
variants from Aage Nielsen’s archive (`aagenielsen.dk/visallespil.php`). That
site is **blocked by this environment’s outbound network policy** (the egress
proxy denies the host), so the game database could not be crawled here. The
rules above were reconstructed from the site’s public rule descriptions and the
World Tafl Federation ruleset via search.

If you want the recorded games imported (e.g. as replayable PGN-style game
records or an opening book for the AI), run the scrape from a machine with
network access to that domain and drop the parsed games into `src/game/` — the
move-notation format (`moveName()` in `engine.ts`, e.g. `d2-d4`) is already
compatible with a simple game-record replay.

---

## Project layout

```
src/
  game/
    types.ts         core types (board, move, state)
    variants.ts      rule presets (Walker, WTF) + RuleSet flags
    engine.ts        move generation, captures, king capture, win detection, notation
    engine.test.ts   vitest unit tests for the engine
    matchSet.ts      over-the-board set scoring (side swap, tiebreak by moves)
    matchSet.test.ts vitest unit tests for set scoring
    ai.ts            alpha–beta minimax + evaluation
  components/
    Board.tsx        the board grid + piece emblems
    RulesModal.tsx   in-app how-to-play
  i18n.ts            translations (EN, ES)
  App.tsx            game state, controls, AI orchestration, custom rule editor
scripts/
  selftest.ts        headless engine assertions
```

## Board themes

The board ships with six colour themes, selectable in the settings and remembered
between visits. Five take their palettes from the default themes of
[Omarchy](https://omarchy.org/) — **Tokyo Night** (the default), **Catppuccin**,
**Gruvbox**, **Nord** and **Everforest** — alongside the original **Carved Wood**.
Everything is driven by CSS custom properties under a `[data-theme]` attribute, so
adding another theme is just one more block in `src/index.css` plus an entry in
`src/theme.ts`.

## Reviewing moves

- **Curved arrows** under the board cycle back and forth through every move
  without discarding anything; **Play from here** branches the game at the
  position you are viewing (against the same opponent, or against the computer).
- **Over-the-board** play offers **Propose takeback**; either side may **Resign**.
- When a game ends you can step back and **Play from here** to explore variations.

## Over-the-board sets

Brandubh is asymmetric, so a single game never pits two people fairly against
each other — whichever army is stronger has the edge. Over-the-board play is
therefore scored as a **set**: two games in which the players swap sides, so
each one sits behind both the king and the raiders. A scoreboard above the board
tracks it live:

- **King’s side vs Raiders counters** — how many games each army has won so far.
- **Per-player standings** — which side each player holds this game, their game
  wins, and their fastest victory (in moves).
- **Each finished game** — winner, the side they held, and the moves it took.

Because the stronger side is expected to win both games, a set usually finishes
level (1–1). When it does, the **move-count tiebreaker** decides it: the player
who won their game in **fewer moves** takes the set. *Next game* swaps the sides
and starts game two; *New set* starts a fresh pair.

## Deploying

The app is a static SPA, so any static host works. This repo ships a
[`vercel.json`](vercel.json) so a connected [Vercel](https://vercel.com) project
deploys automatically on every push — production from the default branch, and a
preview URL for every other branch.

One-time setup: import the repository at **vercel.com → Add New → Project**.
Vercel reads `vercel.json` (framework `vite`, build `npm run build`, output
`dist/`); no further configuration is needed. To deploy anywhere else, run
`npm run build` and serve the `dist/` folder.

## Credits

Piece and corner emblems are vector traces of supplied artwork of traditional
public-domain Celtic / Norse symbols — see [NOTICE](NOTICE.md). A gallery of the
full set lives at [`docs/design/icons.html`](docs/design/icons.html).

## Licence

MIT — see [LICENSE](LICENSE).
