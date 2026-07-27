import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_CONTROL_ID,
  TIME_PRESETS,
  describeTimeControl,
  formatClock,
  isLowTime,
  presetById,
  resolveTimeControl,
} from "./clock";

describe("formatClock", () => {
  it("shows M:SS above ten seconds, rounding the last second up", () => {
    expect(formatClock(180_000)).toBe("3:00");
    expect(formatClock(125_000)).toBe("2:05");
    expect(formatClock(60_000)).toBe("1:00");
    expect(formatClock(10_000)).toBe("0:10");
    // 10.5s still whole-second (ceil) until it drops under ten.
    expect(formatClock(10_500)).toBe("0:11");
  });

  it("counts down in tenths inside the final ten seconds", () => {
    expect(formatClock(9_999)).toBe("9.9");
    expect(formatClock(9_000)).toBe("9.0");
    expect(formatClock(5_300)).toBe("5.3");
    expect(formatClock(400)).toBe("0.4");
  });

  it("clamps negatives to 0.0 and never goes below zero", () => {
    expect(formatClock(0)).toBe("0.0");
    expect(formatClock(-500)).toBe("0.0");
  });

  it("shows H:MM:SS past an hour", () => {
    expect(formatClock(3_600_000)).toBe("1:00:00");
    expect(formatClock(3_661_000)).toBe("1:01:01");
  });
});

describe("isLowTime", () => {
  it("is true only inside the final ten seconds", () => {
    expect(isLowTime(9_999)).toBe(true);
    expect(isLowTime(10_000)).toBe(false);
    expect(isLowTime(0)).toBe(false);
  });
});

describe("presets", () => {
  it("exposes the default 3+2 control", () => {
    const preset = presetById(DEFAULT_TIME_CONTROL_ID);
    expect(preset).toBeDefined();
    expect(preset!.initialSeconds).toBe(180);
    expect(preset!.incrementSeconds).toBe(2);
  });

  it("labels every preset as initial+increment", () => {
    for (const p of TIME_PRESETS) {
      expect(describeTimeControl(p)).toBe(p.id);
    }
  });

  it("returns undefined for an unknown id", () => {
    expect(presetById("nope")).toBeUndefined();
  });
});

describe("resolveTimeControl", () => {
  it("returns null when the clock is disabled", () => {
    expect(resolveTimeControl(false, "3+2", 5, 3)).toBeNull();
  });

  it("resolves a preset id to its bank and increment", () => {
    expect(resolveTimeControl(true, "5+3", 5, 3)).toEqual({
      initialSeconds: 300,
      incrementSeconds: 3,
    });
  });

  it("resolves the custom control from minutes + increment", () => {
    expect(resolveTimeControl(true, "custom", 2.5, 4)).toEqual({
      initialSeconds: 150,
      incrementSeconds: 4,
    });
  });

  it("clamps out-of-range custom values", () => {
    const tc = resolveTimeControl(true, "custom", 999, 999)!;
    expect(tc.initialSeconds).toBe(3600); // 60 minute cap
    expect(tc.incrementSeconds).toBe(60); // 60 second cap
  });
});
