// ── The proving ground: the instrument, without the screen ───────────────────
//
// Everything the unlisted calibration page decides, decided here, where the
// suite can reach it. The page is a shell over this file: it renders a board, a
// timer and three buttons, and every question of *which* puzzle, *which*
// anchor, *what the blob says* and *what the blob means* is answered below.
//
// ## What this is for
//
// `grade.ts` says outright that its weights are a guess. **Grades** are the
// only thing standing between a learner and an `ollaṁ` puzzle on their second
// visit, and the four **Bands** are only honest if a puzzle filed under Hard
// broadly feels hard. There is no backend and no crowd (ADR-0004), so the
// weights get fitted against a small number of real people solving real
// puzzles, and this file is the apparatus that collects them.
//
// ## The one rule the whole design turns on
//
// **Nobody is ever asked how hard a puzzle is** (ADR-0005). The protocol is
// fixed and not configurable: the position cold and timed, an attempt or a
// surrender, *then* the answer, *then* three **Comparisons** against **Anchors**
// the grader has already solved. Showing the answer before asking produces the
// curse of knowledge, which is a displaced centre rather than variance around
// the truth, so more data does not dilute it. And absolute categorical
// judgement ("is this hard?") is the noisiest instrument available, because it
// needs a remembered standard that drifts between sittings. Hence the blinding,
// and hence comparisons. Neither substitutes for the other.
//
// Nothing here ever returns a **Band**, takes one as input, or ranks a puzzle
// against a number. The only thing a grader emits is "A was harder than B".
//
// ## Where the data goes
//
// The grader's own `localStorage`, and out through `mailto:` or the clipboard —
// two buttons, no endpoint. `scripts/calibrate-grades.ts` pools the blobs
// offline. See ADR-0004 for why an endpoint would be a spam vector bought for
// one saved click.

import { poolOrder } from "./puzzlePool";
import type { GradeMeasurements } from "./grade";
import type { Puzzle } from "./puzzleBank";

// ── The unlisted path ─────────────────────────────────────────────────────────

/**
 * **Unlisted, not secured.**
 *
 * `vercel.json` rewrites `/(.*)` to `index.html`, so this needs no router: the
 * entry point compares `window.location.pathname` once. There is no password
 * and there is not going to be one. Any check made in client-side JavaScript
 * can be read out of the bundle and skipped, and a client-side password is only
 * ever meaningful when it *decrypts* the gated content. Here there is nothing to
 * decrypt: the puzzle bank ships in the bundle for the normal app, so this page
 * reveals nothing that is not already public. It is a URL nobody links to, which
 * is exactly as much as it claims to be.
 */
export const PROVING_PATH = "/proving-ground-c7f2a9e4";

export const isProvingPath = (pathname: string): boolean =>
  pathname.replace(/\/+$/, "") === PROVING_PATH;

// ── Constants the protocol is built from ──────────────────────────────────────

/** Eight **Anchors**, so three comparisons place any puzzle by binary search.
 *  All-pairs over eighty puzzles is 3,160 comparisons and would want a database
 *  to apportion; the bands only need enough resolution to cut four groups. */
export const ANCHOR_COUNT = 8;

/** Three, because `log2(8) === 3`. Fixed rather than adaptive: a variable
 *  number of questions per puzzle would make a grader's effort per puzzle
 *  informative about the puzzle, which is a channel around the blinding. */
export const COMPARISONS_PER_PUZZLE = 3;

/**
 * About a tenth of the schedule is a puzzle the grader has already done,
 * inserted silently.
 *
 * This is the **re-test noise floor** and it is not optional. Without it,
 * "the fitted formula agrees with the labels 70% of the time" is uninterpretable:
 * it might be a poor fit to good labels or a ceiling fit to noisy ones, and
 * those call for opposite responses. A grader's disagreement with their own
 * earlier judgement is the only measurement that can tell them apart.
 */
export const REPEAT_PROPORTION = 1 / 10;

/**
 * The ceiling worth treating as safe for a `mailto:` URL.
 *
 * The page measures the blob against this and steers to the clipboard rather
 * than emitting a link that might be cut. A truncated JSON array still parses,
 * so the failure would be silent and would corrupt the fit — the same instinct
 * as the `capture_mismatch` guard in `replay.ts`, which is why the blob carries
 * its own entry count.
 */
