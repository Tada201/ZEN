# Example Codebase Lessons

Reference projects live under `EXAMPLE_NO_EDITS/` and must stay read-only. Use
them to calibrate architecture decisions, not as copy-paste sources.

## Codebuff

Useful patterns observed:

- Tool names and tool parameter types are centralized in `agents/types/tools.ts`.
- Agent definitions use typed capability lists instead of arbitrary strings
  scattered through feature code.
- Experimental agents are moved into `agents-graveyard/`, making production
  surfaces easier to identify.
- Tests live near agent/tool behavior, including context pruning and editor
  flows.

Rules for Zen:

- UI components must not own command strings for tool execution.
- Tool metadata, execution, permissions, and approval APIs belong behind
  `src/api/toolsApi.ts` on the frontend and a backend tool service boundary.
- Prototype tool or agent behavior needs explicit maturity status or a separate
  non-production location.

## Claude-Code-Style Rust Example

Useful patterns observed:

- Tools are treated as a dedicated subsystem with clear framework, registry,
  permission, execution, and rendering concepts.
- Each tool has metadata, schema, read-only/destructive classification,
  permission checks, validation, execution, and result mapping.
- Tool permissions are contextual, not just global toggles.

Rules for Zen:

- A tool is not just a callable function. It must carry metadata, input shape,
  risk level, permission policy, and audit behavior.
- Tool execution must flow through one canonical registry/service path.
- Permission behavior must be per operation, not only per feature screen.

## Atomic-Chat / Tauri Examples

Useful patterns observed:

- Tauri commands and permissions are visible, documented, and generated for
  plugin-style capability boundaries.
- Expensive or optional capabilities are separated into plugins/modules.

Rules for Zen:

- Tauri commands are adapters. They should not become the business layer.
- Privileged modules should be explicit capability surfaces with documented
  permissions.
