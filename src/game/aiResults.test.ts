// ── Human-vs-computer results record (WP-4.2, feature 2) ─────────────────────
// Pure tests for aiResults.ts. No React, no screen — the module takes a plain
// storage-key prefix, so it is testable the same way persist.ts is.
import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_ENTRIES,
  formatTierLine,
  outcomeForHuman,
  recordIfTerminal,
  recordResult,
  summary,
} from "./aiResults";

/** The suites are pure logic with no jsdom (see CLAUDE.md), so storage is a
 *  map. Same stand-in every persist.test.ts in this project uses. */
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

beforeEach(() => {
  (globalThis as { localStorage: Storage }).localStorage =
    new MemoryStorage() as unknown as Storage;
});

const entry = (over: Partial<Parameters<typeof recordResult>[1]> = {}) => ({
  rulesetId: "copenhagen",
  difficulty: "medium",
  humanSide: "defenders",
  result: "win" as const,
  endedAt: 1_000,
  ...over,
});

describe("outcomeForHuman", () => {
  it("is a win when the human's side won", () => {
    expect(outcomeForHuman("defenders", "defenders")).toBe("win");
  });

  it("is a loss when the other side won", () => {
    expect(outcomeForHuman("attackers", "defenders")).toBe("loss");
  });

  it("is a draw regardless of side", () => {
    expect(outcomeForHuman("draw", "defenders")).toBe("draw");
    expect(outcomeForHuman("draw", "attackers")).toBe("draw");
  });

  it("is null over the board — hotseat has no human side to record against", () => {
    expect(outcomeForHuman("defenders", null)).toBeNull();
    expect(outcomeForHuman(null, null)).toBeNull();
  });

  it("is null when the game was never actually over", () => {
    expect(outcomeForHuman(null, "defenders")).toBeNull();
  });
});

describe("recordResult + summary", () => {
  it("tallies a recorded game under its difficulty and side", () => {
    recordResult("copenhagen", entry());
    const s = summary("copenhagen");
    expect(s.overall).toEqual({ win: 1, loss: 0, draw: 0 });
    expect(s.byDifficulty.medium).toEqual({ win: 1, loss: 0, draw: 0 });
    expect(s.bySide.defenders).toEqual({ win: 1, loss: 0, draw: 0 });
  });

  it("keeps separate boards in separate records", () => {
    recordResult("tablut", entry({ result: "loss" }));
    expect(summary("copenhagen").overall).toEqual({ win: 0, loss: 0, draw: 0 });
    expect(summary("tablut").overall).toEqual({ win: 0, loss: 1, draw: 0 });
  });

  it("adds across several games at the same tier", () => {
    recordResult("copenhagen", entry({ difficulty: "easy", result: "win" }));
    recordResult("copenhagen", entry({ difficulty: "easy", result: "win" }));
    recordResult("copenhagen", entry({ difficulty: "easy", result: "win" }));
    recordResult("copenhagen", entry({ difficulty: "easy", result: "loss" }));
    recordResult("copenhagen", entry({ difficulty: "medium", result: "loss" }));
    recordResult("copenhagen", entry({ difficulty: "medium", result: "loss" }));
    recordResult("copenhagen", entry({ difficulty: "medium", result: "loss" }));
    recordResult("copenhagen", entry({ difficulty: "medium", result: "loss" }));
    const s = summary("copenhagen");
    expect(s.byDifficulty.easy).toEqual({ win: 3, loss: 1, draw: 0 });
    expect(s.byDifficulty.medium).toEqual({ win: 0, loss: 4, draw: 0 });
  });

  it("filters by rulesetId when asked", () => {
    recordResult("copenhagen", entry({ rulesetId: "copenhagen", result: "win" }));
    recordResult("copenhagen", entry({ rulesetId: "custom", result: "loss" }));
    expect(summary("copenhagen", { rulesetId: "copenhagen" }).overall).toEqual({
      win: 1,
      loss: 0,
      draw: 0,
    });
  });

  it("filters by difficulty when asked", () => {
    recordResult("copenhagen", entry({ difficulty: "easy", result: "win" }));
    recordResult("copenhagen", entry({ difficulty: "medium", result: "loss" }));
    expect(summary("copenhagen", { difficulty: "easy" }).overall).toEqual({
      win: 1,
      loss: 0,
      draw: 0,
    });
  });

  it("returns an all-zero summary with nothing recorded", () => {
    expect(summary("copenhagen")).toEqual({ overall: { win: 0, loss: 0, draw: 0 }, byDifficulty: {}, bySide: {} });
  });

  it("survives a corrupt or non-array blob rather than throwing", () => {
    localStorage.setItem("copenhagen.aiResults.v1", "not json");
    expect(() => summary("copenhagen")).not.toThrow();
    expect(summary("copenhagen").overall).toEqual({ win: 0, loss: 0, draw: 0 });

    localStorage.setItem("copenhagen.aiResults.v1", JSON.stringify({ not: "an array" }));
    expect(summary("copenhagen").overall).toEqual({ win: 0, loss: 0, draw: 0 });
  });

  it("drops malformed rows rather than the whole file", () => {
    localStorage.setItem(
      "copenhagen.aiResults.v1",
      JSON.stringify([entry({ result: "win" }), { garbage: true }, "also garbage"]),
    );
    expect(summary("copenhagen").overall).toEqual({ win: 1, loss: 0, draw: 0 });
  });

  it("is bounded to the last MAX_ENTRIES games", () => {
    for (let i = 0; i < MAX_ENTRIES + 20; i++) {
      recordResult("copenhagen", entry({ result: "win", endedAt: i }));
    }
    const raw = JSON.parse(localStorage.getItem("copenhagen.aiResults.v1")!);
    expect(raw).toHaveLength(MAX_ENTRIES);
    // The oldest entries are the ones dropped — the newest 500 survive.
    expect(raw[0].endedAt).toBe(20);
    expect(raw[raw.length - 1].endedAt).toBe(MAX_ENTRIES + 19);
  });
});