export const MAILTO_CEILING = 1800;

/** Puzzles withheld from the fit and scored on. Fifteen to twenty, per ADR-0005:
 *  a formula with six free parameters over eighty puzzles will otherwise fit the
 *  noise and report itself a success. */
export const HOLDOUT_SIZE = 18;

// ── Anchors ───────────────────────────────────────────────────────────────────

/**
 * The eight **Anchors**, spread across the *grade range* and not across the pool.
 *
 * Spreading by pool position would be wrong here for a reason `grade.ts`
 * already records: 89 of 158 puzzles grade at exactly 30, so eight evenly-spaced
 * indices would put five anchors on the same grade and the binary search would
 * be comparing a puzzle against five copies of one reference point. Spreading
 * over the *distinct* grades present gives eight genuinely different references.
 *
 * ## The circularity, and why it is not one
 *
 * These are chosen using the very grades being calibrated. That steers **which**
 * comparisons get asked and nothing else: the fit consumes raw pairwise
 * outcomes, so a badly-ordered anchor set costs information, not validity. If
 * the current grades are wrong the binary search wanders, the placements are
 * noisy, and the Bradley-Terry fit still sees every "A harder than B" a grader
 * actually gave. There is no reading of the data in which an anchor's assumed
 * position becomes evidence for itself.
 */
export function anchors(bank: readonly Puzzle[]): Puzzle[] {
  const ordered = poolOrder(bank);
  if (ordered.length <= ANCHOR_COUNT) return ordered;

  // One representative per distinct grade — the lowest **Puzzle number** at it,
  // so the choice is stable under regeneration the way the pool order is.
  const byGrade: Puzzle[] = [];
  for (const p of ordered) {
    if (byGrade.length === 0 || byGrade[byGrade.length - 1].grade !== p.grade) byGrade.push(p);
  }
  const source = byGrade.length >= ANCHOR_COUNT ? byGrade : ordered;
  const out: Puzzle[] = [];
  for (let i = 0; i < ANCHOR_COUNT; i++) {
    // Evenly spaced across the source including both ends, so the anchor set
    // spans the range rather than sitting inside it.
    out.push(source[Math.round((i * (source.length - 1)) / (ANCHOR_COUNT - 1))]);
  }
  return out;
}

/**
 * The next anchor to ask about, given the answers so far, or null when the
 * three questions are done.
 *
 * A plain binary search over an inclusive range of eight, which halves exactly
 * three times: 8 → 4 → 2 → 1. `true` means *harder than this anchor*.
 */
export function nextAnchorIndex(answers: readonly boolean[]): number | null {
  if (answers.length >= COMPARISONS_PER_PUZZLE) return null;
  let lo = 0;
  let hi = ANCHOR_COUNT - 1;
  for (const harder of answers) {
    const mid = (lo + hi) >> 1;
    if (harder) lo = mid + 1;
    else hi = mid;
  }
  return (lo + hi) >> 1;
}

/**
 * Where three answers put a puzzle: an anchor index in `0..7`.
 *
 * Used for the **noise floor** and for nothing else. The fit never sees this —
 * it sees the pairs. A placement is a summary of three answers, and summarising
 * is exactly what makes it the right thing to check a grader against themselves
 * with, because two runs that disagree on one question out of three but land in
 * the same place have not really disagreed.
 */
