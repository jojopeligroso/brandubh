// ── The bank's fast invariants ───────────────────────────────────────────────
//
// Everything here is cheap, and that is the design rather than an accident. The
// expensive claim — a full `solve()` re-proof of every shipped line — lives in
// `scripts/genpuzzles.ts` and only there. What this file re-checks is that the
// data on disk says what the generator meant it to say: legal moves, correct
// parity, a matching fingerprint, ids that exist, flags that agree with the
// metadata they describe, and the solving move still uniquely best at
// `BANK_VERIFY_DEPTH`.
//
// The verification split is the whole reason `npm test` can afford to look at
// every puzzle at all. Re-running the generation-depth search over every solver
// move would add another `ai.test.ts`; this pass costs seconds.

import { describe, expect, it } from "vitest";
import { resetTT, scoreRootMoves } from "./ai";
import { allMoves, applyMove, isGameOver } from "./engine";
import { encodeMove, rulesFingerprint } from "./openingBook";
import { canonicalKey } from "./solver";
import { bandOf, gradeOf } from "./grade";
import {
  BANK_BOARD_SIZE,
  BANK_RULES_FINGERPRINT,
  BANK_VERIFY_DEPTH,
  bankRulesMatch,
  decodeBank,
  decodeSalience,
  encodePuzzle,
  encodeSalience,
  evalGoal,
  isProof,
  isSolverPly,
  loadBank,
  PUZZLE_GOALS,
  puzzleStart,
  solverMoves,
  solverSide,
} from "./puzzleBank";
import { isCornerFight, MOTIFS } from "./motifs";
import { BOARD_SIZE, type Side } from "./types";
import { DEFAULT_VARIANT, VARIANTS } from "./variants";

import { BANK_DATA } from "./puzzleBank.data";
// The **Ledger** is checked in and never bundled. Importing it *here* is safe
// and deliberate: a test file is not reachable from `index.html`, so it never
// enters the app's bundle graph, and nothing in `src/` imports it.
import ledgerJson from "../../data/puzzle-ledger.json";

const rules = VARIANTS.wtf; // the ruleset the bank was generated under
const bank = loadBank(rules);
const ledger = ledgerJson as Record<string, { id: string }>;

