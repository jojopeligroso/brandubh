import { describe, expect, it } from "vitest";
import {
  ANCHOR_COUNT,
  COMPARISONS_PER_PUZZLE,
  HOLDOUT_SIZE,
  MAILTO_CEILING,
  PROVING_PATH,
  anchorIdSet,
  anchors,
  bradleyTerry,
  decodeSession,
  encodeSession,
  featuresOf,
  fitWeights,
  gradeUnder,
  holdoutAccuracy,
  holdoutSplit,
  isAnchorPosition,
  isProvingPath,
  nextAnchorIndex,
  noiseFloor,
  pairsOf,
  parseStoredSession,
  placement,
  ridgeSolve,
  schedule,
  seedNumber,
  type Entry,
  type Pair,
  type Session,
} from "./proving";
import { gradeOf, type GradeMeasurements } from "./grade";
import { bandOf } from "./grade";
import { loadBank, type Puzzle } from "./puzzleBank";
import { VARIANTS } from "./variants";

// The shipped bank, because the whole apparatus is a function of it: the
// anchors are drawn from it, the schedule is drawn from it, and a blob is
// meaningless without it. A synthetic bank would test the arithmetic and none
// of the things that can actually go wrong.
const BANK = loadBank(VARIANTS.wtf);

/** A measurement vector, for the fitting tests. */
const meas = (
  depthToFind: number,
  lineLength = 1,
  salience: Partial<GradeMeasurements["salience"]> = {},
): GradeMeasurements => ({
  depthToFind,
  lineLength,
  salience: {
    capture: false,
    movesKing: false,
    towardCorner: false,
    onlyMoveOfPiece: false,
    ...salience,
  },
});

const fake = (id: string, m: GradeMeasurements): Puzzle =>
  ({ id, measurements: m, grade: gradeOf(m), band: bandOf(gradeOf(m)) }) as unknown as Puzzle;

describe("the unlisted path", () => {
  it("matches only itself, with or without a trailing slash", () => {
    expect(isProvingPath(PROVING_PATH)).toBe(true);
    expect(isProvingPath(`${PROVING_PATH}/`)).toBe(true);
    expect(isProvingPath("/")).toBe(false);
    expect(isProvingPath("/proving-ground")).toBe(false);
    expect(isProvingPath(`${PROVING_PATH}x`)).toBe(false);
  });

  it("is unguessable rather than guarded, and long enough to mean it", () => {
    // ADR-0004: the lock is a sign. There is no password here and there is not
    // meant to be one — this only pins that the path is not something a person
    // types by accident.
    expect(PROVING_PATH.length).toBeGreaterThan(16);
  });
});

describe("anchors", () => {
  const A = anchors(BANK);

  it("are eight, and are real puzzles from the bank", () => {
    expect(A).toHaveLength(ANCHOR_COUNT);
    for (const a of A) expect(BANK.some((p) => p.id === a.id)).toBe(true);
  });

  it("are distinct — eight references, not eight copies of one", () => {
    expect(new Set(A.map((p) => p.id)).size).toBe(ANCHOR_COUNT);
  });

  it("span the grade range and land on eight different grades", () => {
    // The failure this guards: 92 of 161 puzzles grade at exactly 30, so eight
    // evenly-spaced *pool positions* would put five anchors on one grade and the
    // binary search would be comparing against five copies of one reference.
    const grades = A.map((p) => p.grade);
    expect(new Set(grades).size).toBe(ANCHOR_COUNT);
    expect(grades[0]).toBe(Math.min(...BANK.map((p) => p.grade)));
    expect(grades[ANCHOR_COUNT - 1]).toBe(Math.max(...BANK.map((p) => p.grade)));
  });

  it("come back in ascending order, which is what the binary search assumes", () => {
    const grades = A.map((p) => p.grade);
    expect([...grades].sort((a, b) => a - b)).toEqual(grades);
  });

  it("are the same eight every time, so two graders share a reference set", () => {
    expect(anchors(BANK).map((p) => p.id)).toEqual(A.map((p) => p.id));
  });

  it("degrade to the whole bank when there are fewer puzzles than anchors", () => {
    const tiny = BANK.slice(0, 3);
    expect(anchors(tiny)).toHaveLength(3);
  });
});