export function placement(answers: readonly boolean[]): number {
  let lo = 0;
  let hi = ANCHOR_COUNT - 1;
  for (const harder of answers.slice(0, COMPARISONS_PER_PUZZLE)) {
    const mid = (lo + hi) >> 1;
    if (harder) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ── The schedule ──────────────────────────────────────────────────────────────

/** A seeded PRNG, so a schedule is a pure function of its seed and the bank.
 *  Mulberry32, the same generator `ai.test.ts` uses to make searches
 *  reproducible; nothing here needs a better one, and a shared one is one fewer
 *  thing that can differ between a test and a session. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed string to a number. Any stable hash does; this is FNV-1a. The seed is
 *  a *word the grader types*, not a number they generate, because "ana" is
 *  repeatable over the phone and 2748143 is not. */
export function seedNumber(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The order one grader meets the puzzles in.
 *
 * Three things at once, and each of them is one of ADR-0005's four measurement
 * instruments:
 *
 *  1. **The anchors come first**, in ascending grade order, and are asked no
 *     comparisons. A comparison is against an anchor *the grader has already
 *     solved*, so the reference set has to be established before anything can be
 *     placed against it. Ascending rather than shuffled: the anchors are the one
 *     part of the session where a smooth ramp is wanted, because the grader is
 *     building the internal scale the rest of the session is measured on.
 *  2. **The rest is shuffled per session.** Contrast effects are real — a puzzle
 *     after a hard one reads easier — and shuffling spreads them across puzzles
 *     instead of letting them attach to whichever puzzles happen to follow the
 *     hard ones in pool order.
 *  3. **About a tenth recur**, placed in the back half so a repeat is never
 *     adjacent to its first showing. They are not marked, and the page must not
 *     mark them: a grader who knows they are being re-tested is not being
 *     re-tested.
 *
 * Pure and seeded, so `scripts/calibrate-grades.ts` rebuilds the exact schedule
 * from the blob's seed and never has to be told which puzzle an entry was.
 */
export function schedule(bank: readonly Puzzle[], seed: string, size: number): string[] {
  const anchorIds = anchors(bank).map((p) => p.id);
  const anchorSet = new Set(anchorIds);
  const rest = poolOrder(bank)
    .filter((p) => !anchorSet.has(p.id))
    .map((p) => p.id);

  const rng = mulberry32(seedNumber(seed));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const body = rest.slice(0, Math.max(0, Math.min(size, rest.length)));

  // Repeats are drawn from the *first half* and inserted into the second, so
  // every repeat has a first showing well behind it. A repeat next to its
  // original measures short-term memory rather than judgement.
  const repeatCount = Math.floor(body.length * REPEAT_PROPORTION);
  const half = Math.floor(body.length / 2);
  const out = [...body];
  for (let i = 0; i < repeatCount && half > 0; i++) {
    const from = Math.floor(rng() * half);
    const at = half + Math.floor(rng() * Math.max(1, out.length - half));
    out.splice(at, 0, body[from]);
  }
  return [...anchorIds, ...out];
}

/** True for a schedule position that is an anchor and therefore asked no
 *  comparisons. The anchors are always the first `ANCHOR_COUNT` entries. */
export const isAnchorPosition = (index: number): boolean => index < ANCHOR_COUNT;

// ── What a session accumulates ────────────────────────────────────────────────

/** One puzzle met once. A repeat produces a second `Entry` with the same id,
 *  which is the whole point of a repeat. */
export interface Entry {
  puzzleId: string;
  /** Seconds from the position appearing to the attempt ending, capped by the
   *  encoding at 1295 (`zz` in base 36) — twenty-one minutes, which is a
   *  grader who walked away rather than a measurement. */
  seconds: number;
  /** True for solved, false for surrendered. Both are legitimate ends of an
   *  attempt and neither is scored; this is a covariate, not a mark. */
  solved: boolean;
  /** Three `true`/`false` answers, or empty for an anchor. `true` is
   *  *harder than the anchor*. */
  answers: boolean[];
}

export interface Session {
  version: 1;
  /** Whatever the grader typed to identify themselves. Pooled by the script and
   *  never shown to anyone else; two graders must not collide, which is all it
   *  is for. */
  grader: string;
  /** Doubles as the schedule seed, so one word reproduces a whole session. */
  seed: string;
  /** Non-anchor puzzles requested. With the anchors and the repeats, the
   *  schedule is longer than this. */
  size: number;
  entries: Entry[];
}

// ── The blob ──────────────────────────────────────────────────────────────────
//
// Fixed-width four characters per entry, and no puzzle ids at all: the schedule
// is a pure function of the seed and the bank, so repeating the ids would be
// storing something the reader can already derive. An eighty-puzzle run is about
// 380 characters of payload, comfortably inside the `mailto:` ceiling — which is
// the whole reason the encoding is this tight rather than a readable JSON array.
//
//   [0..1]  seconds, base 36, two digits, capped at `zz`
//   [2]     `s` solved, `r` revealed
//   [3]     the three answers as an octal digit, or `-` for an anchor

const SECONDS_CAP = 36 * 36 - 1;

const encodeEntry = (e: Entry): string => {
  const secs = Math.max(0, Math.min(SECONDS_CAP, Math.round(e.seconds)));
  const answers = e.answers.length
    ? String(e.answers.reduce((acc, a, i) => acc | (a ? 1 << i : 0), 0))
    : "-";
  return secs.toString(36).padStart(2, "0") + (e.solved ? "s" : "r") + answers;
};

export function encodeSession(s: Session): string {
  return JSON.stringify({
    v: s.version,
    g: s.grader,
    s: s.seed,
    z: s.size,
    // The self-reported entry count, checked against the payload on the way in.
    n: s.entries.length,
    d: s.entries.map(encodeEntry).join(""),
  });
}

export type DecodeResult =
  | { ok: true; session: Session }
  | { ok: false; reason: string };

/**
 * Read a blob back, refusing anything that does not add up.
 *
 * **The entry-count check is the point of the format.** ADR-0004 explains it: a
 * truncated `mailto:` URL yields a truncated JSON string that still parses, so
 * the failure mode this guards is silent corruption of the fit rather than a
 * crash. `n` is written by the sender and `d.length / 4` is what arrived; a
 * disagreement means characters were lost in transit and the blob is refused
 * outright rather than trimmed to what survived. `replay.ts`'s
 * `capture_mismatch` is the same instinct against the same class of bug.
 *
 * The schedule is rebuilt from `s` and `z` rather than carried, so a blob is
 * meaningless without the bank it was recorded against — which also means a blob
 * recorded against a different bank is caught here rather than silently
 * mismatched onto the wrong puzzles.
 */
export function decodeSession(blob: string, bank: readonly Puzzle[]): DecodeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(blob);
  } catch {
    return { ok: false, reason: "not JSON" };
  }
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not an object" };
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return { ok: false, reason: `unknown version ${String(o.v)}` };
  if (typeof o.g !== "string" || !o.g) return { ok: false, reason: "no grader" };
  if (typeof o.s !== "string" || !o.s) return { ok: false, reason: "no seed" };
  if (typeof o.z !== "number" || !Number.isInteger(o.z) || o.z < 0)
    return { ok: false, reason: "no size" };
  if (typeof o.n !== "number" || !Number.isInteger(o.n) || o.n < 0)
    return { ok: false, reason: "no entry count" };
  if (typeof o.d !== "string") return { ok: false, reason: "no payload" };

  if (o.d.length % 4 !== 0) return { ok: false, reason: "payload is not whole entries" };
  const arrived = o.d.length / 4;
  if (arrived !== o.n) {
    return { ok: false, reason: `entry count ${o.n} but ${arrived} entries arrived` };
  }

  const order = schedule(bank, o.s, o.z);
  if (o.n > order.length) {
    return { ok: false, reason: `${o.n} entries against a schedule of ${order.length}` };
  }

  const entries: Entry[] = [];
  for (let i = 0; i < arrived; i++) {
    const chunk = o.d.slice(i * 4, i * 4 + 4);
    const seconds = parseInt(chunk.slice(0, 2), 36);
    if (!Number.isFinite(seconds)) return { ok: false, reason: `entry ${i}: bad time` };
    if (chunk[2] !== "s" && chunk[2] !== "r")
      return { ok: false, reason: `entry ${i}: bad outcome` };
    const answers: boolean[] = [];
    if (chunk[3] !== "-") {
      const bits = Number(chunk[3]);
      if (!Number.isInteger(bits) || bits < 0 || bits > 7)
        return { ok: false, reason: `entry ${i}: bad comparisons` };
      for (let b = 0; b < COMPARISONS_PER_PUZZLE; b++) answers.push((bits & (1 << b)) !== 0);
    }
    // An anchor carries no comparisons and everything else carries three. A blob
    // that disagrees with its own schedule about which is which has been
    // recorded against a different bank, and is refused for the same reason a
    // short payload is.
    if (isAnchorPosition(i) !== (answers.length === 0)) {
      return { ok: false, reason: `entry ${i}: comparisons do not match the schedule` };
    }
    entries.push({ puzzleId: order[i], seconds, solved: chunk[2] === "s", answers });
  }
  return {
    ok: true,
    session: { version: 1, grader: o.g, seed: o.s, size: o.z, entries },
  };
}

// ── Comparisons ───────────────────────────────────────────────────────────────

/** One pairwise judgement, in the direction the fit wants: `harder` beat
 *  `easier`. Anchors are ordinary items in the ranking, which is what lets a
 *  grader's anchor-versus-anchor implied ordering feed the same fit. */
export interface Pair {
  harder: string;
  easier: string;
  /** Which grader said so, so the script can drop or weight one. */
  grader: string;
}

/** Every comparison a session implies, replaying the binary search so the blob
 *  never has to say which anchor a question was about. */
export function pairsOf(session: Session, bank: readonly Puzzle[]): Pair[] {
  const anchorIds = anchors(bank).map((p) => p.id);
  const out: Pair[] = [];
  for (const e of session.entries) {
    for (let i = 0; i < e.answers.length; i++) {
      const idx = nextAnchorIndex(e.answers.slice(0, i));
      if (idx === null || !anchorIds[idx]) continue;
      const anchor = anchorIds[idx];
      // A puzzle compared against itself says nothing and would give the fit a
      // self-loop. It can happen: a repeat of an anchor is scheduled like any
      // other puzzle if the pool ever shrinks to include one.
      if (anchor === e.puzzleId) continue;
      out.push(
        e.answers[i]
          ? { harder: e.puzzleId, easier: anchor, grader: session.grader }
          : { harder: anchor, easier: e.puzzleId, grader: session.grader },
      );
    }
  }
  return out;
}

// ── The re-test noise floor ───────────────────────────────────────────────────

export interface NoiseFloor {
  /** Puzzles the grader met more than once. */
  repeats: number;
  /** Of those, how many landed somewhere else the second time. */
  placementDisagreements: number;
  /** Individual questions asked in both passes about the same anchor. */
  comparisons: number;
  comparisonDisagreements: number;
}

/**
 * How often a grader disagrees with themselves.
 *
 * Two numbers rather than one, because they measure different things and the
 * fit is scored against both. The **comparison** rate is the like-for-like
 * ceiling on any per-comparison accuracy the fit reports. The **placement**
 * rate is the like-for-like ceiling on anything band-shaped, and is the kinder
 * of the two: two passes that differ on one question of three but land in the
 * same place have not disagreed about anything that matters.
 *
 * A repeat's second pass may ask about different anchors, because the binary
 * search follows the answers. Only questions asked in *both* passes count
 * toward the comparison rate — anything else would be counting a divergence
 * twice, once as itself and once as the different question it caused.
 */
export function noiseFloor(sessions: readonly Session[]): NoiseFloor {
  const out: NoiseFloor = {
    repeats: 0,
    placementDisagreements: 0,
    comparisons: 0,
    comparisonDisagreements: 0,
  };
  for (const s of sessions) {
    const seen = new Map<string, Entry>();
    for (const e of s.entries) {
      const first = seen.get(e.puzzleId);
      if (!first) {
        seen.set(e.puzzleId, e);
        continue;
      }
      if (!first.answers.length || !e.answers.length) continue;
      out.repeats++;
      if (placement(first.answers) !== placement(e.answers)) out.placementDisagreements++;
      // Walk both searches together and compare only while they are on the same
      // question, which is exactly while the answers so far have agreed.
      for (let i = 0; i < COMPARISONS_PER_PUZZLE; i++) {
        const a = nextAnchorIndex(first.answers.slice(0, i));
        const b = nextAnchorIndex(e.answers.slice(0, i));
        if (a === null || a !== b) break;
        out.comparisons++;
        if (first.answers[i] !== e.answers[i]) out.comparisonDisagreements++;
      }
    }
  }
  return out;
}

// ── Bradley-Terry ─────────────────────────────────────────────────────────────

/**
 * Latent difficulty from pairwise wins, by the standard MM iteration.
 *
 * Returns log-strengths, centred on zero. The model is that the probability A is
 * judged harder than B is `pA / (pA + pB)`; the update is
 * `pi <- Wi / sum_j Nij / (pi + pj)`, which is guaranteed to increase the
 * likelihood at every step.
 *
 * **The prior is not decoration.** With 240 comparisons over 80 puzzles most
 * items are in three or four pairs, and an item that wins all of them has an
 * unbounded maximum-likelihood strength: the iteration walks off to infinity and
 * takes everything connected to it along. Half a win and half a loss against a
 * phantom item of fixed strength 1 keeps every estimate finite and costs almost
 * nothing where the data is real. This is the same reason a sparse comparison
 * graph is smoothed rather than pruned: dropping the undefeated items would
 * drop the hardest puzzles, which are the ones the top band is made of.
 */
export function bradleyTerry(
  pairs: readonly Pair[],
  opts: { iterations?: number; prior?: number } = {},
): Map<string, number> {
  const iterations = opts.iterations ?? 200;
  const prior = opts.prior ?? 0.5;

  const items = new Set<string>();
  for (const p of pairs) {
    items.add(p.harder);
    items.add(p.easier);
  }
  const ids = [...items].sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  if (n === 0) return new Map();

  const wins = new Array(n).fill(prior);
  // `meetings[i]` is a sparse map of opponent → how many times they met.
  const meetings: Map<number, number>[] = ids.map(() => new Map());
  for (const p of pairs) {
    const a = index.get(p.harder)!;
    const b = index.get(p.easier)!;
    wins[a] += 1;
    meetings[a].set(b, (meetings[a].get(b) ?? 0) + 1);
    meetings[b].set(a, (meetings[b].get(a) ?? 0) + 1);
  }

  // The phantom is fixed at strength 1, so it pins the scale by itself and the
  // iteration is *not* renormalised between steps — renormalising would fight
  // the very thing keeping the estimate finite. The output is centred once, at
  // the end, because a log-strength is only ever read as a difference.
  const p = new Array(n).fill(1);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      let denom = (2 * prior) / (p[i] + 1); // the phantom
      for (const [j, count] of meetings[i]) denom += count / (p[i] + p[j]);
      p[i] = denom > 0 ? Math.max(1e-12, wins[i] / denom) : p[i];
    }
  }

  const logs = p.map((x) => Math.log(x));
  const mean = logs.reduce((a, b) => a + b, 0) / n;
  return new Map(ids.map((id, i) => [id, logs[i] - mean]));
}

