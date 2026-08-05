import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { allMoves, applyMove, initialState } from "../src/game/engine";
import { encodePosition } from "../src/game/position";
import { canonicalKey } from "../src/game/solver";
import { VARIANTS } from "../src/game/variants";
import {
  handAddProblemReport,
  mergeHandAddWarning,
  parseHandAdds,
  readHandAdds,
  shardHandAddWarning,
  unminedHandAdds,
} from "./handadds";

const rules = VARIANTS.wtf;
const PATH = "data/puzzle-handadds.txt";

// A hand-add is built rather than transcribed: a board typed into a test is a
// board that has to be kept legal by hand, and `parsePosition` rejects the ones
// the rules could never have produced. The opening position and its first legal
// move are the same two things the file's own worked example is made of.
const before = initialState();
const opening = allMoves(before.board, before.turn, rules)[0];
const code = `${opening.from.row}${opening.from.col}${opening.to.row}${opening.to.col}`;
const LINE = `${encodePosition(before)} ${code}`;
const KEY = canonicalKey(applyMove(before, opening, rules));

const parse = (source: string) => parseHandAdds(source, rules, PATH);

describe("parseHandAdds", () => {
  it("reads a line as the position before the lead-in, keyed on the position after it", () => {
    const { entries, problems } = parse(LINE);
    expect(problems).toEqual([]);
    expect(entries).toHaveLength(1);
    // The key is what a shard records in `seen` and what the merge dedupes on.
    // If this drifts, every hand-add already mined starts reading as unmined.
    expect(entries[0].key).toBe(KEY);
    expect(encodePosition(entries[0].before)).toBe(encodePosition(before));
    expect(entries[0].start.turn).not.toBe(before.turn);
  });

  it("ignores blank lines and # comments without counting them as problems", () => {
    const { entries, problems } = parse("# a note\n\n   \n# another\n");
    expect(entries).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("numbers lines as written, comments and blanks included", () => {
    // The owner is looking at the file, not at an ordinal among the live lines.
    const { entries } = parse(`# one\n\n# three\n${LINE}\n`);
    expect(entries[0].line).toBe(4);
  });

  it("counts an unreadable position instead of dropping it", () => {
    const { entries, problems } = parse(`3A3/3A3 a 0302\n${LINE}`);
    expect(entries).toHaveLength(1); // the good line still goes through
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(1);
    expect(problems[0].text).toBe("3A3/3A3 a 0302");
    expect(problems[0].reason).toBe("bad_rank_count");
  });

  it("counts a lead-in that is not legal in the position it is written against", () => {
    const { entries, problems } = parse(`${encodePosition(before)} 0000`);
    expect(entries).toEqual([]);
    expect(problems).toEqual([{ line: 1, text: `${encodePosition(before)} 0000`, reason: "illegal lead-in" }]);
  });

  it("accounts for every non-comment line exactly once", () => {
    const source = `${LINE}\n# comment\nnot a position at all\n\n${encodePosition(before)} 0000`;
    const { entries, problems } = parse(source);
    expect(entries.length + problems.length).toBe(3);
  });
});

describe("the checked-in hand-adds file", () => {
  it("has no unreadable lines", () => {
    // Cheapest possible guard on the one file a person edits by hand. A typo
    // here used to cost a console.warn behind a progress line; now it costs a
    // red suite.
    const file = readHandAdds(join(import.meta.dirname, "../data/puzzle-handadds.txt"), rules);
    expect(file.missing).toBe(false);
    expect(handAddProblemReport(file)).toBeNull();
  });

  it("is not read as a puzzle source when it is absent", () => {
    const file = readHandAdds(join(import.meta.dirname, "../data/no-such-file.txt"), rules);
    expect(file.missing).toBe(true);
    expect(file.entries).toEqual([]);
    expect(handAddProblemReport(file)).toBeNull();
  });
});

describe("handAddProblemReport", () => {
  it("says nothing when there is nothing to say", () => {
    expect(handAddProblemReport(parse(LINE))).toBeNull();
  });

  it("names the file, the line and the reason", () => {
    const report = handAddProblemReport(parse("3A3/3A3 a 0302"));
    expect(report).toContain(PATH);
    expect(report).toContain("line 1 (bad_rank_count)");
    expect(report).toContain("1 UNREADABLE LINE");
  });
});

describe("unminedHandAdds", () => {
  it("is empty when the shards have seen the position", () => {
    expect(unminedHandAdds(parse(LINE), new Set([KEY]))).toEqual([]);
  });

  it("counts a hand-add the shards assessed and threw away as done", () => {
    // `seen` holds rejected keys too, and rejection is a real answer. Measuring
    // against the emitted bank instead would tell the owner to re-mine a
    // position the pipeline is entitled to have dropped.
    const seen = new Set([KEY]); // present in `seen`, absent from `found`
    expect(unminedHandAdds(parse(LINE), seen)).toEqual([]);
  });

  it("returns the entry when no shard has looked at it", () => {
    const unmined = unminedHandAdds(parse(LINE), new Set(["some other key"]));
    expect(unmined).toHaveLength(1);
    expect(unmined[0].text).toBe(LINE);
  });
});

describe("mergeHandAddWarning", () => {
  it("is silent when every hand-add is in a shard", () => {
    expect(mergeHandAddWarning(parse(LINE), new Set([KEY]))).toBeNull();
  });

  it("is silent on a file of nothing but comments", () => {
    expect(mergeHandAddWarning(parse("# nothing here yet\n"), new Set())).toBeNull();
  });

  it("names the waiting line, and the command that would mine it", () => {
    const warning = mergeHandAddWarning(parse(LINE), new Set());
    expect(warning).toContain("HAND-ADD IN NO SHARD");
    expect(warning).toContain(PATH);
    expect(warning).toContain(`line 1: ${LINE}`);
    // The fix is not guessable, so it is quoted rather than described.
    expect(warning).toContain("npx tsx scripts/genpuzzles.ts --shard --from 0 --to 0");
    expect(warning).toContain("npx tsx scripts/genpuzzles.ts --merge");
  });

  it("explains the empty range, and warns off the spelling that destroys the bank", () => {
    const warning = mergeHandAddWarning(parse(LINE), new Set()) ?? "";
    expect(warning).toContain("not a typo");
    expect(warning).toContain("handAdds: true");
    expect(warning).toContain("Keep --shard");
  });

  it("counts, so two waiting positions do not read as one", () => {
    const warning = mergeHandAddWarning(parse(`${LINE}\n# a note\n${LINE}`), new Set()) ?? "";
    // Both lines carry the same key; the report is about lines in the file, not
    // about distinct positions, because the file is what the owner is looking at.
    expect(warning).toContain("2 HAND-ADDS IN NO SHARD");
    expect(warning).toContain("line 1:");
    expect(warning).toContain("line 3:");
  });
});

describe("shardHandAddWarning", () => {
  it("is silent when this shard has been through them", () => {
    expect(shardHandAddWarning(parse(LINE), new Set([KEY]))).toBeNull();
  });

  it("says why re-running the range will not pick them up", () => {
    const warning = shardHandAddWarning(parse(LINE), new Set()) ?? "";
    expect(warning).toContain("THIS SHARD WILL NOT READ");
    expect(warning).toContain("handAdds: true");
    expect(warning).toContain("npx tsx scripts/genpuzzles.ts --shard --from 0 --to 0");
  });
});