describe("the binary search", () => {
  it("asks exactly three questions and then stops", () => {
    expect(nextAnchorIndex([])).not.toBeNull();
    expect(nextAnchorIndex([true])).not.toBeNull();
    expect(nextAnchorIndex([true, false])).not.toBeNull();
    expect(nextAnchorIndex([true, false, true])).toBeNull();
  });

  it("never asks about the same anchor twice in one puzzle", () => {
    for (let bits = 0; bits < 8; bits++) {
      const answers = [0, 1, 2].map((i) => (bits & (1 << i)) !== 0);
      const asked = [0, 1, 2].map((i) => nextAnchorIndex(answers.slice(0, i)));
      expect(new Set(asked).size).toBe(COMPARISONS_PER_PUZZLE);
    }
  });

  it("reaches all eight placements, one per distinct set of answers", () => {
    const seen = new Set<number>();
    for (let bits = 0; bits < 8; bits++) {
      seen.add(placement([0, 1, 2].map((i) => (bits & (1 << i)) !== 0)));
    }
    // Three yes/no answers, eight leaves, eight distinct places to land: the
    // search wastes nothing and no placement is unreachable.
    expect(seen.size).toBe(ANCHOR_COUNT);
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("puts 'harder every time' at the top and 'easier every time' at the bottom", () => {
    expect(placement([true, true, true])).toBe(ANCHOR_COUNT - 1);
    expect(placement([false, false, false])).toBe(0);
  });

  it("is monotone: answering harder anywhere never lowers the placement", () => {
    for (let bits = 0; bits < 8; bits++) {
      const answers = [0, 1, 2].map((i) => (bits & (1 << i)) !== 0);
      for (let i = 0; i < 3; i++) {
        if (answers[i]) continue;
        const raised = [...answers];
        raised[i] = true;
        expect(placement(raised)).toBeGreaterThanOrEqual(placement(answers));
      }
    }
  });
});

describe("the schedule", () => {
  const S = schedule(BANK, "ana", 40);

  it("opens with the anchors, in order, so a reference set exists before anything is placed", () => {
    expect(S.slice(0, ANCHOR_COUNT)).toEqual(anchors(BANK).map((p) => p.id));
    for (let i = 0; i < ANCHOR_COUNT; i++) expect(isAnchorPosition(i)).toBe(true);
    expect(isAnchorPosition(ANCHOR_COUNT)).toBe(false);
  });

  it("never repeats an anchor in the body", () => {
    const anchorIds = new Set(anchors(BANK).map((p) => p.id));
    for (const id of S.slice(ANCHOR_COUNT)) expect(anchorIds.has(id)).toBe(false);
  });

  it("is a pure function of its seed", () => {
    expect(schedule(BANK, "ana", 40)).toEqual(S);
    expect(schedule(BANK, "brian", 40)).not.toEqual(S);
  });

  it("shuffles: two graders do not meet the puzzles in pool order", () => {
    const body = S.slice(ANCHOR_COUNT);
    const poolOrdered = BANK.map((p) => p.id).filter((id) => body.includes(id));
    expect(body).not.toEqual(poolOrdered);
  });

  it("slips about a tenth of the body back in as silent repeats", () => {
    const body = S.slice(ANCHOR_COUNT);
    const distinct = new Set(body).size;
    expect(body.length - distinct).toBe(Math.floor(40 * 0.1));
  });

  it("never places a repeat next to its first showing", () => {
    // A repeat adjacent to its original measures short-term memory rather than
    // judgement, which is not the instrument this is.
    for (let i = 1; i < S.length; i++) expect(S[i]).not.toBe(S[i - 1]);
  });

  it("puts every repeat behind its first showing by a real distance", () => {
    const first = new Map<string, number>();
    for (let i = 0; i < S.length; i++) {
      const seen = first.get(S[i]);
      if (seen === undefined) first.set(S[i], i);
      else expect(i - seen).toBeGreaterThan(1);
    }
  });

  it("asks for no more than the bank holds", () => {
    const all = schedule(BANK, "ana", 10_000);
    expect(new Set(all).size).toBe(BANK.length);
  });

  it("hashes a seed word stably, because a seed is spoken and not generated", () => {
    expect(seedNumber("ana")).toBe(seedNumber("ana"));
    expect(seedNumber("ana")).not.toBe(seedNumber("anb"));
  });
});

// ── The blob ──────────────────────────────────────────────────────────────────

/** A plausible session over the real schedule: anchors get no comparisons,
 *  everything else gets three. */
function sampleSession(seed = "ana", size = 40, grader = "ana"): Session {
  const order = schedule(BANK, seed, size);
  const entries: Entry[] = order.map((puzzleId, i) => ({
    puzzleId,
    seconds: 20 + (i % 47),
    solved: i % 3 !== 0,
    answers: isAnchorPosition(i) ? [] : [i % 2 === 0, i % 3 === 0, i % 5 === 0],
  }));
  return { version: 1, grader, seed, size, entries };
}

describe("the blob", () => {
  const session = sampleSession();
  const blob = encodeSession(session);

  it("round-trips every entry", () => {
    const out = decodeSession(blob, BANK);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.session.grader).toBe(session.grader);
    expect(out.session.seed).toBe(session.seed);
    expect(out.session.size).toBe(session.size);
    expect(out.session.entries).toEqual(session.entries);
  });

  it("fits inside the mailto ceiling for a full run", () => {
    // ADR-0004's arithmetic, re-measured rather than trusted. The encoding is
    // four characters an entry and carries no puzzle ids at all, because the
    // schedule is derivable from the seed.
    const full = encodeSession(sampleSession("ana", 80));
    expect(full.length).toBeLessThan(MAILTO_CEILING);
  });

  it("refuses a truncated payload rather than reading what survived", () => {
    // The failure this exists for: a `mailto:` link cut by a client yields a
    // JSON string that still parses, so without the count the fit would quietly
    // be run on a fraction of a session.
    const cut = JSON.parse(blob) as Record<string, unknown>;
    cut.d = (cut.d as string).slice(0, -8);
    const out = decodeSession(JSON.stringify(cut), BANK);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/entry count/);
  });

  it("refuses a payload that is not whole entries", () => {
    const cut = JSON.parse(blob) as Record<string, unknown>;
    cut.d = (cut.d as string).slice(0, -1);
    expect(decodeSession(JSON.stringify(cut), BANK).ok).toBe(false);
  });

  it("refuses a count that claims more than the schedule holds", () => {
    const over = JSON.parse(blob) as Record<string, unknown>;
    over.z = 1;
    const out = decodeSession(JSON.stringify(over), BANK);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/schedule/);
  });

  it("refuses a payload whose comparisons do not line up with the schedule", () => {
    // Structural rather than a fingerprint: an anchor position carries no
    // comparisons and every other position carries three, so a payload shifted
    // by an entry — or recorded against a different bank — fails to agree with
    // its own schedule about which is which.
    const scrambled = JSON.parse(blob) as Record<string, unknown>;
    const d = scrambled.d as string;
    // Entry 0 is an anchor and must carry no comparisons; give it three.
    scrambled.d = `${d.slice(0, 3)}0${d.slice(4)}`;
    const out = decodeSession(JSON.stringify(scrambled), BANK);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/schedule/);
  });

  it("refuses versions, graders and seeds it does not have", () => {
    for (const bad of [
      '{"v":2,"g":"a","s":"b","z":1,"n":0,"d":""}',
      '{"v":1,"g":"","s":"b","z":1,"n":0,"d":""}',
      '{"v":1,"g":"a","s":"","z":1,"n":0,"d":""}',
      '{"v":1,"g":"a","s":"b","n":0,"d":""}',
      "not json at all",
      "[]",
    ]) {
      expect(decodeSession(bad, BANK).ok).toBe(false);
    }
  });

  it("accepts a session stopped part way through", () => {
    // Legitimate and common: a grader does thirty and stops. A short session is
    // not a corrupt one, and the count is what distinguishes them.
    const partial: Session = { ...session, entries: session.entries.slice(0, 12) };
    const out = decodeSession(encodeSession(partial), BANK);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.session.entries).toHaveLength(12);
  });

  it("caps an absurd time rather than overflowing its two digits", () => {
    const long: Session = {
      ...session,
      entries: [{ ...session.entries[0], seconds: 99_999 }],
    };
    const out = decodeSession(encodeSession(long), BANK);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.session.entries[0].seconds).toBe(36 * 36 - 1);
  });
});

