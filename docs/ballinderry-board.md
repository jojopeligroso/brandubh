# The Ballinderry board theme

`[data-theme="ballinderry"]` is named for the gaming board from Ballinderry
crannóg, Co. Westmeath, **NMI 1932:6583** — a 10th-century yew board with 49
holes in a 7×7 grid, carved heads at either side, and interlace panels around
its edges. It is the closest thing this app has to a physical ancestor, and it
is the reason the theme is the only one that changes how the board is *built*
rather than only what colour it is.

This file records where the theme's details come from, and — more to the point
— **which of them are not sourced**, in the same spirit as the ⚠ UNVERIFIED
section of `docs/tablut-rules.md`.

## ⚠ The ornament is reconstructed from descriptions, not traced

**The NMI's photographs and the Discovery Programme's 3D model could not be
reached.** `museum.ie`, `sketchfab.com` and every other primary or secondary
site tried are blocked by the egress proxy — the same wall `tablut-rules.md`
hit at `aagenielsen.dk`. Web *search* returns snippets and those are the whole
evidentiary basis for the panels; no image of the object was ever loaded.

So the three files in `src/ballinderry/` are **drawings of the patterns the
sources name**, not traces of the carving on this board. A plait is a plait and
Borre ring-chain is a well-defined motif, so they are the right *kind* of
ornament in the right places — but the spacing, the proportions, the ribbon
widths and every particular of the real carving are unknown here and are
therefore invented.

**If you can reach the sources, replace them.** `scripts/gen-ballinderry-ornament.mjs`
regenerates the files and is the only place the geometry lives; the CSS treats
the panels as opaque masks, so dropping in traced SVGs of the same aspect
ratios needs no other change. The two worth going to:

- the NMI collections page for the board, and the NMI's own photography
- the Discovery Programme's 3D model, *Ballinderry Gaming Board (NMI 1932:6583)*,
  on Sketchfab — made with Creative Ireland funding, and the best surface
  detail publicly available

## What is attested

From the NMI's own description of the object and the standard summary of it,
both via search snippets:

- yew, roughly square, **49 holes** laid out as a grid of peg holes
- **the centre and corner holes are marked off with circular arcs**
- **projecting carved heads at either side**, probably handles
- **eight panels of carved interlace** around the edges, of which:
  - **two panels of plain five- and six-strand interlace**
  - **two at opposite corners of ring-chain interlace, Borre style**
- from the 1932 Ballinderry excavation; the crannóg occupied late 9th–11th c.

The excavation report itself was not consulted — it is not reachable either —
so nothing above rests on it. One figure caption seen in search gives the board
as 26.5 × 17 × 2.5 cm, which cannot be squared with "roughly square" and a 7×7
grid; **no dimension is used anywhere in the theme**, so the conflict is noted
and left alone rather than resolved on a caption.

## What the theme does with that

| Attested | In the app |
|---|---|
| 49 holes, no chequer | Every cell is a drilled hole; `--cell-dark` and `--line` are both emptied so no chequer or grid line is drawn. This is the "holes instead of squares" change, and it is scoped to this theme. |
| Centre and corner holes marked off | Left to the app's existing throne motif and corner emblems, which already mark exactly those five squares. Not redrawn as arcs. |
| Two panels, 5- and 6-strand plait | The two long edges: 6-strand along the top, 5-strand along the bottom. |
| Two opposite corners, Borre ring-chain | Two diagonally opposite corners, running into the side bands — top-left and bottom-right. |
| Four further interlace panels, undescribed | **Left as plain timber.** They are attested as interlace but no source seen says which, and inventing four panels of pattern would put more fiction on the board than leaving them bare. |
| Carved heads at either side | **Not drawn.** They project *outside* the board's outline; the board is a square grid in a fixed layout box, and lugs on its sides would have to escape it. A real omission, not an oversight. |

Simplifications inside the panels, all of them forced by the size a panel is on
screen (a band is ~20px tall on a phone):

- **Over-and-under is regular, not woven.** In the plait, one family of ribbons
  breaks at alternate crossings; in the ring-chain, the lozenge always passes
  over the ring. Real interlace alternates properly, and at this scale the
  difference is invisible.
- **Panels are closed with a framing line** rather than ribbons turning back on
  themselves at the panel edge.
- **The strand counts are honest** — 6 and 5 — which is why the plait reads as
  fine woven texture rather than as legible interlace at small sizes. That is
  what the strand count the sources give actually looks like at 20px; a coarser
  plait would read better and would be a different board.

## The palette

Held from the reference image supplied with the request: two tans for the
timber and a dark warm brown for the carving. The tones are the light end of
yew heartwood, which is where a board in use would sit — this is the only
theme in the app with a board that is both light and warm, so it carries its
own three tones rather than borrowing Gokstad's bog oak. The app chrome around
it stays dark, because the wordmark holds its silver and red gold on every
theme and needs a dark ground for it.

## Things it deliberately does not touch

- **Piece colours and emblems.** Unchanged, per the standing rule that a board
  theme repaints the board only (see the `:root` note in `index.css`). A player
  on the app default therefore sees Gokstad's emblems on this board.
- **Corner squares.** Same silver outline and same corner emblem as every other
  theme. One consequence to know about: the emblem covers the hole beneath it,
  so the four corners are the only positions on the board whose hole cannot be
  seen. Left that way on purpose.
## It is a Brandubh board, and it stays on it

Every other theme is a palette and belongs on any board. This one is an object:
49 holes, 7×7. Painted on Tablut it would draw an 81-hole peg board that never
existed, and would say so with all the authority of the sourcing above.

So `resolveTheme` (`src/theme.ts`) falls Ballinderry back to Gokstad while the
Tablut surface is open, and `index.html`'s pre-paint script does the same for
a reload landing there — without that, the held-over paint is a flash of the
wrong board, which is the one thing that script exists to prevent.

**The fallback is a paint, never a preference.** The stored theme is left as
the player set it, the picker goes on showing Ballinderry, and the board comes
back on the way out. `theme.test.ts` pins the resolution and `check:tablut`
pins what the document actually ends up wearing — the two halves fail
separately, and it is the second one that no unit test can see.
