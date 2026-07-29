/**
 * Verifier for the shared parseNumeric / parseNumericLoose parsers under
 * src/atlas/components/genui/premium/primitives/parseNumeric.ts.
 *
 * Locks the contract before more cards depend on it: null/undefined/NaN/
 * Infinity, percentage strings, currency strings, rating strings with /10
 * suffixes, comma-separated numbers, empty strings, non-numeric strings,
 * booleans, objects, and the critical distinction between parseNumeric
 * (regex-strip) and parseNumericLoose (plain parseFloat).
 *
 * Pattern follows the established test/verify-*.mjs convention: transpile
 * the .ts source via the typescript package, import from a data URL, and
 * assert with node:assert.
 */
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL(
  "../src/atlas/components/genui/premium/primitives/parseNumeric.ts",
  import.meta.url,
);
const source = readFileSync(sourcePath, "utf8");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "parseNumeric.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { parseNumeric, parseNumericLoose } = await import(moduleUrl);

// ── parseNumeric: null / undefined / absent ───────────────────────────────

assert.equal(parseNumeric(null), null, "null → null");
assert.equal(parseNumeric(undefined), null, "undefined → null");

// ── parseNumeric: numbers ─────────────────────────────────────────────────

assert.equal(parseNumeric(0), 0, "0 → 0 (NOT null — 0 is a legitimate value)");
assert.equal(parseNumeric(42), 42, "positive integer → as-is");
assert.equal(parseNumeric(-5), -5, "negative integer → as-is");
assert.equal(parseNumeric(3.14), 3.14, "float → as-is");
assert.equal(parseNumeric(-0), -0, "negative zero → as-is (=== 0)");
assert.equal(parseNumeric(NaN), null, "NaN → null (not finite)");
assert.equal(parseNumeric(Infinity), null, "Infinity → null (not finite)");
assert.equal(parseNumeric(-Infinity), null, "-Infinity → null (not finite)");

// ── parseNumeric: percentage strings ──────────────────────────────────────

assert.equal(parseNumeric("35%"), 35, '"35%" → 35');
assert.equal(parseNumeric("0%"), 0, '"0%" → 0 (NOT null)');
assert.equal(parseNumeric("100%"), 100, '"100%" → 100');
assert.equal(parseNumeric("-5%"), -5, '"-5%" → -5');
assert.equal(parseNumeric("  42%  "), 42, '"  42%  " → 42 (whitespace stripped)');

// ── parseNumeric: currency strings ────────────────────────────────────────

assert.equal(parseNumeric("$12.50"), 12.5, '"$12.50" → 12.5');
assert.equal(parseNumeric("€1,234.56"), 1234.56, '"€1,234.56" → 1234.56');
assert.equal(parseNumeric("£0.99"), 0.99, '"£0.99" → 0.99');
assert.equal(parseNumeric("¥1000"), 1000, '"¥1000" → 1000');

// ── parseNumeric: comma-separated numbers ─────────────────────────────────

assert.equal(parseNumeric("1,234"), 1234, '"1,234" → 1234');
assert.equal(parseNumeric("1,000,000"), 1000000, '"1,000,000" → 1000000');

// ── parseNumeric: empty / non-numeric strings ─────────────────────────────

assert.equal(parseNumeric(""), null, 'empty string → null');
assert.equal(parseNumeric("abc"), null, '"abc" → null');
assert.equal(parseNumeric("N/A"), null, '"N/A" → null');
assert.equal(parseNumeric("—"), null, '"—" (em dash) → null');
assert.equal(parseNumeric("free"), null, '"free" → null');
assert.equal(parseNumeric("-"), null, '"-" (hyphen only) → null');
assert.equal(parseNumeric("."), null, '"." (dot only) → null');
assert.equal(parseNumeric("%"), null, '"%" (percent only) → null');

// ── parseNumeric: booleans, objects, arrays ───────────────────────────────

assert.equal(parseNumeric(true), null, "true → null (not a number/string)");
assert.equal(parseNumeric(false), null, "false → null");
assert.equal(parseNumeric({}), null, "{} → null");
assert.equal(parseNumeric({ value: 42 }), null, "{value: 42} → null");
assert.equal(parseNumeric([42]), null, "[42] → null");
assert.equal(parseNumeric([]), null, "[] → null");

// ── parseNumeric: edge cases with mixed content ───────────────────────────

assert.equal(parseNumeric("42px"), 42, '"42px" → 42 (strips letters)');
assert.equal(parseNumeric("USD 99.95"), 99.95, '"USD 99.95" → 99.95');
assert.equal(parseNumeric("1.2.3"), 1.2, '"1.2.3" → 1.2 (parseFloat stops at second dot)');
assert.equal(parseNumeric("75% complete"), 75, '"75% complete" → 75');

