/**
 * SSOT (single-source-of-truth) test primitives.
 *
 * This module extracts the three-layer defense-in-depth pin pattern that the
 * chat timeline uses to keep `humanizeToolAction` and `humanizeToolName`
 * consolidated as the only tool-verb/tool-noun surface. The same shape generalizes
 * to any future SSOT consolidation: an export pin (locks the producer),
 * an active-import pin (locks the consumers), and a legacy-name absence pin
 * (locks the absence of any re-derivation that bypasses the SSOT).
 *
 * Composition: every helper returns a `Pin` object — a positive or negative
 * source-code invariant with a stable description used in the assertion
 * message. `checkAll` takes an `assert` injection and a flat list of
 * `{ source, context, pins }` entries, so cross-cutting pins express as
 * well as per-file pins.
 *
 * Format note: this is the canonical, type-checked reference. Node ESM
 * verifiers (`test/verify-*.mjs`) cannot load `.ts` without a TS loader,
 * so a runtime mirror ships at `extract.mjs`. The two files are kept in
 * sync via a parity pin in `test/verify-tool-execution-card-ux.mjs` —
 * any drift between the export lists throws at verifier time.
 *
 * Source loading is deliberately NOT exported here — a helper cannot know
 * its caller's location, and `import.meta.url`-based path resolution
 * inside the helper would resolve paths from the helper's own directory
 * rather than the caller's. Verifiers inline the standard
 * `readFileSync(new URL("../...", import.meta.url), "utf8")` pattern.
 */

/**
 * A pin is a single source-code invariant: a predicate over the source
 * string plus a short description used in the failure message. Pins
 * compose into `checkAll` to produce uniform failure messages.
 *
 * Factory-first rule — construct pins via `pinExport`, `pinActiveImport`,
 * `pinAbsent`, `pinContains`, and `pinRegexPresent` rather than assembling
 * `{ test, describe }` directly. The factories wrap user-supplied literals
 * in `escapeRegExp` so a caller-supplied substring cannot accidentally
 * become a regex metacharacter. Exposing the type as readonly still allows
 * structural assignment, but the convention keeps the helper safe by default.
 */
export type Pin = Readonly<{
  /** Predicate over the source string. Returns true when the invariant holds. */
  test: (source: string) => boolean;
  /** Short description used in `'${context}: ${pin.describe}'` failure messages. */
  describe: string;
}>;

/**
 * The `assert` injection point. Parametrically compatible with
 * `node:assert/strict`'s `assert(value: unknown, message?: string | Error)`
 * (and Vitest/Jest's `expect` via inverse assertion patterns) — keep
 * parameters loose so any standard assert function fills the slot
 * contravariantly.
 *
 * Lambda fallback: `checkAll((cond, msg) => { if (!cond) throw new Error(String(msg ?? "assertion failed")); }, [...])`
 * works identically to `checkAll(assert, [...])` — any thrown-on-failure
 * function with the right signature is a valid AssertFn. The `msg ?? ...`
 * nullish-coalesce guard avoids `String(undefined) === "undefined"` when
 * the caller omits the message AND catches `null` as a sentinel.
 */
export type AssertFn = (condition: unknown, message?: unknown) => void;

/**
 * Assert that `symbol` is exported at the top level of the source —
 * locks the producer side of an SSOT consolidation.
 *
 * Matches:
 *   export function humanizeToolAction(...) { ... }
 *   export const humanizeToolAction = ...
 *   export class humanizeToolAction { ... }
 *
 * Does NOT match:
 *   - re-exports without redeclaration
 *   - default exports
 *   - named exports via destructuring tricks
 */
export function pinExport(symbol: string, describe: string): Pin {
  const re = new RegExp(
    `export\\s+(?:function|const|let|var|class)\\s+${escapeRegExp(symbol)}\\b`,
  );
  return Object.freeze({ test: (source: string) => re.test(source), describe });
}

/**
 * Assert that `symbol` is *imported* (destructured) from a target file
 * whose import path contains the given fragment — locks the consumer side
 * of an SSOT consolidation.
 *
 * Path-style agnostic — both relative (`"./ToolCallCard"`) and aliased
 * (`"@/atlas/components/chat/ToolCallCard"`) forms pass, since the regex
 * matches any quoted-string whose contents contain `fromFragment`. The
 * fragment is matched as a literal substring, so callers should pick a
 * distinguishing file-name token (e.g. `"ToolCallCard"` rather than `"./").
 *
 * Matches:
 *   import { humanizeToolAction } from "./ToolCallCard";
 *   import { humanizeToolAction } from "@/atlas/.../ToolCallCard";
 *   import {
 *     humanizeToolAction,
 *   } from "../relative/path/ToolCallCard.tsx";
 */
export function pinActiveImport(
  symbol: string,
  fromFragment: string,
  describe: string,
): Pin {
  const re = new RegExp(
    `import\\s*\\{[^}]*\\b${escapeRegExp(symbol)}\\b[^}]*\\}\\s*from\\s*["'][^"']*${escapeRegExp(fromFragment)}["']`,
  );
  return Object.freeze({ test: (source: string) => re.test(source), describe });
}

