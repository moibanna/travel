/**
 * Flight reference parsing.
 *
 * The desk writes both legs into one cell, stating the airline code once when
 * both legs use the same carrier. Splitting it is what lets each leg carry its
 * own status, its own live check and its own driver.
 */

/**
 * Splits one written flight reference into its separate numbers.
 *
 *   "TK316/805"        -> ["TK316", "TK 805"]
 *   "G 9357 / G 9358"  -> ["G 9357", "G 9358"]
 *   "EK 270"           -> ["EK 270"]
 *
 * A bare second number inherits the airline code from the first. The code may
 * be written as `TK316`, `G9 357`, `E 2396` or even `Flydubai 209`, and may
 * appear on only one of the two legs.
 */
export function flightNumbers(raw: string | null | undefined): string[] {
  const parts = String(raw ?? "")
    .split(/[/|,;+&]+/)
    .map((t) => t.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (!parts.length) return [];

  let code = "";
  for (const t of parts) {
    const m =
      /^([A-Za-z]{2}|[A-Za-z]\d|\d[A-Za-z])\s*\d/.exec(t) ||
      /^([A-Za-z]+)\s+\d/.exec(t);
    if (m) {
      code = m[1].toUpperCase();
      break;
    }
  }

  return parts.map((t) =>
    (/^\d+$/.test(t) && code ? `${code} ${t}` : t).toUpperCase(),
  );
}

/**
 * Decides which number belongs to which leg.
 *
 * With a single number and both legs present the departure is deliberately left
 * blank rather than guessed — a wrong flight number on a departure is worse
 * than an empty one.
 */
export function splitFlights(
  raw: string | null | undefined,
  hasArr: boolean,
  hasDep: boolean,
): { arr: string; dep: string } {
  const ns = flightNumbers(raw);
  if (!ns.length) return { arr: "", dep: "" };
  if (ns.length > 1) return { arr: ns[0], dep: ns[ns.length - 1] };
  if (hasArr && !hasDep) return { arr: ns[0], dep: "" };
  if (hasDep && !hasArr) return { arr: "", dep: ns[0] };
  return { arr: ns[0], dep: "" };
}

/** True when two written flight references mean the same flight. */
export const sameFlight = (a: string, b: string): boolean =>
  !!a && !!b &&
  String(a).replace(/\s/g, "").toUpperCase() ===
    String(b).replace(/\s/g, "").toUpperCase();
