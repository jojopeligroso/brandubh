// ── Game file (PGN-style import / export, Copenhagen) ─────────────────────────
// The Copenhagen twin of `../gameFile.ts` and `../tablut/gameFile.ts`: the same
// PGN-derived shape wrapped around the notation `rules.ts` emits, over files a–k
// and ranks 1–11.
//
//   [Format "copenhagen-1"]
//   [Event "Copenhagen"]
//   [Variant "copenhagen"]
//   [Date "2026.09.03"]
//   [Defenders "Eoin"]
//   [Attackers "Ollamh"]
//   [Result "1-0"]
//   [Termination "attackers_win_capture"]
//
//   1. f1-c1 f4-c4
//   2. a4-c4 f6-f4
//   1-0
//
// Three things differ from the Tablut format, and each would silently misread a
// file if it were assumed away:
//
//   • **Black moves first** (rule 2), so a numbered pair reads "Black White" —
//     the same way round as the Brandubh file and the reverse of the Tablut one.
//   • **Eleven files, a–k, with `i` included.** Tafl notation does not skip it.
//   • **The `Rules` tag carries four enums**, not the three Tablut has:
//     `kingStrength` and `strongKingEdgeRule` join `escape`, `firstMove`,
//     `throneBlocks`, `throneAnvil` and `repetitionResult`. Writer and reader are
//     both derived from the defaults, so a rule added later is carried by the
//     format for free — and its permitted values come from `ENUM_RULE_VALUES` in
//     variants.ts, which is where the enum is declared and which
//     `variants.test.ts` holds to covering every one of them.
//
// All three formats are deliberately unrelated: a `copenhagen-1` file is not a
// `tablut-1` file with two more ranks, and no parser will accept another's moves
// — `f10-c10` is off the edge of both smaller boards, and no variant id overlaps.
//
// This is an *interchange* format, deliberately independent of however a game
// happens to be stored locally — the same split chess keeps between PGN and an
// engine's on-disk encoding. Changing one must never force a change in the other.
//
// The parser is tolerant on purpose: files get hand-edited, mailed, and pasted
// out of forum posts. Comments, odd spacing, CRLF, missing tags and eccentric
// move numbering are all shrugged off. What it will *not* do is guess: a token
// it cannot read, or a move that will not replay legally, is refused with the
// line and the reason (see replay.ts — the position always comes from replaying
// through `applyMove`, never from anything asserted in the file).

import { moveName, winnerOf } from "./rules";
import { isExternalStatus, replayPlies, type PlyInput, type ReplayError } from "./replay";
import { BOARD_SIZE, type GameState, type GameStatus, type Square } from "./types";
import {
  CUSTOM_RULE_DEFAULTS,
  ENUM_RULE_VALUES,
  VARIANTS,
  rulesFor,
  type CustomRuleSet,
  type EnumRuleKey,
  type CopenhagenRuleSet as RuleSet,
} from "./variants";

/** Bumped only on a breaking format change; the parser accepts older values. */
export const FORMAT_VERSION = "copenhagen-1";
export const FILE_EXTENSION = "tafl";

/** Free-text header fields the app fills in around the moves. */
export interface GameFileMeta {
  event?: string;
  /** `YYYY.MM.DD`, PGN-style. */
  date?: string;
  attackers?: string;
  defenders?: string;
}

// ── Result / termination ──────────────────────────────────────────────────────
// `Result` is the PGN score. It is *derived* on export and only cross-checked on
// import — the authority is always the status recomputed by the replay.
export type ResultToken = "1-0" | "0-1" | "1/2-1/2" | "*";

export function resultToken(status: GameStatus): ResultToken {
  const w = winnerOf(status);
  if (w === "attackers") return "1-0";
  if (w === "defenders") return "0-1";
  if (w === "draw") return "1/2-1/2";
  return "*";
}

// A `Termination` tag may only restore a status the moves cannot imply — a
// resignation or a flag (see `isExternalStatus` in replay.ts, shared with the
// storage format) — and only onto a game the replay left unfinished, which is
// what stops a doctored tag from inventing a win.

// ── Custom rulesets ───────────────────────────────────────────────────────────
// A named variant needs only its id. A custom ruleset has to travel with the
// game or the moves are meaningless, so it rides in one flat `Rules` tag —
// `key=value` pairs — keeping the header a plain PGN-style tag list.
/**
 * The rule flags that are plain booleans, and the ones that are enums.
 *
 * Both lists are derived from `CUSTOM_RULE_DEFAULTS` by the *runtime type* of each
 * value, so a rule added to `CopenhagenRuleSet` later is carried by this format
 * without anyone editing it — which is the property that stops an exported game
 * from quietly losing a rule it was played under.
 */
