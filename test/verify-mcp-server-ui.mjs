#!/usr/bin/env node
/**
 * Verifier — typed MCP external server settings UI (scope + CRUD contract).
 *
 * Asserts the wire contract between:
 *   - src/api/mcpApi.ts             (typed TS API + status listener)
 *   - src-tauri/src/commands/mcp.rs (scope-aware upsert/set_enabled/remove/reconnect)
 *   - src-tauri/crates/zen-mcp/src/config.rs (typed scope + CRUD helpers)
 *   - src-tauri/src/tools/mod.rs    (ToolRegistry::remove_by_prefix helper)
 *   - src-tauri/crates/zen-mcp/src/client/*.rs (sync_lock + clear-adapters + status events)
 *   - src-tauri/src/lib.rs          (commands registered + boot caller)
 *   - src/components/settings/Tabs/plugins/McpServerRow.tsx  (typed row)
 *   - src/components/settings/Tabs/plugins/McpServerForm.tsx (add/edit form)
 *   - src/components/settings/Tabs/plugins/MCPSettings.tsx   (event subscriber)
 *
 * This is a behavior/contract verifier: it targets the CRUD wire shape and the
 * status-event contract, not source-file paths. `client.rs` was split into a
 * `client/` module dir, so the Rust client is read by concatenating every
 * `client/*.rs` file — the assertions survive future re-splits of that module.
 *
 * Run: `node test/verify-mcp-server-ui.mjs`.
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
/** Concatenate every file in a directory matching `filter` (the client module
 *  is split across many files; join them so symbol asserts don't care where a
 *  symbol landed). Normalizes CRLF so regexes are line-ending agnostic. */
