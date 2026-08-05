/* Offline grade calibration. Run:
 *   npx tsx scripts/calibrate-grades.ts data/blobs/*.json
 *   cat blob.json | npx tsx scripts/calibrate-grades.ts -
 *
 * Ingests the blobs the **Proving ground** produces, pools them across graders,
 * fits `GRADE_WEIGHTS` by Bradley-Terry plus least squares, scores the fit on a
 * holdout it never saw, and prints a table to paste into `src/game/grade.ts`.
 *
 * This is 8f's tool. It changes nothing: it reads blobs and writes stdout, and
 * the paste is a human's decision. Nothing here edits `grade.ts`, and nothing
 * here touches the bank, the shards or the ledger — the puzzle **Measurements**
 * are facts that no refit can change, which is the whole reason the bank stores
 * measurements and computes the grade at import.
 *
 * ## The one number this must never print alone
 *
 * **The fit accuracy is meaningless without the re-test noise floor beside it.**
 * Roughly 240 comparisons over 80 puzzles is thin, and the holdout is eighteen
 * puzzles: a 70% fit against a 30% self-disagreement rate is at ceiling, not
 * mediocre, and the two call for opposite responses. About a tenth of every
 * schedule is a puzzle the grader has already seen, unmarked, and the rate at
 * which they contradict themselves is the only measurement that can tell a poor
 * fit from a good fit to noisy labels. So the report prints them together, in
 * the same block, and there is no flag to print one without the other.
 *
 * ## And the second number, which the plan did not anticipate
 *
 * A held-out comparison the fitted table scores as a **tie** is counted wrong,
 * because a table that cannot separate two puzzles has not said which is
 * harder. Under the shipped table 92 of 161 puzzles grade at exactly 30, so
 * ties are not a rounding detail: on a synthetic perfectly-consistent grader
 * they were 43 of 66 held-out comparisons, and the same fit that scored 0.33
 * overall scored 0.96 on the comparisons it did not tie. Both are true and only
 * the second is about ordering. The report prints correct, tied and scored as
 * three numbers, because a single rate here is a number that will be misread.
 */

import { readFileSync } from "node:fs";

import {
  ANCHOR_COUNT,
  HOLDOUT_SIZE,
  anchorIdSet,
  anchors,
  bradleyTerry,
  decodeSession,
  fitWeights,
  gradeUnder,
  holdoutAccuracy,
  holdoutSplit,
  noiseFloor,
  pairsOf,
  type Pair,
  type Session,
} from "../src/game/proving";
import { BAND_CUTS, BANDS, GRADE_WEIGHTS, bandOf } from "../src/game/grade";
import { loadBank } from "../src/game/puzzleBank";
import { DEFAULT_VARIANT, VARIANTS } from "../src/game/variants";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: npx tsx scripts/calibrate-grades.ts <blob.json ...>   (or - for stdin)");
  process.exit(2);
}

// The ruleset the bank was verified under, and the only one under which a blob
// means anything. `loadBank` returns nothing under any other.
const bank = loadBank(VARIANTS[DEFAULT_VARIANT]);
if (bank.length === 0) {
  console.error("the bank is empty under the default ruleset; nothing to calibrate");
  process.exit(1);
}

// ── Ingest ────────────────────────────────────────────────────────────────────

const sessions: Session[] = [];
let refused = 0;
for (const path of args) {
  const raw = path === "-" ? readFileSync(0, "utf8") : readFileSync(path, "utf8");
  // One blob per file, or one per line: a grader who pasted two into one file
  // should not have to split them by hand.
  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const out = decodeSession(line, bank);
    if (!out.ok) {
      // Refused, never trimmed to what survived. A truncated blob still parses,
      // which is the failure this whole format exists to catch.
      console.error(`refused (${path}): ${out.reason}`);
      refused++;
      continue;
    }
    sessions.push(out.session);
  }
}
if (sessions.length === 0) {
  console.error("no usable blobs");
  process.exit(1);
}

const graders = [...new Set(sessions.map((s) => s.grader))].sort();
const entries = sessions.reduce((n, s) => n + s.entries.length, 0);
const pairs: Pair[] = sessions.flatMap((s) => pairsOf(s, bank));
const reached = new Set(pairs.flatMap((p) => [p.harder, p.easier]));