describe("the stored session", () => {
  it("survives a round trip through localStorage's shape", () => {
    const s = sampleSession();
    expect(parseStoredSession(JSON.stringify(s))).toEqual(s);
  });

  it("returns null rather than throwing on anything it does not recognise", () => {
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession("{")).toBeNull();
    expect(parseStoredSession("{}")).toBeNull();
    expect(parseStoredSession('{"version":1,"grader":"a"}')).toBeNull();
  });
});

// ── Comparisons and the noise floor ───────────────────────────────────────────

describe("comparisons", () => {
  it("yields three pairs per non-anchor entry and none for an anchor", () => {
    const s = sampleSession();
    const nonAnchors = s.entries.filter((e) => e.answers.length).length;
    expect(pairsOf(s, BANK)).toHaveLength(nonAnchors * COMPARISONS_PER_PUZZLE);
  });

  it("orients a pair by the answer, not by the anchor's grade", () => {
    // ADR-0005: the fit is fitted to what the person said. If the current grades
    // were the arbiter this would be circular; they only choose the questions.
    const anchorIds = anchors(BANK).map((p) => p.id);
    const one: Session = {
      version: 1,
      grader: "ana",
      seed: "ana",
      size: 40,
      entries: [
        ...schedule(BANK, "ana", 40)
          .slice(0, ANCHOR_COUNT)
          .map((puzzleId) => ({ puzzleId, seconds: 1, solved: true, answers: [] })),
        {
          puzzleId: schedule(BANK, "ana", 40)[ANCHOR_COUNT],
          seconds: 1,
          solved: true,
          answers: [true, true, true],
        },
      ],
    };
    const pairs = pairsOf(one, BANK);
    expect(pairs).toHaveLength(3);
    for (const p of pairs) {
      expect(anchorIds).toContain(p.easier);
      expect(p.harder).toBe(one.entries[ANCHOR_COUNT].puzzleId);
    }
  });
});

