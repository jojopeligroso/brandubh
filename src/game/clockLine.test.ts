import { describe, expect, it } from "vitest";
import type { TimeControl } from "./clock";
import {
  banksAt,
  fullBanks,
  initialClockLine,
  isTimeLoss,
  recordArrival,
  truncateTo,
  type ClockLine,
} from "./clockLine";

const TC: TimeControl = { initialSeconds: 180, incrementSeconds: 2 }; // 3+2

describe("fullBanks", () => {
  it("gives both sides the starting bank in milliseconds", () => {
    expect(fullBanks(TC)).toEqual({ attackers: 180_000, defenders: 180_000 });
  });

  it("is zero when no clock is configured", () => {
    expect(fullBanks(null)).toEqual({ attackers: 0, defenders: 0 });
  });
});

describe("initialClockLine", () => {
  it("holds the opening position only, both banks full", () => {
    const line = initialClockLine(TC);
    expect(line).toHaveLength(1);
    expect(line[0]).toEqual({ attackers: 180_000, defenders: 180_000 });
  });
});

describe("recordArrival", () => {
  it("appends the banks a position was reached with", () => {
    let line = initialClockLine(TC);
    line = recordArrival(line, 1, { attackers: 172_000, defenders: 180_000 });
    line = recordArrival(line, 2, { attackers: 172_000, defenders: 165_000 });
    expect(line).toHaveLength(3);
    expect(line[2]).toEqual({ attackers: 172_000, defenders: 165_000 });
  });

  it("drops any line that used to follow — a new move supersedes it", () => {
    let line = initialClockLine(TC);
    line = recordArrival(line, 1, { attackers: 172_000, defenders: 180_000 });
    line = recordArrival(line, 2, { attackers: 172_000, defenders: 165_000 });
    // Rewind to ply 1 and play a different move.
    line = recordArrival(truncateTo(line, 1), 2, { attackers: 172_000, defenders: 140_000 });
    expect(line).toHaveLength(3);
    expect(line[2]).toEqual({ attackers: 172_000, defenders: 140_000 });
  });
});

describe("truncateTo", () => {
  it("keeps the position it rewinds to", () => {
    let line = initialClockLine(TC);
    line = recordArrival(line, 1, { attackers: 172_000, defenders: 180_000 });
    line = recordArrival(line, 2, { attackers: 172_000, defenders: 165_000 });
    const cut = truncateTo(line, 1);
    expect(cut).toHaveLength(2);
    expect(cut[1]).toEqual({ attackers: 172_000, defenders: 180_000 });
  });
});

describe("banksAt", () => {
  it("replays the time a position was first offered with", () => {
    let line = initialClockLine(TC);
    line = recordArrival(line, 1, { attackers: 172_000, defenders: 180_000 });
    expect(banksAt(line, 1, TC)).toEqual({ attackers: 172_000, defenders: 180_000 });
  });

  it("is the fix for the flag: a spent bank comes back with its position", () => {
    // Attackers arrive at ply 1 with 12s, get distracted, and flag there.
    let line = initialClockLine(TC);
    line = recordArrival(line, 1, { attackers: 12_000, defenders: 180_000 });
    const afterFlag: ClockLine = line; // the live clock hit 0; the line did not
    expect(banksAt(afterFlag, 1, TC).attackers).toBe(12_000);
  });

  it("falls back to a full bank for an unrecorded ply", () => {
    expect(banksAt([], 4, TC)).toEqual({ attackers: 180_000, defenders: 180_000 });
  });
});

describe("isTimeLoss", () => {
  it("picks out only the clock results", () => {
    expect(isTimeLoss("attackers_win_time")).toBe(true);
    expect(isTimeLoss("defenders_win_time")).toBe(true);
    expect(isTimeLoss("attackers_win_capture")).toBe(false);
    expect(isTimeLoss("defenders_win_escape")).toBe(false);
    expect(isTimeLoss("attackers_win_resign")).toBe(false);
    expect(isTimeLoss("playing")).toBe(false);
  });
});
