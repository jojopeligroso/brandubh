// ── Game file (PGN-style import / export) ─────────────────────────────────────
// Chess has PGN: a header of [Tag "value"] lines, a blank line, then the moves.
// Tafl has no universal standard, so this is the same shape wrapped around the
// notation the app already emits (engine.ts `moveName` / `squareName`, which is
// aagenielsen.dk-compatible):
//
//   [Format "brandubh-1"]
//   [Event "Brandubh"]
//   [Variant "wtf"]
//   [Date "2026.07.29"]
//   [Attackers "Ollamh"]
//   [Defenders "Eoin"]
//   [Result "0-1"]
//   [Termination "defenders_win_escape"]
//
//   1. f4-f6 c4-c3
//   2. b4-c4 d5-c5x1
//   0-1
//
// This is an *interchange* format, deliberately independent of however a game
// happens to be stored locally — the same split chess keeps between PGN and a
// engine's on-disk encoding. Changing one must never force a change in the other.
//
// The parser is tolerant on purpose: files get hand-edited, mailed, and pasted
// out of forum posts. Comments, odd spacing, CRLF, missing tags and eccentric
// move numbering are all shrugged off. What it will *not* do is guess: a token
// it cannot read, or a move that will not replay legally, is refused with the
// line and the reason (see replay.ts — the position always comes from replaying
// through `applyMove`, never from anything asserted in the file).

import { moveName, winnerOf } from "./engine";
import { isExternalStatus, replayPlies, type PlyInput, type ReplayError } from "./replay";
import { BOARD_SIZE, type GameState, type GameStatus, type Square } from "./types";
import {
  CUSTOM_RULE_DEFAULTS,
  DEFAULT_VARIANT,
  VARIANTS,
  rulesFor,
  type CustomRuleSet,
  type RuleSet,
} from "./variants";

/** Bumped only on a breaking format change; the parser accepts older values. */
export const FORMAT_VERSION = "brandubh-1";
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
/** The rule flags that are plain booleans — everything bar `repetitionResult`.
 *  Derived from the type so a new rule flag is carried by the format for free. */
type BoolRuleKey = {
  [K in keyof CustomRuleSet]: CustomRuleSet[K] extends boolean ? K : never;
}[keyof CustomRuleSet];
const BOOL_RULE_KEYS = Object.keys(CUSTOM_RULE_DEFAULTS).filter(
  (k) => typeof CUSTOM_RULE_DEFAULTS[k as keyof CustomRuleSet] === "boolean",
) as BoolRuleKey[];
const REPETITION_VALUES: ReadonlyArray<CustomRuleSet["repetitionResult"]> = [
  "none",
  "draw",
  "loss_for_defenders",
];

function serializeRules(rules: RuleSet): string {
  const parts = BOOL_RULE_KEYS.map((k) => `${k}=${rules[k] ? 1 : 0}`);
  parts.push(`repetitionResult=${rules.repetitionResult}`);
  return parts.join(" ");
}

/** Parse a `Rules` tag body. Unknown keys are ignored; absent keys keep the WTF
 *  default, so a partial hand-written block still loads. */
function parseRules(body: string): CustomRuleSet {
  const out: CustomRuleSet = { ...CUSTOM_RULE_DEFAULTS };
  for (const pair of body.split(/[\s,;]+/).filter(Boolean)) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (key === "repetitionResult") {
      if ((REPETITION_VALUES as readonly string[]).includes(value))
        out.repetitionResult = value as CustomRuleSet["repetitionResult"];
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
    ["Event", meta.event ?? "Brandubh"],
    ["Variant", rules.id],
  ];
  if (rules.id === "custom") tags.push(["Rules", serializeRules(rules)]);
  if (meta.date) tags.push(["Date", meta.date]);
  tags.push(["Attackers", meta.attackers ?? "?"]);
  tags.push(["Defenders", meta.defenders ?? "?"]);
  tags.push(["Result", resultToken(state.status)]);
  if (isExternalStatus(state.status)) tags.push(["Termination", state.status]);

  const header = tags.map(([k, v]) => `[${k} "${escapeTag(v)}"]`).join("\n");

  // Attackers move first, so each numbered pair is "attackers defenders" —
  // the same reading as a PGN line.
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

/** Filename for a downloaded export: `brandubh-<variant>-<date>.tafl`. */
export function exportFileName(rules: RuleSet, date?: string): string {
  const stamp = (date ?? "").replace(/[.\-:]/g, "") || "game";
  return `brandubh-${rules.id}-${stamp}.${FILE_EXTENSION}`;
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

const MOVE_RE = /^([a-g])([1-7])[-–—x]?([a-g])([1-7])(x(\d*))?[!?+#]*$/i;
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

/** Parse a PGN-style Brandubh game file. Never throws. */
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
    warnings.push(`No [Variant] tag — assuming "${DEFAULT_VARIANT}".`);

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

/** Map a `Variant` tag to a ruleset id. Accepts ids, display names and the
 *  common shorthands people actually type. Empty → the default variant. */
function resolveVariant(tag: string): string | "unknown" {
  const v = tag.trim().toLowerCase();
  if (!v) return DEFAULT_VARIANT;
  if (v === "custom") return "custom";
  if (VARIANTS[v]) return v;
  for (const r of Object.values(VARIANTS)) {
    if (r.name.toLowerCase() === v) return r.id;
    // "Brandubh · Walker" → "walker"; also matches "brandubh walker".
    if (v.replace(/[·.\s]+/g, " ").endsWith(` ${r.id}`)) return r.id;
  }
  if (v.includes("world tafl") || v.includes("wtf")) return "wtf";
  if (v.includes("walker") || v.includes("cyningstan")) return "walker";
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