// ── Fitting the grade weights ─────────────────────────────────────────────────

/**
 * The features a grade is a linear function of, in the order `GRADE_WEIGHTS`
 * names them. Intercept first.
 *
 * Salience enters positively here and is *subtracted* in `gradeOf`, so a fitted
 * coefficient is negated on its way into the table. That is worth doing rather
 * than flipping the signs in `gradeOf`: the table reads "subtracted when the
 * flag is set", which is what a salient move being easier means, and a fit is
 * not a reason to make the shipped formula read backwards.
 */
export const FEATURE_NAMES = [
  "intercept",
  "depthToFind",
  "linePastFirst",
  "capture",
  "movesKing",
  "towardCorner",
  "onlyMoveOfPiece",
] as const;

export function featuresOf(m: GradeMeasurements): number[] {
  return [
    1,
    m.depthToFind,
    Math.max(0, m.lineLength - 1),
    m.salience.capture ? 1 : 0,
    m.salience.movesKing ? 1 : 0,
    m.salience.towardCorner ? 1 : 0,
    m.salience.onlyMoveOfPiece ? 1 : 0,
  ];
}

/**
 * Ridge-regularised least squares by Gaussian elimination on the normal
 * equations.
 *
 * Seven parameters over at most eighty rows, so the direct solve is fine and a
 * dependency would not be. The ridge term is doing real work rather than
 * guarding a corner: `grade.ts` records that `lineLength` is 1 on 157 of 158
 * puzzles, so its column is *nearly constant* and `XᵀX` is *nearly singular*.
 * Without the ridge the fit would hand that column an enormous coefficient
 * fitted to one puzzle and report a good residual. With it, a column that does
 * not vary gets a coefficient near zero, which is the truthful answer: an
 * unvarying measurement has no evidence for any weight at all.
 */
