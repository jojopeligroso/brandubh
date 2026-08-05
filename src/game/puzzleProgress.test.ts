import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Difficulty } from "./ai";
import type { Puzzle } from "./puzzleBank";
import {
  UNLOCK_PROPORTION,
  bandProgress,
  isBandUnlocked,
  loadPuzzleProgress,
  parsePuzzleProgress,
  savePuzzleProgress,
  unlockThreshold,
} from "./puzzleProgress";

/** A puzzle with only the two fields progress reads. Nothing here decodes or
 *  verifies anything, so the rest of the record would be scenery. */
const puz = (id: string, band: Difficulty): Puzzle => ({ id, band }) as unknown as Puzzle;

/** `n` puzzles in `band`, numbered so ids stay unique across bands. */
const makeBand = (band: Difficulty, n: number, from: number): Puzzle[] =>
  Array.from({ length: n }, (_, i) => puz(String(from + i).padStart(5, "0"), band));

/** The shipped shape: 106 / 22 / 29 / 4, as `grade.ts` records it. */
const SHIPPED = [
  ...makeBand("easy", 106, 1),
  ...makeBand("medium", 22, 200),
  ...makeBand("hard", 29, 300),
  ...makeBand("ollamh", 4, 400),
];

const solve = (puzzles: Puzzle[], band: Difficulty, n: number): Set<string> =>
  new Set(
    puzzles
      .filter((p) => p.band === band)
      .slice(0, n)
      .map((p) => p.id),
  );

describe("the unlock proportion", () => {
  it("scales with the band, which is the whole reason it is not a count", () => {
    // Under the shipped 106 / 22 / 29 / 4 a flat count would mean four different
    // things. The three gates the bank actually has:
    expect(unlockThreshold(106)).toBe(27);
    expect(unlockThreshold(22)).toBe(6);
    expect(unlockThreshold(29)).toBe(8);
    // And the number the proportion was chosen against: the first gate, which is
    // the only one large enough to be a wall. One third would put it at 36 —
    // more than the whole of `medium` and more than `hard`.
    expect(unlockThreshold(106)).toBeLessThan(Math.ceil(106 / 3));
  });

  it("rounds up, so a non-empty band always costs at least one solve", () => {
    expect(unlockThreshold(1)).toBe(1);
    expect(unlockThreshold(3)).toBe(1);
    expect(UNLOCK_PROPORTION).toBeGreaterThan(0);
  });

  it("asks nothing of an empty band, so an empty band cannot dam the ladder", () => {
    expect(unlockThreshold(0)).toBe(0);
    // A bank with no `medium` puzzles at all still opens `hard` off `easy`: the
    // empty rung is passed through rather than standing as an impossible gate.
    // `ollamh` stays shut, correctly — `hard` is not empty and is untouched.
    const puzzles = [...makeBand("easy", 4, 1), ...makeBand("hard", 4, 300)];
    const progress = bandProgress(puzzles, solve(puzzles, "easy", 1));
    expect(progress.map((b) => b.unlocked)).toEqual([true, true, true, false]);
  });
});

