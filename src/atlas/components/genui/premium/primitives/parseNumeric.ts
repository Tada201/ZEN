/**
 * Shared numeric parsers for the GenUI premium card system.
 *
 * LLM-generated card payloads are noisy: percentages arrive as `"35%"`,
 * prices as `"$12.50"`, ratings as `"8.5/10"`, and some fields arrive as
 * `null`, `undefined`, `NaN`, `Infinity`, booleans, or objects. Every card
 * previously had its own copy of the same strip-and-parse logic. This module
 * is the single source of truth.
 *
 * Two flavors are provided because the two use cases are NOT safe to merge:
 *
 *  - `parseNumeric` — strips non-numeric glyphs (`%`, `$`, `,`, letters)
 *    before `parseFloat`. Correct for percentages, prices, stock levels,
 *    possession, healthiness, progress, and change. BUT it would corrupt
 *    ratings like `"8.5/10"` → strip `/` → `"8.510"` → `8.51` (wrong).
 *
 *  - `parseNumericLoose` — plain `parseFloat` without stripping. Correct for
 *    ratings where the scale suffix (`/10`, `/100`) should be ignored —
 *    `parseFloat("8.5/10")` stops at `/` and returns `8.5`. BUT it would
 *    return `NaN` for `"35%"` because `%` is not a numeric character.
 *
 * Both return `null` for absent/unparseable input so callers can distinguish
 * "no data" from a legitimate `0`. Callers that need a non-null fallback
 * (e.g. Ring's value prop) do `parseNumeric(x) ?? 0`.
 */

/**
 * Strip non-numeric glyphs (`%`, `$`, `,`, letters, whitespace) then
 * `parseFloat`. Returns the parsed number, or `null` when the input is
 * absent, non-finite, or yields no numeric content after stripping.
 *
 * @example
 *   parseNumeric("35%")     // → 35
 *   parseNumeric("$12.50")  // → 12.50
 *   parseNumeric("1,234")   // → 1234
 *   parseNumeric(35)        // → 35
 *   parseNumeric(null)      // → null
 *   parseNumeric("abc")     // → null
 *   parseNumeric("0%")      // → 0   (NOT null — 0 is a legitimate value)
 */
export function parseNumeric(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : null;
  }
  if (typeof v === "string") {
    const num = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Plain `parseFloat` without stripping non-numeric glyphs. Use this for
 * values where a trailing scale suffix (`/10`, `/100`, ` out of 10`)
 * should be ignored rather than stripped. Returns the parsed number, or
 * `null` when the input is absent, non-finite, or yields no leading
 * numeric content.
 *
 * @example
 *   parseNumericLoose("8.5/10")    // → 8.5   (stops at "/")
 *   parseNumericLoose("4.2 out of 5") // → 4.2 (stops at " out")
 *   parseNumericLoose(8.5)          // → 8.5
 *   parseNumericLoose(null)         // → null
 *   parseNumericLoose("35%")        // → null  ("% is not numeric")
 *   parseNumericLoose("abc")        // → null
 */
export function parseNumericLoose(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : null;
  }
  if (typeof v === "string") {
    const num = parseFloat(v);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}