describe("the re-test noise floor", () => {
  const two = (a: boolean[], b: boolean[]): Session => ({
    version: 1,
    grader: "ana",
    seed: "ana",
    size: 40,
    entries: [
      { puzzleId: "X", seconds: 10, solved: true, answers: a },
      { puzzleId: "X", seconds: 10, solved: true, answers: b },
    ],
  });

  it("counts a repeat that lands in the same place as agreement", () => {
    const n = noiseFloor([two([true, false, true], [true, false, true])]);
    expect(n.repeats).toBe(1);
    expect(n.placementDisagreements).toBe(0);
    expect(n.comparisons).toBe(3);
    expect(n.comparisonDisagreements).toBe(0);
  });

  it("counts a repeat that lands elsewhere as a disagreement", () => {
    const n = noiseFloor([two([true, true, true], [false, false, false])]);
    expect(n.placementDisagreements).toBe(1);
  });

  it("only counts questions asked in both passes", () => {
    // The two searches diverge at the first answer and never ask the same thing
    // again. Counting the later questions would count one divergence three
    // times: once as itself, twice as the different questions it caused.
    const n = noiseFloor([two([true, true, true], [false, true, true])]);
    expect(n.comparisons).toBe(1);
    expect(n.comparisonDisagreements).toBe(1);
  });

  it("finds nothing to measure in a session with no repeats", () => {
    const s = sampleSession("ana", 0);
    expect(noiseFloor([s]).repeats).toBe(0);
  });

  it("finds repeats in a real schedule, because the schedule puts them there", () => {
    expect(noiseFloor([sampleSession("ana", 40)]).repeats).toBe(4);
  });
});

