/**
 * Verifier for MCP Phase 6 — MRTR and user interaction (elicitation).
 *
 * Two layers, matching the Phase 5 verifier convention:
 *   1. SOURCE SHAPE — the parser, the fail-closed transport loop, the command
 *      surface, the declared client capability, and the UI consent paths all
 *      exist in source. Catches a revert that would let a server collect a
 *      secret in-band, prefetch a URL, parse/mutate the opaque requestState, or
 *      auto-answer an input request with no human in the loop.
 *   2. SAFETY SEMANTICS — a reference re-implementation of the Rust MRTR
 *      parsers/builders (input-required detection, secret-schema refusal, URL
 *      displayability, request-flood bound, message truncation, retry-state
 *      echo, ElicitResult action normalization) is driven against adversarial /
 *      malicious-server inputs to prove the behaviour the shape only names.
 *
 * No network — MRTR is a request/response transform plus a human prompt.
 */
import { readFileSync, readdirSync } from "node:fs";
import { strict as assert } from "node:assert";

const src = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const clientDir = new URL("../src-tauri/src/mcp/client/", import.meta.url);
const client = readdirSync(clientDir)
  .filter((f) => f.endsWith(".rs"))
  .map((f) => readFileSync(new URL(f, clientDir), "utf8"))
  .join("\n");

const mrtr = src("../src-tauri/src/mcp/mrtr.rs");
const elicit = src("../src-tauri/src/mcp/client/elicit.rs");
const commands = src("../src-tauri/src/commands/mcp.rs");
const types = src("../src-tauri/src/mcp/types.rs");
const modal = src("../src/components/Zen/modals/McpElicitationModal.tsx");
const system = src("../src-tauri/src/commands/system.rs");
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

assertAll("mrtr.rs parse + builders", mrtr, [
  /fn\s+is_input_required\b/,
  /fn\s+parse_input_required\b/,
  /MAX_INPUT_REQUESTS\s*:\s*usize\s*=\s*16/,
  /\.take\(MAX_INPUT_REQUESTS\)/,
  /fn\s+schema_requests_secret\b/,
  /fn\s+is_displayable_url\b/,
  /fn\s+build_elicit_result\b/,
  /fn\s+build_retry_params\b/,
  // opaque requestState echoed, and dropped when the interim result had none
  /map\.insert\(\s*"requestState"\.to_string\(\),\s*state\.clone\(\)\s*\)/,
  /map\.remove\("requestState"\)/,
]);

assertAll("elicit.rs fail-closed MRTR loop", elicit, [
  /fn\s+request_with_mrtr\b/,
  /MAX_MRTR_ROUNDS\s*:\s*usize\s*=\s*\d+/,
  /ELICIT_TIMEOUT_SECS\s*:\s*u64\s*=\s*120/,
  /fn\s+gather_input_responses\b/,
  /fn\s+prompt_elicitation\b/,
  /fn\s+resolve_elicitation\b/,
  // no UI handle ⇒ error, never a silent auto-answer
  /no UI is attached to prompt for it/,
  // fatal (undeclared method) fails the whole call; non-fatal auto-declines
  /if\s+req\.fatal/,
  /build_elicit_result\("decline",\s*None\)/,
  // url opened only on accept, only via the OS browser, never prefetched
  /opener\(\)\.open_url/,
  /if\s+action\s*==\s*"accept"/,
]);

assertAll("commands/mcp.rs resolve surface", commands, [/fn\s+mcp_resolve_elicitation\b/]);

// Elicitation capability (form + url) must be declared to the server.
assertAll("types.rs declares elicitation capability", types, [
  /elicitation/,
  /form/,
  /url/,
]);

// The MRTR call chain must route the three input-capable methods through the
// loop (not the plain endpoint), so an InputRequiredResult is actually handled.
assertAll("features route through request_with_mrtr", client, [
  /request_with_mrtr\([^)]*PROMPTS_GET/s,
  /request_with_mrtr\([^)]*RESOURCES_READ/s,
  // tool calls also satisfy MRTR through the same loop
  /request_with_mrtr\([^)]*TOOLS_CALL/s,
]);

