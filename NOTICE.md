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

The **Brandubh** title wordmark is set in **Gadelica**, a traditional cló
Gaelach (Irish typeface) modelled on the 17th-century printed letterforms —
© Séamas Ó Brógáin, 2007. It is bundled verbatim at `src/fonts/Gadelica.otf`
and used unmodified under the author's own distribution terms: free to use and
redistribute, not modified or renamed, not sold, with authorship credited. Full
terms in `src/fonts/Gadelica-LICENCE.txt`.

**Standard for the cló face (`src/gaelic.ts`):** Gadelica is used *only* for
Irish / Scottish-Gaelic text — never English, Spanish, or any other language.
It is reached solely through the `.gaelic` marker: on individual Gaelic words
(e.g. the **Brandubh** wordmark), or on display text when a Gaelic locale flags
the document with `data-lang-gaelic`. Gaelic text in this face uses traditional
overdot orthography — séimhiú marked with the ponc séimhithe (`bh → ḃ`, … `th →
ṫ`, eclipsis preserved: `bhfear → bḟear`), so "Brandubh" reads **Branduḃ**.

The rest of the interface keeps the platform's native serif, sans-serif and
monospace fonts (no other bundled files).
