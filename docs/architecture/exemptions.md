# Architecture Exemptions

Exemptions are temporary. They exist so the rebuild can be incremental without
pretending current debt is acceptable.

## Required Format

```txt
File:
Owner:
Rule Exempted:
Reason:
Split or Fix Plan:
Expires:
```

## Backend Exemptions

File: src-tauri/src/agent/runner/helpers.rs
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: Legacy shared runner helper module containing context, streaming, and tool normalization utilities.
Split or Fix Plan: Split context budgeting, stream helpers, and tool normalization into focused runner modules.
Expires: Next refactoring cycle

File: src-tauri/src/agent/tools/spawn_tools.rs
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: Legacy subagent spawning workflow owns handoff, validation, and execution coordination.
Split or Fix Plan: Extract handoff construction, child execution, and result normalization into separate modules.
Expires: Next refactoring cycle

File: src-tauri/src/tools/permission.rs
Owner: backend/security
Rule Exempted: Rust hard file-size limit
Reason: Canonical permission policy, path validation, redaction, and regression matrix currently share one security boundary.
Split or Fix Plan: Split policy evaluation, path guards, redaction, and tests while preserving one public permission API.
Expires: Next refactoring cycle


File: src-tauri/src/agent/deep_research/phases.rs
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: Contains complex multi-phase deep research execution steps.
Split or Fix Plan: Refactor phases into separate modular files under a deep_research/phases/ directory.
Expires: Next refactoring cycle

File: src-tauri/src/agent/runner/escalation.rs
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: Existing runner escalation logic.
Split or Fix Plan: Split escalation workflows into dedicated services.
Expires: Next refactoring cycle

File: src-tauri/src/agent/runner/loop.rs
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: Core agent execution loop.
Split or Fix Plan: Decouple loop step handling into separate runner strategy modules.
Expires: Next refactoring cycle

File: src-tauri/src/agent/runner/tool_dispatch.rs
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: Handles tool dispatch logic for agents.
Split or Fix Plan: Decompose into individual tool class handlers.
Expires: Next refactoring cycle

File: src-tauri/src/commands/chat.rs
Owner: backend/commands
Rule Exempted: Rust hard file-size limit
Reason: Large legacy chat command controller.
Split or Fix Plan: Split into chat, message, and session specific command modules.
Expires: Next refactoring cycle

File: src-tauri/src/llm/openai_compat/stream.rs
Owner: backend/llm
Rule Exempted: Rust hard file-size limit
Reason: OpenAI compatible stream parsing and mapping.
Split or Fix Plan: Extract parsing logic into independent adapters.
Expires: Next refactoring cycle

File: src-tauri/src/services/tool.rs
Owner: backend/services
Rule Exempted: Rust hard file-size limit
Reason: Core ToolService registry and execution manager.
Split or Fix Plan: Decompose registry lookup, validation, and execution into distinct sub-modules.
Expires: Next refactoring cycle

## Frontend Exemptions

File: src/atlas/components/chat/AssistantMessage.tsx
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit
Reason: Legacy assistant message renderer owns streaming, citations, reasoning, and tool timeline composition.
Split or Fix Plan: Extract message parts, action controls, and execution timeline adapters into focused components.
Expires: Next frontend refactor

File: src/atlas/components/chat/SessionSidebar.tsx
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit
Reason: Legacy session navigation surface combines filtering, folders, archive actions, and responsive layout.
Split or Fix Plan: Extract session filtering, folder controls, and row composition into focused modules.
Expires: Next frontend refactor

File: src/atlas/components/chat/types.ts
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit
Reason: Shared chat contracts are centralized here to prevent duplicated type definitions across the timeline.
Split or Fix Plan: Partition types by message, execution, and session domains without changing public imports.
Expires: Next frontend refactor

File: src/atlas/components/chat/WelcomeBlackHoleBackground.tsx
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit
Reason: Legacy visual background implementation owns the canvas/SVG composition and animation policy.
Split or Fix Plan: Extract geometry, rendering primitives, and motion orchestration into focused modules.
Expires: Next frontend refactor

File: src/atlas/components/RightPanel.tsx
Owner: frontend/workbench
Rule Exempted: TS/TSX hard file-size limit
Reason: Utility panel coordinates multiple tabs and live agent/context surfaces in one responsive shell.
Split or Fix Plan: Extract tab registry and each panel content into focused modules.
Expires: Next frontend refactor

