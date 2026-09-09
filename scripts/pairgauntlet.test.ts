import { describe, expect, it } from "vitest";
import { adapterFor } from "./gauntlet/index";
import { binomTwoSidedP, categorize, runGauntlet } from "./pairgauntlet";

// This project has no @types/node dependency (tsconfig's `lib` is browser-only:
// ES2020 + DOM), so `process` has no ambient type anywhere else. This file runs
// under vitest's Node environment, where `process.env` genuinely exists at
// runtime — the minimal ambient declaration below types exactly that, rather
// than pulling in all of @types/node's Node-API surface for one env read. Same
// workaround, for the same reason, as src/game/copenhagen/searchInvariants.test.ts.
declare const process: { env: Record<string, string | undefined> };

// ── binomTwoSidedP: exact two-sided binomial sign-test, p=0.5 ─────────────────
// Every expected value below is hand-computable from the binomial pmf
// P(X=i) = C(n,i) * 0.5^n and is independent of this file's implementation —
// if the log-space sum in pairgauntlet.ts ever drifts from the textbook
// definition, these are wrong regardless of what the harness itself reports.
describe("binomTwoSidedP", () => {
  it("is 1 at n=0 (no decisive pairs, nothing to test)", () => {
    expect(binomTwoSidedP(0, 0)).toBe(1);
  });

  it("is 1 for a single coin flip either way (both outcomes equally extreme)", () => {
    expect(binomTwoSidedP(0, 1)).toBe(1);
    expect(binomTwoSidedP(1, 1)).toBe(1);
  });

  it("is 1 at the exact centre of an even split (n=2, k=1)", () => {
    expect(binomTwoSidedP(1, 2)).toBe(1);
  });

  it("is 0.5 for the most extreme outcome at n=2 (P(0)=P(2)=0.25, sum=0.5)", () => {
    expect(binomTwoSidedP(0, 2)).toBeCloseTo(0.5, 10);
    expect(binomTwoSidedP(2, 2)).toBeCloseTo(0.5, 10);
  });

  it("matches the hand-computed n=4 binomial pmf sums", () => {
    // P(X=0)=1/16, P(X=1)=4/16, P(X=2)=6/16, P(X=3)=4/16, P(X=4)=1/16.
    // k=0: only i=0,4 are at-or-below P(0)=1/16 -> 2/16 = 0.125.
    expect(binomTwoSidedP(0, 4)).toBeCloseTo(2 / 16, 10);
    // k=1: i=0,1,3,4 are at-or-below P(1)=4/16 -> (1+4+4+1)/16 = 10/16.
    expect(binomTwoSidedP(1, 4)).toBeCloseTo(10 / 16, 10);
  });

  it("crosses p<0.05 at exactly the 6-0 sweep recorded in the file header's power table", () => {
    // n_decisive=6, min split 6-0 -> p=0.0313 (file header, section derived
    // from this exact function). 5-1 must NOT cross 0.05.
    expect(binomTwoSidedP(6, 6)).toBeCloseTo(0.03125, 10);
    expect(binomTwoSidedP(6, 6)).toBeLessThan(0.05);
    expect(binomTwoSidedP(5, 6)).toBeGreaterThan(0.05);
  });

  it("is symmetric in k (k wins vs n-k wins are equally extreme)", () => {
    expect(binomTwoSidedP(3, 10)).toBeCloseTo(binomTwoSidedP(7, 10), 10);
  });
});

// ── categorize: the pairing logic itself, hand-checked ────────────────────────
// This is the load-bearing correctness property of the whole instrument: side
// bias must cancel by construction. A pair only scores +1/-1 when the SAME
// game-letter (W or L) shows up for the candidate in BOTH roles; anything else
// (a split, or either game undecided) must net to zero.
describe("categorize", () => {
  it("scores +1 only when the candidate wins as both attacker and defender", () => {
    expect(categorize("W", "W")).toEqual({ category: "WW", score: 1 });
  });

  it("scores -1 only when the candidate loses as both attacker and defender", () => {
    expect(categorize("L", "L")).toEqual({ category: "LL", score: -1 });
  });

  it("scores every mixed result as a neutral split, not a partial win", () => {
    expect(categorize("W", "L")).toEqual({ category: "split", score: 0 });
    expect(categorize("L", "W")).toEqual({ category: "split", score: 0 });
  });

  it("treats a draw or incomplete game (letter D) on either side as a split, never decisive", () => {
    expect(categorize("W", "D")).toEqual({ category: "split", score: 0 });
    expect(categorize("D", "L")).toEqual({ category: "split", score: 0 });
    expect(categorize("D", "D")).toEqual({ category: "split", score: 0 });
  });
});

