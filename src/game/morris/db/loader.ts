// ── Loading shipped endgame tables (browser side) ─────────────────────────────
//
// A table is a flat byte per position and a manifest says which tables exist, how
// big each one is and what its bytes hash to. This module fetches them and gunzips
// them in the browser — in the AI worker, in practice, which is the only place that
// needs them — and it is deliberately the *only* part of `db/` that knows files
// exist at all.
//
// Why `DecompressionStream` and not a bundled inflate: a shipped table is ~200 KB
// raw and compresses to a fraction of that, the platform has had gzip streams
// since 2023, and pulling in an inflate implementation to save a feature test is a
// bad trade for a feature that is *optional by design*. If the API is missing the
// engine simply runs without tables — ollamh is then deep-search best-effort, which
// is what the labelling already promises before the endgame anyway — and the miss
// is logged exactly once rather than per table per search.
//
// What it deliberately does not do: no cache of its own (the worker keeps the
// `Map` and decides what to load — see `tableKeysFor`), no integrity check (the
// manifest carries a SHA-256 so a *build* can check it; hashing 2 MB in a worker
// before every first move buys nothing the network's own checks do not), no
// retries, and nothing Node-specific — `loader.node.ts` is the offline twin, kept
// separate so this file stays safe for the Vite worker bundle.

import type { MoveGenRules } from "./generate";
import { parseDbKey } from "./index";

/** The manifest's format tag. Bumped if the entry encoding or index ever changes —
 *  a stale table read under a new index is the one failure mode that would be
 *  silent. */
export const DB_FORMAT = "morris-db-1";

/** One shipped table, as described by the manifest. */
export interface ManifestTable {
  /** `"4-3"` — stones for the side to move, then the other side. */
  key: string;
  m: number;
  o: number;
  /** Slots in the table = bytes raw. */
  entries: number;
  bytes: number;
  gzipBytes: number;
  sha256: string;
  win: number;
  loss: number;
  draw: number;
  maxDepth: number;
}

/** `public/morris/db/manifest.json`. */
export interface Manifest {
  format: string;
  /** The preset id the tables were generated under. */
  variant: string;
  /** The moving-phase flags that were in force — a table is only valid for these. */
  rules: MoveGenRules;
  generated: string;
  tables: ManifestTable[];
}

let warned = false;

/** Whether this environment can gunzip a stream. */
export const decompressionSupported = (): boolean =>
  typeof DecompressionStream !== "undefined";

function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.info(`[morris/db] ${message}`);
}

/** One manifest entry, as far as anything here trusts it: an object naming a table
 *  key this build understands. The numbers beside the key are only ever reported,
 *  never computed with, so they are not checked. */
function isManifestTable(entry: unknown): entry is ManifestTable {
  if (typeof entry !== "object" || entry === null) return false;
  const key = (entry as { key?: unknown }).key;
  return typeof key === "string" && parseDbKey(key) !== null;
}

/** Parse (and sanity-check) a manifest body. Exported so the Node twin and the
 *  tests share one reader. */
export function parseManifest(text: string): Manifest | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Partial<Manifest>;
  if (candidate.format !== DB_FORMAT || !Array.isArray(candidate.tables)) return null;
  // Every entry is unknown data until it has been checked, `null` and `3` included
  // — the types above describe the manifest this project *writes*, not the bytes a
  // stale deploy or a hostile host can serve. Reading `.key` off an unchecked entry
  // is how a bad manifest became a thrown TypeError instead of a null return.
  const tables = (candidate.tables as readonly unknown[]).filter(isManifestTable);
  if (candidate.rules === undefined || candidate.variant === undefined) return null;
  return {
    format: candidate.format,
    variant: candidate.variant,
    rules: candidate.rules,
    generated: candidate.generated ?? "",
    tables,
  };
}

/** Fetch the manifest under `baseUrl` (which must end in a slash), or null. */
export async function fetchManifest(baseUrl: string): Promise<Manifest | null> {
  try {
    const res = await fetch(`${baseUrl}manifest.json`);
    if (!res.ok) return null;
    return parseManifest(await res.text());
  } catch {
    return null;
  }
}

/** Fetch and gunzip one table, or null if it is missing or cannot be unpacked. */
export async function fetchTable(baseUrl: string, key: string): Promise<Uint8Array | null> {
  if (!decompressionSupported()) {
    warnOnce("DecompressionStream is unavailable — playing without endgame tables");
    return null;
  }
  try {
    const res = await fetch(`${baseUrl}${key}.bin.gz`);
    if (!res.ok || res.body === null) return null;
    const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Fetch several tables into `into` (a fresh `Map` by default), skipping keys it
 * already holds. Failures are silent by design: a missing table means the engine
 * searches that endgame instead of reading it.
 */
export async function fetchTables(
  baseUrl: string,
  keys: Iterable<string>,
  into: Map<string, Uint8Array> = new Map(),
): Promise<Map<string, Uint8Array>> {
  const wanted = [...new Set(keys)].filter((k) => !into.has(k));
  const loaded = await Promise.all(wanted.map((k) => fetchTable(baseUrl, k)));
  wanted.forEach((k, i) => {
    const bytes = loaded[i];
    if (bytes !== null && bytes.length > 0) into.set(k, bytes);
  });
  return into;
}

/**
 * Which shipped tables a position with these stone counts can still reach: every
 * (m, o) with m ≤ mover's stones, o ≤ opponent's stones and both ≥ 3, because
 * stones only ever leave the board. Keeps the worker from fetching the whole set
 * at the first move of a 9-v-9 game, per contract §8.
 */
export function tableKeysFor(
  moverStones: number,
  oppStones: number,
  available: Iterable<string>,
): string[] {
  const out: string[] = [];
  for (const key of available) {
    const parsed = parseDbKey(key);
    if (parsed === null) continue;
    // Either side may be the one to move by the time the endgame is reached, so
    // both orientations of the count pair are in range.
    const fits =
      (parsed.m <= moverStones && parsed.o <= oppStones) ||
      (parsed.m <= oppStones && parsed.o <= moverStones);
    if (fits) out.push(key);
  }
  return out;
}
