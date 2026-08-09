/* Reading data/puzzle-handadds.txt, and noticing when the file has moved on
 * without the shards.
 *
 * Split out of scripts/genpuzzles.ts, which reads hand-adds in exactly one
 * place: inside `mine()`, once, guarded by the shard's `handAdds` flag. That is
 * the right place to *mine* them and the wrong place to be the only code that
 * has ever heard of the file, because the two commands a person actually types
 * after appending a position both skip it:
 *
 *   • `--merge` returns before `mine()` is called at all. It emits from the
 *     shards on disk, which is the whole point of the mode, so a hand-add that
 *     no shard has assessed is not in the bank and cannot become one. The run
 *     prints the same puzzle count as yesterday and writes a byte-identical
 *     data module: the exact shape of a success.
 *   • `--shard --from 0 --to 40` finds a shard that recorded `handAdds: true`
 *     on the run that mined it, and the flag is checked before the file is
 *     opened. It prints "nothing to do" without ever looking.
 *
 * Neither is a bug in the mining. Both are silence, and silence is what makes a
 * lost hand-add cost a week rather than a minute: the owner submits a position,
 * regenerates, sees a number, and has no reason to look again. So the file is
 * parsed here, once, into facts anything can check, and both commands say what
 * they are about to skip.
 *
 * Nothing in this module decides what gets mined, assessed or emitted. It reads
 * a text file and compares canonical keys against the keys a shard already
 * recorded in `seen`. `seen` is the right side of that comparison and `found` is
 * not: a hand-add that went through every filter and was *rejected* has been
 * looked at, and telling its owner to mine it again would be the report crying
 * wolf about the one outcome the pipeline is entitled to reach.
 */
import { existsSync, readFileSync } from "node:fs";
import { allMoves, applyMove } from "../src/game/rules";
import { encodeMove } from "../src/game/openingBook";
import { parsePosition } from "../src/game/position";
import { canonicalKey } from "../src/game/solver";
import type { GameState, Move } from "../src/game/types";
import type { RuleSet } from "../src/game/variants";

/** One readable hand-add: a position, the lead-in played from it, and the key
 *  the miner would file it under. */
export interface HandAdd {
  /** 1-based line number in the file, counting comments and blanks, so a report
   *  can point at the line the owner typed rather than at an ordinal among the
   *  live ones. */
  line: number;
  /** The line as written, trimmed. Quoted back verbatim: a person looking for
   *  their own typo wants their own text. */
  text: string;
  /** The position *before* the lead-in: what the file stores. */
  before: GameState;
  leadIn: Move;
  /** The position the learner is handed. `assess` calls this `start`, and the
   *  field is named to match. */
  start: GameState;
  /** `canonicalKey(start)`: what a shard records in `seen`, and what the merge
   *  dedupes on. Folded over D4, so a mirrored resubmission is recognised as
   *  the position already mined. */
  key: string;
}

/** A line that was skipped. Counted, which it never used to be. */
export interface HandAddProblem {
  line: number;
  text: string;
  /** Short, in the words the generator has always used: a `parsePosition` error
   *  code, or `illegal lead-in`. */
  reason: string;
}

export interface HandAddFile {
  /** The path it was read from, so a warning can name it. */
  path: string;
  /** True when there is no file at all, which is not a problem: the generator
   *  has always treated an absent hand-adds file as an empty one. */
  missing: boolean;
  entries: HandAdd[];
  problems: HandAddProblem[];
}

const sameMove = (a: Move, b: Move): boolean => encodeMove(a) === encodeMove(b);

/**
 * Parse the file's text. Blank lines and `#` comments are ignored; every other
 * line is either an entry or a problem, and every line is accounted for by
 * exactly one of the two.
 *
 * The parse is the generator's own, moved rather than rewritten, including
 * `lastIndexOf(" ")`, which is how the position and the four-digit lead-in have
 * always been told apart. Changing it would change which hand-adds are legible,
 * and this module is not allowed to change what gets mined.
 */
export function parseHandAdds(source: string, rules: RuleSet, path = ""): HandAddFile {
  const entries: HandAdd[] = [];
  const problems: HandAddProblem[] = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    const line = i + 1;
    if (!text || text.startsWith("#")) continue;

    const at = text.lastIndexOf(" ");
    const parsed = parsePosition(text.slice(0, at));
    if (!parsed.ok) {
      problems.push({ line, text, reason: parsed.error.code });
      continue;
    }
    const code = text.slice(at + 1);
    const leadIn: Move = {
      from: { row: Number(code[0]), col: Number(code[1]) },
      to: { row: Number(code[2]), col: Number(code[3]) },
    };
    const legal = allMoves(parsed.state.board, parsed.state.turn, rules).find((m) => sameMove(m, leadIn));
    if (!legal) {
      problems.push({ line, text, reason: "illegal lead-in" });
      continue;
    }
    const start = applyMove(parsed.state, legal, rules);
    entries.push({ line, text, before: parsed.state, leadIn: legal, start, key: canonicalKey(start) });
  }

  return { path, missing: false, entries, problems };
}

