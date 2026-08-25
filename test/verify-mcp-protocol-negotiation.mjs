#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
// `client.rs` was split into a `client/` module dir; concatenate every file so
// symbol-shape assertions survive wherever a symbol landed post-split.
const clientDir = new URL("../src-tauri/crates/zen-mcp/src/client/", import.meta.url);
const readClientModule = () =>
  readdirSync(clientDir)
    .filter((f) => f.endsWith(".rs"))
    .map((f) => readFileSync(new URL(f, clientDir), "utf8"))
    .join("\n");
const types = read("src-tauri/crates/zen-mcp/src/types.rs");
const client = readClientModule();
const stdio = read("src-tauri/crates/zen-mcp/src/client/stdio_helpers.rs");
const discovery = read("src-tauri/crates/zen-mcp/src/discovery.rs");

assert.match(types, /MODERN_PROTOCOL_VERSION\s*:\s*&str\s*=\s*"2026-07-28"/);
assert.match(types, /DISCOVER\s*:\s*&str\s*=\s*"server\/discover"/);
assert.match(types, /HEADER_METHOD\s*:\s*&str\s*=\s*"Mcp-Method"/);
assert.match(types, /HEADER_NAME\s*:\s*&str\s*=\s*"Mcp-Name"/);
assert.match(types, /pub fn modern_request_meta/);
assert.match(types, /io\.modelcontextprotocol\/protocolVersion/);

assert.match(client, /async fn discover_http_server/);
assert.match(client, /methods::DISCOVER/);
assert.match(client, /Ok\(None\)/);
assert.match(client, /Self::initialize_server\(&client, url, headers, timeout\)/);
assert.match(client, /modern: true/);
assert.match(client, /modern: false/);
assert.match(client, /if !http_endpoint\.modern/);
assert.match(client, /McpCapabilitySummary/);
assert.match(client, /endpoint_capabilities/);
assert.match(client, /target_url = if endpoint\.modern \{ &endpoint\.url \} else \{ tools_url \}/);
assert.match(client, /Some\(HEADER_METHOD|HEADER_METHOD/);
assert.match(client, /Some\(HEADER_NAME|HEADER_NAME/);
assert.match(client, /next_http_request_id/);

assert.match(stdio, /send_request\(methods::DISCOVER/);
assert.match(stdio, /is_legacy_probe_error/);
assert.match(stdio, /using legacy initialize/);
assert.match(stdio, /modern: true/);
assert.match(stdio, /modern: false/);
assert.match(stdio, /modern_request_meta/);

assert.match(discovery, /modern_2026/);
assert.match(discovery, /legacy_2025/);

console.log("MCP Phase 1 protocol negotiation contract passed.");
