import assert from 'node:assert/strict';
import fs from 'node:fs';

// `client.rs` was split into a `client/` module directory; concatenate every
// file so the security-shape assertions survive the split.
const clientDir = new URL('../src-tauri/src/mcp/client/', import.meta.url);
const client = fs
  .readdirSync(clientDir)
  .filter((f) => f.endsWith('.rs'))
  .map((f) => fs.readFileSync(new URL(f, clientDir), 'utf8'))
  .join('\n');
const config = fs.readFileSync('src-tauri/src/services/mcp_config.rs', 'utf8');
const safety = fs.readFileSync('src-tauri/src/tools/url_safety.rs', 'utf8');
const plan = fs.readFileSync('docs/architecture/mcp-phase-plan.md', 'utf8');

assert.match(client, /build_pinned_http_client/);
assert.match(client, /validate_mcp_endpoint_url/);
assert.match(client, /audit_mcp_connection/);
assert.match(client, /PermissionDecision::Deny/);
assert.match(client, /ZEN_MCP_ALLOW_INSECURE_HTTP/);
assert.match(config, /raw secrets are not persisted/);
assert.match(config, /is_reserved_mcp_header/);
assert.match(config, /target\.remove\(key\)/);
assert.match(safety, /redirect\(reqwest::redirect::Policy::none\(\)\)/);
assert.match(safety, /\.resolve\(host, pinned_addr\)/);
assert.match(safety, /validate_public_ip\(addr\.ip\(\)\)/);
assert.match(plan, /Phase 3 — Security, authorization, and consent/);
assert.match(plan, /backend URL validation/);

console.log('MCP Phase 3 security contract verified');
