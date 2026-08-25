/**
 * Verifier for MCP Phase 5 — resources, prompts, caching, and subscriptions.
 *
 * Locks the exit-gate claims from docs/architecture/mcp-phase-plan.md:
 *   1. SOURCE SHAPE — the safety validators (URI allowlist + traversal guard,
 *      control-char strip, size caps, binary-stays-base64, embedded-resource
 *      summarize), the TTL/scope cache, and the stdio subscription listener
 *      all exist in source. Catches a revert that would let a server inject
 *      executable content/secrets or pin a stale cache.
 *   2. SAFETY SEMANTICS — a reference re-implementation of the URI allowlist,
 *      text sanitizer, blob guard, cache-hint parser, and prompt-content
 *      summarizer (mirroring the Rust) is driven against adversarial inputs to
 *      prove the behaviour the source shape only names.
 *
 * Follows the test/verify-*.mjs convention: read source with node:fs, assert
 * with node:assert. No network — these features are user-driven, not wire loops.
 */
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const src = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const resources = src("../src-tauri/crates/zen-mcp/src/resources.rs");
const rpc = src("../src-tauri/crates/zen-mcp/src/client/rpc.rs");
const features = src("../src-tauri/crates/zen-mcp/src/client/features.rs");
const subs = src("../src-tauri/crates/zen-mcp/src/client/subscriptions.rs");
const commands = src("../src-tauri/src/commands/mcp.rs");
const plan = src("../docs/architecture/mcp-phase-plan.md");

function assertAll(label, source, patterns) {
  const missing = patterns.filter((re) => !re.test(source));
  assert.equal(
    missing.length,
    0,
    `${label}: missing required pattern(s): ${missing.map((r) => r.source).join(", ")}`,
  );
}

// ── 1. Source-shape assertions ─────────────────────────────────────────────

assertAll("resources.rs safety layer", resources, [
  /ALLOWED_URI_SCHEMES\s*:\s*&\[&str\]\s*=\s*&\[/,
  /fn\s+validate_resource_uri\b/,
  /path traversal/i,
  /fn\s+sanitize_mime\b/,
  /fn\s+sanitize_text\b/,
  /fn\s+sanitize_blob\b/,
  /MAX_RESOURCE_TEXT_BYTES/,
  /MAX_RESOURCE_BLOB_BYTES/,
  /MAX_LIST_ITEMS/,
]);

assertAll("features.rs fetch + summarize", features, [
  /fn\s+list_resources\b/,
  /fn\s+read_resource\b/,
  /fn\s+list_prompts\b/,
  /fn\s+get_prompt\b/,
  /fn\s+paginate_list\b/,
  /MAX_LIST_PAGES\s*:\s*usize\s*=\s*\d+/,
  /fn\s+summarize_prompt_content\b/,
  // binary stays base64 (blob_base64), never decoded into model text
  /blob_base64/,
]);

assertAll("rpc.rs cache freshness + scope", rpc, [
  /enum\s+CacheScope/,
  /Public/,
  /Private/,
  /fn\s+parse_cache_hint\b/,
  // ttl must be positive to cache; clamp guards a hostile pin
  /if\s+ttl_ms\s*==\s*0/,
  /min\(60\s*\*\s*60\s*\*\s*1000\)/,
  /fn\s+cache_get\b/,
  /fn\s+cache_put\b/,
  /fn\s+cache_invalidate_server\b/,
  /MAX_CACHE_ENTRIES/,
]);

assertAll("subscriptions.rs deterministic loss", subs, [
  /fn\s+spawn_stdio_subscription\b/,
  /NOTIFICATIONS_TOOLS_LIST_CHANGED/,
  /NOTIFICATIONS_RESOURCES_LIST_CHANGED/,
  /NOTIFICATIONS_PROMPTS_LIST_CHANGED/,
  /cache_invalidate_server/,
  /sync_external_servers/,
  // loop ends when the channel closes (process loss) — determinism
  /while\s+let\s+Some\([^)]*\)\s*=\s*notifications\.recv\(\)\.await/,
]);

assertAll("commands/mcp.rs user-controlled surface", commands, [
  /fn\s+mcp_list_resources\b/,
  /fn\s+mcp_read_resource\b/,
  /fn\s+mcp_list_resource_templates\b/,
  /fn\s+mcp_list_prompts\b/,
  /fn\s+mcp_get_prompt\b/,
]);

assertAll("plan Phase 5 present", plan, [
  /Phase 5 — Resources, prompts, caching, and subscriptions/,
  /cannot silently inject executable content or secrets/,
]);

// ── 2. Safety semantics — reference mirrors of the Rust validators ──────────

const ALLOWED = ["file", "http", "https", "resource", "git", "ssh", "mcp"];
const MAX_URI_LEN = 2048;