// ── The instrument itself: a deeper search must beat a shallower one ──────────
// This is the calibration property the paired-gauntlet report validated at
// depth 4 vs depth 3, 40 pairs (WW=10 LL=0, p=0.00195) — far too slow for a
// test (~11-13s/pair there, ~9 minutes for 40 pairs). Reduced here to the same
// one-ply gap (depth 2 vs depth 1, cheap enough to search per-ply) and 20
// pairs, seed and opening fixed, so the exact per-pair outcomes are
// reproducible and hand-checkable from this file alone (re-run:
// npx tsx scripts/pairgauntlet.ts calibrate 2 1 20 7 book2).
//
// Fully deterministic (fixed maxDepth, no deadline, seeded PRNG) — this is not
// a flaky "run it and see" performance assertion, it is the same replayable
// computation every time, on every machine. Only the wall-clock time varies.
describe("pairgauntlet self-check: a deeper search must beat a shallower one", () => {
  it("depth 2 (candidate) never loses a decisive pair to depth 1 (baseline) over 20 mirrored pairs, book2 opening, seed 7", () => {
    const brandubh = adapterFor("brandubh");
    const summary = runGauntlet(
      brandubh,
      brandubh.defaultWeights,
      brandubh.defaultWeights,
      2, // candidate depth
      1, // baseline depth
      20, // pairs — below the ~50-60 recommended minimum, kept here for CI
      // speed. Small on purpose: see the assertion comment below for why
      // that means this check cannot assert a p-value.
      "book2",
      7,
      () => {}, // silence the per-pair log; the assertions are the record
    );

    // p<0.05 is deliberately NOT asserted here. At 20 pairs the decisive-pair
    // yield is too low for significance to be reachable at all: the file
    // header's power table shows the minimum n_decisive that can ever cross
    // p<0.05 is 6, and only at an exact 6-0 sweep (p=0.0313) — fewer decisive
    // pairs than that cannot cross the threshold no matter how lopsided the
    // split is. This test used to assert signTestP < 0.05 and it passed, but
    // only because this seed happened to land exactly 6 decisive pairs out of
    // 20 — a coin landing the right way, not a property holding at this
    // sample size. Real significance testing is left to the 50-60+ pair runs
    // the header directs people to (see its 40-pair depth-4-vs-3 calibration:
    // WW=10 LL=0, p=0.00195).
    //
    // What DOES hold at any sample size, including this small fast one, is
    // the direction: a real structural advantage (one extra ply of search)
    // never loses a decisive pair to a weaker baseline. So this fast CI check
    // asserts that invariant instead — LL===0 and WW>0 — which is what a
    // 20-pair run can actually prove.
    expect(summary.LL).toBe(0);
    expect(summary.WW).toBeGreaterThan(0);
  });
});

// ── The same property on the two larger boards ────────────────────────────────
// The check above only ever ran on Brandubh, because until 2026-09-09 the
// instrument could only run on Brandubh. It now takes a `--game` adapter, and a
// harness that works on one board is no evidence at all about the other two:
// Tablut escapes to an EDGE rather than a corner, Copenhagen is 11×11 with
// shieldwall, exit fort and encirclement terminals, and all three fork the
// engine and the evaluation weight type (ADR-0006, ADR-0007).
//
// Same invariant, same reason as above: one extra ply of search is a real,
// structural advantage, so the deeper side must never lose a decisive pair. A
// p-value is not asserted on either — both are far below the pair count that
// could reach one (see the header's power table).
//
// Both were observed FAILING before being trusted, by inverting the WW and LL
// branches of `categorize()`; the failures are quoted in
// docs/reports/paired-gauntlet-instrument.md.
//
// The Tablut case runs always. The Copenhagen case is GATED behind
// GAUNTLET_DEEP — see the comment on it for why, and for when you are obliged
// to run it.
describe("pairgauntlet self-check on the larger boards", () => {
  it("Tablut: depth 2 never loses a decisive pair to depth 1 over 8 mirrored pairs, shallow2 opening, seed 7", () => {
    const tablut = adapterFor("tablut");
    const summary = runGauntlet(
      tablut,
      tablut.defaultWeights,
      tablut.defaultWeights,
      2,
      1,
      8, // ~25-31s at nproc=4 under a load average near 5; the largest count
      // that stays inside the ~60s a CI case may cost on this board.
      "shallow2",
      7,
      () => {},
    );
    expect(summary.LL).toBe(0);
    expect(summary.WW).toBeGreaterThan(0);
  }, 120_000);

  // GATED. Measured at 171s in the 2026-09-09 full-suite run, which made this
  // file (262s) the suite's critical path on its own. That cost is the board,
  // not a tuning choice: 11×11 with 116 root moves and three extra terminal
  // checks per node (shieldwall, exit fort, encirclement) measured at roughly
  // 0.5-0.8s per ply at depth 2, and Copenhagen games at this depth run 14 to
  // 151 plies, so a single mirrored pair costs 45-90s on its own. There is no
  // pair count above zero that fits the ~60s a routine CI case may cost here.
  //
  // Gated rather than deleted, and the distinction matters: this is the only
  // check that the mirrored-pair instrument still means anything on the largest
  // board. Run it:
  //
  //     GAUNTLET_DEEP=1 npx vitest run scripts/pairgauntlet.test.ts
  //
  // and you MUST run it before landing either of:
  //   - any change to a Copenhagen evaluation weight or to
  //     src/game/copenhagen/{engine,rules,variants,d4}.ts;
  //   - any change to the shared search core, the GameAdapter interface, or
  //     scripts/pairgauntlet.ts itself.
  // A green suite without GAUNTLET_DEEP set says nothing about Copenhagen. The
  // same idiom, for the same reason, gates the depth-3 perft pins in
  // src/game/copenhagen/searchInvariants.test.ts behind PERFT_DEEP.
  it.skipIf(!process.env.GAUNTLET_DEEP)("Copenhagen: depth 2 never loses a decisive pair to depth 1 over 3 mirrored pairs, shallow2 opening, seed 7 [GAUNTLET_DEEP]", () => {
    const copenhagen = adapterFor("copenhagen");
    const summary = runGauntlet(
      copenhagen,
      copenhagen.defaultWeights,
      copenhagen.defaultWeights,
      2,
      1,
      3, // Three, not eight: the smallest count that carries the property at
      // this seed (pair 3 is the decisive one). See the gating comment above
      // for why it cannot be made cheaper.
      "shallow2",
      7,
      () => {},
    );
    expect(summary.LL).toBe(0);
    expect(summary.WW).toBeGreaterThan(0);
  }, 900_000);
});