// ── parseNumericLoose: null / undefined / absent ───────────────────────────

assert.equal(parseNumericLoose(null), null, "loose: null → null");
assert.equal(parseNumericLoose(undefined), null, "loose: undefined → null");

// ── parseNumericLoose: numbers ────────────────────────────────────────────

assert.equal(parseNumericLoose(0), 0, "loose: 0 → 0");
assert.equal(parseNumericLoose(42), 42, "loose: 42 → 42");
assert.equal(parseNumericLoose(8.5), 8.5, "loose: 8.5 → 8.5");
assert.equal(parseNumericLoose(NaN), null, "loose: NaN → null");
assert.equal(parseNumericLoose(Infinity), null, "loose: Infinity → null");

// ── parseNumericLoose: rating strings with scale suffixes ──────────────────
// This is the KEY use case for parseNumericLoose: parseFloat stops at the
// first non-numeric character, so "8.5/10" → 8.5 (NOT 8.510).

assert.equal(parseNumericLoose("8.5/10"), 8.5, 'loose: "8.5/10" → 8.5 (stops at /)');
assert.equal(parseNumericLoose("4.2 out of 5"), 4.2, 'loose: "4.2 out of 5" → 4.2 (stops at space)');
assert.equal(parseNumericLoose("9/10"), 9, 'loose: "9/10" → 9');
assert.equal(parseNumericLoose("95/100"), 95, 'loose: "95/100" → 95');
assert.equal(parseNumericLoose("7.3"), 7.3, 'loose: "7.3" → 7.3');

// ── parseNumericLoose: plain numeric strings ───────────────────────────────

assert.equal(parseNumericLoose("42"), 42, 'loose: "42" → 42');
assert.equal(parseNumericLoose("3.14"), 3.14, 'loose: "3.14" → 3.14');
assert.equal(parseNumericLoose("  8  "), 8, 'loose: "  8  " → 8 (parseFloat trims whitespace)');

// ── parseNumericLoose: percentage / currency strings ───────────────────────
// parseNumericLoose uses plain parseFloat which stops at the first
// non-numeric character. For "35%", parseFloat returns 35 (stops at %) —
// the SAME result as parseNumeric. The real distinction is currency with
// LEADING symbols ($, £, ¥, €) where parseFloat can't start parsing, and
// comma-separated numbers where parseFloat stops at the comma.

assert.equal(parseNumericLoose("35%"), 35, 'loose: "35%" → 35 (parseFloat stops at %, same as parseNumeric)');
assert.equal(parseNumericLoose("$12.50"), null, 'loose: "$12.50" → null (parseFloat cannot parse leading $)');
assert.equal(parseNumericLoose("£0.99"), null, 'loose: "£0.99" → null (parseFloat cannot parse leading £)');
assert.equal(parseNumericLoose("¥1000"), null, 'loose: "¥1000" → null (parseFloat cannot parse leading ¥)');
assert.equal(parseNumericLoose("1,234"), 1, 'loose: "1,234" → 1 (parseFloat stops at comma)');

// ── parseNumericLoose: empty / non-numeric strings ─────────────────────────

assert.equal(parseNumericLoose(""), null, 'loose: empty string → null');
assert.equal(parseNumericLoose("abc"), null, 'loose: "abc" → null');
assert.equal(parseNumericLoose("N/A"), null, 'loose: "N/A" → null');
assert.equal(parseNumericLoose("—"), null, 'loose: "—" → null');

// ── parseNumericLoose: booleans, objects, arrays ───────────────────────────

assert.equal(parseNumericLoose(true), null, "loose: true → null");
assert.equal(parseNumericLoose(false), null, "loose: false → null");
assert.equal(parseNumericLoose({}), null, "loose: {} → null");
assert.equal(parseNumericLoose([42]), null, "loose: [42] → null");

// ── parseNumericLoose: "min" suffix (used by MovieCard parseRuntime) ───────
// MovieCard's parseRuntime extracts the number before "min" via regex,
// then passes it to parseNumericLoose. But parseFloat also handles "NN min"
// directly by stopping at the space — useful when the regex isn't applied.

assert.equal(parseNumericLoose("120"), 120, 'loose: "120" → 120');
assert.equal(parseNumericLoose("90.5"), 90.5, 'loose: "90.5" → 90.5');
assert.equal(parseNumericLoose("120 min"), 120, 'loose: "120 min" → 120 (parseFloat stops at space)');

