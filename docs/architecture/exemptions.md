# Architecture Exemptions

Exemptions are temporary. They exist so the rebuild can be incremental without
pretending current debt is acceptable.

> **Backend exemptions below were refreshed 2026-08-22 (Phase 0 of the
> BIG_MIGRATION.md workspace migration) against measured line counts.**
> Every Rust file >700 lines carries an entry whose `Expires` field is the
> migration phase that splits or relocates it; app-crate stragglers expire at
> Phase 12 (file-size debt sweep). Entries are closed when the split lands.

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

### Hard-fail band (>900 lines)

File: src-tauri/src/agent/tools/spawn_tools.rs (1,716)
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: Subagent spawn workflow owns registry definitions, handoff construction, child execution, and completion plumbing in one legacy file.
Split or Fix Plan: Move to zen-agent during Phase 11 and split into spawn/{registry.rs, handlers.rs}.
Expires: migration/phase-11-done

File: src-tauri/src/llm/openai_compat/stream.rs (1,627) — RESOLVED Phase 7:
moved to crates/zen-llm/src/openai_compat/ and split into stream.rs (699),
stream_events.rs (108), capabilities.rs (136), stream_tests.rs (719, via
#[path]); the app path is now a §4.6 re-export shim.
Owner: backend/llm
Rule Exempted: Rust hard file-size limit
Reason: (historical) OpenAI-compatible SSE parsing, tool-delta accumulation, and reasoning mapping share one streaming module.
Split or Fix Plan: Done in Phase 7 (split into stream/stream_events/capabilities/stream_tests inside zen-llm).
Expires: resolved migration/phase-07-done

File: src-tauri/src/agent/deep_research/phases.rs (1,609)
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: All multi-phase deep research execution steps live in one file.
Split or Fix Plan: Move to zen-agent during Phase 11 and split into deep_research/phases/{mod.rs, phase_*.rs}.
Expires: migration/phase-11-done

File: src-tauri/crates/zen-security/src/policy.rs (1,393)
Owner: backend/security
Rule Exempted: Rust hard file-size limit
Reason: Successor of the old src/tools/permission.rs (1,551) after the
  Phase 4 split into risk/approval/policy. The remaining size is the rules
  engine plus its inline security-regression suites (mode×risk matrix +
  layer precedence + plan-mode path-attack tests, ~720 lines of tests);
  the executable code portion is ~670 lines. Kept together deliberately:
  the matrix tests pin the same 6-layer chain they test and reference its
  private helpers.
Split or Fix Plan: Extract the test modules into zen-security/tests/ during
  the Phase 12 file-size sweep if crate files are brought under the gate.
Expires: migration/phase-12-done

File: src-tauri/src/agent/runner/loop.rs (1,434)
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: Core agent execution loop owns turn iteration and step handling.
Split or Fix Plan: Move to zen-agent during Phase 11 and split into runner/{turn_loop.rs, step_exec.rs}.
Expires: migration/phase-11-done

File: src-tauri/src/services/tool.rs (1,408)
Owner: backend/services
Rule Exempted: Rust hard file-size limit
Reason: ToolService registry facade, approval execution, and lookup still compose in the app crate (composition shell by design after migration).
Split or Fix Plan: Thin facade over zen-tools/zen-security in Phase 12; split approval execution vs lookup.
Expires: migration/phase-12-done

File: src-tauri/src/agent/runner/helpers.rs (1,297)
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: Legacy shared runner helpers span context budgeting, streaming, and tool normalization.
Split or Fix Plan: Move to zen-agent during Phase 11 and split into runner/support/ by topic.
Expires: migration/phase-11-done

File: src-tauri/src/agent/runner/tool_dispatch.rs (1,253)
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: Tool dispatch routing and per-class executors share one module.
Split or Fix Plan: Move to zen-agent during Phase 11 and split into runner/dispatch/{router.rs, executors.rs}.
Expires: migration/phase-11-done

File: src-tauri/src/agent/runner/escalation.rs (1,114)
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: Escalation policy and flow coordination in one file.
Split or Fix Plan: Move to zen-agent during Phase 11 and split into runner/escalation/{policy.rs, flow.rs}.
Expires: migration/phase-11-done

File: src-tauri/src/llm/anthropic.rs (1,011) — RESOLVED Phase 7: moved to
crates/zen-llm/src/anthropic/ and split into mod.rs (171), wire.rs (193),
chat.rs (656), mapping.rs (32); the app path is now a §4.6 re-export shim.
Owner: backend/llm
Rule Exempted: Rust hard file-size limit
Reason: (historical) Anthropic client, mapping, and event conversion in one file.
Split or Fix Plan: Done in Phase 7 (split into anthropic/{mod,wire,chat,mapping} inside zen-llm).
Expires: resolved migration/phase-07-done

File: src-tauri/src/tools/manager.rs (1,010) — RESOLVED Phase 5: logic moved
to zen-tools and split into registry.rs (~640) + manager.rs (~1,180 incl.
tests); the app file is now a §4.6 re-export shim (8 lines).
Owner: backend/tools
Rule Exempted: Rust hard file-size limit
Reason: (historical) V1 tool manager wrapped the agent tool registry and metadata catalog in one file.
Split or Fix Plan: Done in Phase 5 (Pre-task A unified the dual registries; manager split into zen-tools registry.rs + manager.rs).
Expires: resolved migration/phase-05-done

File: src-tauri/src/commands/chat/send.rs (940)
Owner: backend/commands
Rule Exempted: Rust hard file-size limit
Reason: Chat send command still mixes validation, orchestration calls, and response mapping (stays in app crate).
Split or Fix Plan: Phase 12 split into validation vs orchestration vs response mapping.
Expires: migration/phase-12-done

### Warning band (700–900 lines)

File: src-tauri/crates/zen-llm/src/ollama/mod.rs (739)
Owner: backend/llm
Rule Exempted: Rust warning file-size limit
Reason: Successor of the old src-tauri/src/llm/ollama.rs after the Phase 7
  split into ollama/{mod,wire}; wire types moved out, the chat_stream body
  plus its inline wiremock suites remain. Executable code ~470 lines; tests
  are the bulk.
Split or Fix Plan: Phase 12 file-size sweep — move the test module to a
  #[path] sibling (stream_tests precedent) if the gate is tightened to warn.
Expires: migration/phase-12-done

File: src-tauri/crates/zen-llm/src/openai_compat/stream_tests.rs (719)
Owner: backend/llm
Rule Exempted: Rust warning file-size limit
Reason: Wiremock suite for the openai_compat streaming/list-models surface,
  relocated wholesale from stream.rs during the Phase 7 split via #[path]
  (P5 manager-tests precedent). Test-only file.
Split or Fix Plan: Phase 12 sweep — split by subject (list_models vs
  streaming vs reasoning) if the warn band is enforced for test files.
Expires: migration/phase-12-done

File: src-tauri/src/canvas/session.rs (897)
Owner: backend/canvas
Rule Exempted: Rust warning file-size limit
Reason: Canvas session state and command application share one module (canvas stays in app crate).
Split or Fix Plan: Phase 12 split into session state vs command application.
Expires: migration/phase-12-done

File: src-tauri/src/agent/tools/fs_tools.rs (877)
Owner: backend/agent-tools
Rule Exempted: Rust warning file-size limit
Reason: Agent filesystem tool suite grew range-windowed document reads (offset/limit continuation markers) on top of read/write/edit/list.
Split or Fix Plan: Move to zen-agent during Phase 11 and split into fs/{read_tools.rs, write_tools.rs}.
Expires: migration/phase-11-done

File: src-tauri/src/agent/event_bus.rs (862)
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: AgentEvent contract, artifact tag detection, and the broadcast bus share one file.
Split or Fix Plan: Port type moves to zen-core in Phase 6; bus impl moves to zen-agent or app bridge at Phase 11 per ownership decision.
Expires: migration/phase-11-done

File: src-tauri/src/llm/ollama.rs (852) — RESOLVED Phase 7: moved to
crates/zen-llm/src/ollama/ and split into mod.rs (739, successor entry below)
+ wire.rs (125); the app path is now a §4.6 re-export shim.
Owner: backend/llm
Rule Exempted: Rust warning file-size limit
Reason: (historical) Ollama client and streaming in one file.
Split or Fix Plan: Done in Phase 7 (split into ollama/{mod,wire} inside zen-llm).
Expires: resolved migration/phase-07-done

File: src-tauri/src/services/mcp_config.rs (805) — RESOLVED Phase 8: moved to
crates/zen-mcp/src/ and split per plan into config.rs (609, parse/merge/
validate) + config_store.rs (220, path/file-I/O/audit persistence); both
sub-threshold, no successor exemption. The app path is now part of the §4.6
services re-export shim.
Owner: backend/mcp
Rule Exempted: Rust warning file-size limit
Reason: (historical) MCP config parsing and persistence orchestration share one service file.
Split or Fix Plan: Done in Phase 8 (config parsing vs persistence split inside zen-mcp).
Expires: resolved migration/phase-08-done

File: src-tauri/src/services/speech_service/mod.rs (784)
Owner: backend/media
Rule Exempted: Rust warning file-size limit
Reason: Speech service owns capture, VAD pipeline wiring, and transcription orchestration in one module.
Split or Fix Plan: Move to zen-media during Phase 10 and split during the move.
Expires: migration/phase-10-done

File: src-tauri/src/agent/router.rs (779)
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Agent router combines model routing decisions and fallback logic.
Split or Fix Plan: Move to zen-agent during Phase 11; split or justify a continuing exemption entry at that point.
Expires: migration/phase-11-done

File: src-tauri/src/agent/runner/voice_display.rs (770)
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Voice display agent bridge owns transcription surface rendering and lifecycle.
Split or Fix Plan: Move to zen-agent during Phase 11; split or justify a continuing exemption entry at that point.
Expires: migration/phase-11-done

File: src-tauri/src/commands/settings.rs (756)
Owner: backend/commands
Rule Exempted: Rust warning file-size limit
Reason: Settings command surface aggregates many small typed IPC handlers (stays in app crate).
Split or Fix Plan: Phase 12 sweep — split by settings domain if still over 700.
Expires: migration/phase-12-done

File: src-tauri/src/agent/plugins.rs (755)
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Plugin registration and lifecycle in one file.
Split or Fix Plan: Move to zen-agent during Phase 11; split or justify a continuing exemption entry at that point.
Expires: migration/phase-11-done

File: src-tauri/src/agent/runner/context_breakdown.rs (748)
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Context budget breakdown rendering and computation share one module.
Split or Fix Plan: Move to zen-agent during Phase 11; split or justify a continuing exemption entry at that point.
Expires: migration/phase-11-done

File: src-tauri/src/agent/orchestrator/execution.rs (727)
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Orchestrator execution coordination in one file.
Split or Fix Plan: Move to zen-agent during Phase 11; split or justify a continuing exemption entry at that point.
Expires: migration/phase-11-done

File: src-tauri/src/commands/spatial.rs (724)
Owner: backend/commands
Rule Exempted: Rust warning file-size limit
Reason: Spatial/geospatial command surface aggregates typed IPC handlers (stays in app crate).
Split or Fix Plan: Phase 12 sweep — split by domain if still over 700.
Expires: migration/phase-12-done

File: src-tauri/src/commands/mod.rs (709)
Owner: backend/commands
Rule Exempted: Rust warning file-size limit
Reason: Command module registry and shared helpers (stays in app crate).
Split or Fix Plan: Phase 12 — extract per-domain command registration groups alongside the lib.rs boot split.
Expires: migration/phase-12-done

### Closed backend entries (kept as record)

File: src-tauri/src/commands/chat.rs
Result: Resolved earlier — split into src-tauri/src/commands/chat/{mod,send,crud,lifecycle,...}.rs. Current offender status is tracked by the send.rs entry above.

File: src-tauri/src/mcp/server.rs
Result: Resolved — full MCP server handlers were decomposed; no mcp/*.rs file exceeds 700 lines today (largest: stdio.rs at 499).

File: src-tauri/src/mcp/types.rs
Result: Resolved — now 251 lines; no exemption required.

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

File: src/atlas/hooks/stream/useChatChunkEvent.ts
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit
Reason: Chunk/done/error stream listener owns first-chunk buffering, runtime-bridge draining, and deep-research handoff finalization in one boundary.
Split or Fix Plan: Extract the done/error finalization and deep-research handoff branches behind the existing hook facade.
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