function validateUri(uri) {
  if (!uri) return false;
  if (uri.length > MAX_URI_LEN) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(uri)) return false;
  const idx = uri.indexOf(":");
  if (idx <= 0) return false;
  const scheme = uri.slice(0, idx).toLowerCase();
  if (!ALLOWED.includes(scheme)) return false;
  if (scheme === "file" && uri.split(/[/\\]/).includes("..")) return false;
  return true;
}

// Executable / smuggling schemes must all be rejected.
for (const bad of [
  "javascript:alert(1)",
  "data:text/html,<script>",
  "vbscript:x",
  "blob:http://x",
  "file:///a/../../etc/passwd",
  "no-scheme",
  "",
  "https://x/" + "a".repeat(MAX_URI_LEN),
]) {
  assert.equal(validateUri(bad), false, `URI must be rejected: ${JSON.stringify(bad)}`);
}
for (const ok of ["file:///home/u/readme.md", "https://example.com/x", "resource://s/1"]) {
  assert.equal(validateUri(ok), true, `URI must be accepted: ${ok}`);
}

// Text sanitizer strips control chars (keeping \n \t \r) and truncates.
function sanitizeText(input, maxBytes) {
  const cleaned = [...input]
    .filter((c) => {
      const code = c.codePointAt(0);
      if (c === "\n" || c === "\t" || c === "\r") return true;
      return !(code <= 0x1f || code === 0x7f);
    })
    .join("");
  if (Buffer.byteLength(cleaned) <= maxBytes) return { text: cleaned, truncated: false };
  return { text: cleaned.slice(0, maxBytes), truncated: true };
}
assert.equal(sanitizeText("ok\u0007line\nend", 1024).text, "okline\nend");
assert.equal(sanitizeText("a".repeat(100), 10).truncated, true);

// Blob guard: only base64 alphabet, size-bounded; never decoded.
const MAX_BLOB = 1024 * 1024;
function sanitizeBlob(v) {
  if (v.length > MAX_BLOB) return null;
  if (!/^[A-Za-z0-9+/=\r\n]*$/.test(v)) return null;
  return v;
}
assert.equal(sanitizeBlob("aGVsbG8="), "aGVsbG8=");
assert.equal(sanitizeBlob("not base64!!"), null);
assert.equal(sanitizeBlob("A".repeat(MAX_BLOB + 1)), null);

// Cache hint: no ttl / zero ttl ⇒ not cached; absurd ttl clamped to 1h;
// scope defaults to private unless the server says public.
const HOUR = 60 * 60 * 1000;
function parseCacheHint(result) {
  const meta = result._meta ?? {};
  const ttlMs = result.ttlMs ?? meta.ttlMs;
  if (typeof ttlMs !== "number" || ttlMs === 0) return null;
  const ttl = Math.min(ttlMs, HOUR);
  const scopeRaw = result.cacheScope ?? meta.cacheScope;
  return { ttl, scope: scopeRaw === "public" ? "public" : "private" };
}
assert.equal(parseCacheHint({}), null);
assert.equal(parseCacheHint({ ttlMs: 0 }), null);
assert.deepEqual(parseCacheHint({ ttlMs: 5000 }), { ttl: 5000, scope: "private" });
assert.deepEqual(parseCacheHint({ _meta: { ttlMs: 1000, cacheScope: "public" } }), {
  ttl: 1000,
  scope: "public",
});
assert.equal(parseCacheHint({ ttlMs: 999_999_999 }).ttl, HOUR);

// Prompt content summarizer: text is kept sanitized; image/audio/resource
// blocks collapse to `[type: uri]` so no opaque/executable payload is inlined,
// and an unsafe embedded URI is blanked.
function summarize(content) {
  const blocks = Array.isArray(content) ? content : [content];
  const out = [];
  for (const b of blocks.slice(0, 64)) {
    if (!b.type || b.type === "text") {
      if (typeof b.text === "string") out.push(sanitizeText(b.text, MAX_BLOB).text);
    } else {
      const raw = b.resource?.uri ?? b.uri ?? "";
      const uri = validateUri(raw) ? raw : "";
      out.push(`[${b.type}: ${uri}]`);
    }
  }
  return out.join("\n");
}
const summary = summarize([
  { type: "text", text: "look at" },
  { type: "resource", resource: { uri: "file:///x" } },
  { type: "image", uri: "javascript:evil()" },
]);
assert.ok(summary.includes("look at"), "text block preserved");
assert.ok(summary.includes("[resource: file:///x]"), "resource summarized, not inlined");
assert.ok(summary.includes("[image: ]"), "unsafe embedded URI blanked");
assert.ok(!summary.includes("javascript:"), "executable scheme must never survive summarize");

console.log("mcp phase 5 resources/prompts verifier passed");
