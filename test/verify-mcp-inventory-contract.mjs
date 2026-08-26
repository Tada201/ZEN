#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const discovery = read("src-tauri/crates/zen-mcp/src/discovery.rs");
const command = read("src-tauri/src/commands/mcp.rs");
const appState = read("src-tauri/src/commands/mod.rs");
const lib = read("src-tauri/src/lib.rs");
const prompt = read("src-tauri/crates/zen-agent/src/middleware/system_prompt.rs");
const api = read("src/api/mcpApi.ts");
const mock = read("src/api/mockClient.ts");
const manager = read("src-tauri/crates/zen-tools/src/manager.rs");
const settings = read("src/components/settings/Tabs/plugins/MCPSettings.tsx");

assert.match(discovery, /pub struct McpDiscoveryService/);
assert.match(discovery, /pub struct McpServerRecord/);
assert.match(discovery, /pub struct McpInventory/);
assert.match(discovery, /MAX_INVENTORY_SERVERS/);
assert.match(discovery, /No configured MCP servers/);
assert.match(discovery, /safe_error_code/);
assert.match(discovery, /authentication_failed/);
assert.match(discovery, /prompt_redacts_control_characters/);

assert.match(command, /pub async fn mcp_get_inventory/);
assert.match(command, /McpInventory/);
assert.match(appState, /pub mcp_discovery: Arc<zen_mcp::McpDiscoveryService>/);
assert.match(appState, /McpDiscoveryService::new\(mcp_config\.clone\(\)\)/);
assert.match(lib, /commands::mcp::mcp_get_inventory/);

assert.match(prompt, /Authoritative MCP inventory/);
assert.match(prompt, /self\.ctx\.mcp_discovery\.refresh\(\)\.await/);
assert.match(prompt, /Only `ready` MCP servers may be used/);
assert.match(prompt, /Never invent a server, command, tool ID, URL, or argument/);

assert.match(api, /export interface McpServerRecord/);
assert.match(api, /revision: number/);
assert.match(api, /getInventory:.*mcp_get_inventory/s);
assert.match(api, /subscribeInventory/);
assert.match(api, /mcp:inventory/);
assert.match(mock, /mcp_get_inventory: \(\) => \(\{ revision: 0, servers: \[\] \}\)/);

assert.match(manager, /pub origin: Option<String>/);
assert.match(manager, /descriptor\.origin = Some\("mcp"\.to_string\(\)\)/);
assert.match(manager, /descriptor\.server_name/);
assert.match(settings, /subscribeInventory/);
assert.match(settings, /inventoryRevisionRef/);
assert.match(settings, /record\.availability === 'configured'/);

console.log("MCP Phase 0 inventory contract passed.");
