# Assets

This file records material that is **not** the project author's to license, and
the terms it carries instead. It grants no rights in the project's own code —
for that, see [LICENSE](LICENSE), which is source-available and all rights
reserved.

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

**No font files are bundled.** The interface uses the platform's own serif,
sans-serif and monospace faces throughout.

The **Branduḃ** wordmark and the **Ollaṁ** difficulty label are drawn, not
typeset. Both were set once in **Gadelica** — a traditional cló Gaelach (Irish
typeface) modelled on 17th-century printed letterforms, © Séamas Ó Brógáin,
2007 — and converted to outlines, which is all that ships (`src/wordmark.ts`,
`src/components/Wordmark.tsx`). Those two fixed words were the only text ever
set in the cló face, so nothing was lost by dropping the font.

Séamas Ó Brógáin's letterforms are the origin of those outlines and he is
credited accordingly. Outlining is ordinary typographic use of a face that its
author distributes for use without restriction; it does not make the underlying
design ours, and no claim is made over the Gadelica typeface itself.

Because the glyphs are baked into path data, these two words cannot be
re-rendered or translated — changing them means re-outlining them. Everything
else, including a Gaelic locale, renders in the ordinary display face while
keeping traditional overdot orthography — séimhiú marked with the ponc
séimhithe (`bh → ḃ`, … `th → ṫ`, eclipsis preserved: `bhfear → bḟear`), so
"Brandubh" reads **Branduḃ**. See `src/gaelic.ts`.
