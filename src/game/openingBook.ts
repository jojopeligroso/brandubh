import { SYM, transformHash, transformMove } from "./d4";
import type { Move } from "./types";
import { ruleFlags, type RuleSet } from "./variants";
import { BOOK_DATA, BOOK_RULES_FINGERPRINT } from "./openingBook.data";

// ── Opening-book storage format ───────────────────────────────────────────────
// The generated data (openingBook.data.ts) stores one line per *canonical* D4
// position: `<hash>:<move>[,<move>...]`, where <hash> is the position's
// lexicographically-smallest D4 image in `hashBoard` format and each <move> is
// four digits `frfctrtc` in that same orientation. Folding by symmetry keeps the
// bundled file ~8× smaller than the expanded book; this loader unfolds each
// entry under all 8 transforms at import, so runtime lookups stay a plain
// `hashBoard(board, turn)` probe with no per-move canonicalisation cost.

const moveKey = (m: Move): string => `${m.from.row}${m.from.col}${m.to.row}${m.to.col}`;

export const encodeMove = moveKey;

/** The inverse of `encodeMove`. Exported because the puzzle bank stores its
 *  **Line**s in this same four-digit form, and two spellings of one encoding is
 *  one spelling too many. */
export const decodeMove = (s: string): Move => ({
  from: { row: Number(s[0]), col: Number(s[1]) },
  to: { row: Number(s[2]), col: Number(s[3]) },
});

/** Expand a folded book blob into the runtime map: every D4 image of every
 *  entry, keyed by raw position hash. Symmetric positions (several transforms
 *  mapping to the same hash — the opening has all 8) merge their transformed
 *  move lists, so a fully-symmetric position offers every orientation of its
 *  booked moves — free variety, at identical strength by symmetry. */
export function expandBook(data: string): Record<string, Move[]> {
  const book: Record<string, Move[]> = {};
  for (const line of data.split("\n")) {
    if (!line) continue;
    const [hash, moveList] = line.split(":");
    const moves = moveList.split(",").map(decodeMove);
    for (const t of SYM) {
      const key = transformHash(hash, t);
      const imaged = moves.map((m) => transformMove(m, t));
      const existing = (book[key] ??= []);
      for (const m of imaged) if (!existing.some((e) => moveKey(e) === moveKey(m))) existing.push(m);
    }
  }
  return book;
}

/** A ruleset reduced to its gameplay flags in a stable order — the identity the
 *  book was generated under. Any differing flag can change what a move is worth
 *  (or whether it is legal), so the book only serves exact matches. */
export function rulesFingerprint(rules: RuleSet): string {
  const flags = ruleFlags(rules);
  return Object.keys(flags)
    .sort()
    .map((k) => `${k}=${String(flags[k as keyof typeof flags])}`)
    .join(";");
}

/** True when `rules` plays identically to the ruleset the book was built for
 *  (the WTF default — including a "custom" ruleset with the same flags).
 *
 *  ⚠ This is a LEGALITY gate, not a freshness one, and it is the book's only
 *  gate. It compares gameplay rule flags; it says nothing about the
 *  `EvalWeights` the book's moves were searched under, so changing an eval
 *  weight leaves a book generated under the old weights matching, in place and
 *  still served. That is the situation today: the bundled book predates
 *  `liberties: 12`. See the `OPENING_BOOK` block in `engine.ts` for the full
 *  note and what regenerating it would require. */
export function bookRulesMatch(rules: RuleSet): boolean {
  return BOOK_RULES_FINGERPRINT !== "" && rulesFingerprint(rules) === BOOK_RULES_FINGERPRINT;
}

/** The bundled book, expanded — computed once at import. */
export function loadOpeningBook(): Record<string, Move[]> {
  return expandBook(BOOK_DATA);
}
