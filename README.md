# Brandubh · Irish Hnefatafl

A slick, fully playable browser version of **Brandubh** — the Irish 7×7 form of
hnefatafl, the asymmetric Norse–Gaelic “king’s table” war game. Play the King’s
desperate escape or the raiders’ hunt, against a friend (pass-and-play) or a
built-in AI, with two historical rule variants.

![Brandubh board](docs/screenshot.png)

- ⚔️ Correct, tested tafl engine (custodial capture, hostile corners & throne, strong-king throne capture)
- 🤖 Minimax + alpha–beta AI with three difficulty levels
- 👑 Two rule variants: **Copenhagen** (armed king) and **Weaponless-King**
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
- In these reconstructions the King, once he leaves the throne, may not move
  back onto it.

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
- A position repeated three times is a **draw** (repetition rule).

> Some tournament rule-sets add a *shieldwall* capture (bracketing a whole row of
> pieces against the edge) and an *exit-fort* win for the King. This
> implementation keeps to the core Brandubh rules above; those extensions are
> noted here for completeness and are candidate future options.

---

## The two variants

Brandubh has been reconstructed more than one way. The app ships the two
rule-sets that are used for recorded Brandubh play, selectable in the settings:

1. **Copenhagen Brandubh** *(default)* — the modern World Tafl Federation
   tournament reconstruction. The **king is armed**: he can take part in
   captures like any other piece. This is the balanced, competitive ruleset.

2. **Weaponless-King Brandubh** — an older “historical” reading in which the
   **king carries no weapon** and cannot help make captures (one interpretation
   of the Hervarar-saga riddle). The four defenders must clear the king’s path
   alone, making the escape harder.

Both share the same board, setup, movement, hostile squares, and win
conditions; they differ only in whether the king may capture (and are wired
through a single declarative `RuleSet` in `src/game/variants.ts`, so adding
further variants is a matter of flipping flags).

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
    types.ts       core types (board, move, state)
    variants.ts    the two rule presets + RuleSet flags
    engine.ts      move generation, captures, king capture, win detection, notation
    ai.ts          alpha–beta minimax + evaluation
  components/
    Board.tsx      the board grid + piece emblems
    RulesModal.tsx in-app how-to-play
  App.tsx          game state, controls, AI orchestration
scripts/
  selftest.ts      headless engine assertions
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

## Credits

The raven emblem on the raider pieces is from
[game-icons.net](https://game-icons.net/) (CC BY 3.0) — see [NOTICE](NOTICE.md).

## Licence

MIT — see [LICENSE](LICENSE).