assertAll("modal consent paths", modal, [
  // url shown verbatim for review, never embedded/fetched
  /\{request\.url\}/,
  /Only continue if you trust this server/,
  // object/array schema props are skipped — no structured/opaque smuggling
  /not a flat primitive/,
  // every exit resolves the awaiting backend request
  /resolveElicitation\(/,
]);

// Diagnostics export carries protocol status but no server secrets/names/URLs.
assertAll("diagnostics export is safe", system, [
  /supported_protocol_versions/,
  /MODERN_PROTOCOL_VERSION/,
]);
assert.ok(
  !/record\.command|record\.url|record\.env|record\.headers/.test(system),
  "diagnostics must not export command/url/env/header values",
);

assertAll("plan Phase 6 present", plan, [
  /Phase 6 — MRTR and user interaction/,
  /Request state is never parsed or modified by the client/,
]);

// ── 2. Safety semantics — reference mirrors of the Rust MRTR logic ──────────

const MAX_INPUT_REQUESTS = 16;
const MAX_MESSAGE_BYTES = 4 * 1024;
const ELICITATION_CREATE = "elicitation/create";

const isInputRequired = (r) => r?.resultType === "input_required";
assert.equal(isInputRequired({ content: [] }), false, "missing resultType ⇒ complete");
assert.equal(isInputRequired({ resultType: "complete" }), false);
assert.equal(isInputRequired({ resultType: "input_required" }), true);

// Secret-schema detector (mirror of schema_requests_secret): errs toward false
// positives so a password/token field can never reach form mode.
const NEEDLES = [
  "password", "passwd", "secret", "token", "apikey", "api_key", "api-key",
  "access_key", "accesskey", "credential", "private_key", "privatekey",
  "client_secret", "clientsecret", "otp", "passphrase", "pin",
];
function schemaRequestsSecret(schema) {
  const props = schema?.properties;
  if (!props || typeof props !== "object") return false;
  const looks = (s) => typeof s === "string" && NEEDLES.some((n) => s.toLowerCase().includes(n));
  return Object.entries(props).some(
    ([name, def]) =>
      looks(name) ||
      looks(def?.title) ||
      (typeof def?.format === "string" && def.format.toLowerCase() === "password"),
  );
}
assert.equal(schemaRequestsSecret({ properties: { api_key: { type: "string" } } }), true);
assert.equal(schemaRequestsSecret({ properties: { pw: { format: "password" } } }), true);
assert.equal(schemaRequestsSecret({ properties: { AccessToken: { type: "string" } } }), true);
assert.equal(
  schemaRequestsSecret({ properties: { name: { type: "string" }, email: { format: "email" } } }),
  false,
);

// URL displayability: only absolute http(s) is shown for consent; executable /
// smuggling schemes are refused before any UI.
function isDisplayableUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "not a url", ""]) {
  assert.equal(isDisplayableUrl(bad), false, `URL must be refused: ${JSON.stringify(bad)}`);
}
assert.equal(isDisplayableUrl("https://ex.com/x"), true);

// Message truncation + control strip (mirror of sanitize_text applied in parse).
function sanitizeText(input, maxBytes) {
  const cleaned = [...input]
    .filter((c) => c === "\n" || c === "\t" || c === "\r" || !(c.codePointAt(0) <= 0x1f || c.codePointAt(0) === 0x7f))
    .join("");
  return Buffer.byteLength(cleaned) <= maxBytes ? cleaned : cleaned.slice(0, maxBytes);
}
const bigMsg = sanitizeText("a".repeat(MAX_MESSAGE_BYTES * 2) + "\u0007tail", MAX_MESSAGE_BYTES);
assert.ok(bigMsg.length <= MAX_MESSAGE_BYTES, "oversized message truncated");
assert.ok(!bigMsg.includes("\u0007"), "control char stripped from message");

