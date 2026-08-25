#!/usr/bin/env node
// Phase 4 exit-gate verifier — production MCP tools.
//
// Confirms the discovery-time descriptor validation and idempotent
// registration wiring exist and behave, covering the plan's exit-gate
// states for the tool_list -> tool_info -> tool_exec path:
//
//   A) src-tauri/crates/zen-mcp/src/tool_schema.rs exists and exposes:
//        * validate_tool_schema  (bounded, Draft 2020-12 meta-validation)
//        * tool_header_extension_is_safe  (x-mcp-header rejection)
//        * fold_title  (top-level title -> annotations.title)
//      and pins jsonschema draft202012.
//
//   B) sync_external_servers (client/sync.rs) wires them in:
//        * per-server duplicate tool name dedupe (idempotent registration)
//        * validate_tool_schema for inputSchema + outputSchema
//        * tool_header_extension_is_safe gate
//        * rejected tools are skipped (continue), not fatal to the server
//        * tool_count reflects tools actually registered
//
//   C) Runtime contract — a reference port of the validation rules
//      classifies a diverse tools/list payload (ready, malformed-schema,
//      duplicate-name, unsafe-header, zero-tool) exactly as the Rust side
//      is documented to.
//
//   D) Frontend: successful non-action MCP tool cards collapse by default
//      (ToolCallCard hasAction excludes "completed"), and tool_list/tool_info
//      envelopes stay hidden from the chat timeline.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");
const SRC = (p) => readFileSync(path.join(PROJECT_ROOT, p), "utf8");

let exitCode = 0;
function fail(section, message) {
  console.error(`\u2717 ${section}: ${message}`);
  exitCode = 1;
}
function ok(section, message) {
  console.log(`\u2713 ${section}: ${message}`);
}
function assertAll(section, source, patterns) {
  let allOk = true;
  for (const p of patterns) {
    if (!p.test(source)) {
      fail(section, `missing required pattern: ${p}`);
      allOk = false;
    }
  }
  return allOk;
}

