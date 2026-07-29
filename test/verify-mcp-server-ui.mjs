#!/usr/bin/env node
/**
 * Verifier — typed MCP external server settings UI.
 *
 * Asserts the wire contract between:
 *   - src/api/mcpApi.ts           (typed TS API + listener)
 *   - src-tauri/src/commands/mcp.rs (4 new Tauri commands)
 *   - src-tauri/src/services/mcp_config.rs (typed add/remove/list helpers)
 *   - src-tauri/src/tools/mod.rs   (ToolRegistry::remove_by_prefix helper)
 *   - src-tauri/src/mcp/client.rs  (sync_lock + clear-adapters + status events)
 *   - src-tauri/src/lib.rs         (commands registered + boot caller)
 *   - src/components/settings/Tabs/plugins/MCPExternalServers.tsx (typed cards)
 *   - src/components/settings/Tabs/plugins/MCPSettings.tsx (event subscriber)
 *
 * Run: `node test/verify-mcp-server-ui.mjs`.
 * Each section reports pass/fail; exit 0 iff every section passes.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

let failed = 0;
const section = (label, fn) => {
  const ok = fn();
  if (ok) {
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
  return ok;
};

console.log('MCP server settings UI verifier\n');

// Note: the verifier intentionally lives alongside verify-mcp-tool-adapter
// and verify-mcp-annotation-mapping; both target the same surface so this
// split keeps each script small and runnable on its own.

// ─── Section A: src/api/mcpApi.ts ───────────────────────────────
console.log('A. src/api/mcpApi.ts — typed entries + listener');
(() => {
  const src = read('src/api/mcpApi.ts');
  section('Exports McpServerEntry interface with transport-aware fields', () => {
    const m = src.match(/export\s+interface\s+McpServerEntry\s*\{[^}]*\}/);
    if (!m) return false;
    return (
      /name:\s*string/.test(m[0]) &&
      /transport:\s*McpTransport/.test(m[0]) &&
      /url\?:\s*string/.test(m[0]) &&
      /command\?:\s*string/.test(m[0])
    );
  });
  section('Exports McpTransport type union (http | stdio)', () => {
    const m = src.match(/export\s+type\s+McpTransport\s*=\s*([^;]+);/);
    if (!m) return false;
    return m[1].includes('"http"') && m[1].includes('"stdio"');
  });
  section('Exports McpServerStatus type union', () => {
    const m = src.match(/export\s+type\s+McpServerStatus\s*=\s*([^;]+);/);
    if (!m) return false;
    return ['reconnecting', 'connected', 'failed']
      .map((s) => m[1].includes(`"${s}"`))
      .every(Boolean);
  });
  section('Exports McpServerStatusEvent interface', () => {
    const m = src.match(/export\s+interface\s+McpServerStatusEvent\s*\{[^}]*\}/);
    if (!m) return false;
    return /name:\s*string/.test(m[0]) && /status:\s*McpServerStatus/.test(m[0]);
  });
  section('mcpApi.listServers wraps mcp_list_servers', () => {
    const m = src.match(/listServers:\s*\([^)]*\)\s*=>\s*[^,]+,/);
    return !!m && /mcp_list_servers/.test(m[0]);
  });
  section('mcpApi.addServer wraps mcp_add_server', () => {
    return (
      /addServer:\s*\(/.test(src) &&
      /callCommand<void>\(\s*"mcp_add_server"/.test(src)
    );
  });
  section('mcpApi.removeServer wraps mcp_remove_server', () => {
    return (
      /removeServer:\s*\(/.test(src) &&
      /callCommand<boolean>\(\s*"mcp_remove_server"/.test(src)
    );
  });
  section('mcpApi.reconnect wraps mcp_reconnect', () => {
    return (
      /reconnect:\s*\(\s*\)\s*=>/.test(src) &&
      /callCommand<void>\(\s*"mcp_reconnect"/.test(src)
    );
  });
  section('mcpApi.subscribeServerStatus forwards mcp:server:status payload', () => {
    return (
      /subscribeServerStatus/.test(src) &&
      /listen<McpServerStatusEvent>\(\s*"mcp:server:status"/.test(src)
    );
  });
})();

// ─── Section B: src-tauri/src/commands/mcp.rs ────────────────────
console.log('\nB. src-tauri/src/commands/mcp.rs — typed commands');
(() => {
  const src = read('src-tauri/src/commands/mcp.rs');
  // Anchor every per-function assertion on `pub async fn mcp_X` rather
  // than on `#\[tauri::command\]` (which risks swallowing the previous
  // command's body via non-greedy back-reference).
  const fnBody = (name) =>
    src.match(
      new RegExp(`pub\\s+async\\s+fn\\s+${name}[\\s\\S]*?\\n\\}`),
    );

  section('mcp_list_servers returns Vec<McpServerEntry>', () => {
    const m = fnBody('mcp_list_servers');
    return !!m && /Vec<McpServerEntry>/.test(m[0]);
  });
  section('mcp_add_server(name, url) triggers background sync', () => {
    const m = fnBody('mcp_add_server');
    if (!m) return false;
    return (
      /name:\s*String/.test(m[0]) &&
      /url:\s*String/.test(m[0]) &&
      /\.add_server\(\s*&name,\s*&url\s*\)/.test(m[0]) &&
      /tokio::spawn[\s\S]*?sync_external_servers\(\s*Some\(&app\)/.test(m[0])
    );
  });
  section('mcp_remove_server returns bool and skips sync when not removed', () => {
    const m = fnBody('mcp_remove_server');
    if (!m) return false;
    return (
      /->\s*ZenResult<bool>/.test(m[0]) &&
      /\.remove_server\(\s*&name\s*\)/.test(m[0]) &&
      // Only fires sync when removal actually happened.
      /if\s+removed\s*\{[\s\S]*?sync_external_servers\(\s*Some\(&app\)/.test(m[0])
    );
  });
  section('mcp_reconnect spawns sync without mutating config', () => {
    const m = fnBody('mcp_reconnect');
    if (!m) return false;
    return (
      /client\.sync_external_servers\(\s*Some\(&app\)/.test(m[0]) &&
      // Must NOT touch mcp_config for a reconnect.
      !/\.add_server\(|\.remove_server\(/.test(m[0])
    );
  });
  section('McpServerEntry is imported via crate::services', () => {
    return /use\s+crate::services::McpServerEntry/.test(src);
  });
})();

// ─── Section C: src-tauri/src/services/mcp_config.rs ────────────
console.log('\nC. src-tauri/src/services/mcp_config.rs — typed helpers');
(() => {
  const src = read('src-tauri/src/services/mcp_config.rs');
  section('McpServerEntry struct exists with transport + optional url/command/args', () => {
    const m = src.match(/pub\s+struct\s+McpServerEntry\s*\{[^}]*\}/);
    if (!m) return false;
    return (
      /pub\s+name:\s*String/.test(m[0]) &&
      /pub\s+transport:\s*McpTransport/.test(m[0]) &&
      /pub\s+url:\s*Option<String>/.test(m[0]) &&
      /pub\s+command:\s*Option<String>/.test(m[0])
    );
  });
  section('McpTransport enum exists with Http and Stdio variants', () => {
    const m = src.match(/pub\s+enum\s+McpTransport\s*\{[^}]*\}/);
    if (!m) return false;
    return /Http/.test(m[0]) && /Stdio/.test(m[0]);
  });
  section('list_servers surfaces both HTTP (url) and stdio (command) entries', () => {
    return (
      /pub\s+async\s+fn\s+list_servers/.test(src) &&
      /\.get\("url"\)\.and_then\(\|v\|\s*v\.as_str\(\)\)/.test(src) &&
      /\.get\("command"\)\.and_then\(\|v\|\s*v\.as_str\(\)\)/.test(src)
    );
  });
  section('add_server rejects empty name and empty url', () => {
    return (
      /MCP server name must not be empty/.test(src) &&
      /MCP server url must not be empty/.test(src)
    );
  });
  section('add_server upserts without dropping sibling fields', () => {
    return (
      /or_insert_with\(\|\|\s*serde_json::json!\(\{\}\)\)/.test(src) &&
      /obj\.insert\("url"\.to_string\(\),\s*serde_json::Value::String\(url\.to_string\(\)\)\)/.test(src)
    );
  });
  section('remove_server returns bool and skips rewrite when nothing changed', () => {
    return (
      /pub\s+async\s+fn\s+remove_server[\s\S]*?->\s*Result<bool, McpConfigError>/.test(src) &&
      /pub\s+async\s+fn\s+remove_server[\s\S]*?return\s+Ok\(false\)/.test(src)
    );
  });
  section('remove_server uses serde_json::Map::remove to drop the entry', () => {
    // `serde_json::Map` exposes `remove` returning Option<Value>;
    // `shift_remove` returns the (key, value) pair. We use whichever
    // is consistent with the running serde_json version's API.
    return /\.remove\(name\)\.is_some\(\)/.test(src);
  });
})();

// ─── Section D: src-tauri/src/tools/mod.rs ────────────────────────
console.log('\nD. src-tauri/src/tools/mod.rs — remove_by_prefix helper');
(() => {
  const src = read('src-tauri/src/tools/mod.rs');
  section('ToolRegistry::remove_by_prefix exists', () => {
    return (
      /pub\s+fn\s+remove_by_prefix\s*\(\s*&mut\s*self,\s*prefix:\s*&str\s*\)\s*->\s*usize/.test(
        src,
      )
    );
  });
  section('remove_by_prefix clears tools, risks, and definitions by prefix', () => {
    return (
      /self\.tools\.remove\(name\)/.test(src) &&
      /self\.known_tool_risks\.remove\(name\)/.test(src) &&
      /self\.known_tool_definitions\.remove\(name\)/.test(src)
    );
  });
})();

// ─── Section E: src-tauri/src/mcp/client.rs ───────────────────────
console.log('\nE. src-tauri/src/mcp/client.rs — sync lock + status events');
(() => {
  const src = read('src-tauri/src/mcp/client.rs');
  section('McpClient struct owns Arc<Mutex<()>> sync_lock', () => {
    return /sync_lock:\s*Arc<Mutex<\(\)>>/.test(src);
  });
  section('sync_lock initialized in McpClient::new', () => {
    return (
      /impl\s+McpClient\s*\{[\s\S]*?sync_lock:\s*Arc::new\(\s*Mutex::new\(\(\)[^)]*\)/.test(src)
    );
  });
  section('sync_external_servers takes Option<&AppHandle>', () => {
    return (
      /pub\s+async\s+fn\s+sync_external_servers\(\s*self:\s*&Arc<Self>,\s*app:\s*Option<&AppHandle>\s*\)/.test(
        src,
      )
    );
  });
  section(
    'sync_external_servers acquires sync_lock and wipes ext:* adapters first',
    () => {
      return (
        /let\s+_guard\s*=\s*self\.sync_lock\.lock\(\)\.await/.test(src) &&
        /registry\.remove_by_prefix\("ext:"\)/.test(src)
      );
    },
  );
  section('emit_server_status helper exists with app: Option<&AppHandle>', () => {
    return (
      /fn\s+emit_server_status\(\s*\n?\s*app:\s*Option<&AppHandle>/.test(src) &&
      /app\.emit\("mcp:server:status"/.test(src)
    );
  });
  section('status payload includes name + status + optional error', () => {
    return (
      /"name":\s*name/.test(src) &&
      /"status":\s*status/.test(src) &&
      /payload\["error"\]\s*=\s*serde_json::Value::String\(e\)/.test(src)
    );
  });
  section('servers emit reconnecting/connected/failed spanning the loop', () => {
    // Count distinct call sites by scanning for the literal name string.
    const calls = (src.match(/emit_server_status\(/g) || []).length;
    // bootstrap + 5 in-loop emit call sites = at least 6.
    return calls >= 6;
  });
})();

// ─── Section F: src-tauri/src/lib.rs ──────────────────────────────
console.log('\nF. src-tauri/src/lib.rs — command registration + boot caller');
(() => {
  const src = read('src-tauri/src/lib.rs');
  section('invoke_handler registers all 4 new commands', () => {
    return (
      /commands::mcp::mcp_list_servers/.test(src) &&
      /commands::mcp::mcp_add_server/.test(src) &&
      /commands::mcp::mcp_remove_server/.test(src) &&
      /commands::mcp::mcp_reconnect/.test(src)
    );
  });
  section('boot caller passes None to sync_external_servers', () => {
    // Tolerant whitespace across lines.
    return /client\.sync_external_servers\(\s*None\s*\)\.await/.test(src);
  });
})();

// ─── Section G: MCPExternalServers.tsx — typed cards ─────────────
console.log('\nG. MCPExternalServers.tsx — typed list-of-cards UI');
(() => {
  const src = read('src/components/settings/Tabs/plugins/MCPExternalServers.tsx');
  section('No <textarea> editor remains (raw JSON has been retired)', () => {
    return !/<textarea\b/i.test(src);
  });
  section('Receives typed McpServerEntry[] + statusMap props', () => {
    return (
      /interface\s+Props\s*\{[^}]*\}/.test(src) &&
      /servers:\s*McpServerEntry\[\]/.test(src) &&
      /statusMap:\s*Record<string,\s*McpServerStatusEvent>/.test(src)
    );
  });
  section('Renders per-row name + endpoint display + status pill', () => {
    return /server\.name/.test(src) && /endpointDisplay/.test(src) && /StatusPill/.test(src);
  });
  section('Displays transport badge (HTTP / stdio) per row', () => {
    return /TRANSPORT_LABEL/.test(src) && /TRANSPORT_ICON/.test(src);
  });
  section('Includes Add MCP Server and Reconnect All buttons', () => {
    return /Add MCP Server/.test(src) && /Reconnect All/.test(src);
  });
})();

// ─── Section H: MCPSettings.tsx — event subscriber ───────────────
console.log('\nH. MCPSettings.tsx — wires typed UI + mcp:server:status events');
(() => {
  const src = read('src/components/settings/Tabs/plugins/MCPSettings.tsx');
  section('No more legacy JSON textarea path (uses listServers not getConfig-by-string)', () => {
    return !/JSON\.parse\(configText\)/.test(src) && /mcpApi\.listServers/.test(src);
  });
  section('Subscribes to mcp:server:status via subscribeServerStatus', () => {
    return /mcpApi\s*\.\s*subscribeServerStatus\s*\(/.test(src);
  });
  section('Wires add/remove/reconnect into typed handlers', () => {
    return (
      /handleAdd[\s\S]*?await\s+mcpApi\.addServer/.test(src) &&
      /handleRemove[\s\S]*?await\s+mcpApi\.removeServer/.test(src) &&
      /handleReconnect[\s\S]*?await\s+mcpApi\.reconnect/.test(src)
    );
  });
})();

// ─── Section I: Runtime contract — wire shape agreement ─────────
console.log('\nI. Runtime wire contract');
(() => {
  const ts = read('src/api/mcpApi.ts');
  const rs = read('src-tauri/src/mcp/client.rs');
  section(
    'Event payload { name, status, error? } agrees between TS and Rust',
    () => {
      // TS declares name, status, optional error.
      const tsShape =
        /name:\s*string/.test(ts) &&
        /status:\s*McpServerStatus/.test(ts) &&
        /error\?:\s*string/.test(ts);
      // Rust emits exactly those three keys (error only when Some).
      const rsShape =
        /"name":\s*name/.test(rs) && /"status":\s*status/.test(rs) && /payload\["error"\]/.test(rs);
      return tsShape && rsShape;
    },
  );
  section('Status values match exactly: reconnecting / connected / failed', () => {
    // TS union invariant:
    const tsUnion = /"reconnecting"/.test(ts) && /"connected"/.test(ts) && /"failed"/.test(ts);
    // Rust emit helper only knows the same three.
    const rsCallSites = rs.match(/emit_server_status\([^)]*?\)/g) || [];
    const rsStatusValues = rsCallSites
      .flatMap((s) => s.match(/"(reconnecting|connected|failed)"/g) || [])
      .map((s) => s.replace(/"/g, ''));
    const allValid = rsStatusValues.every((v) =>
      ['reconnecting', 'connected', 'failed'].includes(v),
    );
    return tsUnion && allValid && rsStatusValues.length >= 6;
  });
})();

// ─── Summary ─────────────────────────────────────────────────────
console.log('');
if (failed === 0) {
  console.log('All sections passed.');
  process.exit(0);
} else {
  console.error(`${failed} section(s) failed.`);
  process.exit(1);
}