describe("the bank as shipped", () => {
  it("is not empty", () => {
    // A bank that silently decoded to nothing would make every invariant below
    // pass vacuously, which is the one way this file could lie.
    expect(bank.length).toBeGreaterThan(0);
  });

  it("was generated under the ruleset the app ships", () => {
    // Nothing verified under one ruleset is valid under another: a differing
    // flag can change whether the solving move wins, or whether it is legal.
    expect(BANK_RULES_FINGERPRINT).toBe(rulesFingerprint(VARIANTS[DEFAULT_VARIANT]));
    expect(bankRulesMatch(rules)).toBe(true);
  });

  it("serves nothing under a ruleset it was not verified for", () => {
    expect(loadBank(VARIANTS.walker)).toEqual([]);
  });

  it("was verified on the board the engine plays on", () => {
    // The field exists so a future 9x9 fork inherits the format; the engine is
    // deliberately not generalised, so today these must agree.
    expect(BANK_BOARD_SIZE).toBe(BOARD_SIZE);
  });

  it("has a five-digit, unique, ledgered number for every puzzle", () => {
    const ids = bank.map((p) => p.id);
    const ledgered = new Set(Object.values(ledger).map((e) => e.id));
    for (const id of ids) {
      expect(id).toMatch(/^\d{5}$/);
      expect(ledgered.has(id)).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keys the ledger on the position the learner actually sees", () => {
    // The **Ledger** keys on the position alone, never on the **Line**, so a
    // number survives a ruleset change that alters the answer — and it keys on
    // the D4-canonical form, so a mirrored duplicate is one puzzle with one
    // number rather than eight numbers for one position.
    for (const p of bank) {
      const start = puzzleStart(p, rules);
      expect(start).not.toBeNull();
      expect(ledger[canonicalKey(start!)]?.id).toBe(p.id);
    }
  });

  it("carries a goal from the four-value vocabulary", () => {
    // Four values, and a **Guillotine** is not among them: it is an `escape`
    // whose line happens to be **Truncated**.
    for (const p of bank) expect(PUZZLE_GOALS).toContain(p.goal);
  });

  it("never moves a number that has been issued", () => {
    // **Puzzle numbers** are permanent: assigned in order of first appearance
    // and never reused, so a number always means the same position. A ledger
    // with a gap or a duplicate would mean one of those two claims had broken.
    const ids = Object.values(ledger)
      .map((e) => e.id)
      .sort();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("00001");
    expect(ids[ids.length - 1]).toBe(String(ids.length).padStart(5, "0"));
  });

  it("carries a motif from the attested vocabulary, or none at all", () => {
    // ADR-0003: recognisers are written only for attested terms, and most
    // puzzles exhibit none of them and live in the **Pool**.
    for (const p of bank) if (p.motif !== null) expect(MOTIFS).toContain(p.motif);
    expect(bank.some((p) => p.motif === null)).toBe(true);
  });

  it("tags every puzzle with its side to move and its line length", () => {
    for (const p of bank) {
      expect(p.tags, `puzzle ${p.id}`).toContain(solverSide(p));
      expect(p.tags, `puzzle ${p.id}`).toContain(`moves${solverMoves(p.line)}`);
      expect(new Set(p.tags).size, `puzzle ${p.id} repeats a tag`).toBe(p.tags.length);
    }
  });

  it("never repeats the primary motif as one of its own tags", () => {
    // A **Tag** carries the motifs that are *not* primary; one repeating the row
    // the puzzle is already filed under would say nothing.
    for (const p of bank) if (p.motif) expect(p.tags).not.toContain(p.motif);
  });

  it("re-runs the board-only recogniser and gets the same answer", () => {
    // Determinism, in the form that can actually ship: replaying every line and
    // recognising it again must reproduce the stored labels exactly. Board-only,
    // so it costs nothing — the proof-based Guillotine is re-derived by the
    // generator instead (see `tagOf` in scripts/genpuzzles.ts).
    for (const p of bank) {
      const start = puzzleStart(p, rules);
      const states = [start!];
      let s = start!;
      for (const m of p.line) {
        s = applyMove(s, m, rules);
        states.push(s);
      }
      const carries = p.motif === "cornerFight" || p.tags.includes("cornerFight");
      expect(carries, `puzzle ${p.id}`).toBe(isCornerFight(states, rules));
    }
  });

  it("finds no Guillotine by recogniser, because no shipped proof runs past its line", () => {
    // Recorded rather than omitted (ADR-0003). The motif lives in the proof past
    // the end of the **Line**, and every proof in this bank ends *at* its line —
    // `truncated` is false throughout — so there is no continuation for it to
    // live in. That is a finding about the bank, not a hole in the recogniser,
    // and it is the assertion this test has always been about.
    expect(bank.filter((p) => isProof(p.goal) && p.truncated)).toHaveLength(0);
    expect(bank.filter((p) => p.motif === "guillotine" && !p.byHand)).toHaveLength(0);
  });

  it("carries the Guillotine only by hand, on 00125", () => {
    // The other half of the same finding. A Guillotine in this bank can only
    // have come from a **Note**, because the recogniser above cannot reach one:
    // 00125's goal is `crushing`, an evaluation, and an evaluation has no proof
    // to be a continuation of (ADR-0002).
    //
    // Pinned to the id rather than counted, because a **Puzzle number** is
    // permanent and never reused — so this test moves only when a person adds
    // or removes a Note, which is exactly when it should be read again.
    const hand = bank.filter((p) => p.byHand);
    expect(hand.map((p) => `${p.id}:${p.motif}`)).toEqual(["00125:guillotine"]);
    expect(hand[0].goal).toBe("crushing");
  });

  it("never flags provenance on a puzzle with no motif", () => {
    // `h` says where `motif` came from, so it is meaningless without one and the
    // codec refuses to write it — otherwise the flag would start to look like a
    // property of the puzzle rather than of the label.
    for (const p of bank) if (!p.motif) expect(p.byHand, `puzzle ${p.id}`).toBe(false);
  });
});

describe("every line is playable from the position it is stored against", () => {
  it("parses the stored position and plays the lead-in", () => {
    for (const p of bank) expect(puzzleStart(p, rules)).not.toBeNull();
  });

  it("plays every ply of every line legally", () => {
    // The invariant a corrupt payload breaks first, and the cheapest one to
    // check: a move that is not in `allMoves` is a move the board would refuse.
    for (const p of bank) {
      let state = puzzleStart(p, rules)!;
      for (const [i, move] of p.line.entries()) {
        const legal = allMoves(state.board, state.turn, rules);
        expect(
          legal.some((l) => encodeMove(l) === encodeMove(move)),
          `puzzle ${p.id} ply ${i} (${encodeMove(move)}) is not legal`,
        ).toBe(true);
        state = applyMove(state, move, rules);
      }
    }
  });

  it("ends every line on a solver move", () => {
    // Parity from the post-lead-in turn. A **Line** alternates solver and
    // scripted reply and always ends on a solver move, so the count is odd and
    // every even index belongs to the solver.
    for (const p of bank) {
      expect(p.line.length % 2, `puzzle ${p.id}`).toBe(1);
      expect(isSolverPly(p.line.length - 1)).toBe(true);
      const start = puzzleStart(p, rules)!;
      let state = start;
      for (const [i, move] of p.line.entries()) {
        expect(state.turn, `puzzle ${p.id} ply ${i}`).toBe(isSolverPly(i) ? start.turn : otherOf(start.turn));
        state = applyMove(state, move, rules);
      }
    }
  });

  it("never asks for more than four solver moves", () => {
    // A learner playing out a proven guillotine is being tested on patience,
    // not recognition (ADR-0002).
    for (const p of bank) {
      expect(solverMoves(p.line)).toBeGreaterThanOrEqual(1);
      expect(solverMoves(p.line)).toBeLessThanOrEqual(4);
    }
  });

  it("does not end the game before the last solver move", () => {
    // A line whose scripted reply ends the game is a line the learner cannot
    // finish.
    for (const p of bank) {
      let state = puzzleStart(p, rules)!;
      for (const [i, move] of p.line.entries()) {
        state = applyMove(state, move, rules);
        if (i < p.line.length - 1) expect(isGameOver(state.status), `puzzle ${p.id} ply ${i}`).toBe(false);
      }
    }
  });
});

describe("every solving move is still uniquely best at BANK_VERIFY_DEPTH", () => {
  it("re-checks uniqueness cheaply, at the depth the generator enforced", () => {
    // ADR-0001, re-asserted against the shipped data. A bank puzzle plays the
    // opponent's replies from a stored line, so an equally-good alternative
    // walks the learner into a scripted reply that no longer fits the board.
    //
    // The generator holds the strong claim at its own generation depth *and*
    // rejects anything that is not also unique here, which is what makes this
    // cheap check meaningful rather than merely cheap.
    for (const p of bank) {
      let state = puzzleStart(p, rules)!;
      for (const [i, move] of p.line.entries()) {
        if (isSolverPly(i)) {
          resetTT();
          const { within } = scoreRootMoves(state, rules, BANK_VERIFY_DEPTH, 0);
          expect(within.length, `puzzle ${p.id} step ${i / 2} has ${within.length} best moves`).toBe(1);
          expect(encodeMove(within[0].move), `puzzle ${p.id} step ${i / 2}`).toBe(encodeMove(move));
        }
        state = applyMove(state, move, rules);
      }
    }
  });
});

describe("the metadata agrees with itself", () => {
  it("has a finite dtm exactly when the goal is a proof", () => {
    // `regicide` and `escape` are proven outright; `crushing` and `advantage`
    // are measured against the evaluation and are never called proofs. The dtm
    // is what makes that distinction checkable rather than merely stated.
    for (const p of bank) {
      expect(Number.isFinite(p.dtm), `puzzle ${p.id} (${p.goal})`).toBe(isProof(p.goal));
    }
  });

  it("sets the truncated flag exactly when a proof runs past the shipped line", () => {
    // **Truncated** means "a prefix of a *proven* line", so it can only apply to
    // a proof — an evaluation has no proof to be a prefix of.
    for (const p of bank) {
      const expected = isProof(p.goal) && p.dtm > p.line.length;
      expect(p.truncated, `puzzle ${p.id} (${p.goal}, dtm ${p.dtm}, ${p.line.length} plies)`).toBe(expected);
    }
  });

  it("records a depthToFind no deeper than the verify depth", () => {
    // A consequence of the verification split rather than a property of the
    // puzzles: uniqueness is enforced at BANK_VERIFY_DEPTH, so the measurement
    // cannot exceed it. Worth pinning, because it caps the grade formula's
    // dominant term and a future change to either number should notice.
    for (const p of bank) {
      expect(p.measurements.depthToFind).toBeGreaterThanOrEqual(1);
      expect(p.measurements.depthToFind).toBeLessThanOrEqual(BANK_VERIFY_DEPTH);
    }
  });

  it("derives lineLength from the line rather than storing it", () => {
    for (const p of bank) expect(p.measurements.lineLength).toBe(solverMoves(p.line));
  });

  it("grades and bands at import, from the stored measurements", () => {
    // Proposal 2: the payload stores measurements, `grade.ts` turns them into a
    // grade. Refitting the weights in 8f is then one edit and no regeneration.
    for (const p of bank) {
      expect(p.grade).toBe(gradeOf(p.measurements));
      expect(p.band).toBe(bandOf(p.grade));
    }
  });

  it("fills every band", () => {
    // An empty band means the cuts in `grade.ts` describe a bank that does not
    // exist. That is a finding about the cuts, not a shrug.
    for (const band of ["easy", "medium", "hard", "ollamh"] as const) {
      expect(bank.filter((p) => p.band === band).length, `band ${band} is empty`).toBeGreaterThan(0);
    }
  });
});

describe("the codec", () => {
  it("round-trips every shipped record", () => {
    // The generator writes with `encodePuzzle` and the app reads with
    // `decodeBank`, so a round-trip failure is a format drift between the two
    // halves of one file.
    for (const p of bank) {
      const [again] = decodeBank(encodePuzzle(p));
      expect(again).toEqual(p);
    }
  });

  it("round-trips salience flags", () => {
    for (const capture of [false, true])
      for (const movesKing of [false, true])
        for (const towardCorner of [false, true])
          for (const onlyMoveOfPiece of [false, true]) {
            const s = { capture, movesKing, towardCorner, onlyMoveOfPiece };
            expect(decodeSalience(encodeSalience(s))).toEqual(s);
          }
  });

  it("round-trips the two flags independently", () => {
    // `flags` is a letter set, not an enum: `truncated` and `byHand` are
    // unrelated facts and either can hold without the other. The shipped bank
    // exercises only `h` today (nothing is truncated), so the pairing is checked
    // here rather than left to the data to demonstrate.
    const base = bank.find((p) => p.motif)!;
    for (const truncated of [false, true])
      for (const byHand of [false, true]) {
        const [again] = decodeBank(encodePuzzle({ ...base, truncated, byHand }));
        expect(again.truncated, `truncated=${truncated} byHand=${byHand}`).toBe(truncated);
        expect(again.byHand, `truncated=${truncated} byHand=${byHand}`).toBe(byHand);
      }
  });

  it("will not write provenance onto a record with no motif", () => {
    // `h` says where `motif` came from. Without a motif there is nothing for it
    // to be the provenance of, so the encoder drops it rather than storing a
    // flag whose referent is missing.
    const none = bank.find((p) => !p.motif)!;
    const encoded = encodePuzzle({ ...none, byHand: true });
    expect(encoded.split("|")[5]).toBe("");
    expect(decodeBank(encoded)[0].byHand).toBe(false);
  });

  it("drops a record it cannot read rather than throwing", () => {
    // Tolerant in exactly one direction, the way `tutorials.ts` drops an id it
    // does not recognise. A malformed record is a generator bug and the suite is
    // where it gets caught; a learner opening the Learn screen is not.
    expect(decodeBank("nonsense")).toEqual([]);
    expect(decodeBank("00001|too|few|fields")).toEqual([]);
    expect(decodeBank("")).toEqual([]);
    expect(decodeBank("\n\n")).toEqual([]);
  });

  it("drops a record whose goal is not in the vocabulary", () => {
    const good = encodePuzzle(bank[0]);
    const bad = good.replace(`|${bank[0].goal}|`, "|guillotine|");
    expect(decodeBank(bad)).toEqual([]);
    // ...and the same record with its real goal still decodes, so the test is
    // about the goal and not about the surgery.
    expect(decodeBank(good).length).toBe(1);
  });
});

describe("evalGoal", () => {
  it("reads an attacker-positive score from either side's point of view", () => {
    expect(evalGoal(250, "attackers")).toBe("crushing");
    expect(evalGoal(-250, "defenders")).toBe("crushing");
    expect(evalGoal(150, "attackers")).toBe("advantage");
    expect(evalGoal(-150, "defenders")).toBe("advantage");
  });

  it("says nothing about a position that is not decided enough to ask about", () => {
    expect(evalGoal(0, "attackers")).toBeNull();
    expect(evalGoal(119, "attackers")).toBeNull();
    // A score that is decisive for the *other* side is not this side's puzzle.
    expect(evalGoal(250, "defenders")).toBeNull();
  });
});

describe("the decode is total", () => {
  it("decodes every non-empty line of the payload", () => {
    // Guards against a bank that decodes but is a *different* bank from the
    // payload: `decodeBank` drops what it cannot read, so a silent partial
    // decode would make every loop above run over fewer records than ship.
    const count = BANK_DATA.split("\n").filter((l) => l.trim() !== "").length;
    expect(bank.length).toBe(count);
  });
});

const otherOf = (s: Side): Side => (s === "attackers" ? "defenders" : "attackers");
