// ── Loading shipped endgame tables (Node side) ────────────────────────────────
//
// The offline twin of `loader.ts`: reads `<m>-<o>.bin.gz` off disk and gunzips it
// with `node:zlib`, for the generator's own round-trip check, for a test that wants
// to probe a shipped table, and for any future offline gauntlet.
//
// Two things about its shape are deliberate:
//
//   • Separate file, never imported by `loader.ts`, `probe.ts` or anything the AI
//     worker reaches. A `node:` specifier inside the worker's import graph is a
//     bundle error in Vite, and the one in this project that would be hardest to
//     notice: the worker builds fine until someone adds the import.
//   • The `node:` modules are pulled in by *dynamic* import through a string
//     constant, because this repository has no `@types/node` (by choice — `tsc -b`
//     covers `src` only and the scripts run under `tsx`). A static import would be
//     a compile error in `src`; this is the smallest shape that keeps `npx tsc -b`
//     green without inventing ambient declarations for modules the app never loads.
//
// What it deliberately does not do: it does not verify the manifest's SHA-256
// (the generator does that at write time, where a mismatch is actionable) and it
// does not cache.

import { type Manifest, parseManifest } from "./loader";

const FS_MODULE = "node:fs";
const ZLIB_MODULE = "node:zlib";

interface NodeFs {
  readFileSync(path: string): Uint8Array;
  existsSync(path: string): boolean;
}

interface NodeZlib {
  gunzipSync(data: Uint8Array): Uint8Array;
}

const fs = async (): Promise<NodeFs> => (await import(FS_MODULE)) as unknown as NodeFs;
const zlib = async (): Promise<NodeZlib> => (await import(ZLIB_MODULE)) as unknown as NodeZlib;

/** Read and gunzip one table from a directory, or null if it is not there. */
export async function readTable(dir: string, key: string): Promise<Uint8Array | null> {
  const io = await fs();
  const path = `${dir}/${key}.bin.gz`;
  if (!io.existsSync(path)) return null;
  const gz = await zlib();
  return new Uint8Array(gz.gunzipSync(io.readFileSync(path)));
}

/** Read the manifest from a directory, or null. */
export async function readManifest(dir: string): Promise<Manifest | null> {
  const io = await fs();
  const path = `${dir}/manifest.json`;
  if (!io.existsSync(path)) return null;
  return parseManifest(new TextDecoder().decode(io.readFileSync(path)));
}

/** Read every table the manifest in `dir` lists. */
export async function readTables(dir: string): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  const manifest = await readManifest(dir);
  if (manifest === null) return out;
  for (const entry of manifest.tables) {
    const bytes = await readTable(dir, entry.key);
    if (bytes !== null) out.set(entry.key, bytes);
  }
  return out;
}