// ── The fit ───────────────────────────────────────────────────────────────────

describe("Bradley-Terry", () => {
  it("recovers a known ranking from consistent comparisons", () => {
    // Five items with a true order, every pair judged the right way round. The
    // fit must reproduce the order exactly; anything less means the estimator is
    // broken and no amount of human data would show it.
    const order = ["a", "b", "c", "d", "e"]; // easiest first
    const pairs: Pair[] = [];
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        pairs.push({ harder: order[j], easier: order[i], grader: "t" });
      }
    }
    const s = bradleyTerry(pairs);
    const ranked = [...s.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    expect(ranked).toEqual(order);
  });

  it("recovers a ranking through noise", () => {
    // The realistic case: a true order, and one judgement in six reversed. The
    // point of pooling comparisons is that the ranking survives this.
    const order = ["a", "b", "c", "d", "e", "f"];
    const pairs: Pair[] = [];
    let k = 0;
    for (let rep = 0; rep < 6; rep++) {
      for (let i = 0; i < order.length; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const flip = k++ % 6 === 0;
          pairs.push(
            flip
              ? { harder: order[i], easier: order[j], grader: "t" }
              : { harder: order[j], easier: order[i], grader: "t" },
          );
        }
      }
    }
    const s = bradleyTerry(pairs);
    const ranked = [...s.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    expect(ranked).toEqual(order);
  });

  it("keeps an undefeated item finite, which is the prior's whole job", () => {
    // Without the prior an item that wins everything has an unbounded
    // maximum-likelihood strength and the iteration walks off to infinity,
    // taking everything connected to it. Those items are the hardest puzzles in
    // the bank, so they cannot simply be dropped.
    const s = bradleyTerry([
      { harder: "top", easier: "a", grader: "t" },
      { harder: "top", easier: "b", grader: "t" },
      { harder: "a", easier: "b", grader: "t" },
    ]);
    for (const v of s.values()) expect(Number.isFinite(v)).toBe(true);
    expect(s.get("top")!).toBeGreaterThan(s.get("a")!);
  });

  it("says nothing when it has been told nothing", () => {
    expect(bradleyTerry([]).size).toBe(0);
  });

  it("centres its output, since a log-strength is only read as a difference", () => {
    const s = bradleyTerry([
      { harder: "a", easier: "b", grader: "t" },
      { harder: "b", easier: "c", grader: "t" },
    ]);
    const mean = [...s.values()].reduce((a, b) => a + b, 0) / s.size;
    expect(Math.abs(mean)).toBeLessThan(1e-9);
  });
});

describe("least squares", () => {
  it("recovers exact coefficients from noiseless data", () => {
    const rows = [
      [1, 1, 0],
      [1, 2, 0],
      [1, 3, 1],
      [1, 4, 1],
      [1, 5, 0],
    ];
    const truth = [2, 3, -5];
    const y = rows.map((r) => r.reduce((acc, x, i) => acc + x * truth[i], 0));
    const beta = ridgeSolve(rows, y, 0);
    for (let i = 0; i < truth.length; i++) expect(beta[i]).toBeCloseTo(truth[i], 6);
  });

  it("gives a column that does not vary a coefficient near zero", () => {
    // `grade.ts` records that `lineLength` is 1 on 160 of 161 puzzles, so its
    // column is nearly constant and the normal equations are nearly singular.
    // The truthful answer for a measurement with no variation is "no evidence
    // for any weight", not an enormous coefficient fitted to one puzzle.
    const rows = Array.from({ length: 20 }, (_, i) => [1, i, 0]);
    const y = rows.map((r) => 5 + 2 * r[1]);
    const beta = ridgeSolve(rows, y);
    expect(beta[1]).toBeCloseTo(2, 3);
    expect(Math.abs(beta[2])).toBeLessThan(1e-6);
  });

  it("returns nothing when it is given nothing", () => {
    expect(ridgeSolve([], [])).toEqual([]);
  });
});

