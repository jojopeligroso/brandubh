# Assets

## Piece emblems

The emblems on the pieces are vector traces of supplied reference images of
traditional (public-domain) Celtic / Norse symbols. In every case the geometry
of the source image is preserved unchanged — only the colour is themed at
runtime via `currentColor`.

- **Raider (attacker) pieces** — selectable in Settings from a set of traced
  symbols (The Crow, Triquetra, Triskele, and several Celtic shield / round
  knots). Traces live in `src/emblems.ts`.
- **King's-side (defender) pieces** — a Celtic shield knot. Trace in
  `src/shieldKnot.ts`.
- **Corner squares** — Celtic Tree-of-Life motifs (Tree Knot, Oak, Knotwork
  Tree, Filigree Tree, Leafy Tree). Traces in `src/cornerEmblems.ts`.

A gallery of the full set is saved at `docs/design/icons.html`.

The traces were produced from the supplied artwork with an automatic raster→vector
tracer; the shapes are faithful reproductions of those public-domain symbols.

## Fonts

The display face for headings and board coordinates is **Gadelica**, a
traditional cló Gaelach (Irish typeface) modelled on the 17th-century printed
letterforms — © Séamas Ó Brógáin, 2007. It is bundled verbatim at
`src/fonts/Gadelica.otf` and used unmodified under the author's own
distribution terms: free to use and redistribute, not modified or renamed, not
sold, with authorship credited. Full terms in `src/fonts/Gadelica-LICENCE.txt`.

Irish text shown in this face uses traditional overdot orthography — séimhiú
marked with the ponc séimhithe (`bh → ḃ`, `ch → ċ`, … `th → ṫ`) rather than a
following "h" — applied by `src/seimhiu.ts`.

Body text and move notation continue to use the platform's native
sans-serif and monospace fonts (no bundled files).
