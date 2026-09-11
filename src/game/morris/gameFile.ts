// ── Game file (PGN-style import / export, Morris) ──────────────────────────────
// The Morris twin of `../copenhagen/gameFile.ts`: the same PGN-derived shape
// wrapped around the notation `rules.ts` emits.
//
//   [Format "morris-1"]
//   [Event "Nine Men's Morris"]
//   [Variant "morris-gasser-1"]
//   [Date "2026.09.10"]
//   [White "Eoin"]
//   [Black "Ollamh"]
//   [Result "1-0"]
//   [Termination "black_win_resign"]
//
//   1. d7 a7
//   2. g7 d1xa7
//   1-0
//
// Three things differ from the three tafl formats, and each would misread a file
// if it were assumed away:
//
//   • **The extension is `.morris`, not `.tafl`** (ADR-0008). A `.tafl` file
//     asserts a tafl game and its move tokens are a tafl grammar; these are not.
//     Sharing the extension would produce files that *look* importable into four
//     screens and are importable into one.
//   • **A move token is not two squares.** `d7` places, `a7-a4` steps, and an `x`
//     suffix names each stone the mill took: `d7xd2`, `a7-a4xb2`. The grammar
//     lives in `moveName`/`parseMoveName` (rules.ts) and is *not* re-implemented
//     here — this module tokenises and delegates, so the writer and the reader
//     cannot drift apart from the notation the move log shows.
//   • **There is no capture count and no `capture_mismatch` code.** The stone
//     taken is part of the move, so a file paired with the wrong ruleset fails as
//     an illegal move rather than as a count that does not add up (see
//     `replay.ts`).
//
// The two tags are `[White]`/`[Black]`, this game's own sides, in the order the
// numbered pairs read — White places first under the shipped preset
// (`firstMove`), so a pair is "White Black".
//
// This is an *interchange* format, deliberately independent of however a game
// happens to be stored locally — the same split chess keeps between PGN and an
// engine's on-disk encoding. Changing one must never force a change in the other.
//
// The parser is tolerant on purpose: files get hand-edited, mailed, and pasted
// out of forum posts. Comments, odd spacing, CRLF, missing tags, capitals and
// eccentric move numbering are all shrugged off. What it will *not* do is guess: a
// token it cannot read, or a move that will not replay legally, is refused with
// the line and the reason (see replay.ts — the position always comes from
// replaying through `applyMove`, never from anything asserted in the file).

import { moveName, parseMoveName, winnerOf } from "./rules";
import { isExternalStatus, replayPlies, type PlyInput, type ReplayError } from "./replay";
import type { GameState, MorrisStatus } from "./types";
import {
  CUSTOM_RULE_DEFAULTS,
  ENUM_CHOICES,
  VARIANTS,
  rulesFor,
  type CustomRuleSet,
  type EnumRuleKey,
  type MorrisRuleSet as RuleSet,
} from "./variants";

/** Bumped only on a breaking format change; the parser accepts older values. */
export const FORMAT_VERSION = "morris-1";
/** Not `tafl` — see the header, and ADR-0008. */
export const FILE_EXTENSION = "morris";

/** Free-text header fields the app fills in around the moves. */
export interface GameFileMeta {
  event?: string;
  /** `YYYY.MM.DD`, PGN-style. */
  date?: string;
  white?: string;
  black?: string;
}

// ── Result / termination ──────────────────────────────────────────────────────
// `Result` is the PGN score. It is *derived* on export and only cross-checked on
// import — the authority is always the status recomputed by the replay.
export type ResultToken = "1-0" | "0-1" | "1/2-1/2" | "*";

/** White is "1-0" because White moves first, the same convention the three tafl
 *  formats follow for *their* first mover. A draw is a real result here and not
 *  an oddity: Gasser's finding is that the game is one. */
export function resultToken(status: MorrisStatus): ResultToken {
  const w = winnerOf(status);
  if (w === "white") return "1-0";
  if (w === "black") return "0-1";
  if (w === "draw") return "1/2-1/2";
  return "*";
}

// A `Termination` tag may only restore a status the moves cannot imply — a
// resignation or a flag (see `isExternalStatus` in replay.ts, shared with the
// storage format) — and only onto a game the replay left unfinished, which is
// what stops a doctored tag from inventing a win.

// ── Custom rulesets ───────────────────────────────────────────────────────────
// A named variant needs only its id. A custom ruleset has to travel with the game
// or the moves are meaningless, so it rides in one flat `Rules` tag —
// `key=value` pairs — keeping the header a plain PGN-style tag list.
/**
 * The rule flags that are plain booleans, and the ones that are enums.
 *
 * Both lists are derived from `CUSTOM_RULE_DEFAULTS` by the *runtime type* of
 * each value, so a rule added to `MorrisRuleSet` later is carried by this format
 * without anyone editing it — which is the property that stops an exported game
 * from quietly losing a rule it was played under. `ENUM_RULE_KEYS` is the key
 * list of `ENUM_CHOICES` (`variants.ts`) rather than a second filter over
 * `CUSTOM_RULE_DEFAULTS`, so the enum keys this format reads from and the enum
 * keys the rule editor renders can never drift apart — `ruleChoices.test.ts`
 * asserts the parity.
 */
