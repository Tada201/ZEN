# Tool System Architecture

Zen's canonical tool boundary is `ToolService`. This document is the required
reference before adding, moving, or exposing backend tools.

## Required Flow

```txt
agent / MCP / UI
  -> ToolService
  -> SecurityService
  -> registry lookup
  -> tool implementation
  -> audit event
```

No feature should construct or execute a tool directly.

## Ownership Map

Since the workspace migration, the tool contracts and registries live in the
`zen-tools` crate; the app crate holds the executors that need Tauri's
`AppHandle` plus the host-binding aliases.

Crate-owned (`src-tauri/crates/zen-tools/src/`):

- `registry.rs`: the `Tool`/`AgentTool` contracts, `ToolRegistry<A>`,
  `AgentToolRegistry<A>`, `default_tool_risk`, and the lazy-source port
- `manager.rs`: `ToolManager<A>` — discovery, tool metadata, meta-tool
  definitions
- `capability.rs`: static capability/status metadata
- `calculator.rs`: the one pure executor with no host dependency

App-crate (`src-tauri/src/`):

- `tools/mod.rs`: `init_tool_registry` plus the host bindings
  `ToolRegistry`/`GlobalToolRegistry`/`ToolManager` (aliases of the generic
  zen-tools types at `tauri::AppHandle`)
- `tools/*`: system tool executors (`fs_tools`, `web_fetch`, `sys_metrics`,
  `terminal_tools`, `image_tool`)
- `agent/tools/*`: agent-facing executors plus progressive discovery metadata
- `services/tool.rs`: `ToolService`, the only execution boundary

Supporting owners:

- `ToolService` (app): only execution boundary for production tool calls.
- `SecurityService` (`zen_security::service`): permission decisions and audit
  persistence.
- `ToolManager`: discovery, tool metadata aggregation, and permission settings.
- `GlobalToolRegistry`: the production tool registry.
- `agent::tools::ToolRegistry`: the agent-side execution registry (an alias of
  `zen_tools::AgentToolRegistry<tauri::AppHandle>`), fed by progressive
  discovery.
- `McpServer` (`zen-mcp`): external tool exposure adapter; it must call
  `ToolService`.

Because zen-tools is generic over the host (RULES.md §3.1 forbids `tauri` in
crates) and Rust has no trait aliases, `impl` and `dyn` positions must spell
`zen_tools::Tool<tauri::AppHandle>`; struct and type positions use the app-crate
aliases. Do not add a third registry or a direct execution path.

## Adding A Tool

Required:

- stable id
- display name and description
- input schema
- risk level
- permission policy
- implementation registered in `src-tauri/src/tools/mod.rs`
- execution through `ToolService`
- allowed and denied audit behavior
- tests or documented exemption
- coverage entry in `src-tauri/tool-coverage.json` if risk is medium, high,
  or critical

Recommended sequence:

1. Add the implementation. If it needs `AppHandle`/`AppState`, put it under
   `src-tauri/src/tools/<domain>.rs`; if it is pure, it belongs in
   `src-tauri/crates/zen-tools/src/`.
2. Implement the `Tool` trait (`zen_tools::Tool<tauri::AppHandle>` in the app
   crate) and return a bounded, structured output.
3. Register the tool in `init_tool_registry`.
4. Add or verify `default_tool_risk` (in `zen-tools/src/registry.rs`) and
   metadata.
5. Route all agent, MCP, and UI calls through `ToolService`.
6. Add lightweight backend tests for allow, deny, malformed input, and audit
   behavior when the tool is privileged.
7. Update this document if the tool introduces a new integration pattern.

Forbidden:

- direct `.execute()` calls from commands, agents, MCP, or UI
- bypassing `SecurityService`
- registering no-op behavior as production
- reading secrets through `SettingsService`
- returning raw secrets or full provider response bodies
- creating a provider/client ad hoc when an existing service owns it

## MCP Exposure

MCP is an adapter, not a second tool system.

- MCP HTTP remains localhost-only.
- Remote MCP remains unsupported until authentication and token policy are
  designed.
- MCP startup must fail if `ToolService` is unavailable.
- MCP tool execution must use the same permission, audit, and registry path as
  agent/UI execution.

## Agent Tools

Agent-facing executors live in `src-tauri/src/agent/tools/*` and register into
`agent::tools::ToolRegistry` (the `AgentToolRegistry<tauri::AppHandle>` alias).
Progressive discovery feeds that registry through
`zen_tools::registry::LazyToolSource`, so the agent sees a small starting catalog
and pulls the rest on demand.

This is a second *executor* surface, not a second tool system: permission
preflight, execution, and audit still go through `ToolService`.

Not allowed:

- new privileged behavior implemented only in `agent::tools`
- direct execution from the agent runner that bypasses `ToolService`
- duplicate versions of the same production tool with different permissions

## Review Checklist

Before merging a tool change, verify:

- no raw tool execution path was added
- `npm run quality:fast` passes
- the tool appears in `ToolManager` discovery if user-facing
- risk level is conservative by default
- privileged actions have allow and deny tests
- medium/high/critical tools are listed in `src-tauri/tool-coverage.json`
- audit event content excludes secrets and large payloads
