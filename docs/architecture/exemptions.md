# Architecture Exemptions

Exemptions are temporary. They exist so the rebuild can be incremental without
pretending current debt is acceptable.

> **Backend exemptions below were closed out 2026-08-26 at the end of the
> workspace migration** (recorded in
> [history/BIG_MIGRATION.md](history/BIG_MIGRATION.md)) against measured line
> counts. The hard-fail band is empty: no `.rs` file under `src-tauri/src/**` or
> `src-tauri/crates/**` exceeds 900 lines. `scripts/quality-check.ps1` scans
> `src-tauri/crates/**` alongside the app crate, so extracted-crate files are held
> to the same hard limit. Entries marked RESOLVED are kept as a record of where
> each responsibility now lives; the app-side re-export shims those notes mention
> were deleted at the end of the migration, so the crate path is now the only
> path. Every surviving warning-band entry (700–900) carries an owner and a
> concrete split plan, and expires on the next refactor that touches its surface
> rather than on a migration phase — splitting them is ordinary refactoring debt,
> not migration debt.

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

File: src-tauri/src/agent/tools/spawn_tools.rs (1,716) — RESOLVED Phase 11:
moved to src-tauri/src/agent/tools/spawn_tools/ (executors stay app-side per
the Phase 5 AppHandle sanction) and split into child.rs (523), tool.rs (416),
deps.rs (314), failure.rs (174), model_select.rs (111), outcome.rs (88),
completion.rs (61), messaging.rs (51), params.rs (30), mod.rs (35) — all
sub-threshold; no successor exemption.
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: (historical) Subagent spawn workflow owned registry definitions, handoff construction, child execution, and completion plumbing in one legacy file.
Split or Fix Plan: Done in Phase 11 (split into spawn_tools/{child,tool,deps,...}).
Expires: resolved migration/phase-11-done