// ── Critical distinction: parseNumeric vs parseNumericLoose ────────────────
// The same input can produce different results. This is the design contract:
// callers MUST choose the correct variant for their data type.
//
// Distinguishing case 1: ratings with /10 suffix
//   parseNumeric strips / → "8.510" → 8.51 (WRONG for ratings)
//   parseNumericLoose stops at / → 8.5 (CORRECT for ratings)
//
// Distinguishing case 2: currency with leading symbol
//   parseNumeric strips $ → "12.50" → 12.5 (CORRECT for prices)
//   parseNumericLoose can't parse leading $ → NaN → null (WRONG for prices)
//
// Distinguishing case 3: comma-separated numbers
//   parseNumeric strips , → "1234" → 1234 (CORRECT)
//   parseNumericLoose stops at , → 1 (WRONG)
//
// NON-distinguishing: percentage strings like "35%"
//   Both return 35 because parseFloat also stops at % — so percentages
//   are NOT a distinguishing case. Use either variant for percentages.

assert.notEqual(
  parseNumeric("8.5/10"),
  parseNumericLoose("8.5/10"),
  'parseNumeric("8.5/10") ≠ parseNumericLoose("8.5/10") — ratings are a distinguishing case',
);
assert.equal(
  parseNumeric("8.5/10"),
  8.51,
  'parseNumeric("8.5/10") → 8.51 (strips / → "8.510" → 8.51) — WRONG for ratings',
);
assert.equal(
  parseNumericLoose("8.5/10"),
  8.5,
  'parseNumericLoose("8.5/10") → 8.5 (stops at /) — CORRECT for ratings',
);

assert.notEqual(
  parseNumeric("$12.50"),
  parseNumericLoose("$12.50"),
  'parseNumeric("$12.50") ≠ parseNumericLoose("$12.50") — currency is a distinguishing case',
);
assert.equal(
  parseNumeric("$12.50"),
  12.5,
  'parseNumeric("$12.50") → 12.5 — CORRECT for prices',
);
assert.equal(
  parseNumericLoose("$12.50"),
  null,
  'parseNumericLoose("$12.50") → null — WRONG for prices (parseFloat cannot parse leading $)',
);

assert.notEqual(
  parseNumeric("1,234"),
  parseNumericLoose("1,234"),
  'parseNumeric("1,234") ≠ parseNumericLoose("1,234") — comma-separated is a distinguishing case',
);
assert.equal(
  parseNumeric("1,234"),
  1234,
  'parseNumeric("1,234") → 1234 — CORRECT',
);
assert.equal(
  parseNumericLoose("1,234"),
  1,
  'parseNumericLoose("1,234") → 1 — WRONG (parseFloat stops at comma)',
);

// Non-distinguishing: percentage strings. Both return 35 because
// parseFloat also stops at %. This is NOT a reason to choose one over
// the other — use either variant for trailing-suffix percentages.
assert.equal(
  parseNumeric("35%"),
  parseNumericLoose("35%"),
  'parseNumeric("35%") === parseNumericLoose("35%") — percentages are NOT a distinguishing case (both stop at %)',
);
assert.equal(parseNumeric("35%"), 35, 'parseNumeric("35%") → 35');
assert.equal(parseNumericLoose("35%"), 35, 'parseNumericLoose("35%") → 35');

// ── Backward compatibility: ?? 0 fallback pattern ──────────────────────────
// Cards that need a non-null fallback (e.g. Ring.value) use
// `parseNumeric(x) ?? 0`. Verify this pattern works for all edge cases.

assert.equal(parseNumeric(null) ?? 0, 0, "null ?? 0 → 0");
assert.equal(parseNumeric(undefined) ?? 0, 0, "undefined ?? 0 → 0");
assert.equal(parseNumeric("abc") ?? 0, 0, '"abc" ?? 0 → 0');
assert.equal(parseNumeric(0) ?? 0, 0, "0 ?? 0 → 0 (0 is NOT null, so ?? keeps it)");
assert.equal(parseNumeric("0%") ?? 0, 0, '"0%" ?? 0 → 0 (legitimate 0 preserved)');
assert.equal(parseNumeric(42) ?? 0, 42, "42 ?? 0 → 42");
assert.equal(parseNumeric("35%") ?? 0, 35, '"35%" ?? 0 → 35');

// ── Symmetry: both return null for the same absent/unparseable cases ───────
// For inputs that are genuinely absent or non-numeric, both variants agree.

const sharedNullCases = [null, undefined, NaN, Infinity, -Infinity, true, false, {}, [], "abc", "", "N/A"];
for (const v of sharedNullCases) {
  assert.equal(
    parseNumeric(v),
    parseNumericLoose(v),
    `parseNumeric and parseNumericLoose should agree on null for ${JSON.stringify(v)}`,
  );
}

console.log("parse-numeric verifier passed");
