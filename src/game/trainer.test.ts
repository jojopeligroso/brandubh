import { describe, expect, it } from "vitest";
import {
  MIN_ACCURACY,
  PROMOTE_AFTER,
  initialTrainer,
  nextBand,
  parseTrainer,
  pickNext,
  promotes,
  recordAttempt,
  type TrainerState,
} from "./trainer";
import type { Difficulty } from "./ai";
import type { Puzzle } from "./puzzleBank";

// The trainer reads only `id` and `band`; everything else is along for the
// ride. A cast keeps the fixtures honest about that without inventing boards.
const puzzle = (id: string, band: Difficulty): Puzzle => ({ id, band }) as Puzzle;

/** A little bank: 10 easy, 6 medium, 6 hard, 2 ollamh. */
const bank: Puzzle[] = [
  ...Array.from({ length: 10 }, (_, i) => puzzle(`e${i}`, "easy")),
  ...Array.from({ length: 6 }, (_, i) => puzzle(`m${i}`, "medium")),
  ...Array.from({ length: 6 }, (_, i) => puzzle(`h${i}`, "hard")),
  ...Array.from({ length: 2 }, (_, i) => puzzle(`o${i}`, "ollamh")),
];

const rand0 = () => 0; // always the first candidate — the suites pin the draw

const afterAttempts = (start: TrainerState, results: boolean[]): TrainerState =>
  results.reduce((s, r) => recordAttempt(s, r), start);

describe("promotion gates", () => {
  it("walks the ladder in DIFFICULTIES order", () => {
    expect(nextBand("easy")).toBe("medium");
    expect(nextBand("medium")).toBe("hard");
    expect(nextBand("hard")).toBe("ollamh");
    expect(nextBand("ollamh")).toBeNull();
  });

  it("easy needs 8 clean solves, the upper gates 5, ollamh never promotes", () => {
    expect(PROMOTE_AFTER).toEqual({ easy: 8, medium: 5, hard: 5, ollamh: null });
  });

  it("8 clean easy solves in a row promote to medium", () => {
    const s = afterAttempts(initialTrainer(), Array(8).fill(true));
    expect(s.band).toBe("medium");
    expect(s.record.easy).toEqual({ correct: 8, attempted: 8 });
  });

  it("7 clean solves do not promote", () => {
    const s = afterAttempts(initialTrainer(), Array(7).fill(true));
    expect(s.band).toBe("easy");
  });

  it("the count alone is not enough: 8 clean of 11 is under the 80% floor", () => {
    // 3 misses then 8 clean = 8/11 ≈ 72.7%.
    const s = afterAttempts(initialTrainer(), [false, false, false, ...Array(8).fill(true)]);
    expect(s.band).toBe("easy");
    expect(promotes("easy", s.record.easy)).toBe(false);
  });

  it("8 clean of 10 is exactly 80% and passes", () => {
    const s = afterAttempts(initialTrainer(), [false, false, ...Array(8).fill(true)]);
    expect(s.band).toBe("medium");
  });

  it("a slow start stays recoverable: more clean solves re-open the gate", () => {
    // 3 misses, then clean solves until the floor is met again: 12/15 = 80%.
    const s = afterAttempts(initialTrainer(), [false, false, false, ...Array(12).fill(true)]);
    expect(s.band).toBe("medium");
  });

  it("medium promotes to hard after 5 clean at 80%+", () => {
    const start: TrainerState = { ...initialTrainer(), band: "medium" };
    expect(afterAttempts(start, Array(5).fill(true)).band).toBe("hard");
    expect(afterAttempts(start, [false, ...Array(4).fill(true)]).band).toBe("medium"); // 4/5
    expect(afterAttempts(start, [false, ...Array(5).fill(true)]).band).toBe("hard"); // 5/6 ≈ 83%
  });

  it("hard promotes to ollamh after 5; ollamh has nowhere to go", () => {
    const hard: TrainerState = { ...initialTrainer(), band: "hard" };
    expect(afterAttempts(hard, Array(5).fill(true)).band).toBe("ollamh");
    const top: TrainerState = { ...initialTrainer(), band: "ollamh" };
    expect(afterAttempts(top, Array(50).fill(true)).band).toBe("ollamh");
  });

  it("attempts are scored against the band being trained, not reset on promotion", () => {
    const s = afterAttempts(initialTrainer(), Array(8).fill(true));
    const after = recordAttempt(s, false);
    expect(after.record.medium).toEqual({ correct: 0, attempted: 1 });
    expect(after.record.easy).toEqual({ correct: 8, attempted: 8 }); // untouched
  });

  it("MIN_ACCURACY is the documented 80%", () => {
    expect(MIN_ACCURACY).toBe(0.8);
  });
});

