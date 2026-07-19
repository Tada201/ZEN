// Runtime mirror of `src/lib/test-ssot/extract.ts`.
//
// Node.js ESM verifiers (`test/verify-*.mjs`) cannot load `.ts` files
// without a TS loader, so the runtime ships at this path. Both files
// declare the same exports — the verifier pins parity between them so
// drift fails at test time. Documentation lives on the `.ts` file;
// types are inlined here as JSDoc typedefs so IDEs and editors respect
// them.
//
// Source loading is deliberately NOT exported here — a helper cannot know
// its caller's location, and `import.meta.url`-based path resolution
// inside the helper would resolve paths from the helper's own directory
// rather than the caller's. Verifiers inline the standard
// `readFileSync(new URL("../...", import.meta.url), "utf8")` pattern.

/**
 * @typedef {{ test: (source: string) => boolean, describe: string }} Pin
 * Factory-first rule — construct pins via the factories below rather than
 * assembling `{ test, describe }` directly. The factories wrap user-supplied
 * literals in `escapeRegExp` so a caller-supplied substring cannot
 * accidentally become a regex metacharacter.
 */

/**
 * @typedef {(condition: unknown, message?: unknown) => void} AssertFn
 * Parametrically compatible with `node:assert/strict`'s `assert(value: unknown,
 * message?: string | Error)` (and Vitest/Jest's expect via inverse assertion
 * patterns). Parameters are loose so any standard assert function fills the
 * slot contravariantly.
 *
 * Lambda fallback: `checkAll((cond, msg) => { if (!cond) throw new Error(String(msg ?? "assertion failed")); }, [...])`
 * works identically to `checkAll(assert, [...])` — any thrown-on-failure
 * function with the right signature is a valid AssertFn. The `msg ?? ...`
 * nullish-coalesce guard avoids `String(undefined) === "undefined"` when
 * the caller omits the message AND catches `null` as a sentinel.
 */

/**
 * Assert that `symbol` is exported at the top level of the source.
 * @param {string} symbol
 * @param {string} describe
 * @returns {Pin}
 */
export function pinExport(symbol, describe) {
  // prettier-ignore
  const pattern = `export\\s+(?:function|const|let|var|class)\\s+${escapeRegExp(symbol)}\\b`;
  const re = new RegExp(pattern);
  return Object.freeze({ test: (source) => re.test(source), describe });
}

/**
 * Assert that `symbol` is imported (destructured) from a target file whose
 * import path contains `fromFragment`.
 * @param {string} symbol
 * @param {string} fromFragment
 * @param {string} describe
 * @returns {Pin}
 */
export function pinActiveImport(symbol, fromFragment, describe) {
  // prettier-ignore
  const pattern =
    `import\\s*\\{[^}]*\\b${escapeRegExp(symbol)}\\b[^}]*\\}\\s*from\\s*["'][^"']*${escapeRegExp(fromFragment)}["']`;
  const re = new RegExp(pattern);
  return Object.freeze({ test: (source) => re.test(source), describe });
}

/**
 * Assert that `pattern` (or every pattern in the array form) is absent.
 * Identifier-like strings (camelCase, snake_case, kebab-case) — a legacy
 * helper-name like `"getToolActionVerb"` or `"get-action-verb"` — are
 * wrapped in `\b...\b` automatically by `literalMatcher` (regex
 * `/^[A-Za-z_][A-Za-z0-9_-]*$/`). Non-identifier strings fall through to
 * plain escaped-regex substring matching.
 *
 * String-vs-regex asymmetry — the `string` form auto-wraps identifier-like
 * literals in `\b...\b`, but the `RegExp` form is used verbatim (no
 * auto-wrapping). A caller writing `pinAbsent(/getToolActionVerb/, ...)`
 * gets whole-string partial matching, while
 * `pinAbsent("getToolActionVerb", ...)` gets whole-word matching. Pick
 * the form that matches your intent.
 *
 * Array form folds multiple patterns into a single ALL-must-be-false
 * predicate producing ONE failure message when ANY single pattern matches.
 * Not a per-pattern message breakdown — useful for "all four stale family
 * table branches must be gone" loops.
 *
 * @param {string | RegExp | ReadonlyArray<string | RegExp>} pattern
 * @param {string} describe
 * @returns {Pin}
 */
export function pinAbsent(pattern, describe) {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  const matchers = patterns.map((p) =>
    p instanceof RegExp ? p : literalMatcher(p),
  );
  return Object.freeze({
    test: (source) => matchers.every((re) => !re.test(source)),
    describe,
  });
}

/**
 * Assert a literal substring is present in the source.
 * @param {string} literal
 * @param {string} describe
 * @returns {Pin}
 */
export function pinContains(literal, describe) {
  return Object.freeze({ test: (source) => source.includes(literal), describe });
}

/**
 * Assert that the regex `pattern` matches somewhere in the source.
 * @param {string | RegExp} pattern
 * @param {string} describe
 * @returns {Pin}
 */
export function pinRegexPresent(pattern, describe) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  return Object.freeze({ test: (source) => re.test(source), describe });
}

/**
 * Walk a pin table and assert each entry against its injected `assert`.
 *
 * V1 is sync-only — predicates return `boolean`, not `Promise<boolean>`.
 * If async test loads (e.g. disk-fetched fixtures) ever need to flow through
 * this walker, ship a v2 with `Pin.test: (source) => Promise<boolean>` and
 * a corresponding `checkAllAsync` rather than overloading this signature.
 *
 * @param {AssertFn} assert
 * @param {ReadonlyArray<{ context: string; source: string; pins: ReadonlyArray<Pin> }>} table
 */
export function checkAll(assert, table) {
  for (const entry of table) {
    for (const pin of entry.pins) {
      assert(pin.test(entry.source), `${entry.context}: ${pin.describe}`);
    }
  }
}

// Manual-sync note — `escapeRegExp` and `literalMatcher` are duplicated between
// extract.ts and extract.mjs. The parity pin at the verifier only asserts
// exported names, so any change here MUST be mirrored in extract.ts. The
// identifier regex (`/^[A-Za-z_][A-Za-z0-9_-]*$/`) covers camelCase, snake_case,
// and kebab-case legacy names — non-identifier literals fall through to plain
// substring matching.

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function literalMatcher(literal) {
  const isWordy = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(literal);
  return isWordy
    ? new RegExp(`\\b${escapeRegExp(literal)}\\b`)
    : new RegExp(escapeRegExp(literal));
}