console.log(`\n${sessions.length} session(s) from ${graders.length} grader(s): ${graders.join(", ")}`);
if (refused) console.log(`  ${refused} blob(s) refused`);
console.log(`  ${entries} puzzles met, ${pairs.length} comparisons, ${reached.size} distinct puzzles reached`);
console.log(`  bank ${bank.length}, anchors ${ANCHOR_COUNT}: ${anchors(bank).map((p) => p.id).join(" ")}`);

// A per-grader line, because "graders work independently and their blobs are
// pooled" is only a noise reducer if there is more than one of them, and a run
// dominated by one grader should say so on its face rather than in a footnote.
for (const g of graders) {
  const mine = sessions.filter((s) => s.grader === g);
  const n = mine.reduce((a, s) => a + s.entries.length, 0);
  const solved = mine.reduce((a, s) => a + s.entries.filter((e) => e.solved).length, 0);
  const secs = mine.flatMap((s) => s.entries.map((e) => e.seconds)).sort((a, b) => a - b);
  const median = secs.length ? secs[Math.floor(secs.length / 2)] : 0;
  console.log(
    `    ${g.padEnd(12)} ${String(n).padStart(4)} puzzles, ` +
      `${((100 * solved) / Math.max(1, n)).toFixed(0)}% solved, median ${median}s`,
  );
}

// ── The noise floor, printed before anything it is the floor for ──────────────

const floor = noiseFloor(sessions);
const floorRate = floor.comparisons ? floor.comparisonDisagreements / floor.comparisons : NaN;
const placeRate = floor.repeats ? floor.placementDisagreements / floor.repeats : NaN;
console.log(`\nre-test noise floor (the silent repeats, ~1 in 10 of every schedule)`);
if (floor.repeats === 0) {
  console.log(`  NO REPEATS SEEN. Every number below is uninterpretable; do not fit on this.`);
} else {
  console.log(
    `  ${floor.repeats} repeat(s): ${floor.placementDisagreements} landed elsewhere ` +
      `(${(100 * placeRate).toFixed(0)}%)`,
  );
  console.log(
    `  ${floor.comparisons} question(s) asked twice: ${floor.comparisonDisagreements} answered ` +
      `differently (${(100 * floorRate).toFixed(0)}%)`,
  );
}

// ── Fit ───────────────────────────────────────────────────────────────────────

// The anchors are the ruler and are never held out. Every comparison is against
// an anchor, so the comparison graph is a star with eight centres: holding one
// out removes an edge from every puzzle in the session, and dropping pairs with
// a held-out endpoint then drops all of them. Measured: eighteen items held out
// of the sixty-eight a sixty-puzzle session touches took six anchors with them
// and turned 198 comparisons into 7, with no error and a negative fitted weight
// for `depthToFind` as the result.
const { test } = holdoutSplit([...reached], HOLDOUT_SIZE, anchorIdSet(bank));
const held = new Set(test);
const fitPairs = pairs.filter((p) => !held.has(p.harder) && !held.has(p.easier));

const strengths = bradleyTerry(fitPairs);
const fitted = fitWeights(strengths, bank);
const acc = holdoutAccuracy(fitted, pairs, bank, held);

console.log(`\nfit: ${fitPairs.length} comparison(s) over ${strengths.size} puzzle(s)`);
console.log(`  holdout: ${test.length} puzzle(s) withheld, fixed by puzzle number before any data existed`);
if (strengths.size <= test.length) {
  // A short run holds out most of what it reached, and then fits on almost
  // nothing while still printing a table. ADR-0005 budgets ~240 comparisons
  // across four or five graders for a reason; this says so rather than letting
  // a table from six comparisons look like an answer.
  console.log(`  TOO THIN: the holdout is as large as the fit set. Run more sessions before pasting.`);
}
if (acc.scored === 0) {
  console.log(`  NOTHING SCORED. No held-out puzzle was compared; widen the sessions.`);
} else {
  console.log(
    `  scored ${acc.scored}: ${acc.correct} correct, ${acc.ties} tied (counted wrong), ` +
      `${acc.scored - acc.correct - acc.ties} wrong`,
  );
  console.log(`    overall  ${((100 * acc.correct) / acc.scored).toFixed(0)}%`);
  const untied = acc.scored - acc.ties;
  if (untied > 0) {
    console.log(`    untied   ${((100 * acc.correct) / untied).toFixed(0)}%  (of the ${untied} it did not tie)`);
  }
  if (Number.isFinite(floorRate)) {
    console.log(
      `    floor    ${(100 * (1 - floorRate)).toFixed(0)}%  — the ceiling any fit can reach against these labels`,
    );
  }
}

