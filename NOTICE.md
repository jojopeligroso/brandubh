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

The traces were produced from the supplied artwork with an automatic raster→vector
tracer; the shapes are faithful reproductions of those public-domain symbols.