type BoolRuleKey = {
  [K in keyof CustomRuleSet]: CustomRuleSet[K] extends boolean ? K : never;
}[keyof CustomRuleSet];

const ruleKeys = Object.keys(CUSTOM_RULE_DEFAULTS) as Array<keyof CustomRuleSet>;
const BOOL_RULE_KEYS = ruleKeys.filter(
  (k) => typeof CUSTOM_RULE_DEFAULTS[k] === "boolean",
) as BoolRuleKey[];
const ENUM_RULE_KEYS = ruleKeys.filter(
  (k) => typeof CUSTOM_RULE_DEFAULTS[k] === "string",
) as EnumRuleKey[];

function serializeRules(rules: RuleSet): string {
  return [
    ...BOOL_RULE_KEYS.map((k) => `${k}=${rules[k] ? 1 : 0}`),
    ...ENUM_RULE_KEYS.map((k) => `${k}=${rules[k]}`),
  ].join(" ");
}

/** Parse a `Rules` tag body. Unknown keys and unknown values are ignored; absent
 *  keys keep the baseline default, so a partial hand-written block still loads. */
function parseRules(body: string): CustomRuleSet {
  const out: CustomRuleSet = { ...CUSTOM_RULE_DEFAULTS };
  for (const pair of body.split(/[\s,;]+/).filter(Boolean)) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();

    const enumKey = ENUM_RULE_KEYS.find((k) => k.toLowerCase() === key.toLowerCase());
    if (enumKey) {
      if (ENUM_RULE_VALUES[enumKey].includes(value.toLowerCase()))
        (out[enumKey] as string) = value.toLowerCase();
      continue;
    }
    const boolKey = BOOL_RULE_KEYS.find((k) => k.toLowerCase() === key.toLowerCase());
    if (boolKey) out[boolKey] = /^(1|true|yes|on)$/i.test(value);
  }
  return out;
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Serialize a game — finished or in progress — to the text format above.
 * `state` should be the timeline *tip*: exporting while reviewing an earlier
 * move still writes the whole mainline, as the design doc specifies.
 */
export function exportGame(state: GameState, rules: RuleSet, meta: GameFileMeta = {}): string {
  const tags: Array<[string, string]> = [
    ["Format", FORMAT_VERSION],
    ["Event", meta.event ?? "Copenhagen"],
    ["Variant", rules.id],
  ];
  if (rules.id === "custom") tags.push(["Rules", serializeRules(rules)]);
  if (meta.date) tags.push(["Date", meta.date]);
  // Defenders first, matching the move order below.
  tags.push(["Defenders", meta.defenders ?? "?"]);
  tags.push(["Attackers", meta.attackers ?? "?"]);
  tags.push(["Result", resultToken(state.status)]);
  if (isExternalStatus(state.status)) tags.push(["Termination", state.status]);

  const header = tags.map(([k, v]) => `[${k} "${escapeTag(v)}"]`).join("\n");

  // White moves first here (baseline rule 2), so each numbered pair is
  // "defenders attackers" — the reverse of the Brandubh file, and the reason a
  // reader must not assume tafl's usual order.
  const lines: string[] = [];
  for (let i = 0; i < state.history.length; i += 2) {
    const pair = [state.history[i], state.history[i + 1]]
      .filter(Boolean)
      .map((h) => moveName(h!.move))
      .join(" ");
    lines.push(`${i / 2 + 1}. ${pair}`);
  }
  lines.push(resultToken(state.status));

  return `${header}\n\n${lines.join("\n")}\n`;
}

const escapeTag = (v: string): string => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Filename for a downloaded export: `<variant>-<date>.tafl`. */
export function exportFileName(rules: RuleSet, date?: string): string {
  const stamp = (date ?? "").replace(/[.\-:]/g, "") || "game";
  return `${rules.id}-${stamp}.${FILE_EXTENSION}`;
}

// ── Import ────────────────────────────────────────────────────────────────────

export type ParseErrorCode =
  /** Nothing that looked like a move list. */
  | "no_moves"
  /** A `[Tag ...]` line that could not be read. */
  | "bad_tag"
  /** `Variant` names a ruleset this build doesn't have. */
  | "unknown_variant"
  /** `Variant "custom"` with no `Rules` tag to go with it. */
  | "missing_custom_rules"
  /** A token that is neither a move, a move number, nor a result. */
  | "bad_token"
  | "illegal_move"
  | "moves_after_end"
  | "capture_mismatch";

export interface ParseError {
  code: ParseErrorCode;
  /** 1-based source line, when the problem is locatable in the text. */
  line?: number;
  /** The offending text, quoted back to the user. */
  token?: string;
  /** 1-based ply number, for the replay failures. */
  ply?: number;
  /** English detail, appended after the localized headline. */
  detail: string;
}