// parse_input_required: flood bound + unsupported-method fatal block.
function parseInputRequired(result) {
  const map = result.inputRequests ?? {};
  const requests = [];
  for (const [key, req] of Object.entries(map).slice(0, MAX_INPUT_REQUESTS)) {
    const method = req?.method ?? "";
    const params = req?.params ?? {};
    const message = sanitizeText(String(params.message ?? ""), MAX_MESSAGE_BYTES);
    if (method !== ELICITATION_CREATE) {
      requests.push({ key, blocked: `unsupported input method '${method}'`, fatal: true });
      continue;
    }
    const mode = params.mode === "url" ? "url" : "form";
    if (mode === "url") {
      const ok = typeof params.url === "string" && isDisplayableUrl(params.url);
      requests.push({ key, mode, message, url: params.url, blocked: ok ? null : "bad url", fatal: false });
    } else {
      const blocked = params.requestedSchema && schemaRequestsSecret(params.requestedSchema)
        ? "credential via form mode"
        : null;
      requests.push({ key, mode, message, blocked, fatal: false });
    }
  }
  return { requests, requestState: result.requestState ?? null };
}

const flood = {};
for (let i = 0; i < MAX_INPUT_REQUESTS + 50; i++) {
  flood[`k${i}`] = { method: ELICITATION_CREATE, params: { mode: "form", message: "hi" } };
}
assert.equal(
  parseInputRequired({ resultType: "input_required", inputRequests: flood }).requests.length,
  MAX_INPUT_REQUESTS,
  "request flood is bounded",
);
const mixed = parseInputRequired({
  resultType: "input_required",
  requestState: "AEAD-blob",
  inputRequests: {
    who: { method: ELICITATION_CREATE, params: { mode: "form", message: "name?" } },
    key: { method: ELICITATION_CREATE, params: { mode: "form", requestedSchema: { properties: { token: {} } } } },
    link: { method: ELICITATION_CREATE, params: { mode: "url", url: "vbscript:x" } },
    nope: { method: "sampling/createMessage", params: {} },
  },
});
const at = (k) => mixed.requests.find((r) => r.key === k);
assert.equal(at("who").blocked, null, "benign form allowed");
assert.ok(at("key").blocked && !at("key").fatal, "credential form auto-declined, not fatal");
assert.ok(at("link").blocked && !at("link").fatal, "bad url auto-declined, not fatal");
assert.ok(at("nope").blocked && at("nope").fatal, "undeclared method is a fatal protocol violation");
assert.equal(mixed.requestState, "AEAD-blob", "requestState kept opaque, unchanged");

// build_retry_params: echo requestState verbatim; drop it when absent.
function buildRetryParams(original, inputResponses, requestState) {
  const out = original && typeof original === "object" ? { ...original } : {};
  out.inputResponses = inputResponses;
  if (requestState === null || requestState === undefined) delete out.requestState;
  else out.requestState = requestState;
  return out;
}
const withState = buildRetryParams({ name: "t", requestState: "stale" }, { who: {} }, "fresh");
assert.equal(withState.requestState, "fresh", "requestState echoed verbatim");
assert.ok(withState.inputResponses, "inputResponses attached");
const noState = buildRetryParams({ name: "t", requestState: "stale" }, {}, null);
assert.equal(noState.requestState, undefined, "retry drops a requestState the server didn't resend");

// build_elicit_result: content only on accept; unknown action ⇒ cancel.
function buildElicitResult(action, content) {
  const a = ["accept", "decline", "cancel"].includes(action) ? action : "cancel";
  const obj = { action: a };
  if (a === "accept" && content && typeof content === "object") obj.content = content;
  return obj;
}
assert.deepEqual(buildElicitResult("accept", { name: "x" }), { action: "accept", content: { name: "x" } });
assert.equal(buildElicitResult("decline", { name: "x" }).content, undefined, "decline carries no content");
assert.equal(buildElicitResult("weird", null).action, "cancel", "unknown action ⇒ cancel");

console.log("mcp phase 6 mrtr/elicitation verifier passed");