// ── The table ─────────────────────────────────────────────────────────────────

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
console.log(`\nfitted GRADE_WEIGHTS (paste into src/game/grade.ts):`);
console.log(`
export const GRADE_WEIGHTS = {
  depthToFind: ${fitted.depthToFind},
  linePastFirst: ${fitted.linePastFirst},
  salience: {
    capture: ${fitted.salience.capture},
    movesKing: ${fitted.salience.movesKing},
    towardCorner: ${fitted.salience.towardCorner},
    onlyMoveOfPiece: ${fitted.salience.onlyMoveOfPiece},
  },
} as const;
`);
console.log(`  against the shipped guess:`);
console.log(`    depthToFind      ${String(GRADE_WEIGHTS.depthToFind).padStart(5)} -> ${String(fitted.depthToFind).padStart(5)}  (${sign(fitted.depthToFind - GRADE_WEIGHTS.depthToFind)})`);
console.log(`    linePastFirst    ${String(GRADE_WEIGHTS.linePastFirst).padStart(5)} -> ${String(fitted.linePastFirst).padStart(5)}  (${sign(fitted.linePastFirst - GRADE_WEIGHTS.linePastFirst)})`);
for (const k of ["capture", "movesKing", "towardCorner", "onlyMoveOfPiece"] as const) {
  console.log(
    `    ${k.padEnd(16)} ${String(GRADE_WEIGHTS.salience[k]).padStart(5)} -> ` +
      `${String(fitted.salience[k]).padStart(5)}  (${sign(fitted.salience[k] - GRADE_WEIGHTS.salience[k])})`,
  );
}
console.log(`  raw coefficients: ${fitted.coefficients.map((c) => c.toFixed(4)).join(", ")}`);
console.log(`  scaled by ${fitted.scale.toFixed(3)} so the largest weight is 100 — the unit is arbitrary`);
if (fitted.scale === 1 && fitted.coefficients.every((c) => Math.abs(c) < 1e-9)) {
  console.log(`  DEGENERATE: every coefficient is zero. There is nothing here to paste.`);
}

// ── What the new table does to the bands ──────────────────────────────────────
//
// Re-banding is 8f's next step and the cuts are the thing most likely to be
// wrong afterwards: `BAND_CUTS` was calibrated against the *current* grade
// distribution, and a refit moves that distribution. An empty band means the
// cuts describe a bank that does not exist, so this says so here rather than
// leaving it to be discovered on the Learn screen.

const regraded = bank.map((p) => gradeUnder(fitted, p.measurements)).sort((a, b) => a - b);
const counts = new Map<string, number>(BANDS.map((b) => [b, 0]));
for (const g of regraded) counts.set(bandOf(g), (counts.get(bandOf(g)) ?? 0) + 1);

console.log(`\nunder the fitted table, with BAND_CUTS unchanged (${JSON.stringify(BAND_CUTS)}):`);
console.log(`  grade range ${regraded[0]}-${regraded[regraded.length - 1]}, ${new Set(regraded).size} distinct value(s)`);
const pct = (q: number) => regraded[Math.min(regraded.length - 1, Math.floor((q / 100) * regraded.length))];
console.log(`  ${[10, 25, 50, 75, 90].map((q) => `p${q} ${pct(q)}`).join("    ")}`);
console.log(`  bands: ${BANDS.map((b) => `${b} ${counts.get(b)}`).join(", ")}`);
const empty = BANDS.filter((b) => (counts.get(b) ?? 0) === 0);
if (empty.length) {
  console.log(`  EMPTY BAND(S): ${empty.join(", ")}. Redraw BAND_CUTS before pasting — an empty band`);
  console.log(`  names a region no puzzle can enter, which is what the first cuts got wrong.`);
}
// Where the gaps are, since `grade.ts` records that percentiles cannot cut this
// distribution: 92 of 161 puzzles share one grade, so the cuts go where the
// distribution stops being flat, not where a quantile falls.
const gaps: string[] = [];
for (let i = 1; i < regraded.length; i++) {
  if (regraded[i] - regraded[i - 1] > 20) gaps.push(`${regraded[i - 1]}->${regraded[i]}`);
}
console.log(`  gaps wider than 20: ${gaps.length ? gaps.join(", ") : "none — the cuts have nowhere natural to go"}`);
console.log("");
