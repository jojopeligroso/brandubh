/**
 * Traditional Gaelic-script (cló Gaelach) orthography.
 *
 * Modern Irish marks séimhiú (lenition) with a following "h" — "bhí", "mhór",
 * "chaith". Traditional cló Gaelach instead uses the ponc séimhithe (an overdot)
 * on the consonant itself: "ḃí", "ṁór", "ċaiṫ". When Irish text is shown in the
 * Gaelic display face we render it the traditional way, with the overdot.
 *
 * Séimhiú only. Eclipsis (urú) is preserved, not dotted:
 *   - "bhf" spells an eclipsed f, so "bhfear" → "bḟear" (b + dotted f), never
 *     "ḃfear"; only the silenced f takes the dot, the eclipsing b stays.
 *   - the other eclipsis pairs (mb, gc, nd, bp, dt, ng) contain no "h" and so
 *     pass through untouched already.
 *
 * Apply this ONLY to Irish (`ga`) strings. English/Spanish text also contains
 * "th", "ch", "sh" … which are not lenition and must not be dotted.
 */

// Lenitable consonant → its overdotted form (ponc séimhithe), preserving case.
const OVERDOT: Record<string, string> = {
  b: "ḃ", c: "ċ", d: "ḋ", f: "ḟ", g: "ġ", m: "ṁ", p: "ṗ", s: "ṡ", t: "ṫ",
  B: "Ḃ", C: "Ċ", D: "Ḋ", F: "Ḟ", G: "Ġ", M: "Ṁ", P: "Ṗ", S: "Ṡ", T: "Ṫ",
};

// Eclipsed f is written "bhf"; only the f is dotted (silenced), the b remains.
const DOTTED_F: Record<string, string> = { f: "ḟ", F: "Ḟ" };

/**
 * Convert modern Irish spelling to traditional cló Gaelach overdot orthography.
 * Idempotent on its own output (no "h" digraphs remain to re-convert).
 */
export function toSeanchlo(text: string): string {
  return text
    // Eclipsis of f first: b + h + f → b + dotted-f (keep the b, drop the h).
    .replace(/([bB])[hH]([fF])/g, (_m, b: string, f: string) => b + DOTTED_F[f])
    // Séimhiú: lenitable consonant + h → overdotted consonant (drop the h).
    .replace(/([bcdfgmpstBCDFGMPST])[hH]/g, (m, c: string) => OVERDOT[c] ?? m);
}

/**
 * Deep-convert every string in a translations table (or any nested object of
 * strings) to traditional overdot orthography. Used to render the Irish (`ga`)
 * locale in the cló Gaelach face. Preserves object shape; non-strings untouched.
 */
export function toSeanchloTable<T>(table: T): T {
  if (typeof table === "string") return toSeanchlo(table) as unknown as T;
  if (table && typeof table === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(table)) {
      out[key] = toSeanchloTable(value);
    }
    return out as T;
  }
  return table;
}
