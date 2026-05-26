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

There are still two backend tool surfaces:

- `src-tauri/src/tools/*`: app/system tool registry used by `ToolService`
- `src-tauri/src/agent/tools/*`: legacy agent-facing tool definitions,
  progressive metadata, and compatibility adapters

Supporting owners:

- `ToolService`: only execution boundary for production tool calls.
- `SecurityService`: permission decisions and audit persistence.
- `ToolManager`: discovery, tool metadata aggregation, and permission settings.
- `GlobalToolRegistry`: v2 production tool registry.
- `agent::tools::ToolRegistry`: legacy/progressive registry retained during
  Phase 3.5 only.
- `McpServer`: external tool exposure adapter; it must call `ToolService`.

The two surfaces are accepted temporarily during Phase 3.5. New production tools
must be added through the `src-tauri/src/tools/*` v2 path and exposed through
`ToolService`. Do not add a third registry or a direct execution path.

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

1. Add the implementation under `src-tauri/src/tools/<domain>.rs`.
2. Implement the v2 `Tool` trait and return a bounded, structured output.
3. Register the tool in `init_tool_registry`.
4. Add or verify `default_tool_risk` and metadata.
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

- MCP HTTP remains localhost-only for this phase.
- Remote MCP remains unsupported until authentication and token policy are
  designed.
- MCP startup must fail if `ToolService` is unavailable.
- MCP tool execution must use the same permission, audit, and registry path as
  agent/UI execution.

## Agent Compatibility

Agent-facing tools may still read progressive metadata from
`src-tauri/src/agent/tools/*`, but production execution should move toward the
v2 `ToolService` path.

Allowed legacy usage:

- progressive discovery metadata
- compatibility adapters that delegate into `ToolService`
- temporary wrappers with documented migration intent

Not allowed:

- new privileged behavior implemented only in `agent::tools`
- direct execution from the agent runner that bypasses `ToolService`
- duplicate versions of the same production tool with different permissions

## Migration Rule

When touching an existing tool, prefer moving it toward the canonical
`ToolService` path. Do not expand the older surface unless the change is part of
a deliberate migration.

## Review Checklist

Before merging a tool change, verify:

- no raw tool execution path was added
- `npm run quality:fast` passes
- the tool appears in `ToolManager` discovery if user-facing
- risk level is conservative by default
- privileged actions have allow and deny tests
- medium/high/critical tools are listed in `src-tauri/tool-coverage.json`
- audit event content excludes secrets and large payloads