export function ridgeSolve(rows: number[][], y: number[], lambda = 1e-3): number[] {
  const k = rows[0]?.length ?? 0;
  if (k === 0 || rows.length !== y.length) return [];
  const a: number[][] = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let sum = 0;
      for (let r = 0; r < rows.length; r++) sum += rows[r][i] * rows[r][j];
      a[i][j] = sum + (i === j && i > 0 ? lambda : 0); // never penalise the intercept
    }
    let rhs = 0;
    for (let r = 0; r < rows.length; r++) rhs += rows[r][i] * y[r];
    a[i][k] = rhs;
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) continue;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c <= k; c++) a[r][c] -= f * a[col][c];
    }
  }
  return Array.from({ length: k }, (_, i) =>
    Math.abs(a[i][i]) < 1e-12 ? 0 : a[i][k] / a[i][i],
  );
}

export interface FittedWeights {
  depthToFind: number;
  linePastFirst: number;
  salience: {
    capture: number;
    movesKing: number;
    towardCorner: number;
    onlyMoveOfPiece: number;
  };
  /** The raw regression coefficients, before rescaling, in `FEATURE_NAMES`
   *  order. Kept so the calibration report can show what was actually fitted
   *  rather than only what was rounded. */
  coefficients: number[];
  /** What the coefficients were multiplied by to reach the table. */
  scale: number;
}