describe("fitting the weights", () => {
  it("reads the features in the order the table names them", () => {
    expect(featuresOf(meas(3, 2, { capture: true, towardCorner: true }))).toEqual([
      1, 3, 1, 1, 0, 1, 0,
    ]);
  });

  it("recovers a table it was generated from, up to the arbitrary scale", () => {
    // A synthetic world where difficulty *is* a known linear function of the
    // measurements. The fit has to come back with the same shape; the scale is
    // free because Bradley-Terry strengths are log-odds with no natural unit and
    // grades have no natural unit either.
    const truth = {
      depthToFind: 100,
      linePastFirst: 40,
      salience: { capture: 50, movesKing: 0, towardCorner: 20, onlyMoveOfPiece: 0 },
    };
    const puzzles: Puzzle[] = [];
    const strengths = new Map<string, number>();
    let n = 0;
    for (let d = 1; d <= 4; d++) {
      for (let l = 1; l <= 3; l++) {
        for (const cap of [false, true]) {
          for (const tc of [false, true]) {
            const m = meas(d, l, { capture: cap, towardCorner: tc });
            const id = String(n++).padStart(5, "0");
            puzzles.push(fake(id, m));
            strengths.set(
              id,
              (d * truth.depthToFind +
                (l - 1) * truth.linePastFirst -
                (cap ? truth.salience.capture : 0) -
                (tc ? truth.salience.towardCorner : 0)) /
                100,
            );
          }
        }
      }
    }
    const w = fitWeights(strengths, puzzles);
    const ratio = w.depthToFind / truth.depthToFind;
    expect(ratio).toBeGreaterThan(0);
    expect(w.linePastFirst / ratio).toBeCloseTo(truth.linePastFirst, 0);
    expect(w.salience.capture / ratio).toBeCloseTo(truth.salience.capture, 0);
    expect(w.salience.towardCorner / ratio).toBeCloseTo(truth.salience.towardCorner, 0);
    expect(Math.abs(w.salience.movesKing / ratio)).toBeLessThan(5);
  });

  it("scales the largest weight to 100, so a fitted table diffs against the guess", () => {
    const puzzles = [1, 2, 3, 4].map((d) => fake(String(d).padStart(5, "0"), meas(d)));
    const strengths = new Map(puzzles.map((p, i) => [p.id, i * 0.01]));
    const w = fitWeights(strengths, puzzles);
    const biggest = Math.max(
      Math.abs(w.depthToFind),
      Math.abs(w.linePastFirst),
      ...Object.values(w.salience).map(Math.abs),
    );
    expect(biggest).toBe(100);
  });

  it("survives a degenerate fit rather than dividing by zero", () => {
    // Every puzzle identical: nothing to fit, and the honest output is a table
    // of zeros with a scale of 1, not a NaN.
    const puzzles = ["00001", "00002"].map((id) => fake(id, meas(1)));
    const w = fitWeights(new Map(puzzles.map((p) => [p.id, 0])), puzzles);
    expect(w.scale).toBe(1);
    expect(Number.isFinite(w.depthToFind)).toBe(true);
  });

  it("says nothing about puzzles no grader reached", () => {
    const puzzles = [fake("00001", meas(1)), fake("00002", meas(2))];
    const w = fitWeights(new Map([["00001", 1]]), puzzles);
    expect(Number.isFinite(w.depthToFind)).toBe(true);
  });

  it("grades under a candidate table exactly as gradeOf grades under the real one", () => {
    const m = meas(3, 2, { capture: true, onlyMoveOfPiece: true });
    const asShipped = {
      depthToFind: 100,
      linePastFirst: 60,
      salience: { capture: 50, movesKing: 40, towardCorner: 30, onlyMoveOfPiece: 60 },
      coefficients: [],
      scale: 1,
    };
    expect(gradeUnder(asShipped, m)).toBe(gradeOf(m));
  });

  it("floors a grade at zero, as the shipped formula does", () => {
    const w = {
      depthToFind: 10,
      linePastFirst: 0,
      salience: { capture: 500, movesKing: 0, towardCorner: 0, onlyMoveOfPiece: 0 },
      coefficients: [],
      scale: 1,
    };
    expect(gradeUnder(w, meas(1, 1, { capture: true }))).toBe(0);
  });
});