const LABELS = { easy: "Easy", medium: "Medium", hard: "Hard", ollamh: "Ollamh" };
const ORDER = ["easy", "medium", "hard", "ollamh"] as const;

describe("formatTierLine", () => {
  it("is null with nothing recorded", () => {
    expect(formatTierLine(summary("copenhagen"), ORDER, LABELS)).toBeNull();
  });

  it("matches the spec's own example", () => {
    recordResult("copenhagen", entry({ difficulty: "easy", result: "win" }));
    recordResult("copenhagen", entry({ difficulty: "easy", result: "win" }));
    recordResult("copenhagen", entry({ difficulty: "easy", result: "win" }));
    recordResult("copenhagen", entry({ difficulty: "easy", result: "loss" }));
    recordResult("copenhagen", entry({ difficulty: "medium", result: "loss" }));
    recordResult("copenhagen", entry({ difficulty: "medium", result: "loss" }));
    recordResult("copenhagen", entry({ difficulty: "medium", result: "loss" }));
    recordResult("copenhagen", entry({ difficulty: "medium", result: "loss" }));
    const line = formatTierLine(summary("copenhagen"), ORDER, LABELS);
    expect(line).toBe("Easy 3-1-0, Medium 0-4-0");
  });

  it("leaves out a tier with nothing recorded, rather than padding it with zeroes", () => {
    recordResult("copenhagen", entry({ difficulty: "medium", result: "draw" }));
    const line = formatTierLine(summary("copenhagen"), ORDER, LABELS);
    expect(line).toBe("Medium 0-0-1");
  });

  it("reads in ladder order, not insertion order", () => {
    recordResult("copenhagen", entry({ difficulty: "hard", result: "win" }));
    recordResult("copenhagen", entry({ difficulty: "easy", result: "loss" }));
    const line = formatTierLine(summary("copenhagen"), ORDER, LABELS);
    expect(line).toBe("Easy 0-1-0, Hard 1-0-0");
  });
});

describe("recordIfTerminal", () => {
  it("records a real result", () => {
    recordIfTerminal("copenhagen", {
      winner: "defenders",
      humanSide: "defenders",
      rulesetId: "copenhagen",
      difficulty: "medium",
      endedAt: 5,
    });
    expect(summary("copenhagen").overall).toEqual({ win: 1, loss: 0, draw: 0 });
  });

  it("records nothing for a hotseat game", () => {
    recordIfTerminal("copenhagen", {
      winner: "defenders",
      humanSide: null,
      rulesetId: "copenhagen",
      difficulty: "medium",
      endedAt: 5,
    });
    expect(localStorage.getItem("copenhagen.aiResults.v1")).toBeNull();
  });

  it("records nothing for an abandoned (never-terminal) game", () => {
    recordIfTerminal("copenhagen", {
      winner: null,
      humanSide: "defenders",
      rulesetId: "copenhagen",
      difficulty: "medium",
      endedAt: 5,
    });
    expect(localStorage.getItem("copenhagen.aiResults.v1")).toBeNull();
  });
});