File: src/atlas/hooks/chat/useChatQueries.ts
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit
Reason: Query hooks centralize chat pagination and reload-safe message hydration contracts.
Split or Fix Plan: Split chat list, message pagination, and artifact query hooks while keeping the public hook facade.
Expires: Next frontend refactor

File: src/atlas/hooks/stream/useAgentEvents.ts
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit
Reason: Canonical event routing hook coordinates stream, tool, agent, and persistence events.
Split or Fix Plan: Extract event-family handlers behind the existing hook facade.
Expires: Next frontend refactor

File: src/atlas/sections/WorkspaceSection.tsx
Owner: frontend/workbench
Rule Exempted: TS/TSX hard file-size limit
Reason: Workspace section coordinates tabs, editor lifecycle, and app-owned workspace actions.
Split or Fix Plan: Extract tab lifecycle, workspace commands, and view composition into focused modules.
Expires: Next frontend refactor

File: src/components/settings/Tabs/ProvidersSettings.tsx
Owner: frontend/settings
Rule Exempted: TS/TSX hard file-size limit
Reason: Provider settings orchestrate catalog, credentials presence, model discovery, and connection state.
Split or Fix Plan: Extract provider rows, discovery controls, and connection status into focused modules.
Expires: Next frontend refactor

File: src/lib/stores/settings/createProviderSlice.ts
Owner: frontend/settings
Rule Exempted: TS/TSX hard file-size limit
Reason: Provider state slice currently owns compatibility migration and canonical provider selection state.
Split or Fix Plan: Split provider catalog, model selection, and persistence migration into domain slices.
Expires: Next frontend refactor

File: src/components/ui/sidebar.tsx
Owner: frontend/ui
Rule Exempted: TS/TSX hard file-size limit
Reason: Generated UI primitive has many variants and subcomponents.
Split or Fix Plan: Keep as a generated primitive only. Do not add app behavior here; wrap it from feature code instead.
Expires: Generated UI primitive review

File: src/atlas/components/chat/cardCatalog.ts
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit
Reason: New catalog mapping all premium card components.
Split or Fix Plan: Split catalog registrations into separate registry modules.
Expires: Next frontend refactor

File: src/atlas/components/chat/DeepResearchMessage.tsx
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit (resolved via Phase 4 split)
Reason: Original ~440-line monolith was split into five focused owners; the
exemption is resolved and the legacy entry is kept here only as a record of
where the responsibility lives now. New owners:
  - src/atlas/components/chat/DeepResearchMessage.tsx — thin router, the only
    file imported by MessageItem (42 lines).
  - src/atlas/components/chat/DeepResearchRunMessage.tsx — run view with the
    Process and Agents sub-headers (408 lines; over soft 350, under hard 500).
  - src/atlas/components/chat/ResearchClarificationCard.tsx — clarification
    form for the engine's scope questions (84 lines).
  - src/atlas/components/chat/ResearchAgentCard.tsx — per-agent progress
    surface used by ResearchMatrix (121 lines).
  - src/atlas/components/chat/deepResearchTypes.ts — shared ResearchStep /
    AgentInfo / props types (37 lines).
Split or Fix Plan: Phase 4 split complete. No new exemption opened: every
file is under the 500-line hard limit. Only DeepResearchRunMessage.tsx
crosses soft 350 — acceptable while the run view still owns the Collapsible
process feed; revisit if it grows toward 500.
Expires: Resolved

File: src/components/workbench/cesium/useCesiumEntityLayers.ts
Owner: frontend/map
Rule Exempted: TS/TSX hard file-size limit
Reason: Cesium entity visualization layer hook.
Split or Fix Plan: Extract individual layer configurations into helper hooks.
Expires: Next map refactor

File: src-tauri/src/mcp/server.rs
Owner: backend/mcp
Rule Exempted: Rust hard file-size limit
Reason: MCP server with full 2025-06-18 spec handlers for resources, prompts, logging, completion, and roots.
Split or Fix Plan: Extract resources, prompts, and completion handlers into separate handler files under mcp/handlers/.
Expires: Next refactoring cycle

File: src-tauri/src/mcp/types.rs
Owner: backend/mcp
Rule Exempted: Rust warning file-size limit
Reason: Full MCP 2025-06-18 type definitions (JSON-RPC 2.0, resources, prompts, tools, logging, sampling, completion, roots).
Split or Fix Plan: Split into types/ sub-module by domain (lifecycle, tools, resources, prompts, logging).
Expires: Next refactoring cycle