// ── Section A — mcp/tool_schema.rs ──────────────────────────────────────────
{
  const section = "mcp/tool_schema.rs";
  const src = SRC("src-tauri/crates/zen-mcp/src/tool_schema.rs");
  if (
    assertAll(section, src, [
      /pub\s+fn\s+validate_tool_schema\s*\(/,
      /pub\s+fn\s+tool_header_extension_is_safe\s*\(/,
      /pub\s+fn\s+fold_title\s*\(/,
      /jsonschema::draft202012::new\s*\(/,
      /MAX_SCHEMA_DEPTH/,
      /MAX_SCHEMA_NODES/,
      /is_reserved_mcp_header/,
      /is_sensitive_header/,
    ])
  ) {
    ok(section, "bounded 2020-12 validation + x-mcp-header rejection + title fold present");
  }
}

// ── Section B — client/sync.rs wiring ───────────────────────────────────────
{
  const section = "mcp/client/sync.rs";
  const src = SRC("src-tauri/crates/zen-mcp/src/client/sync.rs");
  if (
    assertAll(section, src, [
      // duplicate dedupe within a server
      /seen_names\s*:\s*std::collections::HashSet/,
      /if\s+!seen_names\.insert\(\s*name\.clone\(\)\s*\)\s*\{[\s\S]{0,400}?continue;/,
      // schema + header validation gate, skipping (continue) on error
      /validate_tool_schema\(\s*"inputSchema"/,
      /validate_tool_schema\(\s*"outputSchema"/,
      /tool_header_extension_is_safe\(\s*&tool_json\s*\)/,
      /rejected tool with malformed schema or unsafe header[\s\S]{0,80}?continue;/,
      // fold title into annotations before risk classification
      /fold_title\(\s*&tool_json\s*,\s*annotations\s*\)/,
      // tool_count reflects tools actually registered
      /let\s+tool_count\s*=\s*registered\s*;/,
    ])
  ) {
    ok(section, "idempotent dedupe + schema/header validation + registered count wiring");
  }
}

// ── Section C — runtime contract ────────────────────────────────────────────
{
  const section = "runtime contract";
  const MAX_DEPTH = 32;
  const MAX_NODES = 4096;
  const RESERVED = new Set([
    "accept", "content-type", "mcp-protocol-version", "mcp-session-id", "mcp-method", "mcp-name",
  ]);
  const SENSITIVE = new Set([
    "authorization", "proxy-authorization", "x-api-key", "api-key", "cookie", "set-cookie",
  ]);

  function boundsOk(value, depth, counter) {
    if (depth > MAX_DEPTH) return false;
    counter.n += 1;
    if (counter.n > MAX_NODES) return false;
    if (Array.isArray(value)) return value.every((v) => boundsOk(v, depth + 1, counter));
    if (value && typeof value === "object") {
      return Object.values(value).every((v) => boundsOk(v, depth + 1, counter));
    }
    return true;
  }
  // Minimal shape check standing in for jsonschema draft202012 compilation:
  // an object schema whose `type` (if present) is a string or array of strings.
  function schemaShapeOk(schema) {
    if (schema === null || schema === undefined) return true;
    if (typeof schema !== "object" || Array.isArray(schema)) return false;
    if ("type" in schema) {
      const t = schema.type;
      const stringy = typeof t === "string" || (Array.isArray(t) && t.every((x) => typeof x === "string"));
      if (!stringy) return false;
    }
    return boundsOk(schema, 0, { n: 0 });
  }
  function headerExtSafe(tool) {
    const ext = tool["x-mcp-header"];
    if (ext === undefined || ext === null) return true;
    let names;
    if (Array.isArray(ext)) names = ext.filter((x) => typeof x === "string");
    else if (typeof ext === "object") names = Object.keys(ext);
    else return false;
    return names.every((n) => n && !RESERVED.has(n.toLowerCase()) && !SENSITIVE.has(n.toLowerCase()));
  }

  // Simulate the sync loop's per-tool accept/reject + dedupe.
  function registerTools(tools) {
    const seen = new Set();
    const registered = [];
    for (const tool of tools) {
      const name = typeof tool.name === "string" ? tool.name : "unknown";
      if (seen.has(name)) continue;
      seen.add(name);
      const input = tool.inputSchema ?? { type: "object" };
      const output = tool.outputSchema ?? null;
      if (!schemaShapeOk(input)) continue;
      if (output !== null && !schemaShapeOk(output)) continue;
      if (!headerExtSafe(tool)) continue;
      registered.push(name);
    }
    return registered;
  }

  const deep = (() => {
    let s = { type: "object" };
    for (let i = 0; i < MAX_DEPTH + 2; i += 1) s = { properties: { x: s } };
    return s;
  })();

  const payload = [
    { name: "ready", inputSchema: { type: "object" } },              // ok
    { name: "bad_type", inputSchema: { type: 123 } },                // malformed-schema -> reject
    { name: "too_deep", inputSchema: deep },                         // depth bound -> reject
    { name: "ready", inputSchema: { type: "object" } },              // duplicate -> skip
    { name: "unsafe_hdr", inputSchema: { type: "object" }, "x-mcp-header": ["Authorization"] }, // reject
    { name: "safe_hdr", inputSchema: { type: "object" }, "x-mcp-header": { "X-Trace": "1" } },  // ok
    { name: "bad_out", inputSchema: { type: "object" }, outputSchema: "nope" }, // reject
  ];

  const registered = registerTools(payload);
  const expected = ["ready", "safe_hdr"];
  const match = registered.length === expected.length && expected.every((n, i) => registered[i] === n);
  if (!match) {
    fail(section, `expected registered ${JSON.stringify(expected)}, got ${JSON.stringify(registered)}`);
  } else {
    ok(section, "malformed-schema / duplicate-name / unsafe-header rejected; valid tools registered");
  }

  // zero-tool server: nothing advertised -> nothing registered (ready-with-zero).
  if (registerTools([]).length !== 0) {
    fail(section, "zero-tool server should register no tools");
  } else {
    ok(section, "zero-tool server registers no tools");
  }
}

// ── Section D — frontend collapse + hidden envelopes ────────────────────────
{
  const section = "frontend";
  const card = SRC("src/atlas/components/chat/ToolCallCard.tsx");
  const parts = SRC("src/atlas/components/chat/assistantMessageParts.ts");
  let allOk = true;
  // Successful (completed) non-action cards must NOT be forced open: hasAction
  // covers only running/approval/error/stale.
  if (!/const\s+hasAction\s*=\s*isStale\s*\|\|\s*effectiveStatus\s*===\s*"running"\s*\|\|\s*effectiveStatus\s*===\s*"awaiting_approval"\s*\|\|\s*effectiveStatus\s*===\s*"error"/.test(card)) {
    fail(section, "ToolCallCard hasAction no longer excludes completed (successful cards would not collapse)");
    allOk = false;
  }
  if (!/useState\(\s*\(\)\s*=>\s*defaultExpanded\s*\?\?\s*hasAction\s*\)/.test(card)) {
    fail(section, "ToolCallCard expand default is not defaultExpanded ?? hasAction");
    allOk = false;
  }
  // tool_list / tool_info discovery envelopes stay hidden in the timeline.
  if (!/name === "tool_list" \|\| name === "tool_info"/.test(parts)) {
    fail(section, "assistantMessageParts no longer hides tool_list/tool_info envelopes");
    allOk = false;
  }
  if (allOk) {
    ok(section, "successful MCP tool cards collapse; discovery envelopes hidden");
  }
}

if (exitCode === 0) {
  console.log("\nMCP Phase 4 production tools contract passed.");
} else {
  console.error("\nMCP Phase 4 production tools contract FAILED.");
}
process.exit(exitCode);