function readDirConcat(relDir, filter = () => true) {
  const dir = path.join(ROOT, relDir);
  return fs
    .readdirSync(dir)
    .filter(filter)
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n')
    .replace(/\r\n/g, '\n');
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

// ─── Section A: src/api/mcpApi.ts ───────────────────────────────
console.log('A. src/api/mcpApi.ts — typed entries + scope CRUD + listener');
(() => {
  const src = read('src/api/mcpApi.ts');
  section('Exports McpServerEntry interface with scope + transport-aware fields', () => {
    const m = src.match(/export\s+interface\s+McpServerEntry\s*\{[^}]*\}/);
    if (!m) return false;
    return (
      /name:\s*string/.test(m[0]) &&
      /scope:\s*McpScope/.test(m[0]) &&
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
  section('Exports McpScope type union (user | workspace)', () => {
    const m = src.match(/export\s+type\s+McpScope\s*=\s*([^;]+);/);
    if (!m) return false;
    return m[1].includes('"user"') && m[1].includes('"workspace"');
  });
  section('Exports McpServerStatus type union', () => {
    const m = src.match(/export\s+type\s+McpServerStatus\s*=\s*([\s\S]*?);/);
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
    return /listServers:\s*\([^)]*\)\s*=>[\s\S]*?mcp_list_servers/.test(src);
  });
  section('mcpApi.upsertServer(scope, name, config) wraps mcp_upsert_server', () => {
    return (
      /upsertServer:\s*\(\s*scope:\s*McpScope,\s*name:\s*string,\s*config:/.test(src) &&
      /callCommand<void>\(\s*"mcp_upsert_server"/.test(src)
    );
  });
  section('mcpApi.setEnabled(scope, name, enabled) wraps mcp_set_enabled', () => {
    return (
      /setEnabled:\s*\(\s*scope:\s*McpScope,\s*name:\s*string,\s*enabled:\s*boolean\s*\)/.test(
        src,
      ) && /callCommand<boolean>\(\s*"mcp_set_enabled"/.test(src)
    );
  });
  section('mcpApi.removeServer(scope, name) wraps mcp_remove_server', () => {
    return (
      /removeServer:\s*\(\s*scope:\s*McpScope,\s*name:\s*string\s*\)/.test(src) &&
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
  section('Retired addServer / mcp_add_server surface is fully gone', () => {
    return !/\baddServer\b/.test(src) && !/mcp_add_server/.test(src);
  });
})();

// ─── Section B: src-tauri/src/commands/mcp.rs ────────────────────
console.log('\nB. src-tauri/src/commands/mcp.rs — scope-aware commands');
(() => {
  const src = read('src-tauri/src/commands/mcp.rs');
  const fnBody = (name) =>
    src.match(new RegExp(`pub\\s+async\\s+fn\\s+${name}[\\s\\S]*?\\n\\}`));

  section('mcp_list_servers returns Vec<McpServerEntry>', () => {
    const m = fnBody('mcp_list_servers');
    return !!m && /Vec<McpServerEntry>/.test(m[0]);
  });
  section('mcp_upsert_server(scope, name, config) triggers background sync', () => {
    const m = fnBody('mcp_upsert_server');
    if (!m) return false;
    return (
      /scope:\s*McpScope/.test(m[0]) &&
      /name:\s*String/.test(m[0]) &&
      /config:\s*Value/.test(m[0]) &&
      /\.upsert_server\(\s*scope,\s*&name,\s*config\s*\)/.test(m[0]) &&
      /tokio::spawn[\s\S]*?sync_external_servers\(\s*Some\(&ui\)/.test(m[0])
    );
  });
  section('mcp_set_enabled returns bool and re-syncs only when the row existed', () => {
    const m = fnBody('mcp_set_enabled');
    if (!m) return false;
    return (
      /->\s*ZenResult<bool>/.test(m[0]) &&
      /\.set_enabled\(\s*scope,\s*&name,\s*enabled\s*\)/.test(m[0]) &&
      /if\s+existed\s*\{[\s\S]*?sync_external_servers\(\s*Some\(&ui\)/.test(m[0])
    );
  });
  section('mcp_remove_server returns bool and skips sync when not removed', () => {
    const m = fnBody('mcp_remove_server');
    if (!m) return false;
    return (
      /->\s*ZenResult<bool>/.test(m[0]) &&
      /\.remove_server\(\s*scope,\s*&name\s*\)/.test(m[0]) &&
      /if\s+removed\s*\{[\s\S]*?sync_external_servers\(\s*Some\(&ui\)/.test(m[0])
    );
  });
  section('mcp_reconnect spawns sync without mutating config', () => {
    const m = fnBody('mcp_reconnect');
    if (!m) return false;
    return (
      /client\.sync_external_servers\(\s*Some\(&ui\)/.test(m[0]) &&
      !/\.upsert_server\(|\.remove_server\(|\.set_enabled\(/.test(m[0])
    );
  });
  section('McpScope + McpServerEntry are imported from zen_mcp', () => {
    return (
      /use\s+zen_mcp::\{[^}]*McpScope[^}]*\}/.test(src) &&
      /use\s+zen_mcp::\{[^}]*McpServerEntry[^}]*\}/.test(src)
    );
  });
})();

// ─── Section C: src-tauri/crates/zen-mcp/src/config.rs ────────────
console.log('\nC. src-tauri/crates/zen-mcp/src/config.rs — scope + typed CRUD');
(() => {
  const src = read('src-tauri/crates/zen-mcp/src/config.rs');
  section('McpScope enum exists with User and Workspace variants', () => {
    const m = src.match(/pub\s+enum\s+McpScope\s*\{[^}]*\}/);
    if (!m) return false;
    return /User/.test(m[0]) && /Workspace/.test(m[0]);
  });
  section('McpServerEntry struct has scope + transport + optional url/command', () => {
    const m = src.match(/pub\s+struct\s+McpServerEntry\s*\{[\s\S]*?\n\}/);
    if (!m) return false;
    return (
      /pub\s+name:\s*String/.test(m[0]) &&
      /pub\s+scope:\s*McpScope/.test(m[0]) &&
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
  section('list_servers merges both scopes (Workspace overrides User)', () => {
    return (
      /pub\s+async\s+fn\s+list_servers/.test(src) &&
      /McpScope::MERGE_ORDER/.test(src) &&
      /merged\.insert\(entry\.name\.clone\(\),\s*entry\)/.test(src)
    );
  });
  section('parse surfaces both HTTP (url) and stdio (command) entries', () => {
    return (
      /obj\.get\("url"\)\.and_then\(\|v\|\s*v\.as_str\(\)\)/.test(src) &&
      /obj\.get\("command"\)\.and_then\(\|v\|\s*v\.as_str\(\)\)/.test(src)
    );
  });
  section('upsert_server(scope, name, entry) rejects an empty name', () => {
    return (
      /pub\s+async\s+fn\s+upsert_server\(\s*[\s\S]*?scope:\s*McpScope,\s*name:\s*&str,\s*entry:\s*Value/.test(
        src,
      ) && /MCP server name must not be empty/.test(src)
    );
  });
  section('validate_entry requires a usable url (http) or command (stdio)', () => {
    return /entry needs a non-empty 'url' \(http\) or 'command' \(stdio\)/.test(src);
  });
  section('validate rejects raw secrets — env refs only are persisted', () => {
    return (
      /must use an environment reference; raw secrets are not persisted/.test(src) &&
      /fn\s+contains_secret_reference/.test(src)
    );
  });
  section('upsert merges onto the existing entry so siblings survive', () => {
    return /\.or_insert_with\(\|\|\s*Value::Object\(Map::new\(\)\)\)/.test(src);
  });
  section('set_enabled(scope, name, bool) toggles the disabled flag', () => {
    return (
      /pub\s+async\s+fn\s+set_enabled\(\s*[\s\S]*?scope:\s*McpScope,\s*name:\s*&str,\s*enabled:\s*bool/.test(
        src,
      ) &&
      /entry\.remove\("disabled"\)/.test(src) &&
      /entry\.insert\("disabled"\.to_string\(\),\s*Value::Bool\(true\)\)/.test(src)
    );
  });
  section('remove_server(scope, name) returns bool and skips a no-op rewrite', () => {
    return (
      /pub\s+async\s+fn\s+remove_server\(\s*&self,\s*scope:\s*McpScope,\s*name:\s*&str\s*\)\s*->\s*Result<bool, McpConfigError>/.test(
        src,
      ) &&
      /servers\.remove\(name\)\.is_some\(\)/.test(src) &&
      /if\s+!removed\s*\{\s*return\s+Ok\(false\)/.test(src)
    );
  });
})();

// ─── Section D: src-tauri/crates/zen-tools/src/registry.rs ────────
console.log('\nD. src-tauri/crates/zen-tools/src/registry.rs — remove_by_prefix helper');
(() => {
  // The canonical registry moved into the zen-tools crate; `src/tools/mod.rs` is
  // now the app-side wiring shim.
  const src = read('src-tauri/crates/zen-tools/src/registry.rs');
  section('ToolRegistry::remove_by_prefix exists', () => {
    return /pub\s+fn\s+remove_by_prefix\s*\(\s*&mut\s*self,\s*prefix:\s*&str\s*\)\s*->\s*usize/.test(
      src,
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

// ─── Section E: src-tauri/crates/zen-mcp/src/client/*.rs ─────────────────────
console.log('\nE. src-tauri/crates/zen-mcp/src/client/ — sync lock + status events');
(() => {
  // client.rs was split into a module dir; concatenate every *.rs so these
  // structural asserts survive where each symbol physically lives. The `ext:*`
  // wipe itself now runs through the app-side registrar port, so read that too.
  const src =
    readDirConcat('src-tauri/crates/zen-mcp/src/client', (f) => f.endsWith('.rs')) +
    '\n' +
    read('src-tauri/src/services/mcp_registrar.rs');
  section('McpClient struct owns Arc<Mutex<()>> sync_lock', () => {
    return /sync_lock:\s*Arc<Mutex<\(\)>>/.test(src);
  });
  section('sync_lock initialized in McpClient::new', () => {
    return /sync_lock:\s*Arc::new\(\s*Mutex::new\(\(\)\s*\)\s*\)/.test(src);
  });
  section('sync_external_servers takes an optional UI bridge', () => {
    // The crate cannot depend on tauri, so the AppHandle was replaced by the
    // `UiBridge` port (event sink + browser opener) during the extraction.
    return /pub\s+async\s+fn\s+sync_external_servers\(\s*self:\s*&Arc<Self>,\s*ui:\s*Option<&crate::ui::UiBridge>\s*\)/.test(
      src,
    );
  });
  section('sync acquires sync_lock and wipes ext:* adapters first', () => {
    return (
      /let\s+_guard\s*=\s*self\.sync_lock\.lock\(\)\.await/.test(src) &&
      /self\.registrar\.clear_external\(\)/.test(src) &&
      /\.remove_by_prefix\("ext:"\)/.test(src)
    );
  });
  section('emit_server_status helper exists and emits through the UI sink', () => {
    return (
      /fn\s+emit_server_status\(\s*[\s\S]*?ui:\s*Option<&crate::ui::UiBridge>/.test(src) &&
      /sink\.emit_result\("mcp:server:status"/.test(src)
    );
  });
  section('status payload includes name + status + optional error', () => {
    return (
      /"name":\s*name/.test(src) &&
      /"status":\s*status/.test(src) &&
      /payload\["error"\]\s*=\s*serde_json::Value::String\(/.test(src)
    );
  });
  section('servers emit status across the sync loop (>= 6 call sites)', () => {
    const calls = (src.match(/emit_server_status\(/g) || []).length;
    return calls >= 6;
  });
})();

// ─── Section F: src-tauri/src/lib.rs ──────────────────────────────
console.log('\nF. src-tauri/src/lib.rs — command registration + boot caller');
(() => {
  const src = read('src-tauri/src/lib.rs');
  section('invoke_handler registers the scope CRUD command surface', () => {
    return (
      /commands::mcp::mcp_list_servers/.test(src) &&
      /commands::mcp::mcp_upsert_server/.test(src) &&
      /commands::mcp::mcp_set_enabled/.test(src) &&
      /commands::mcp::mcp_remove_server/.test(src) &&
      /commands::mcp::mcp_reconnect/.test(src)
    );
  });
  section('retired mcp_add_server is no longer registered', () => {
    return !/commands::mcp::mcp_add_server/.test(src);
  });
  section('boot caller passes None to sync_external_servers', () => {
    return /client\.sync_external_servers\(\s*None\s*\)\.await/.test(src);
  });
})();

// ─── Section G: split UI components (row + form) ─────────────────
console.log('\nG. McpServerRow.tsx + McpServerForm.tsx — typed split UI');
(() => {
  const base = 'src/components/settings/Tabs/plugins';
  section('Retired MCPExternalServers.tsx no longer exists', () => {
    return !exists(`${base}/MCPExternalServers.tsx`);
  });
  section('McpServerRow renders name + endpoint + status pill + transport/scope', () => {
    if (!exists(`${base}/McpServerRow.tsx`)) return false;
    const src = read(`${base}/McpServerRow.tsx`);
    return (
      /server\.name/.test(src) &&
      /endpointDisplay/.test(src) &&
      /StatusPill/.test(src) &&
      /TRANSPORT_LABEL/.test(src) &&
      /TRANSPORT_ICON/.test(src) &&
      /SCOPE_LABEL/.test(src)
    );
  });
  section('McpServerRow wires onEdit / onToggleEnabled / onRemove', () => {
    const src = read(`${base}/McpServerRow.tsx`);
    return (
      /onEdit\(server\)/.test(src) &&
      /onToggleEnabled\(server,/.test(src) &&
      /onRemove\(server\)/.test(src)
    );
  });
  section('McpServerForm exposes McpFormSubmit { scope, name, config }', () => {
    if (!exists(`${base}/McpServerForm.tsx`)) return false;
    const src = read(`${base}/McpServerForm.tsx`);
    const m = src.match(/export\s+interface\s+McpFormSubmit\s*\{[\s\S]*?\n\}/);
    if (!m) return false;
    return (
      /scope:\s*McpScope/.test(m[0]) &&
      /name:\s*string/.test(m[0]) &&
      /config:/.test(m[0])
    );
  });
  section('McpServerForm supports both stdio and http transports', () => {
    const src = read(`${base}/McpServerForm.tsx`);
    return /transport:\s*McpTransport/.test(src) && /parseArgs/.test(src) && /buildEntry/.test(src);
  });
})();

// ─── Section H: MCPSettings.tsx — event subscriber + handlers ────
console.log('\nH. MCPSettings.tsx — wires typed UI + mcp:server:status events');
(() => {
  const src = read('src/components/settings/Tabs/plugins/MCPSettings.tsx');
  section('Uses listServers (no legacy JSON textarea parse path)', () => {
    return !/JSON\.parse\(configText\)/.test(src) && /mcpApi\.listServers/.test(src);
  });
  section('Subscribes to mcp:server:status via subscribeServerStatus', () => {
    return /mcpApi\s*\.\s*subscribeServerStatus\s*\(/.test(src);
  });
  section('Renders the split McpServerRow + McpServerForm components', () => {
    return (
      /<McpServerRow\b/.test(src) &&
      /<McpServerForm\b/.test(src) &&
      /Add MCP Server/.test(src) &&
      /Reconnect All/.test(src)
    );
  });
  section('Wires upsert/setEnabled/remove/reconnect into typed handlers', () => {
    return (
      /await\s+mcpApi\.upsertServer/.test(src) &&
      /await\s+mcpApi\.setEnabled/.test(src) &&
      /await\s+mcpApi\.removeServer/.test(src) &&
      /await\s+mcpApi\.reconnect/.test(src)
    );
  });
})();

// ─── Section I: Runtime contract — wire shape agreement ─────────
console.log('\nI. Runtime wire contract');
(() => {
  const ts = read('src/api/mcpApi.ts');
  const rs = readDirConcat('src-tauri/crates/zen-mcp/src/client', (f) => f.endsWith('.rs'));
  section('Event payload { name, status, error? } agrees between TS and Rust', () => {
    const tsShape =
      /name:\s*string/.test(ts) &&
      /status:\s*McpServerStatus/.test(ts) &&
      /error\?:\s*string/.test(ts);
    const rsShape =
      /"name":\s*name/.test(rs) && /"status":\s*status/.test(rs) && /payload\["error"\]/.test(rs);
    return tsShape && rsShape;
  });
  section('Status values agree: TS union covers every emitted Rust status', () => {
    const tsUnionM = ts.match(/export\s+type\s+McpServerStatus\s*=\s*([\s\S]*?);/);
    if (!tsUnionM) return false;
    const tsValues = (tsUnionM[1].match(/"([a-z_]+)"/g) || []).map((s) => s.replace(/"/g, ''));
    // Every status literal emitted by the Rust helper must exist in the TS union.
    const rsCallSites = rs.match(/emit_server_status\([\s\S]*?\)/g) || [];
    const rsStatusValues = rsCallSites
      .flatMap((s) => s.match(/"(reconnecting|connected|failed|disabled|awaiting_consent)"/g) || [])
      .map((s) => s.replace(/"/g, ''));
    const covered = rsStatusValues.every((v) => tsValues.includes(v));
    const coreTs = ['reconnecting', 'connected', 'failed'].every((v) => tsValues.includes(v));
    return coreTs && covered && rsStatusValues.length >= 6;
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
