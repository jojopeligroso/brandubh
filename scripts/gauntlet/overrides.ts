/* Shared JSON-override parsing for the per-game adapters.
 *
 * `cand` accepts either a named term or a JSON object of weight overrides. The
 * JSON path is where a typo becomes a silently-ignored knob — `{"libertys":12}`
 * would merge cleanly and measure nothing but noise — so an unknown key is a
 * hard error naming the keys this game actually has. Each game's weight type is
 * different (ADR-0006, ADR-0007), so "unknown" is answered per game.
 */
export function mergeOverrides<W extends object>(game: string, defaults: W, json: string): W {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`--weights for ${game} is not valid JSON: ${(e as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`--weights for ${game} must be a JSON object of weight overrides`);
  }
  const known = new Set(Object.keys(defaults));
  const unknown = Object.keys(parsed).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    throw new Error(
      `unknown weight key(s) for ${game}: ${unknown.join(", ")}\n` +
        `  ${game} weights are: ${[...known].join(", ")}`,
    );
  }
  return { ...defaults, ...(parsed as Partial<W>) };
}
