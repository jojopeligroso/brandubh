import { useId } from "react";
import {
  OLLAMH_BASELINE_EM,
  OLLAMH_HEIGHT_EM,
  OLLAMH_PATH,
  OLLAMH_VIEWBOX,
  WORDMARK_BASELINE_EM,
  WORDMARK_BRAN_PATH,
  WORDMARK_DUBH_PATH,
  WORDMARK_HEIGHT_EM,
  WORDMARK_SEAM,
  WORDMARK_VIEWBOX,
  WORDMARK_WIDTH,
} from "../wordmark";

/**
 * The Gaelic words in the interface, drawn rather than typeset.
 *
 * These were the only text ever set in the cló Gaelach face, so the outlines in
 * src/wordmark.ts replace the bundled font entirely (see NOTICE.md). Both marks
 * size off the inherited font-size — `height` in em, `vertical-align` seating
 * the box on the text baseline — so the existing `text-xl` / `text-3xl` classes
 * keep working, and both carry the plain-text spelling for screen readers.
 */

/**
 * Half-width of the colour transition, as a fraction of the wordmark's width.
 *
 * A design value, unlike WORDMARK_SEAM, which is measured. The two colours meet
 * on the compound's seam and bleed into one another across ±this much, so the
 * end of "Bran" warms and the "d" of "duḃ" starts already part-gold rather than
 * switching at a hard edge. Widen it for a softer wash, shrink it towards 0 for
 * an abrupt split.
 *
 * 0.042 was chosen from rendered comparisons at 0.000 / 0.020 / 0.042 / 0.075 /
 * 0.130. Judge any change on a warm-gold theme: the default theme's gold is a
 * blue very close to its parchment, so the transition is nearly invisible there
 * whatever this is set to.
 */
const BLEED = 0.042;

/**
 * "Branduḃ" — the raven of the game's name.
 *
 * Brandubh is **bran** (raven) + **dubh** (black), and the colour follows that
 * compound: silver through "Bran", red gold through "duḃ", bleeding across the
 * join. Both morphemes are filled from one user-space gradient, so the
 * transition lands identically no matter which of the two paths a given stretch
 * of letterform belongs to.
 */
export function Wordmark({ className }: { className?: string }) {
  // Instance-scoped: several wordmarks can be mounted at once (header, drawer,
  // setup overlay) and duplicate gradient ids would collide in the document.
  const gradientId = `wordmark-bleed-${useId()}`;

  return (
    <svg
      className={className}
      viewBox={WORDMARK_VIEWBOX}
      role="img"
      aria-label="Brandubh"
      style={{
        height: `${WORDMARK_HEIGHT_EM}em`,
        width: "auto",
        verticalAlign: `${-WORDMARK_BASELINE_EM}em`,
      }}
    >
      <defs>
        {/* userSpaceOnUse, spanning the whole mark: the morphemes are separate
            paths, so the default objectBoundingBox units would restart the ramp
            on each of them and colour both halves identically.

            Both stops are brand tokens, not theme tokens — the mark holds its
            silver and gold in every theme (see index.css). That is why this
            ignores the `text-parchment` on its parent: a logo should not
            reskin. */}
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={WORDMARK_WIDTH}
          y2="0"
        >
          <stop offset={WORDMARK_SEAM - BLEED} style={{ stopColor: "var(--wordmark-silver)" }} />
          <stop offset={WORDMARK_SEAM + BLEED} style={{ stopColor: "var(--wordmark-gold)" }} />
        </linearGradient>
      </defs>
      <path d={WORDMARK_BRAN_PATH} fill={`url(#${gradientId})`} />
      <path d={WORDMARK_DUBH_PATH} fill={`url(#${gradientId})`} />
    </svg>
  );
}

/**
 * "Ollaṁ" — the hardest AI level, an Irish word (a master-poet), so it stays in
 * the cló face. The glyphs are baked, so `label` only supplies the accessible
 * name; every locale spells it "Ollamh" (see i18n.ts).
 */
export function OllamhMark({ label }: { label: string }) {
  return (
    <svg
      viewBox={OLLAMH_VIEWBOX}
      role="img"
      aria-label={label}
      style={{
        height: `${OLLAMH_HEIGHT_EM}em`,
        width: "auto",
        verticalAlign: `${-OLLAMH_BASELINE_EM}em`,
      }}
    >
      <path d={OLLAMH_PATH} fill="currentColor" />
    </svg>
  );
}