describe("band unlocking", () => {
  it("opens the first band with nothing solved", () => {
    const progress = bandProgress(SHIPPED, new Set());
    expect(progress[0]).toMatchObject({ band: "easy", total: 106, solved: 0, unlocked: true });
    expect(progress.slice(1).every((b) => !b.unlocked)).toBe(true);
  });

  it("opens the next band exactly at the boundary, and not one solve before", () => {
    const justUnder = bandProgress(SHIPPED, solve(SHIPPED, "easy", 26));
    expect(justUnder[1].unlocked).toBe(false);
    expect(justUnder[1].needed).toBe(1);

    const exactly = bandProgress(SHIPPED, solve(SHIPPED, "easy", 27));
    expect(exactly[1].unlocked).toBe(true);
    expect(exactly[1].needed).toBe(0);
  });

  it("is walked rung by rung: clearing the whole first band opens only the second", () => {
    const progress = bandProgress(SHIPPED, solve(SHIPPED, "easy", 106));
    expect(progress.map((b) => b.unlocked)).toEqual([true, true, false, false]);
  });

  it("counts a locked band's own solves as zero, because it cannot have any", () => {
    const progress = bandProgress(SHIPPED, new Set());
    expect(progress[3]).toMatchObject({ band: "ollamh", total: 4, solved: 0 });
  });

  it("reaches the top band on 41 solves — a quarter of the bank", () => {
    const solved = new Set([
      ...solve(SHIPPED, "easy", 27),
      ...solve(SHIPPED, "medium", 6),
      ...solve(SHIPPED, "hard", 8),
    ]);
    expect(solved.size).toBe(41);
    expect(bandProgress(SHIPPED, solved).map((b) => b.unlocked)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("never revokes: adding solves can only ever open more", () => {
    // Monotonicity, walked one solve at a time over the whole bank. Nothing in
    // the rules can take a band back, and this is the assertion that says so.
    const solved = new Set<string>();
    let opened = 0;
    for (const p of SHIPPED) {
      solved.add(p.id);
      const now = bandProgress(SHIPPED, solved).filter((b) => b.unlocked).length;
      expect(now).toBeGreaterThanOrEqual(opened);
      opened = now;
    }
  });

  it("is blind to how many attempts a solve took — it has no way to know", () => {
    // The Attempt's wrong-guess count never reaches storage, so two learners
    // with the same solved set are in the same place by construction. The check
    // that matters is that `bandProgress` reads nothing but ids and bands.
    const a = bandProgress(SHIPPED, solve(SHIPPED, "easy", 27));
    const b = bandProgress(SHIPPED, solve(SHIPPED, "easy", 27));
    expect(a).toEqual(b);
  });

  it("answers the boolean directly too", () => {
    expect(isBandUnlocked("medium", SHIPPED, new Set())).toBe(false);
    expect(isBandUnlocked("medium", SHIPPED, solve(SHIPPED, "easy", 27))).toBe(true);
    expect(isBandUnlocked("easy", [], new Set())).toBe(true);
  });

  it("reports needed against the band immediately below, at every rung", () => {
    const progress = bandProgress(SHIPPED, new Set());
    expect(progress.map((b) => b.needed)).toEqual([0, 27, 6, 8]);
  });
});

// The same in-memory stand-in `persist.test.ts` uses; the suite runs in node,
// which has no `localStorage` of its own.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
  clear = (): void => this.data.clear();
  key = (i: number): string | null => [...this.data.keys()][i] ?? null;
  get length(): number {
    return this.data.size;
  }
}

const installStorage = (): void => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: new MemoryStorage() as unknown as Storage,
  });
};

describe("the stored ledger", () => {
  const known = new Set(SHIPPED.map((p) => p.id));

  beforeEach(installStorage);

  it("drops an id the bank does not contain", () => {
    const parsed = parsePuzzleProgress(JSON.stringify(["00001", "99999"]), known);
    expect([...parsed]).toEqual(["00001"]);
  });

  it("comes back empty under a ruleset whose bank is empty", () => {
    // `loadBank` serves nothing under a ruleset it was not verified for, so
    // `known` is empty and no stored id is recognised — which is right, and
    // leaves the stored string untouched for when the ruleset comes back.
    expect(parsePuzzleProgress(JSON.stringify(["00001"]), new Set()).size).toBe(0);
  });

  it("tolerates nothing stored, junk, and the wrong shape", () => {
    expect(parsePuzzleProgress(null, known).size).toBe(0);
    expect(parsePuzzleProgress("{{{", known).size).toBe(0);
    expect(parsePuzzleProgress(JSON.stringify({ "00001": true }), known).size).toBe(0);
    expect(parsePuzzleProgress(JSON.stringify([1, null, "00001"]), known)).toEqual(
      new Set(["00001"]),
    );
  });

  it("round-trips through localStorage", () => {
    savePuzzleProgress(new Set(["00001", "00002"]));
    expect(loadPuzzleProgress(known)).toEqual(new Set(["00001", "00002"]));
  });
});

describe("a dead localStorage", () => {
  afterEach(installStorage);

  it("is tolerated in both directions rather than throwing at the Learn screen", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked in private mode");
      },
    });
    expect(loadPuzzleProgress(new Set(["00001"])).size).toBe(0);
    // A solve that cannot be written down is a solve that has to be made again.
    // That is not worth an exception on the screen that is teaching someone.
    expect(() => savePuzzleProgress(new Set(["00001"]))).not.toThrow();
  });
});