describe("the holdout", () => {
  const ids = BANK.map((p) => p.id);

  it("withholds the requested number and keeps the rest", () => {
    const { fit, test } = holdoutSplit(ids);
    expect(test).toHaveLength(HOLDOUT_SIZE);
    expect(fit).toHaveLength(ids.length - HOLDOUT_SIZE);
    expect(new Set([...fit, ...test]).size).toBe(ids.length);
  });

  it("is fixed before any data exists, which is the only property that matters", () => {
    // A holdout chosen after seeing the comparisons — or from a grader's seed,
    // which amounts to the same thing once the blobs are in hand — is not a
    // holdout, it is a second fit.
    expect(holdoutSplit(ids).test).toEqual(holdoutSplit([...ids].reverse()).test);
  });

  it("does not hold out one end of the grade range", () => {
    const { test } = holdoutSplit(ids);
    const held = BANK.filter((p) => test.includes(p.id));
    expect(new Set(held.map((p) => p.band)).size).toBeGreaterThan(1);
  });

  it("copes with being asked for more than it has", () => {
    expect(holdoutSplit(["00001", "00002"], 50).test).toHaveLength(2);
  });

  it("never withholds an anchor, and keeps it on the fit side", () => {
    // The plan's specification is wrong here and this is the assertion that
    // catches it. Every comparison is against an anchor, so the graph is a star
    // with eight centres; holding out a centre removes every edge that touched
    // it, and holding out six removed 191 of 198 comparisons in a real session
    // without erroring — the fit reported a *negative* weight for `depthToFind`
    // out of the seven that survived. An anchor is the ruler, not an item.
    const excluded = anchorIdSet(BANK);
    const { fit, test } = holdoutSplit(ids, HOLDOUT_SIZE, excluded);
    for (const a of excluded) {
      expect(test).not.toContain(a);
      expect(fit).toContain(a);
    }
    expect(test).toHaveLength(HOLDOUT_SIZE);
  });

  it("holds out the same puzzles whether or not the anchors are in the list", () => {
    // The exclusion removes anchors from the candidate pool; it must not shuffle
    // everything else, or the holdout would depend on the session size.
    const excluded = anchorIdSet(BANK);
    const withAnchors = holdoutSplit(ids, HOLDOUT_SIZE, excluded).test;
    const without = holdoutSplit(
      ids.filter((id) => !excluded.has(id)),
      HOLDOUT_SIZE,
      excluded,
    ).test;
    expect(withAnchors).toEqual(without);
  });
});