/**
 * Assert that `pattern` is absent from the source. Use for:
 *
 *  - Legacy helper-name absence (e.g. `"getToolActionVerb"` or kebab-case
 *    `"get-action-verb"`) — identifier-like literals are wrapped in
 *    `\b...\b` automatically by `literalMatcher` (regex
 *    `/^[A-Za-z_][A-Za-z0-9_-]*$/` covers camelCase, snake_case, and
 *    kebab-case).
 *  - A regex pattern that fingerprints forbidden transforms (e.g. the
 *    canonical snake-to-TitleCase `/\.replace\s*\(\s*\/\[_-\]\+/` and the
 *    modern `.replaceAll("_", " ")` shapes).
 *  - A literal substring that would re-introduce a parallel SSOT.
 *
 * Array form folds multiple patterns into a single ALL-must-be-false
 * predicate producing ONE failure message when ANY single pattern matches.
 * Useful for "all four stale family-table branches must be gone" loops —
 * not a per-pattern message breakdown.
 *
 * String-vs-regex asymmetry — the `string` form auto-wraps identifier-like
 * literals in `\b...\b`, but the `RegExp` form is used verbatim (no
 * auto-wrapping). A caller writing `pinAbsent(/getToolActionVerb/, ...)`
 * gets whole-string partial matching, while
 * `pinAbsent("getToolActionVerb", ...)` gets whole-word matching. Pick
 * the form that matches your intent.
 */
export function pinAbsent(
  pattern: string | RegExp | ReadonlyArray<string | RegExp>,
  describe: string,
): Pin {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  const matchers = patterns.map((p) => (p instanceof RegExp ? p : literalMatcher(p)));
  return Object.freeze({
    test: (source: string) => matchers.every((re) => !re.test(source)),
    describe,
  });
}

/**
 * Assert that `literal` substring appears in the source. Used for stable
 * surface-literal assertions like `"Searching"` / `"Reading"` / `"Writing"`
 * / `"Running"` — the family-table verbs that downstream rendering depends
 * on, but which the helper family should OWN centrally.
 */
export function pinContains(literal: string, describe: string): Pin {
  return Object.freeze({ test: (source: string) => source.includes(literal), describe });
}

/**
 * Assert that the regex `pattern` matches somewhere in the source. Use for
 * positive structural assertions (e.g. the early-return shape of
 * `shouldShowToolGroupInTimeline` /\bif...return true\b/) where a substring
 * check is too loose but a `contains()` literal is too tight.
 */
export function pinRegexPresent(pattern: string | RegExp, describe: string): Pin {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  return Object.freeze({ test: (source: string) => re.test(source), describe });
}

/**
 * Evaluate a pin table against an injected `assert`. The table is a flat
 * list of `{ context, source, pins }` entries — explicit per-file, no
 * implicit cross-cutting. This is intentionally more verbose than a
 * `{ sources, pinTable }` shape: cross-cutting pins express by being added
 * to each entry that needs them, which keeps the failure message
 * grounded in a specific file.
 *
 * Failure messages follow `"${context}: ${pin.describe}"` so each
 * violation names the file and the invariant it broke.
 *
 * V1 is sync-only — predicates return `boolean`, not `Promise<boolean>`.
 * If async test loads (e.g. disk-fetched fixtures) ever need to flow through
 * this walker, ship a v2 with `Pin.test: (source) => Promise<boolean>` and
 * a corresponding `checkAllAsync` rather than overloading this signature.
 */
export function checkAll(
  assert: AssertFn,
  table: ReadonlyArray<{ readonly context: string; readonly source: string; readonly pins: ReadonlyArray<Pin> }>,
): void {
  for (const entry of table) {
    for (const pin of entry.pins) {
      assert(pin.test(entry.source), `${entry.context}: ${pin.describe}`);
    }
  }
}

// Manual-sync note — `escapeRegExp` and `literalMatcher` are duplicated
// between extract.ts and extract.mjs. The parity pin at the verifier only
// asserts exported names, so any change here MUST be mirrored in
// extract.mjs. The identifier regex (`/^[A-Za-z_][A-Za-z0-9_-]*$/`) covers
// camelCase, snake_case, and kebab-case legacy names — non-identifier
// literals fall through to plain substring matching.

/**
 * Escape regex metacharacters in a literal that should be matched as a
 * substring inside a constructed regex. Backs the path-style agnosticism
 * in `pinActiveImport` and the literal form of `pinAbsent`.
 */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The literal-matcher wraps an exact substring in `\b...\b` boundaries
 * when the substring is "looks like an identifier" (legacy helper-name
 * form: starts with letter/underscore, contains only word characters
 * and hyphens). The hyphen widening covers kebab-case legacy names like
 * `get-action-verb`; alphanumerics-only callers (`getToolActionVerb`,
 * `snake_case_name`) still get word-boundary semantics. Non-identifier
 * literals (containing spaces, regex metachars, etc.) fall through to
 * a plain escaped-regex substring match.
 */
function literalMatcher(literal: string): RegExp {
  const isWordy = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(literal);
  return isWordy
    ? new RegExp(`\\b${escapeRegExp(literal)}\\b`)
    : new RegExp(escapeRegExp(literal));
}
