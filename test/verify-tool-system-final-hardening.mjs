import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const toolsMod = readFileSync(new URL("../src-tauri/src/tools/mod.rs", import.meta.url), "utf8");
const fsToolsMod = readFileSync(new URL("../src-tauri/src/tools/fs_tools/mod.rs", import.meta.url), "utf8");
const fsToolsWrite = readFileSync(new URL("../src-tauri/src/tools/fs_tools/write.rs", import.meta.url), "utf8");
const toolManager = readFileSync(new URL("../src-tauri/src/tools/manager.rs", import.meta.url), "utf8");
const agentMiddleware = readFileSync(new URL("../src-tauri/crates/zen-agent/src/middleware/system_prompt.rs", import.meta.url), "utf8");
const toolService = readFileSync(new URL("../src-tauri/src/services/tool.rs", import.meta.url), "utf8");
const terminalService = readFileSync(new URL("../src-tauri/src/services/terminal.rs", import.meta.url), "utf8");
const terminalTool = readFileSync(new URL("../src-tauri/src/tools/terminal_tools.rs", import.meta.url), "utf8");
const workspaceMod = readFileSync(new URL("../src-tauri/src/workspace.rs", import.meta.url), "utf8");
const toolDispatch = ["mod.rs", "router.rs", "executors.rs", "completion.rs"]
  .map((f) => readFileSync(new URL(`../src-tauri/crates/zen-agent/src/runner/dispatch/${f}`, import.meta.url), "utf8")).join("");
