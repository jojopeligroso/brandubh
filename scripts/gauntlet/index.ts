/* Adapter selection for `scripts/pairgauntlet.ts --game <id>`.
 *
 * The three modules are imported eagerly rather than lazily: each pulls in one
 * game's engine and rules, which is cheap, and a lazy `await import` would make
 * every caller (including the co-located test) async for no gain.
 */
import type { GameAdapter, GameId } from "./adapter";
import { GAME_IDS } from "./adapter";
import { brandubhAdapter } from "./brandubh";
import { tablutAdapter } from "./tablut";
import { copenhagenAdapter } from "./copenhagen";

const ADAPTERS: Record<GameId, GameAdapter> = {
  brandubh: brandubhAdapter,
  tablut: tablutAdapter,
  copenhagen: copenhagenAdapter,
};

export function isGameId(s: string): s is GameId {
  return (GAME_IDS as readonly string[]).includes(s);
}

/** The adapter for a game id. Throws on an unknown id rather than defaulting,
 *  so a typo can never silently measure the wrong board. */
export function adapterFor(game: GameId): GameAdapter {
  return ADAPTERS[game];
}

export { GAME_IDS };
export type { GameAdapter, GameId, Weights } from "./adapter";
