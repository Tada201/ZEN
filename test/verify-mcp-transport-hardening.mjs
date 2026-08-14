#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const http = read("src-tauri/src/mcp/client/http_body.rs");
// `client.rs` was split into a `client/` module dir; concatenate every file so
// symbol-shape assertions survive wherever a symbol landed post-split.
const clientDir = new URL("../src-tauri/src/mcp/client/", import.meta.url);
const client = readdirSync(clientDir)
  .filter((f) => f.endsWith(".rs"))
  .map((f) => readFileSync(new URL(f, clientDir), "utf8"))
  .join("\n");
const stdio = read("src-tauri/src/mcp/stdio.rs");

assert.match(http, /MAX_RPC_BODY_BYTES\s*:\s*usize\s*=\s*2\s*\*\s*1024\s*\*\s*1024/);
assert.match(http, /bytes_stream\(\)/);
assert.match(http, /response body exceeds/);
assert.match(http, /event-stream exceeds 256 event limit/);

assert.match(client, /inputSchema/);
assert.match(client, /input_schema/);
assert.match(client, /outputSchema/);
assert.match(client, /output_schema/);
assert.match(client, /if endpoint\.modern \{ &endpoint\.url \} else \{ tools_url \}/);
assert.match(client, /if endpoint\.modern \{ &endpoint\.url \} else \{ &call_url \}/);
assert.match(client, /modern_http_uses_one_endpoint_for_discovery_and_tools/);

assert.match(stdio, /MAX_STDIO_MESSAGE_BYTES\s*:\s*usize\s*=\s*2\s*\*\s*1024\s*\*\s*1024/);
assert.match(stdio, /send_request_cancelable/);
assert.match(stdio, /notifications\/cancelled/);
assert.match(stdio, /message exceeds size limit/);
assert.match(stdio, /pending\.remove\(&id\)/);

console.log("MCP Phase 2 transport hardening contract passed.");