describe("holdout accuracy", () => {
  const puzzles = [
    fake("00001", meas(1)),
    fake("00002", meas(2)),
    fake("00003", meas(3)),
    fake("00004", meas(4)),
  ];
  const w = {
    depthToFind: 100,
    linePastFirst: 0,
    salience: { capture: 0, movesKing: 0, towardCorner: 0, onlyMoveOfPiece: 0 },
    coefficients: [],
    scale: 1,
  };

  it("scores only pairs that touch the holdout", () => {
    const pairs: Pair[] = [
      { harder: "00002", easier: "00001", grader: "t" }, // neither held out
      { harder: "00004", easier: "00003", grader: "t" }, // 00004 held out
    ];
    const out = holdoutAccuracy(w, pairs, puzzles, new Set(["00004"]));
    expect(out.scored).toBe(1);
    expect(out.correct).toBe(1);
  });

  it("counts a tie as wrong, not as half right", () => {
    // 92 of 161 puzzles share a grade under the shipped table. A rule that
    // rewarded ties would flatter exactly the failure this measurement exists
    // to catch.
    const pairs: Pair[] = [{ harder: "00002", easier: "00002", grader: "t" }];
    const out = holdoutAccuracy(w, pairs, puzzles, new Set(["00002"]));
    expect(out.scored).toBe(1);
    expect(out.correct).toBe(0);
    expect(out.ties).toBe(1);
  });

  it("ignores a pair naming a puzzle that is not in the bank", () => {
    const pairs: Pair[] = [{ harder: "99999", easier: "00001", grader: "t" }];
    expect(holdoutAccuracy(w, pairs, puzzles, new Set(["99999"])).scored).toBe(0);
  });
});

describe("end to end, on the shipped bank", () => {
  it("runs a synthetic grader through the whole apparatus", () => {
    // A grader who answers exactly as the *current* grades would predict. The
    // fit should then reproduce the current table's ordering, which is the one
    // case where the answer is known in advance. It proves the plumbing —
    // schedule, blob, pairs, fit, score — carries a signal end to end, and says
    // nothing about whether the current table is right.
    const byId = new Map(BANK.map((p) => [p.id, p]));
    const anchorIds = anchors(BANK).map((p) => p.id);
    const order = schedule(BANK, "ana", 60);
    const entries: Entry[] = order.map((puzzleId, i) => {
      if (isAnchorPosition(i)) return { puzzleId, seconds: 30, solved: true, answers: [] };
      const answers: boolean[] = [];
      for (let q = 0; q < COMPARISONS_PER_PUZZLE; q++) {
        const idx = nextAnchorIndex(answers)!;
        answers.push(byId.get(puzzleId)!.grade > byId.get(anchorIds[idx])!.grade);
      }
      return { puzzleId, seconds: 30, solved: true, answers };
    });
    const session: Session = { version: 1, grader: "ana", seed: "ana", size: 60, entries };

    const round = decodeSession(encodeSession(session), BANK);
    expect(round.ok).toBe(true);
    if (!round.ok) return;

    const pairs = pairsOf(round.session, BANK);
    expect(pairs.length).toBeGreaterThan(100);
    const { test } = holdoutSplit(
      [...new Set(pairs.flatMap((p) => [p.harder, p.easier]))],
      HOLDOUT_SIZE,
      anchorIdSet(BANK),
    );
    const held = new Set(test);
    const strengths = bradleyTerry(pairs.filter((p) => !held.has(p.harder) && !held.has(p.easier)));
    const w = fitWeights(strengths, BANK);
    const acc = holdoutAccuracy(w, pairs, BANK, held);

    // The fit recovers the direction it was simulated from: harder puzzles need
    // deeper search, so `depthToFind` comes back positive.
    expect(w.depthToFind).toBeGreaterThan(0);
    expect(acc.scored).toBeGreaterThan(0);

    // **Ties dominate the headline, and that is the result rather than a
    // nuisance.** On a perfectly consistent synthetic grader the fitted table
    // gets 43 of 66 held-out comparisons as *ties* and 22 of the remaining 23
    // right. A raw accuracy of 0.33 and a non-tie accuracy of 0.96 are the same
    // measurement, and only the second is about the ordering. 8f has to read
    // three numbers here, not one — which is why `holdoutAccuracy` returns
    // three and the script prints three.
    expect(acc.ties).toBeGreaterThan(0);
    expect(acc.correct / (acc.scored - acc.ties)).toBeGreaterThan(0.9);

    // And the noise floor of a perfectly consistent grader is zero, which is
    // what makes it a floor rather than a fudge.
    const floor = noiseFloor([round.session]);
    expect(floor.repeats).toBeGreaterThan(0);
    expect(floor.comparisonDisagreements).toBe(0);
  });
});