const toolPipeline = readFileSync(new URL("../src-tauri/crates/zen-agent/src/runner/tool_pipeline.rs", import.meta.url), "utf8");
const dbQueries = readFileSync(new URL("../src-tauri/src/db/queries/mod.rs", import.meta.url), "utf8");
const dbMod = readFileSync(new URL("../src-tauri/src/db/mod.rs", import.meta.url), "utf8");
const mcpCommands = readFileSync(new URL("../src-tauri/src/commands/mcp.rs", import.meta.url), "utf8");
const tauriLib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const commandsMod = readFileSync(new URL("../src-tauri/src/commands/mod.rs", import.meta.url), "utf8");
const settingsCommands = readFileSync(new URL("../src-tauri/src/commands/settings.rs", import.meta.url), "utf8");
const chatCommands = [
  "../src-tauri/src/commands/chat/mod.rs",
  "../src-tauri/src/commands/chat/helpers.rs",
  "../src-tauri/src/commands/chat/send.rs",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const agentCommands = readFileSync(new URL("../src-tauri/src/commands/agent.rs", import.meta.url), "utf8");
const escalation = readFileSync(new URL("../src-tauri/crates/zen-agent/src/runner/escalation.rs", import.meta.url), "utf8");
const mcpApi = readFileSync(new URL("../src/api/mcpApi.ts", import.meta.url), "utf8");
const mcpSettings = readFileSync(new URL("../src/components/settings/Tabs/plugins/MCPSettings.tsx", import.meta.url), "utf8");
const mockClient = readFileSync(new URL("../src/api/mockClient.ts", import.meta.url), "utf8");
const permissionModeMenu = readFileSync(new URL("../src/atlas/components/PermissionModeMenu.tsx", import.meta.url), "utf8");
const toolsSettings = readFileSync(new URL("../src/components/settings/Tabs/ToolsSettings.tsx", import.meta.url), "utf8");
const workspaceSettings = readFileSync(new URL("../src/components/settings/Tabs/WorkspaceSettings.tsx", import.meta.url), "utf8");
const folderBrowser = readFileSync(new URL("../src/atlas/components/FolderBrowser.tsx", import.meta.url), "utf8");
const settingsMapper = readFileSync(new URL("../src/lib/stores/settingsMapper.ts", import.meta.url), "utf8");
const workspaceApi = readFileSync(new URL("../src/api/workspaceApi.ts", import.meta.url), "utf8");
const events = readFileSync(new URL("../src/api/events.ts", import.meta.url), "utf8");
const useToolEvents = readFileSync(new URL("../src/atlas/hooks/stream/useToolEvents.ts", import.meta.url), "utf8");
const toolCallCard = readFileSync(new URL("../src/atlas/components/chat/ToolCallCard.tsx", import.meta.url), "utf8");
const toolOutputPreview = readFileSync(new URL("../src/atlas/components/chat/tool/toolOutputPreview.ts", import.meta.url), "utf8");
const generalistAgent = readFileSync(new URL("../src-tauri/resources/agents/generalist.json", import.meta.url), "utf8");
// ZEN-DOCS (researcher) and ZEN-TAC (operational_expert) were retired; the
// shipped defaults are generalist, explore, and voice_display.
const exploreAgent = readFileSync(new URL("../src-tauri/resources/agents/explore.json", import.meta.url), "utf8");

// The MCP HTTP transport (mcp/server.rs + mcp/http.rs) was removed in cf2f785
// ("MCP server -> client"); MCP now runs over stdio only, so per-launch HTTP
// auth-token, x-zen-mcp-token header, and HTTP rate-limit assertions no longer
// apply and were removed with the subsystem.
assert(mockClient.includes("redactMockValue") && mockClient.includes("console.log(`[Mock IPC] ${command}`, redactMockValue(args))"), "mock IPC logging should redact command arguments");
assert(toolService.includes("Critical tools require interactive approval") && toolService.includes("execute_non_interactive"), "non-interactive MCP should not execute critical tools");
assert(
  toolService.includes("audit_execution_result") &&
    (toolService.includes("\"event\":\"tool_execution_result\"") || toolService.includes('"event": "tool_execution_result"')),
  "tool execution should emit final audit result rows"
);
assert(toolService.includes("output_hash") && toolService.includes("duration_ms") && toolService.includes("resolved_name"), "tool execution audit should include resolved name, duration, and output hash");
assert(
  toolService.includes("let start = std::time::Instant::now();") &&
    toolService.includes("execute_v2_authorized(app, chat_id, v2_tool_call, \"agent_tool\")") &&
    toolService.includes("duration_ms: start.elapsed().as_millis() as u64"),
  "agent v2 fallback tool results should preserve measured duration for frontend telemetry",
);
assert(
  toolService.includes("security_risk_for_tool") &&
    toolService.includes(".or_else(|| registry.known_tool_risk(tool_name))"),
  "ToolService security evaluation should use canonical known-tool risk metadata, not native-v2-only lookup"
);
assert(toolsMod.includes("pub fn validate_arguments") && toolsMod.includes("jsonschema::validator_for") && toolsMod.includes("self.validate_arguments(tool_call)?"), "tool args should be schema validated before permission/execution");
assert(toolsMod.includes("known_tool_definitions") && toolsMod.includes("register_known_tool_definition"), "v1 compatibility tools should have canonical schema definitions");
assert(toolsMod.includes("legacy_tools") && toolsMod.includes("register_legacy_tool") && toolsMod.includes("get_legacy"), "canonical registry should own legacy executor handles during migration");
assert(toolService.includes("registry.get_legacy(&tool_call.name)") && !toolDispatch.includes("self.tool_registry.read().await.get(&tc_name)"), "agent runner execution should resolve tools through ToolService/canonical registry");
assert(toolManager.includes("sync_legacy_tool_definitions") && commandsMod.includes("register_legacy_tool"), "startup/tool manager should sync legacy executors into the canonical registry");
assert(toolPipeline.includes("enforce_tool_allowlist(&allowlist, &real_id, \"agent\")") && toolPipeline.includes("enforce_tool_allowlist(&allowlist, tool_id, \"agent\")"), "tool_exec and tool_info should use the shared allowlist helper");
assert(toolManager.includes("sanitize_tool_info_schema") && toolManager.includes("TOOL_INFO_MAX_SCHEMA_BYTES"), "tool_info schemas should be capped before model exposure");
assert(
  toolsMod.includes("pub mod terminal_tools") &&
    toolsMod.includes("registry.register(Arc::new(RunCommandTool))") &&
    terminalTool.includes("impl Tool for RunCommandTool") &&
    terminalTool.includes('RiskLevel::Critical') &&
    terminalTool.includes("execute_command("),
  "run_command should be a direct v2 tool while preserving critical risk and terminal-manager execution"
);
assert(
  toolsMod.includes("registry.register(Arc::new(fs_tools::WriteFileTool))") &&
    toolsMod.includes("registry.register(Arc::new(fs_tools::EditFileTool))") &&
    fsToolsWrite.includes("impl Tool for WriteFileTool") &&
    fsToolsWrite.includes("impl Tool for EditFileTool") &&
    fsToolsWrite.includes("crate::workspace::resolve_workspace_path") &&
    fsToolsWrite.includes("RiskLevel::High"),
  "write_file and edit_file should be direct high-risk v2 tools with workspace-contained paths"
);
assert(
  commandsMod.includes("pub async fn set_workspace_folder") &&
    settingsCommands.includes('key == "workspace.root"') &&
    settingsCommands.includes('key == "workspace_path"') &&
    settingsCommands.includes("state.set_workspace_folder") &&
    tauriLib.includes('settings_manager.get("workspace.root")') &&
    tauriLib.includes('settings_manager.get("workspace_path")') &&
    tauriLib.includes("commands::system::browse_folder") &&
    workspaceApi.includes('"browse_folder"') &&
    settingsMapper.includes('workspacePath: "workspace.root"') &&
    workspaceMod.includes("canonicalize_workspace_root") &&
    workspaceMod.includes("find_project_workspace_from_current_dir") &&
    workspaceMod.includes("Component::ParentDir") &&
    workspaceMod.includes("test_nonexistent_nested_path_traversal_blocked"),
  "workspace.root settings should validate, hydrate, default to the project root when available, and update the live workspace used by file tools"
);
assert(
  fsToolsMod.includes("workspace_max_file_bytes") &&
    fsToolsMod.includes('"workspace.max-file-size"') &&
    fsToolsMod.includes("enforce_existing_file_size") &&
    fsToolsMod.includes("enforce_content_size") &&
    workspaceSettings.includes("FolderBrowser") &&
    folderBrowser.includes("entries?: FolderEntry[]") &&
    folderBrowser.includes("vscode-icons:file-type-typescript") &&
    folderBrowser.includes("entryType(entry)") &&
    workspaceSettings.includes("Workspace sandbox enforced") &&
    workspaceSettings.includes("Git automation is not enabled") &&
    !workspaceSettings.includes("Allow External Paths"),
  "workspace file tools should enforce max file size and the UI should expose a working workspace folder picker without unenforced toggles"
);
assert(
  chatCommands.includes("default_yolo_tool_ids") &&
    chatCommands.includes('state.settings_manager.get("tool_yolo_mode")') &&
    chatCommands.includes('state.settings_manager.get("tools.yolo-mode")') &&
    chatCommands.includes('"write_file"') &&
    chatCommands.includes('"edit_file"') &&
    chatCommands.includes('"grep_documents"') &&
    chatCommands.includes('"run_command"') &&
    chatCommands.includes("tool_ids.sort()") &&
    chatCommands.includes("tool_ids.dedup()"),
  "YOLO chat turns should expand the backend tool allowlist beyond web_search and normal tool-intent turns should include coding tools"
);
assert(toolsMod.includes("direct_tool_risk") && agentCommands.includes("direct_tool_risk"), "direct low/medium tool exposure should be enforced via the canonical registry risk lookup");
assert(agentCommands.includes("renderer_allowed") && agentCommands.includes("not available through renderer-initiated execution"), "renderer tool command IPC should enforce direct low/medium tool exposure");
assert(escalation.includes("Sha256::digest(args.to_string())") && !escalation.includes("format!(\"sig:{name}:{}\", args)"), "early tool dedupe keys should hash args instead of storing full JSON");
assert(escalation.includes("sig:{index}:{name}") && escalation.includes("Some(index)"), "early tool dedupe keys should not collide when providers omit tool-call ids");
assert(
  terminalService.includes("INTERACTIVE_APPROVAL_TTL") &&
    terminalService.includes("approvals.insert") &&
    terminalService.includes("self.approvals.lock().await.remove(&approval_id)") &&
    terminalService.includes("terminal spawn attempted without a valid approval") &&
    terminalService.includes("terminal approval did not match the requested session") &&
    terminalService.includes("decision: PermissionDecision::Deny") &&
    terminalService.includes("decision: PermissionDecision::Allow"),
  "terminal spawn must require a single-use explicit approval token and deny missing, expired, or mismatched approvals",
);
assert(escalation.includes("redact_tool_preview_string") && escalation.includes("redact_tool_preview_args"), "streamed tool-call previews should be redacted before reaching the renderer");
assert(permissionModeMenu.includes('mode === "yolo"') && permissionModeMenu.includes("window.confirm") && permissionModeMenu.includes("Hard security blocks still apply"), "chat input permission menu should confirm and visibly indicate YOLO mode");
assert(
  toolsSettings.includes('nextMode === "yolo"') &&
    toolsSettings.includes("Enable Full Access?") &&
    toolsSettings.includes("Hard security blocks still apply"),
  "settings should confirm autonomous activation and explain the non-bypassable security floor",
);
assert(
  dbQueries.includes("pub mod session_permissions") &&
    dbMod.includes("init_session_permissions(pool)") &&
    agentCommands.includes("upsert_session_permission") &&
    toolDispatch.includes("load_session_permission_map"),
  "exact session tool approvals should persist to SQLite and hydrate before approval checks"
);
assert(
  toolService.includes("redacted_arguments_for_display(&tool_call.arguments)") &&
    toolPermissionRedactionIsPresent(),
  "approval and timeout events should expose display-safe arguments only"
);
assert(events.includes("arguments?: ToolCall[\"input\"]") && useToolEvents.includes("event.payload.arguments || {}"), "frontend timeout card should retain original timed-out input");
assert(
  toolOutputPreview.includes("parseMaybeJson") &&
    !toolCallCard.includes("exec(value)") &&
    toolCallCard.includes("redactDisplayValue"),
  "tool cards should not regex-parse malformed args and should redact copied/displayed input",
);
assert(
  agentMiddleware.includes("Required Tool Protocol") &&
    agentMiddleware.includes("tool_list") &&
    agentMiddleware.includes("tool_info") &&
    agentMiddleware.includes("tool_exec") &&
    agentMiddleware.includes("Do Not Guess Tools"),
  "runtime prompt should require the tool_list -> tool_info -> tool_exec protocol"
);
assert(
  toolManager.includes("Always use this first") &&
    toolManager.includes("before the first tool_exec") &&
    toolManager.includes("use only documented arguments"),
  "meta-tool descriptions should tell models to list tools, read descriptions/schemas, then execute"
);
for (const [name, agent] of [
  ["generalist", generalistAgent],
  ["explore", exploreAgent],
]) {
  const parsed = JSON.parse(agent);
  assert(parsed.instructions.includes("Tool Use Protocol"), `${name} should include the shared tool protocol`);
  assert(parsed.instructions.includes("tool_list") && parsed.instructions.includes("tool_info") && parsed.instructions.includes("tool_exec"), `${name} should teach all three meta-tools`);
  assert(!parsed.instructions.includes("tools_search") && !parsed.instructions.includes("list_tools"), `${name} should not teach stale progressive discovery tools`);
}
assert(!JSON.parse(generalistAgent).tool_ids.includes("tools_search") && !JSON.parse(generalistAgent).tool_ids.includes("list_tools"), "generalist allowlist should not include stale progressive discovery tools");
// Explore is read-only by construction: no write/edit/patch/command tools and
// no delegation, so a search delegation can never mutate the workspace.
{
  const explore = JSON.parse(exploreAgent);
  for (const forbidden of ["write_file", "edit_file", "apply_patch", "run_command", "spawn_agent", "manage_board"]) {
    assert(!explore.tool_ids.includes(forbidden), `explore must not be granted the mutating tool '${forbidden}'`);
  }
  assert(!Object.keys(explore).some((key) => /nested|allowed_agent/i.test(key)), "explore must not carry retired nested-delegation options");
}

console.log("tool system final hardening ok");

function toolPermissionRedactionIsPresent() {
  const permission = readFileSync(new URL("../src-tauri/src/tools/permission.rs", import.meta.url), "utf8");
  return permission.includes("pub fn redacted_arguments_for_display") && permission.includes("[redacted]");
}