/**
 * Fit `GRADE_WEIGHTS` to Bradley-Terry strengths.
 *
 * ## Why the scale is arbitrary, and chosen anyway
 *
 * Bradley-Terry strengths are log-odds and have no natural unit; grades have no
 * natural unit either, and `grade.ts` says so ("the units are arbitrary and only
 * the cuts below give them meaning"). So the fit determines the weights only up
 * to a positive multiple, and the multiple has to be picked for readability.
 * It is picked so the largest weight is 100 — the magnitude the current guessed
 * table is written in, which keeps a fitted table diffable against the guessed
 * one and keeps `BAND_CUTS`, which 8f redraws from the fitted distribution
 * anyway, in a familiar range.
 *
 * A degenerate fit (every coefficient zero, which is what a single unvarying
 * feature set produces) gets scale 1 rather than a division by zero, and the
 * report says the fit is degenerate rather than printing zeros as a result.
 */
export function fitWeights(
  strengths: ReadonlyMap<string, number>,
  puzzles: readonly Puzzle[],
): FittedWeights {
  const rows: number[][] = [];
  const y: number[] = [];
  for (const p of puzzles) {
    const s = strengths.get(p.id);
    if (s === undefined) continue;
    rows.push(featuresOf(p.measurements));
    y.push(s);
  }
  const beta = rows.length ? ridgeSolve(rows, y) : [];
  const magnitude = Math.max(...beta.slice(1).map((b) => Math.abs(b)), 0);
  const scale = magnitude > 1e-9 ? 100 / magnitude : 1;
  const at = (i: number) => Math.round(((beta[i] ?? 0) * scale) / 5) * 5;
  return {
    depthToFind: at(1),
    linePastFirst: at(2),
    // Negated: the table subtracts salience, so a feature that makes a puzzle
    // *easier* has a negative coefficient and a positive table entry.
    salience: {
      capture: -at(3),
      movesKing: -at(4),
      towardCorner: -at(5),
      onlyMoveOfPiece: -at(6),
    },
    coefficients: beta,
    scale,
  };
}

