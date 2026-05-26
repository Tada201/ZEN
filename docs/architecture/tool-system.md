# Tool System Architecture

Zen's canonical tool boundary is `ToolService`.

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

## Current Surfaces

There are still two backend tool surfaces:

- `src-tauri/src/tools/*`: app/system tool registry used by `ToolService`
- `src-tauri/src/agent/tools/*`: agent-facing tool definitions and metadata

This is accepted temporarily during Phase 3.5. New production tools should be
added through `ToolService` and must not add a third registry or execution path.

## Adding A Tool

Required:

- stable id
- display name and description
- input schema
- risk level
- permission policy
- implementation behind `ToolService`
- audit behavior
- tests or documented exemption

Forbidden:

- direct `.execute()` calls from commands, agents, MCP, or UI
- bypassing `SecurityService`
- registering no-op behavior as production
- reading secrets through `SettingsService`

## Migration Rule

When touching an existing tool, prefer moving it toward the canonical
`ToolService` path. Do not expand the older surface unless the change is part of
a deliberate migration.
