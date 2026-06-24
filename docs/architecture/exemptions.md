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
Rule Exempted: TS/TSX hard file-size limit
Reason: Complex rendering for deep research progress steps.
Split or Fix Plan: Extract steps progress and sub-agent panel components into separate files.
Expires: Next frontend refactor

File: src/components/workbench/cesium/useCesiumEntityLayers.ts
Owner: frontend/map
Rule Exempted: TS/TSX hard file-size limit
Reason: Cesium entity visualization layer hook.
Split or Fix Plan: Extract individual layer configurations into helper hooks.
Expires: Next map refactor