/** A grade under a candidate table, so the script can score a fit without
 *  editing `grade.ts` first. Mirrors `gradeOf` exactly, floor included. */
export function gradeUnder(w: FittedWeights, m: GradeMeasurements): number {
  let g = m.depthToFind * w.depthToFind + Math.max(0, m.lineLength - 1) * w.linePastFirst;
  if (m.salience.capture) g -= w.salience.capture;
  if (m.salience.movesKing) g -= w.salience.movesKing;
  if (m.salience.towardCorner) g -= w.salience.towardCorner;
  if (m.salience.onlyMoveOfPiece) g -= w.salience.onlyMoveOfPiece;
  return Math.max(0, g);
}

// ── The holdout ───────────────────────────────────────────────────────────────

/**
 * Which puzzles are withheld from the fit.
 *
 * Deterministic from the **Puzzle number** alone, and therefore fixed before any
 * data exists. That is the property that matters: a holdout chosen after seeing
 * the comparisons — or chosen from a grader's seed, which amounts to the same
 * thing once the blobs are in hand — is not a holdout, it is a second fit. The
 * hash is FNV-1a over the id, which has no relationship to grade, band or pool
 * order, so the split does not accidentally hold out one end of the range.
 *
 * ## An anchor is never held out, and the plan did not say so
 *
 * This is the one place 8e's specification is wrong, and it is wrong quietly.
 * "Weights fitted on part of the data and scored on a holdout of 15-20" reads
 * as a puzzle-level split, and would be right if the comparison graph were
 * dense. It is not: every comparison is *against an anchor*, so the graph is a
 * star with eight centres and every single edge touches one of them. Holding a
 * puzzle out removes its three edges. Holding an **anchor** out removes an edge
 * from every puzzle in the session — and if the fit drops any pair with a
 * held-out endpoint, as it must, it drops **all** of them.
 *
 * Measured, not reasoned: eighteen items held out of the sixty-eight a
 * sixty-puzzle session touches took six anchors with them, and 198 comparisons
 * became 7. The fit still ran, still reported coefficients, and gave
 * `depthToFind` a *negative* weight from seven pairs among eight items. Nothing
 * threw. That is the failure mode worth naming: a star graph does not degrade
 * when you sample its centres, it collapses, and it collapses into numbers that
 * still look like an answer.
 *
 * So the anchors are excluded from the candidate pool. They are not items being
 * measured; they are the ruler. Holding out a puzzle asks "can the formula place
 * a puzzle it never saw?", which is the question. Holding out a ruler asks
 * nothing.
 */
