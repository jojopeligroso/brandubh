// ── The worker's one-call entry point into the databases ──────────────────────
//
// `ai.worker.ts` needs two things `probe.ts` deliberately does not do: *fetch* the
// tables, and decide which ones are worth fetching. This is that glue, and nothing
// else — the whole module is a cache keyed by base URL plus one arithmetic rule.
//
//     const probe = req.dbBaseUrl
//       ? await probeFor(req.dbBaseUrl, req.state, req.rules)
//       : null;
//
// The ruleset is an argument and not an afterthought: a table is an answer about
// the game its generator played, and the manifest records which game that was. A
// custom ruleset that changes any of the three moving-phase flags (`flying`,
// `removeFromMillsWhenAllInMills`, `doubleMillRemoves`) gets **no** probe at all
// rather than a stranger's answers — checked here, before anything is fetched, so
// a mismatched ruleset also costs no download. `Setup → Custom → Flying = None →
// Ollamh` is the reachable case, and without this check it read a flying win off
// a table and labelled it perfect play.
//
// The rule (contract §8): a side's stone count — board plus hand — only ever goes
// *down*, so a game standing at m and o stones can only ever reach tables (m′, o′)
// with m′ ≤ m, o′ ≤ o and both ≥ 3, in either orientation. A 9-v-9 opening
// therefore fetches every shipped table once and a thinned endgame fetches the one
// or two it can still use, rather than the download being paid for at the first
// move of every game.
//
// Caching is module state, which is exactly right for a worker: one worker, one
// session, tables loaded at most once each and shared by every search after that.
// A failed or missing table is cached as "absent" by simply never entering the map;
// the next call retries it, which is the behaviour wanted on a flaky network and
// harmless on a missing file (one 404 per search, and `ollamh` just searches).
//
// What it deliberately does not do: no decompression of its own (`loader.ts`), no
// indexing (`index.ts`), no opinion about difficulty — the engine ignores a probe
// handed to anything below `ollamh`, and that decision stays there.

import type { GameState } from "../types";
import { type Probe, makeProbe } from "./probe";
import { type MoveGenRules, sameMoveGenRules } from "./generate";
import { type Manifest, fetchManifest, fetchTables, tableKeysFor } from "./loader";

const manifests = new Map<string, Manifest | null>();
const loaded = new Map<string, Map<string, Uint8Array>>();

/** Stones a side still has: on the board plus in hand. Only ever decreases, which
 *  is what makes the "which tables can this game reach" question answerable. */
function totalStones(state: GameState, side: "white" | "black"): number {
  let n = state.inHand[side];
  const cell = side === "white" ? 1 : 2;
  for (let i = 0; i < state.board.length; i++) if (state.board[i] === cell) n++;
  return n;
}

/**
 * A probe over the tables this position can still reach, loading whatever is
 * missing first. `null` when the manifest is unreachable, **the manifest's rules
 * are not the rules being played**, nothing is shipped for these stone counts, or
 * gzip is unavailable — all of which mean "search it".
 *
 * `rules` is the ruleset the game is actually being played under; only its three
 * moving-phase flags are read, which is why the parameter is the narrower
 * `MoveGenRules` and a whole `MorrisRuleSet` satisfies it.
 */
export async function probeFor(
  baseUrl: string,
  state: GameState,
  rules: MoveGenRules,
): Promise<Probe | null> {
  let manifest = manifests.get(baseUrl);
  if (manifest === undefined) {
    manifest = await fetchManifest(baseUrl);
    manifests.set(baseUrl, manifest);
  }
  if (manifest === null) return null;
  // Before the fetch, because a mismatch is permanent for this game: nothing the
  // download could contain would be an answer about it.
  if (!sameMoveGenRules(manifest.rules, rules)) return null;
  const mover = state.turn;
  const opponent = mover === "white" ? "black" : "white";
  const wanted = tableKeysFor(
    totalStones(state, mover),
    totalStones(state, opponent),
    manifest.tables.map((t) => t.key),
  );
  if (wanted.length === 0) return null;
  let tables = loaded.get(baseUrl);
  if (tables === undefined) {
    tables = new Map<string, Uint8Array>();
    loaded.set(baseUrl, tables);
  }
  await fetchTables(baseUrl, wanted, tables);
  if (tables.size === 0) return null;
  // The pairing is handed on as well as checked above: the probe itself then
  // carries the refusal, so it cannot outlive the check by being cached or passed
  // around.
  return makeProbe(tables, { rules: { tables: manifest.rules, game: rules } });
}

/** Forget everything loaded for a base URL. For tests, and for a worker that is
 *  told the tables have been replaced. */
export function resetProbeCache(): void {
  manifests.clear();
  loaded.clear();
}