describe("pickNext", () => {
  it("serves an unsolved puzzle from the current band", () => {
    const { puzzle: p, band } = pickNext(bank, new Set(), "easy", rand0);
    expect(p?.band).toBe("easy");
    expect(band).toBe("easy");
  });

  it("never serves a solved puzzle", () => {
    const solved = new Set(bank.filter((p) => p.band === "easy").map((p) => p.id));
    solved.delete("e7");
    const { puzzle: p } = pickNext(bank, solved, "easy", rand0);
    expect(p?.id).toBe("e7");
  });

  it("avoids re-serving the puzzle just finished while alternatives exist", () => {
    const solved = new Set(["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7"]); // e8, e9 left
    const { puzzle: p } = pickNext(bank, solved, "easy", rand0, "e8");
    expect(p?.id).toBe("e9");
  });

  it("re-serves the avoided puzzle when it is the only one left in the band", () => {
    const solved = new Set(["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"]);
    const { puzzle: p } = pickNext(bank, solved, "easy", rand0, "e9");
    expect(p?.id).toBe("e9");
  });

  it("skips upward past a band with nothing left unsolved", () => {
    const solved = new Set(bank.filter((p) => p.band === "easy").map((p) => p.id));
    const { puzzle: p, band } = pickNext(bank, solved, "easy", rand0);
    expect(p?.band).toBe("medium");
    expect(band).toBe("medium");
  });

  it("free play past ollamh: serves leftovers from any band, randomly", () => {
    // Everything solved except one easy and one hard leftover.
    const solved = new Set(bank.map((p) => p.id));
    solved.delete("e3");
    solved.delete("h2");
    const first = pickNext(bank, solved, "ollamh", rand0);
    expect(first.band).toBe("ollamh"); // the trainer stays at the top
    expect(["e3", "h2"]).toContain(first.puzzle?.id);
    const second = pickNext(bank, solved, "ollamh", () => 0.99);
    expect(["e3", "h2"]).toContain(second.puzzle?.id);
    expect(second.puzzle?.id).not.toBe(first.puzzle?.id); // rand reaches both
  });

  it("returns null once the whole bank is solved", () => {
    const solved = new Set(bank.map((p) => p.id));
    expect(pickNext(bank, solved, "ollamh", rand0).puzzle).toBeNull();
    expect(pickNext(bank, solved, "easy", rand0).puzzle).toBeNull();
  });

  it("draws across the whole unsolved pool as rand varies", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const { puzzle: p } = pickNext(bank, new Set(), "easy", () => i / 10);
      if (p) seen.add(p.id);
    }
    expect(seen.size).toBe(10); // all ten easy puzzles reachable
  });
});

describe("persistence parsing", () => {
  it("round-trips a state", () => {
    const s = afterAttempts(initialTrainer(), [true, false, true]);
    expect(parseTrainer(JSON.stringify(s))).toEqual(s);
  });

  it("tolerates null, garbage, and wrong shapes", () => {
    expect(parseTrainer(null)).toEqual(initialTrainer());
    expect(parseTrainer("not json")).toEqual(initialTrainer());
    expect(parseTrainer("[1,2,3]")).toEqual(initialTrainer());
    expect(parseTrainer(JSON.stringify({ band: "impossible" }))).toEqual(initialTrainer());
  });

  it("clamps corrupt numbers: correct never exceeds attempted, negatives drop to 0", () => {
    const s = parseTrainer(
      JSON.stringify({
        band: "medium",
        record: { easy: { correct: 9, attempted: 4 }, hard: { correct: -2, attempted: -5 } },
      }),
    );
    expect(s.band).toBe("medium");
    expect(s.record.easy).toEqual({ correct: 4, attempted: 4 });
    expect(s.record.hard).toEqual({ correct: 0, attempted: 0 });
  });
});