export function holdoutSplit(
  ids: readonly string[],
  size = HOLDOUT_SIZE,
  exclude: ReadonlySet<string> = new Set(),
): { fit: string[]; test: string[] } {
  const eligible = [...ids].filter((id) => !exclude.has(id));
  const ranked = eligible.sort((a, b) => seedNumber(a) - seedNumber(b) || a.localeCompare(b));
  const test = ranked.slice(0, Math.max(0, Math.min(size, ranked.length)));
  const held = new Set(test);
  return { fit: [...ids].filter((id) => !held.has(id)).sort(), test: test.sort() };
}

/** The anchors, as the set `holdoutSplit` has to be told to leave alone. A
 *  one-line helper so no caller has to remember the rule above. */
export const anchorIdSet = (bank: readonly Puzzle[]): Set<string> =>
  new Set(anchors(bank).map((p) => p.id));

/**
 * How often a candidate table predicts a comparison the fit never saw.
 *
 * Only pairs with a held-out puzzle on at least one side count; anything else
 * is scoring the fit on its own training data. Ties in the predicted grade are
 * counted as wrong rather than as half, because a table that cannot separate
 * two puzzles has not predicted which is harder, and 89 of 158 puzzles share a
 * grade under the current table — a scoring rule that rewarded ties would
 * flatter exactly the failure this measurement exists to catch.
 */
export function holdoutAccuracy(
  w: FittedWeights,
  pairs: readonly Pair[],
  puzzles: readonly Puzzle[],
  test: ReadonlySet<string>,
): { scored: number; correct: number; ties: number } {
  const byId = new Map(puzzles.map((p) => [p.id, p]));
  let scored = 0;
  let correct = 0;
  let ties = 0;
  for (const pair of pairs) {
    if (!test.has(pair.harder) && !test.has(pair.easier)) continue;
    const a = byId.get(pair.harder);
    const b = byId.get(pair.easier);
    if (!a || !b) continue;
    scored++;
    const ga = gradeUnder(w, a.measurements);
    const gb = gradeUnder(w, b.measurements);
    if (ga > gb) correct++;
    else if (ga === gb) ties++;
  }
  return { scored, correct, ties };
}

// ── Where a session lives while it is being taken ─────────────────────────────

export const PROVING_KEY = "brandubh.proving.v1";

/** Tolerant, in the `tutorials.ts` idiom: a session that will not parse is a
 *  session the grader starts again, which is worth nothing to throw over. */
export function parseStoredSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Session>;
    if (o.version !== 1 || typeof o.grader !== "string" || typeof o.seed !== "string") return null;
    if (typeof o.size !== "number" || !Array.isArray(o.entries)) return null;
    const entries = o.entries.filter(
      (e): e is Entry =>
        !!e &&
        typeof e.puzzleId === "string" &&
        typeof e.seconds === "number" &&
        typeof e.solved === "boolean" &&
        Array.isArray(e.answers),
    );
    return { version: 1, grader: o.grader, seed: o.seed, size: o.size, entries };
  } catch {
    return null;
  }
}

export function loadSession(): Session | null {
  try {
    return parseStoredSession(localStorage.getItem(PROVING_KEY));
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(PROVING_KEY, JSON.stringify(s));
  } catch {
    /* ignore persistence failures */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(PROVING_KEY);
  } catch {
    /* ignore persistence failures */
  }
}