type BoolRuleKey = {
  [K in keyof CustomRuleSet]: CustomRuleSet[K] extends boolean ? K : never;
}[keyof CustomRuleSet];

const ruleKeys = Object.keys(CUSTOM_RULE_DEFAULTS) as Array<keyof CustomRuleSet>;
export const BOOL_RULE_KEYS = ruleKeys.filter(
  (k) => typeof CUSTOM_RULE_DEFAULTS[k] === "boolean",
) as BoolRuleKey[];
export const ENUM_RULE_KEYS = Object.keys(ENUM_CHOICES) as EnumRuleKey[];

/**
 * The values each enum rule will accept on import — `ENUM_CHOICES` itself, shared
 * with the custom rule editor. The whole job here is to refuse a value the type
 * system will not be present to check at runtime: an imported file is untrusted
 * text, and `flying=always` must be ignored rather than assigned.
 */
const ENUM_RULE_VALUES = ENUM_CHOICES;

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
 * `state` should be the timeline *tip*: exporting while reviewing an earlier move
 * still writes the whole mainline, as the design doc specifies.
 */
export function exportGame(state: GameState, rules: RuleSet, meta: GameFileMeta = {}): string {
  const tags: Array<[string, string]> = [
    ["Format", FORMAT_VERSION],
    ["Event", meta.event ?? "Nine Men's Morris"],
    ["Variant", rules.id],
  ];
  if (rules.id === "custom") tags.push(["Rules", serializeRules(rules)]);
  if (meta.date) tags.push(["Date", meta.date]);
  // White first, matching the move order below.
  tags.push(["White", meta.white ?? "?"]);
  tags.push(["Black", meta.black ?? "?"]);
  tags.push(["Result", resultToken(state.status)]);
  if (isExternalStatus(state.status)) tags.push(["Termination", state.status]);

  const header = tags.map(([k, v]) => `[${k} "${escapeTag(v)}"]`).join("\n");

  // White places first (`firstMove`), so each numbered pair is "White Black".
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

/** Filename for a downloaded export: `<variant>-<date>.morris`. */
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
  | "moves_after_end";

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

const NUMBER_RE = /^\d+(\.{1,3}|\)|\.\))?$/;
const RESULT_RE = /^(1-0|0-1|1\/2-1\/2|½-½|\*)$/;
const TAG_RE = /^\[\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:"((?:[^"\\]|\\.)*)"|([^\]]*?))\s*\]$/;

/**
 * Normalise one hand-typed move token before `parseMoveName` sees it: capitals,
 * the three dashes people actually type, and the chess annotation marks that ride
 * along on a copied move. Everything structural is left to `parseMoveName`, whose
 * grammar is the notation's single definition.
 */
const tidyToken = (token: string): string =>
  token.toLowerCase().replace(/[–—−]/g, "-").replace(/[!?+#]+$/, "");

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

/** Parse a PGN-style Morris game file. Never throws. */
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
      if (RESULT_RE.test(token)) continue; // recomputed, never trusted
      // Move numbers ride ahead of the move with or without a space: "12.a7-a4".
      const numPrefix = /^(\d+)(\.{1,3}|\)|\.\))?/.exec(token);
      if (numPrefix && (NUMBER_RE.test(token) || numPrefix[2])) {
        token = token.slice(numPrefix[0].length);
        if (!token) continue;
      }
      const move = parseMoveName(tidyToken(token));
      if (!move) {
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
      plies.push(move);
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
  if (!variantTag) warnings.push(`No [Variant] tag — assuming "${UNTAGGED_VARIANT}".`);

  const variantId = resolved;
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
  const termination = tags["Termination"] as MorrisStatus | undefined;
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
        white: tags["White"],
        black: tags["Black"],
      },
      tags,
      warnings,
    },
  };
}

/**
 * What a file with no `[Variant]` tag is assumed to be.
 *
 * The shipped preset, with a warning — and unlike the tafl formats there is no
 * "baseline that asserts nothing" to prefer instead: Morris has one visible
 * ruleset, and the two flags it adds beyond Gasser's reading are *draw*
 * terminations, which can only end a game sooner, never change what a move means.
 * A file that asserts nothing therefore replays identically for as long as it
 * lasts.
 */
const UNTAGGED_VARIANT = "morris-gasser-1";

/** Map a `Variant` tag to a ruleset id. Accepts ids, display names and the
 *  shorthands people actually type. Empty → the untagged fallback. */
function resolveVariant(tag: string): string | "unknown" {
  const v = tag.trim().toLowerCase();
  if (!v) return UNTAGGED_VARIANT;
  if (v === "custom") return "custom";
  if (VARIANTS[v]) return v;
  for (const r of Object.values(VARIANTS)) {
    if (r.name.toLowerCase() === v) return r.id;
    if (v.replace(/[·.\s]+/g, " ").endsWith(` ${r.id}`)) return r.id;
  }
  // The names this game actually goes by. "Mill" is included because it is what
  // half of Europe calls it (Mühle, molenspel); "merels"/"merrills" likewise.
  if (/morris|merel|merrill|m[üu]hle|mill|nine men/.test(v)) return UNTAGGED_VARIANT;
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
  }
}