export interface ParsedGame {
  /** `states[k]` is the position after k plies. Feed straight to the timeline. */
  states: GameState[];
  rules: RuleSet;
  /** Ruleset id as resolved — `"custom"` when the file carried a `Rules` tag. */
  variantId: string;
  meta: GameFileMeta;
  /** Every tag found, keyed by canonical (capitalized) name. */
  tags: Record<string, string>;
  /** Non-fatal oddities worth showing: guessed variant, result disagreement, … */
  warnings: string[];
}

export type ParseResult = { ok: true; game: ParsedGame } | { ok: false; error: ParseError };

/**
 * A ply token: two squares, an optional separator, and an optional capture count.
 *
 * The rank alternation puts `1[01]` **first** so `f10` reads as rank 10 and not
 * as rank 1 followed by a stray `0`. Regex alternation is first-match, not
 * longest-match, so the order is the rule rather than a preference — and getting
 * it the other way round would not fail loudly, it would silently parse half of
 * every double-digit rank on the board. This is the one line of the format that
 * an 11×11 board genuinely changes.
 */
const MOVE_RE = /^([a-k])(1[01]|[1-9])[-–—x]?([a-k])(1[01]|[1-9])(x(\d*))?[!?+#]*$/i;
const NUMBER_RE = /^\d+(\.{1,3}|\)|\.\))?$/;
const RESULT_RE = /^(1-0|0-1|1\/2-1\/2|½-½|\*)$/;
const TAG_RE = /^\[\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:"((?:[^"\\]|\\.)*)"|([^\]]*?))\s*\]$/;

const squareFrom = (file: string, rank: string): Square => ({
  row: BOARD_SIZE - Number(rank),
  col: file.toLowerCase().charCodeAt(0) - 97,
});

/**
 * Strip `{ … }` block comments while preserving line structure, so the line
 * numbers in any error still point at the user's file.
 */
function stripBlockComments(text: string): string {
  let out = "";
  let depth = 0;
  for (const ch of text) {
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 || ch === "\n") out += ch;
  }
  return out;
}

/** Parse a PGN-style Copenhagen game file. Never throws. */
export function parseGame(text: string): ParseResult {
  const warnings: string[] = [];
  const tags: Record<string, string> = {};
  const plies: PlyInput[] = [];

  const normalized = stripBlockComments(text.replace(/^﻿/, "").replace(/\r\n?/g, "\n"));

  const linesIn = normalized.split("\n");
  for (let ln = 0; ln < linesIn.length; ln++) {
    // `;` runs to end of line; a leading `%` comments out the whole line (PGN).
    let line = linesIn[ln].split(";")[0];
    if (/^\s*%/.test(line)) continue;
    line = line.trim();
    if (!line) continue;

    // Header tags may legally appear anywhere — some exporters trail them.
    if (line.startsWith("[")) {
      const m = TAG_RE.exec(line);
      if (!m) {
        return {
          ok: false,
          error: {
            code: "bad_tag",
            line: ln + 1,
            token: line,
            detail: `unreadable header line: ${line}`,
          },
        };
      }
      const key = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
      const raw = m[2] ?? m[3] ?? "";
      tags[key] = raw.replace(/\\(.)/g, "$1").trim();
      continue;
    }

    for (const rawToken of line.split(/\s+/)) {
      let token = rawToken;
      // Move numbers ride ahead of the move with or without a space: "12.f4-f6".
      const numPrefix = /^(\d+)(\.{1,3}|\)|\.\))?/.exec(token);
      if (numPrefix && (NUMBER_RE.test(token) || numPrefix[2])) {
        token = token.slice(numPrefix[0].length);
        if (!token) continue;
      }
      if (RESULT_RE.test(token)) continue; // recomputed, never trusted
      const m = MOVE_RE.exec(token);
      if (!m) {
        return {
          ok: false,
          error: {
            code: "bad_token",
            line: ln + 1,
            token: rawToken,
            detail: `unrecognized token "${rawToken}" on line ${ln + 1}`,
          },
        };
      }
      // "d5xc5" (capture as separator) asserts a capture without a count; a
      // trailing "x2" asserts exactly two. An "x" with no digits stays unstated.
      const claimed = m[6] ? Number(m[6]) : null;
      plies.push({
        from: squareFrom(m[1], m[2]),
        to: squareFrom(m[3], m[4]),
        captures: claimed,
      });
    }
  }

  if (plies.length === 0)
    return { ok: false, error: { code: "no_moves", detail: "no moves found in the file" } };

  // ── Resolve the ruleset ─────────────────────────────────────────────────────
  const variantTag = tags["Variant"] ?? "";
  const resolved = resolveVariant(variantTag);
  if (resolved === "unknown")
    return {
      ok: false,
      error: {
        code: "unknown_variant",
        token: variantTag,
        detail: `unknown variant "${variantTag}"`,
      },
    };
  if (!variantTag)
    warnings.push(`No [Variant] tag — assuming "${UNTAGGED_VARIANT}".`);

  let variantId = resolved;
  let rules: RuleSet;
  if (variantId === "custom") {
    if (tags["Rules"] === undefined)
      return {
        ok: false,
        error: {
          code: "missing_custom_rules",
          detail: 'variant "custom" needs a [Rules "..."] tag',
        },
      };
    rules = rulesFor("custom", parseRules(tags["Rules"]));
  } else {
    rules = VARIANTS[variantId];
    if (tags["Rules"] !== undefined)
      warnings.push(`[Rules] ignored — only read for variant "custom".`);
  }

  // ── Replay ──────────────────────────────────────────────────────────────────
  const replayed = replayPlies(plies, rules);
  if (!replayed.ok) return { ok: false, error: replayErrorToParseError(replayed.error) };
  const states = replayed.states;

  // ── Terminations replay cannot know about (resign / flag) ────────────────────
  const termination = tags["Termination"] as GameStatus | undefined;
  const tipIndex = states.length - 1;
  if (termination && isExternalStatus(termination)) {
    if (states[tipIndex].status === "playing")
      states[tipIndex] = { ...states[tipIndex], status: termination };
    else warnings.push(`[Termination] ignored — the moves already decide this game.`);
  } else if (termination) {
    warnings.push(`[Termination "${termination}"] ignored — recomputed from the moves.`);
  }

  // The file's Result is advisory. Disagreement usually means a wrong Variant
  // tag, so say so rather than silently overriding either way.
  const claimedResult = tags["Result"];
  const actualResult = resultToken(states[tipIndex].status);
  if (claimedResult && claimedResult !== "*" && claimedResult !== actualResult)
    warnings.push(`[Result "${claimedResult}"] disagrees with the replayed game (${actualResult}).`);

  const format = tags["Format"];
  if (format && format !== FORMAT_VERSION)
    warnings.push(`Format "${format}" is not "${FORMAT_VERSION}" — read anyway.`);

  return {
    ok: true,
    game: {
      states,
      rules,
      variantId,
      meta: {
        event: tags["Event"],
        date: tags["Date"],
        attackers: tags["Attackers"],
        defenders: tags["Defenders"],
      },
      tags,
      warnings,
    },
  };
}

