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
