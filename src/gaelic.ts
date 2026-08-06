/**
 * Cló Gaelach — the standard for when the traditional Gaelic script is used.
 *
 * RULE: the cló Gaelach face is used ONLY for Irish / Scottish-Gaelic text.
 * English, Spanish, or any other language is never set in it.
 *
 * No cló font is bundled any more. The only text that ever used the face was a
 * pair of fixed words — the "Branduḃ" wordmark and the "Ollaṁ" difficulty level
 * — and those now ship as outlines (src/wordmark.ts, components/Wordmark.tsx),
 * so there is no font file to redistribute. See NOTICE.md.
 *
 * What remains here is the orthography, which is independent of the typeface.
 * A Gaelic locale (Irish `ga`, Scottish Gaelic `gd`) still flags the document
 * with `data-lang-gaelic` and still runs every string through `toSeanchloTable`;
 * that text renders in the ordinary display face. Gaelic text uses traditional
 * overdot orthography: séimhiú (lenition) is marked with the ponc séimhithe
 * (overdot) rather than a following "h" — "bh" → "ḃ", "ch" → "ċ", … "th" → "ṫ".
 *
 * `toSeanchlo` is still exported for that table conversion. Do not use it to
 * build new on-screen words expecting the cló face: outlining is the only way
 * to get the traditional letterforms now, and it only works for fixed strings.
 */

/** BCP-47 codes written in the Gaelic script. */
export const GAELIC_LANGS = new Set(["ga", "gd"]);

/** True when a language is Irish or Scottish Gaelic (i.e. uses the cló face). */
export function isGaelicLang(lang: string): boolean {
  return GAELIC_LANGS.has(lang);
}

// Lenitable consonant → its overdotted form (ponc séimhithe), preserving case.
const OVERDOT: Record<string, string> = {
  b: "ḃ", c: "ċ", d: "ḋ", f: "ḟ", g: "ġ", m: "ṁ", p: "ṗ", s: "ṡ", t: "ṫ",
  B: "Ḃ", C: "Ċ", D: "Ḋ", F: "Ḟ", G: "Ġ", M: "Ṁ", P: "Ṗ", S: "Ṡ", T: "Ṫ",
};

// Eclipsed f is written "bhf"; only the f is dotted (silenced), the b remains.
const DOTTED_F: Record<string, string> = { f: "ḟ", F: "Ḟ" };

/**
 * Convert modern Irish spelling to traditional cló Gaelach overdot orthography.
 * Séimhiú only — eclipsis (urú) is preserved: "bhf" (eclipsed f) becomes "bḟ",
 * never "ḃf"; the h-less pairs (mb, gc, nd, bp, dt, ng) pass through untouched.
 * Idempotent on its own output. Apply only to Gaelic text.
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
 * strings) to overdot orthography. Used to render a Gaelic locale. Preserves
 * object shape; non-strings are left untouched and the input is not mutated.
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