/** The same, off disk. An absent file is an empty one. */
export function readHandAdds(path: string, rules: RuleSet): HandAddFile {
  if (!existsSync(path)) return { path, missing: true, entries: [], problems: [] };
  return parseHandAdds(readFileSync(path, "utf8"), rules, path);
}

/** The live entries no shard has assessed, in file order. */
export const unminedHandAdds = (file: HandAddFile, seen: ReadonlySet<string>): HandAdd[] =>
  file.entries.filter((e) => !seen.has(e.key));

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const listEntries = (of: HandAdd[]): string => of.map((e) => `     line ${e.line}: ${e.text}`).join("\n");

/**
 * The unreadable lines, or null when there are none.
 *
 * These used to be a bare `console.warn` per line with a leading newline,
 * emitted from inside the mining loop and never counted anywhere. A count is
 * the difference between "the generator said something" and "three of the four
 * positions I added are not in the bank": one is noticed, the other is a line
 * of terminal scrollback.
 */
export function handAddProblemReport(file: HandAddFile): string | null {
  if (!file.problems.length) return null;
  return (
    `!! ${plural(file.problems.length, "UNREADABLE LINE", "UNREADABLE LINES")} in ${file.path}, skipped and\n` +
    `   therefore not in the bank:\n` +
    file.problems.map((p) => `     line ${p.line} (${p.reason}): ${p.text}`).join("\n")
  );
}

/**
 * What `--merge` has to say when the file holds positions the shards do not.
 *
 * Names the command that fixes it, because the command is not guessable. The
 * empty range looks like a typo and is the only sequence that works, and the
 * two neighbouring spellings both fail (one silently, one destructively), so
 * both are named here rather than left to be discovered.
 */
export function mergeHandAddWarning(file: HandAddFile, seen: ReadonlySet<string>): string | null {
  const unmined = unminedHandAdds(file, seen);
  if (!unmined.length) return null;
  return (
    `!! ${plural(unmined.length, "HAND-ADD", "HAND-ADDS")} IN NO SHARD. ${file.path} holds\n` +
    `   ${plural(unmined.length, "live entry", "live entries")} that no shard on disk has assessed:\n` +
    `${listEntries(unmined)}\n` +
    `   --merge emits from shards and never mines, so the count above is the count\n` +
    `   without them and the file this run writes will not contain them either.\n` +
    `   Mine them, then merge again:\n` +
    `     npx tsx scripts/genpuzzles.ts --shard --from 0 --to 0\n` +
    `     npx tsx scripts/genpuzzles.ts --merge\n` +
    `   The empty range is not a typo. Hand-adds belong to the shard holding game 0,\n` +
    `   and that shard recorded handAdds: true when it was mined, so re-running its\n` +
    `   real range reports "nothing to do" without opening the file. A fresh 0-0\n` +
    `   shard opens it and mines no games. Keep --shard: dropping it emits from that\n` +
    `   one shard alone, and the bank becomes the hand-adds and nothing else.`
  );
}

/**
 * What a shard has to say when it is the shard that owns the hand-adds and has
 * already been through them.
 *
 * The flag is not wrong (the hand-adds it knew about really are done), but "no
 * work left in this range" and "no work left" are different claims, and the
 * early return has only ever made the second one.
 */
export function shardHandAddWarning(file: HandAddFile, seen: ReadonlySet<string>): string | null {
  const unmined = unminedHandAdds(file, seen);
  if (!unmined.length) return null;
  return (
    `!! ${plural(unmined.length, "HAND-ADD", "HAND-ADDS")} THIS SHARD WILL NOT READ. ${file.path}\n` +
    `   holds ${plural(unmined.length, "live entry", "live entries")} this shard has not assessed:\n` +
    `${listEntries(unmined)}\n` +
    `   It recorded handAdds: true on the run that mined it, and that flag is checked\n` +
    `   before the file is opened, so re-running this range will never pick them up.\n` +
    `   Mine them into a shard of their own, then merge:\n` +
    `     npx tsx scripts/genpuzzles.ts --shard --from 0 --to 0\n` +
    `     npx tsx scripts/genpuzzles.ts --merge`
  );
}