/**
 * What a file with no `[Variant]` tag is assumed to be. Deliberately the
 * baseline rather than `DEFAULT_VARIANT`: the picker's default can move (and
 * has), but a file that asserts nothing should replay under the ruleset that
 * asserts nothing — the six undisputed rules — with a warning saying so.
 */
const UNTAGGED_VARIANT = "copenhagen";

/** Map a `Variant` tag to a ruleset id. Accepts ids, display names and the
 *  common shorthands people actually type. Empty → the untagged fallback. */
function resolveVariant(tag: string): string | "unknown" {
  const v = tag.trim().toLowerCase();
  if (!v) return UNTAGGED_VARIANT;
  if (v === "custom") return "custom";
  if (VARIANTS[v]) return v;
  for (const r of Object.values(VARIANTS)) {
    if (r.name.toLowerCase() === v) return r.id;
    if (v.replace(/[·.\s]+/g, " ").endsWith(` ${r.id}`)) return r.id;
  }
  // The shorthands people actually type. Fetlar is checked first because
  // "fetlar hnefatafl" contains neither "copenhagen" nor an id, and because a
  // file saying Fetlar must never quietly resolve to Copenhagen — the two differ
  // by three whole rules.
  if (v.includes("fetlar")) return "copenhagen-fetlar";
  if (v.includes("copenhagen") || v.includes("hnefatafl") || v.includes("11")) return "copenhagen";
  return "unknown";
}

function replayErrorToParseError(e: ReplayError): ParseError {
  const ply = e.index + 1;
  switch (e.code) {
    case "illegal_move":
      return {
        code: "illegal_move",
        ply,
        token: e.ply,
        detail: `move ${ply} (${e.ply}) is not legal in that position`,
      };
    case "moves_after_end":
      return {
        code: "moves_after_end",
        ply,
        token: e.ply,
        detail: `move ${ply} (${e.ply}) comes after the game had already ended`,
      };
    case "capture_mismatch":
      return {
        code: "capture_mismatch",
        ply,
        token: e.ply,
        detail:
          `move ${ply} (${e.ply}) claims ${e.claimedCaptures} capture(s) but ` +
          `${e.actualCaptures} occur — is the [Variant] tag right?`,
      };
  }
}