File: src-tauri/src/llm/openai_compat/stream.rs (1,627) — RESOLVED Phase 7:
moved to crates/zen-llm/src/openai_compat/ and split into stream.rs (699),
stream_events.rs (108), capabilities.rs (136), stream_tests.rs (719, via
#[path]); the app-side re-export shim was deleted at the end of the migration.
Owner: backend/llm
Rule Exempted: Rust hard file-size limit
Reason: (historical) OpenAI-compatible SSE parsing, tool-delta accumulation, and reasoning mapping share one streaming module.
Split or Fix Plan: Done in Phase 7 (split into stream/stream_events/capabilities/stream_tests inside zen-llm).
Expires: resolved migration/phase-07-done

File: src-tauri/src/agent/deep_research/phases.rs (1,609) — RESOLVED Phase 11:
moved to crates/zen-agent/src/deep_research/ and split into phases/dispatch.rs
(572), phases/plan.rs (337), phases/report.rs (317), phases/search.rs (282),
phases/analyze.rs (131) plus llm.rs (464), engine.rs (387), types.rs (351),
mod.rs (336), extractor.rs (92) — all sub-threshold; no successor exemption.
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: (historical) All multi-phase deep research execution steps lived in one file.
Split or Fix Plan: Done in Phase 11 (split into deep_research/phases/{dispatch,plan,report,search,analyze}).
Expires: resolved migration/phase-11-done

File: src-tauri/crates/zen-security/src/policy.rs (1,393) — RESOLVED Phase 12:
the two inline security-regression suites were extracted to
policy_mode_risk_tests.rs (307) and policy_tests.rs (417), declared from
policy.rs via #[path] (openai_compat/stream_tests.rs precedent) so they keep
module-relative access to the private helpers they pin. policy.rs is now 683
lines — below the 700 warn threshold, so no successor exemption is needed.
Owner: backend/security
Rule Exempted: Rust hard file-size limit
Reason: (historical) Successor of the old src/tools/permission.rs (1,551) after
  the Phase 4 split into risk/approval/policy. The remaining size was the rules
  engine plus ~720 lines of inline security-regression tests (mode×risk matrix +
  layer precedence + plan-mode path-attack tests).
Split or Fix Plan: Done in Phase 12 (test modules moved to #[path] siblings;
  `cargo test -p zen-security` still runs all 53 tests including the 17
  mode_risk_matrix cases).
Expires: resolved migration/phase-12-done

File: src-tauri/src/agent/runner/loop.rs (1,434) — RESOLVED Phase 11: moved to
crates/zen-agent/src/runner/ and split into turn_loop.rs (797) + step_exec.rs
(858). Both stay in the 700-900 warn band with their own successor entries
below; no hard-fail successor.
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: (historical) Core agent execution loop owned turn iteration and step handling.
Split or Fix Plan: Done in Phase 11 (split into runner/{turn_loop,step_exec}); warn-band successors carried below.
Expires: resolved migration/phase-11-done

File: src-tauri/src/services/tool.rs (1,408) — RESOLVED Phase 12: split into
src/services/tool.rs (144, module wiring + re-exports) plus tool/agent_exec.rs
(393), tool/entry.rs (204), tool/approval.rs (202), tool/mutations.rs (150),
tool/authorized.rs (121), tool/audit.rs (118), tool/tests.rs (97) — all
sub-threshold; no successor exemption.
Owner: backend/services
Rule Exempted: Rust hard file-size limit
Reason: (historical) ToolService registry facade, approval execution, and lookup composed in one app-crate file.
Split or Fix Plan: Done in Phase 12 (split by concern: entry/approval/authorized/agent_exec/mutations/audit).
Expires: resolved migration/phase-12-done

File: src-tauri/src/agent/runner/helpers.rs (1,297) — RESOLVED Phase 11: moved
to crates/zen-agent/src/runner/ and split into runner/helpers/budget.rs (554)
+ runner/helpers/compact.rs (434) plus smaller topic modules — all
sub-threshold; no successor exemption.
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: (historical) Legacy shared runner helpers spanned context budgeting, streaming, and tool normalization.
Split or Fix Plan: Done in Phase 11 (split into runner/helpers/{budget,compact,...}).
Expires: resolved migration/phase-11-done

File: src-tauri/src/agent/runner/tool_dispatch.rs (1,253) — RESOLVED Phase 11:
moved to crates/zen-agent/src/runner/dispatch/ and split into router.rs (779,
warn-band successor below), executors.rs (849, warn-band successor below), plus
mod.rs and completion.rs (sub-threshold).
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: (historical) Tool dispatch routing and per-class executors shared one module.
Split or Fix Plan: Done in Phase 11 (split into runner/dispatch/{router,executors,completion,mod}); warn-band successors carried below.
Expires: resolved migration/phase-11-done

File: src-tauri/src/agent/runner/escalation.rs (1,114) — RESOLVED Phase 11:
moved to crates/zen-agent/src/runner/escalation.rs (438) after the runner
escalation/helpers split (commit b03328a); now sub-threshold, no successor
exemption.
Owner: backend/agent
Rule Exempted: Rust hard file-size limit
Reason: (historical) Escalation policy and flow coordination in one file.
Split or Fix Plan: Done in Phase 11 (escalation reduced to 438 lines during the pre-move split).
Expires: resolved migration/phase-11-done

File: src-tauri/src/llm/anthropic.rs (1,011) — RESOLVED Phase 7: moved to
crates/zen-llm/src/anthropic/ and split into mod.rs (171), wire.rs (193),
chat.rs (656), mapping.rs (32); the app-side re-export shim was deleted at the end of the migration.
Owner: backend/llm
Rule Exempted: Rust hard file-size limit
Reason: (historical) Anthropic client, mapping, and event conversion in one file.
Split or Fix Plan: Done in Phase 7 (split into anthropic/{mod,wire,chat,mapping} inside zen-llm).
Expires: resolved migration/phase-07-done

File: src-tauri/src/tools/manager.rs (1,010) — RESOLVED Phase 5: logic moved
to zen-tools and split into registry.rs (~640) + manager.rs (~1,180 incl.
tests); the app-side re-export shim was deleted at the end of the migration.
Owner: backend/tools
Rule Exempted: Rust hard file-size limit
Reason: (historical) V1 tool manager wrapped the agent tool registry and metadata catalog in one file.
Split or Fix Plan: Done in Phase 5 (Pre-task A unified the dual registries; manager split into zen-tools registry.rs + manager.rs).
Expires: resolved migration/phase-05-done

File: src-tauri/src/commands/chat/send.rs (940) — RESOLVED Phase 12: split into
src/commands/chat/send.rs (321, command entry + orchestration) plus
send/prompt.rs (233), send/route.rs (233), send/research.rs (176),
send/resolve.rs (164), send/persist.rs (117), send/history.rs (85),
send/validate.rs (88) — all sub-threshold; no successor exemption.
Owner: backend/commands
Rule Exempted: Rust hard file-size limit
Reason: (historical) Chat send command mixed validation, orchestration calls, and response mapping.
Split or Fix Plan: Done in Phase 12 (split into validate/resolve/history/prompt/route/research/persist).
Expires: resolved migration/phase-12-done

### Warning band (700–900 lines)

> **Disposition (2026-08-26, migration close).** The hard-fail band is empty: no
> file under `src-tauri/src/**` or `src-tauri/crates/**` exceeds 900 lines, and
> `scripts/quality-check.ps1` enforces the 900-line Rust hard limit over
> `src-tauri/crates/**` as well as the app crate. Every entry below is a
> *warning*-band file that the gate does not fail on. Rather than force sixteen
> speculative splits at the end of the migration, these are handed to the teams
> that own the surfaces with owners and concrete plans; each expires on the next
> refactor that touches its surface.

File: src-tauri/crates/zen-tools/src/manager.rs (818)
Owner: backend/tools
Rule Exempted: Rust warning file-size limit
Reason: Successor of the Phase 5 extraction from src-tauri/src/tools/manager.rs
  (1,010). Owns the discovery manager, the meta-tool definitions, and the
  permission-mode settings parsing plus its inline test module.
Split or Fix Plan: Move the inline test module to a #[path] sibling
  (openai_compat/stream_tests.rs precedent) — that alone drops the file well
  under the warn band.
Expires: next backend refactor touching tool discovery

File: src-tauri/crates/zen-llm/src/ollama/mod.rs (739)
Owner: backend/llm
Rule Exempted: Rust warning file-size limit
Reason: Successor of the old src-tauri/src/llm/ollama.rs after the Phase 7
  split into ollama/{mod,wire}; wire types moved out, the chat_stream body
  plus its inline wiremock suites remain. Executable code ~470 lines; tests
  are the bulk.
Split or Fix Plan: move the test module to a
  #[path] sibling (stream_tests precedent) if the gate is tightened to warn.
Expires: next backend refactor touching LLM providers — warn band only (see the band note above)

File: src-tauri/crates/zen-llm/src/openai_compat/stream_tests.rs (719)
Owner: backend/llm
Rule Exempted: Rust warning file-size limit
Reason: Wiremock suite for the openai_compat streaming/list-models surface,
  relocated wholesale from stream.rs during the Phase 7 split via #[path]
  (P5 manager-tests precedent). Test-only file.
Split or Fix Plan: split by subject (list_models vs
  streaming vs reasoning) if the warn band is enforced for test files.
Expires: next backend refactor touching LLM providers — warn band only (see the band note above)

File: src-tauri/src/canvas/session.rs (897)
Owner: backend/canvas
Rule Exempted: Rust warning file-size limit
Reason: Canvas session state and command application share one module (canvas stays in app crate).
Split or Fix Plan: Split into session state vs command application.
Expires: next backend refactor touching canvas sessions — warn band only (see the band note above)

File: src-tauri/src/agent/tools/fs_tools.rs (875)
Owner: backend/agent-tools
Rule Exempted: Rust warning file-size limit
Reason: Agent filesystem tool suite grew range-windowed document reads (offset/limit continuation markers) on top of read/write/edit/list. Phase 11 re-scope: like all leaf executors it stays in the app crate (it receives `AppHandle` through the frozen `AgentTool` trait), so the planned zen-agent move does not apply and the split was deferred rather than forced mid-phase.
Split or Fix Plan: split into fs/{read_tools.rs, write_tools.rs}.
Expires: next backend refactor touching agent filesystem tools — warn band only (see the band note above)

File: src-tauri/crates/zen-agent/src/event_bus.rs (856) — successor of the
Phase 11 relocation from src-tauri/src/agent/event_bus.rs. Owns the R5
`AgentEvent::event_name()` SSOT plus payload structs; kept whole so the
event-name mapping stays in one auditable place.
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: AgentEvent contract, artifact tag detection, and the broadcast bus share one file; splitting would scatter the byte-identical event-name contract across modules.
Split or Fix Plan: split payload structs from bus impl if the gate extends to crates/** with warn enforcement.
Expires: next backend refactor touching the agent runtime — warn band only (see the band note above)

File: src-tauri/src/llm/ollama.rs (852) — RESOLVED Phase 7: moved to
crates/zen-llm/src/ollama/ and split into mod.rs (739, successor entry below)
+ wire.rs (125); the app-side re-export shim was deleted at the end of the migration.
Owner: backend/llm
Rule Exempted: Rust warning file-size limit
Reason: (historical) Ollama client and streaming in one file.
Split or Fix Plan: Done in Phase 7 (split into ollama/{mod,wire} inside zen-llm).
Expires: resolved migration/phase-07-done

File: src-tauri/src/services/mcp_config.rs (805) — RESOLVED Phase 8: moved to
crates/zen-mcp/src/ and split per plan into config.rs (609, parse/merge/
validate) + config_store.rs (220, path/file-I/O/audit persistence); both
sub-threshold, no successor exemption. The app-side services re-export shim was
deleted at the end of the migration.
Owner: backend/mcp
Rule Exempted: Rust warning file-size limit
Reason: (historical) MCP config parsing and persistence orchestration share one service file.
Split or Fix Plan: Done in Phase 8 (config parsing vs persistence split inside zen-mcp).
Expires: resolved migration/phase-08-done

File: src-tauri/src/services/speech_service/mod.rs (784) — RESOLVED Phase 10:
moved to src-tauri/crates/zen-media/src/speech_service/ and split during the
move into mod.rs (565) + server.rs (230), both under the 700 warn band; no
successor exemption.
Owner: backend/media
Rule Exempted: Rust warning file-size limit
Reason: Speech service owns capture, VAD pipeline wiring, and transcription orchestration in one module.
Split or Fix Plan: Done — moved to zen-media and split during the move.
Expires: resolved migration/phase-10-done (moved to crates/zen-media/src/speech_service/; split into mod.rs 565 + server.rs 230, both under the 700 warn band; the app-side re-export shim was deleted at the end of the migration).

File: src-tauri/crates/zen-agent/src/router.rs (796) — successor of the Phase 11
relocation from src-tauri/src/agent/router.rs. Note: the Phase 11 ledger listed
this entry under the `runner/dispatch/` path; the current file is the crate-root
router.rs, while runner/dispatch/router.rs measures 266 and needs no exemption.
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Agent router combines model routing decisions and fallback logic.
Split or Fix Plan: Renewed — split tier schema inlining from routing. Warn band
  only; the gate extended to crates/** in Phase 12 enforces the 900 hard limit,
  which this file is well under.
Expires: next backend refactor touching agent routing

File: src-tauri/crates/zen-agent/src/runner/dispatch/executors.rs (849) — new
split product of Phase 11 (carved out of the former 1,253-line
tool_dispatch.rs).
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Per-tool-class executors (approval-gated, interactive, direct) share one dispatch module by design so approval ordering stays in one place.
Split or Fix Plan: group executors by class into submodules.
Expires: next backend refactor touching the agent runtime — warn band only (see the band note above)

File: src-tauri/crates/zen-agent/src/runner/turn_loop.rs (797) — new split
product of Phase 11 (carved out of the former 1,434-line runner loop.rs).
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Turn iteration owns the escalation ladder and per-turn bookkeeping in one control-flow file.
Split or Fix Plan: extract turn bookkeeping helpers.
Expires: next backend refactor touching the agent runtime — warn band only (see the band note above)

File: src-tauri/crates/zen-agent/src/runner/step_exec.rs (858) — new split
product of Phase 11 (carved out of the former 1,434-line runner loop.rs).
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Single-step execution spans assistant-message handling, tool-call planning, and finish-reason branches.
Split or Fix Plan: split message vs tool-planning vs finish handling.
Expires: next backend refactor touching the agent runtime — warn band only (see the band note above)

File: src-tauri/crates/zen-agent/src/runner/voice_display.rs (736) — successor
of the Phase 11 relocation from src-tauri/src/agent/runner/voice_display.rs
(board emission now flows through the BoardPort seam; the raw tauri listener
lives in the app-side adapter).
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Voice display agent bridge owns transcription surface rendering and lifecycle.
Split or Fix Plan: split normalization helpers from the runner glue.
Expires: next backend refactor touching the agent runtime — warn band only (see the band note above)

File: src-tauri/src/commands/settings.rs (756)
Owner: backend/commands
Rule Exempted: Rust warning file-size limit
Reason: Settings command surface aggregates many small typed IPC handlers (stays in app crate).
Split or Fix Plan: split by settings domain if still over 700.
Expires: next backend refactor touching this command surface — warn band only (see the band note above)

File: src-tauri/crates/zen-agent/src/plugins.rs (755) — successor of the
Phase 11 relocation from src-tauri/src/agent/plugins.rs.
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Plugin registration and lifecycle in one file.
Split or Fix Plan: split registration from lifecycle.
Expires: next backend refactor touching the agent runtime — warn band only (see the band note above)

File: src-tauri/crates/zen-agent/src/runner/context_breakdown.rs (748) —
successor of the Phase 11 relocation from
src-tauri/src/agent/runner/context_breakdown.rs.
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Context budget breakdown rendering and computation share one module.
Split or Fix Plan: split rendering from computation.
Expires: next backend refactor touching the agent runtime — warn band only (see the band note above)

File: src-tauri/crates/zen-agent/src/orchestrator/execution.rs (710) —
successor of the Phase 11 relocation from
src-tauri/src/agent/orchestrator/execution.rs.
Owner: backend/agent
Rule Exempted: Rust warning file-size limit
Reason: Orchestrator execution coordination in one file.
Split or Fix Plan: split coordination from per-agent execution if still over 700.
Expires: next backend refactor touching the agent runtime — warn band only (see the band note above)

File: src-tauri/src/commands/spatial.rs (724)
Owner: backend/commands
Rule Exempted: Rust warning file-size limit
Reason: Spatial/geospatial command surface aggregates typed IPC handlers (stays in app crate).
Split or Fix Plan: split by domain if still over 700.
Expires: next backend refactor touching this command surface — warn band only (see the band note above)

File: src-tauri/src/commands/mod.rs (709) — RESOLVED: re-measured at 621 lines in
the Phase 12 sweep (the ledger figure predated the per-domain command splits), so
it is below the 700 warn threshold and needs no exemption.
Owner: backend/commands
Rule Exempted: Rust warning file-size limit
Reason: (historical) Command module registry and shared helpers.
Split or Fix Plan: No action needed — sub-threshold.
Expires: resolved migration/phase-12-done

### Closed backend entries (kept as record)

These file paths are pre-workspace-migration; they no longer exist. Each line
records where the responsibility ended up so an old reference can be resolved.

File: src-tauri/src/commands/chat.rs
Result: Resolved before the migration — split into src-tauri/src/commands/chat/{mod,send,crud,lifecycle,...}.rs, which is still the app-side home. Current offender status is tracked by the send.rs entry above.

File: src-tauri/src/mcp/server.rs
Result: Resolved — the MCP server handlers were decomposed, then moved to the zen-mcp crate. No file under src-tauri/crates/zen-mcp/src/** exceeds 700 lines (largest: client/mod.rs at 642).

File: src-tauri/src/mcp/types.rs
Result: Resolved — decomposed, then moved to src-tauri/crates/zen-mcp/src/types.rs; no exemption required.

## Frontend Exemptions

> **Note (2026-08-25).** Extending `scripts/quality-check.ps1` to scan
> `src-tauri/crates/**` surfaced four *frontend* files that were already over the
> 500-line TS/TSX hard limit at HEAD with no exemption entry — the gate had been
> failing on them independently of the backend migration. They are recorded below
> so the gate reflects reality; owners are the frontend surfaces, not the
> migration.

File: src/api/mockClient.ts
Owner: frontend/api
Rule Exempted: TS/TSX hard file-size limit
Reason: 659 lines. Development-only mock of the entire Tauri command surface; its size tracks the command count, not internal complexity.
Split or Fix Plan: Split per command domain (chat, settings, mcp, workspace) mirroring src/api/tauriClient.ts.
Expires: Next frontend refactor

File: src/atlas/components/chat/PremiumChatInputFixture.tsx
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit
Reason: 686 lines. Development fixture harness that exercises every composer state in one file.
Split or Fix Plan: Split per fixture scenario, or move under a dev-only directory excluded from the product gate.
Expires: Next frontend refactor

File: src/atlas/components/chat/assistantMessageParts.ts
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit
Reason: 593 lines. Canonical projection from message records to rendered assistant parts; owns the part-kind taxonomy in one place deliberately.
Split or Fix Plan: Extract per-part-kind projectors, keeping the taxonomy union in a single small module.
Expires: Next frontend refactor

File: src/atlas/hooks/stream/agentActionLedger.ts
Owner: frontend/chat-stream
Rule Exempted: TS/TSX hard file-size limit
Reason: 537 lines. Streaming action ledger reconciles tool, subagent, and artifact events into one ordered timeline.
Split or Fix Plan: Split ledger reduction from the event-normalization helpers.
Expires: Next frontend refactor

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
