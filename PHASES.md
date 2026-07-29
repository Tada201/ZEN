# Chat Inline UI / Execution Timeline — Phased Plan

**Last updated:** 2026-07-25

This file tracks the multi-phase effort to make Zen's chat inline UI consistent, premium, and reload-safe.

---

## Phase 0 — Discovery & Audit

**Status:** ✅ Completed (2026-07-25)

**Goal:** Understand the current chat inline UI flow from agent execution to message rendering, identify reload/persistence issues, and compare against industry reference apps (ChatGPT, Codex, Claude).

**Deliverables:**
- Read frontend design doc (`frontende-design.md`) and frontend architecture rules.
- Examined backend runner loop, event bus, and persistence layer.
- Examined frontend event handlers, API wrappers, and message normalization.
- Identified root cause: the assistant-message execution timeline (`steps`) was stored only in memory and lost on reload.
- Identified secondary issues: optimistic frontend message IDs diverged from backend persisted IDs.

**References:**
- `frontende-design.md`
- `docs/architecture/frontend-rules.md`
- `src-tauri/src/agent/runner/loop.rs`
- `src-tauri/src/agent/event_bus.rs`
- `src/atlas/hooks/stream/useChatChunkEvent.ts`
- `src/atlas/components/chat/types.ts`

---

## Phase 1 — Execution Timeline Persistence

**Status:** ✅ Completed (2026-07-25)

**Goal:** Persist the assistant-message execution timeline so the chat UI looks identical before and after reload.

**Changes:**
- Added `steps_json TEXT` column to the `messages` table.
- Added `update_message_steps` Tauri command (`src-tauri/src/commands/chat/crud.rs`).
  - Validates JSON syntax.
  - Enforces a 2 MB size cap.
  - Updates only `role = 'assistant'` rows scoped to the exact chat/message pair.
- Added `queries::update_message_steps` (`src-tauri/src/db/queries/message.rs`).
- Added `chatApi.updateMessageSteps` frontend API wrapper (`src/api/chatApi.ts`).
- Extended `ChatDonePayload` with `message_id` (`src-tauri/src/agent/event_bus.rs`).
- Updated runners to emit the backend `message_id` in `chat:done`.
- Updated `useChatChunkEvent` to persist `assistant.steps` via `updateMessageSteps` on `chat:done`.
- Updated `normalizeVercelMessage` to rehydrate `steps` from `stepsJson` when available.
- Added unit tests and doc tests for `validate_steps_json`.
- Added ADR: `docs/architecture/execution-timeline-persistence.md`.

**Validation:**
- `cd src-tauri && cargo check --all-targets` passes (pre-existing warnings only).
- `cd src-tauri && cargo test commands::chat::crud::tests` blocked by local Windows `STATUS_ENTRYPOINT_NOT_FOUND` issue; not a code failure.

**Known Limitations:**
- Deep research and orchestrator branches still emit `message_id: None`, so their timelines are not yet persisted.
- `steps` are only persisted at `chat:done`; a mid-stream reload still loses the live timeline.

---

## Phase 2 — Backend Message ID Audit & Rules

**Status:** ✅ Completed (2026-07-25)

**Goal:** Ensure all chat events use backend message IDs correctly and document the contract.

**Changes:**
- Audited backend emissions of `chat:message`, `chat:error`, and `chat:stream-reset`.
- Documented the backend message ID contract in `docs/architecture/frontend-rules.md`.
- Added rules:
  - `chat:done` carries `message_id` for post-stream persistence.
  - `chat:message` carries `id` for upsert/replace of optimistic placeholders.
  - `chat:error` and `chat:stream-reset` do not target a specific message.
  - Optimistic IDs are temporary; backend IDs are authoritative.

**References:**
- `src-tauri/src/agent/event_bus.rs`
- `src/api/events.ts`
- `src/atlas/hooks/stream/useChatChunkEvent.ts`
- `docs/architecture/frontend-rules.md`

---

## Phase 3 — UI/UX Inline Chat Polish

**Status:** ✅ Completed (2026-07-25)

**Goal:** Make the inline chat UI feel premium, consistent, and free of transparent / glassy / hard-to-read tool-call cards.

**Completed so far:**
- Audited and fixed `ToolCallCard`, `AgentExecutionTrace`, `ExecutionGroup`, and `AssistantMessage` for transparency, contrast, and hierarchy.
- Audited and fixed `ReasoningBlock`, `MarkdownContent`, and `StreamingSkeleton` for similar glassy/transparent styling and low-contrast text.
- Audited and fixed `CodeBlock`, `FileTree`, `MessageList`, and `DeepResearchRunMessage` for the same issues.
- Removed or hardened overly transparent backgrounds (`bg-card/90`, `bg-card/60`, `bg-background/40`, `backdrop-blur`, etc.).
- Standardized hover states and transitions across cards and triggers.
- Documented findings in `docs/audits/phase3-ui-audit.md`.
- Updated `docs/architecture/frontend-rules.md` with explicit "Surface & Readability Rules" forbidding glassmorphism and low-contrast opacity on primary surfaces.
- Fixed shared components that propagate glassmorphism: `CardShell.tsx`, `AppDialog.tsx`, and `WorkspaceLayout.tsx` now use solid semantic surfaces (`bg-card`, `bg-background`, `border-border`) instead of translucent backgrounds/backdrop blur.

**Completed (app-wide glassmorphism/opacity sweep):**
- Audited and fixed remaining glassmorphism/low-opacity surfaces outside the chat timeline.
- Replaced translucent HUD panels, widgets, and modals in `src/components/Zen/` and `src/components/GTSM/` with solid semantic surfaces (`bg-card`, `bg-muted`, `border-border`).
- Updated `scripts/fix-zen-gtsm-glass.mjs` and documented the manual template-literal edge cases.
- Validated with `npx tsc --noEmit` and confirmed zero remaining `backdrop-blur` / `bg-background/` / `bg-card/` / `bg-muted/` matches in the affected directories.

**Remaining (optional):**
- Verify the timeline renders the same after reload (rely on Phase 1 persistence).
- Add a verification step / visual diff test if possible.

**References:**
- `docs/audits/app-wide-glassmorphism-audit.md`
- `src/atlas/components/chat/ToolCallCard.tsx`
- `src/atlas/components/chat/AgentExecutionTrace.tsx`
- `src/atlas/components/chat/ExecutionGroup.tsx`
- `src/atlas/components/chat/AssistantMessage.tsx`
- `src/atlas/components/chat/ReasoningBlock.tsx`
- `src/atlas/components/chat/MarkdownContent.tsx`
- `src/atlas/components/chat/StreamingSkeleton.tsx`
- `frontende-design.md`
- `docs/architecture/frontend-rules.md`
- `docs/audits/phase3-ui-audit.md`

---

## Phase 4 — Subagent Execution Preview & Tool-Call Card Refinements

**Status:** ✅ Completed (stray-ledger verifier pending)

**Goal:** Make multi-agent delegation and individual tool calls feel intentional, inspectable, and reload-safe inside the chat timeline. Ensure subagent runs are previewed like first-class execution steps, and that tool-call cards render file edits, shell output, code diffs, and search results consistently with leading coding assistants (ChatGPT/Codex, Claude).

---

### Problems to Solve

1. **Subagent runs are invisible in the chat timeline.**
   - When a parent agent spawns a subagent, the user sees only the final tool result or a generic status line.
   - No preview of subagent name, task, running state, nested tool calls, or final handoff result.
   - Reloading the app drops any in-flight subagent state because the subagent is not represented in the persisted `steps_json` shape.

2. **Tool-call cards are one-size-fits-all.**
   - `ToolCallCard` currently shows verb + filename + delta, but treats file edits, bash output, search results, and artifacts identically.
   - File edits need inline diff / before-after preview.
   - Bash/terminal output needs a compact terminal block, not a JSON blob.
   - Search results need a citation list, not raw output.
   - Stray tool calls (ghost cards from optimistic IDs that are never matched to a backend ID) still appear before reload and vanish after reload.

3. **Collapsed / expanded states waste space and hide context.**
   - Completed tool groups collapse to a single line, which is good, but there is no quick preview of the result (e.g., "2 files changed" or "search found 4 results").
   - Approval cards always expand; successful background tools should stay compact.

4. **Reload safety is partial.**
   - Phase 1 persists `steps_json`, but subagent-specific steps and tool-call output previews are not explicitly included in the persistence contract.
   - Tool-call cards with optimistic IDs that are not yet reconciled to backend IDs can re-appear as "stray" cards after reload.

---

### Sub-milestones

- **4a — Subagent execution preview:** ✅ backend step type → frontend card → persistence → typecheck. Verifier still TODO.
- **4b — Backend stray-tool-call audit:** ✅ stable backend IDs / deduplication; integration test still TODO.
- **4c — Design alignment & rules:** ✅ Docs complete. Added `docs/architecture/chat-inline-tool-cards.md` UX reference, updated `docs/architecture/frontend-rules.md` Tool-Card UX rules, and added an enforcement checklist. Reference screenshots and the three open questions (diff default, terminal truncation, subagent inline vs panel) are still pending.
- **4d — Tool-call card refinements:** ✅ Completed. Refactored `ToolCallCard` to use content-type renderers (`FileEditContent`, `TerminalContent`, `SearchContent`, `ArtifactContent`, `ImageContent`, `GenericContent`), fixed status-driven expand/collapse, removed remaining low-opacity surfaces, and wired stray-tool-call reconciliation with backend IDs + deduplication in `useChatChunkEvent`. Add a verifier/test for stray-ledger reconciliation still TODO.

---

### Deliverables

#### 4.1 Subagent execution preview (backend-first, then frontend)
- Extend the `Step` / `ToolCall` types and backend `StepEvent` to support a `subagent` kind:
  - `agent_id`, `parent_agent_id`, `task`, `status`, `result_summary`, `child_tool_calls`.
- Emit `chat:step` events for subagent spawn/complete from the agent runner and spawn tools (`src-tauri/src/agent/runner/loop.rs`, `src-tauri/src/agent/tools/spawn_tools.rs`, `src-tauri/src/agent/tools/child_runner.rs`, `event_bus.rs`).
- Create `SubagentExecutionCard.tsx` in `src/atlas/components/chat/`:
  - Collapsed: avatar/name, task label, spinner/completed icon, elapsed time.
  - Expanded: nested list of child tool calls (reusing `AgentExecutionTrace`), final handoff summary, error state.
- Wire `AgentExecutionTrace` / `ExecutionGroup` to recognize `subagent` steps and render the new card.
- Update `update_message_steps` validation to accept and cap the new `subagent` shape.
- Add a `steps_version` field or DB migration so persisted `steps_json` can be versioned and safely extended.
- Preserve backward compatibility: load old `steps_json` without `steps_version` as version `1` and migrate in-memory on normalization.
- Add a verifier script `test/verify-subagent-execution-preview.mjs` that sends a chat, spawns a subagent, and checks the persisted `steps_json` after reload.

#### 4.2 Backend stray-tool-call audit (must precede frontend reconciliation fixes)
- Audit `chat:step`, `chat:message`, and `chat:done` emissions in the runner, spawn tools, and event bus for duplicate or orphan tool-call events.
- Ensure every emitted tool-call step carries a stable backend ID so the frontend can reconcile optimistic placeholders without producing stray cards.
- Add backend unit tests for tool-call step identity and deduplication.

#### 4.3 Tool-call card refinements (after backend events are stable)
- Refactor `ToolCallCard.tsx` to use a content-type strategy. Extend existing helpers (`tool/toolOutputPreview.ts`, `assistantMessageParts.ts`) rather than duplicating parsing logic:
  - `FileEditToolContent` — inline diff or "+N / −M" badge.
  - `TerminalToolContent` — monospaced output block with copy button.
  - `SearchToolContent` — numbered result snippets with source links.
  - `ArtifactToolContent` — existing artifact preview path.
  - `GenericToolContent` — current JSON/raw fallback.
- Fix stray-tool-call lifecycle in `useChatChunkEvent.ts`:
  - Track optimistic tool-call IDs.
  - When `chat:done` or `chat:message` arrives with backend IDs, prune unmatched optimistic IDs and reconcile duplicates.
- Improve collapsed previews:
  - Show one-line summary with icon + count + status.
  - Keep running/approval/error cards expanded by default; completed background cards collapsed.
- Add per-card animations that are subtle and consistent (`duration-200`, `fade-in`, no bouncing loaders).
- Ensure new subagent cards and tool cards use proper `aria-live` / status regions and focus management when a subagent completes or a tool requires approval.

#### 4.4 Design alignment with coding assistants
- Audit and document the UX patterns used by ChatGPT/Codex and Claude in `docs/architecture/chat-inline-tool-cards.md`:
  - Capture reference screenshots of Codex and Claude tool cards (file diff, terminal output, search results, subagent/handrail traces).
  - Create a comparison table mapping each tool type to the desired Zen card behavior.
  - Codex patterns to consider: file-tree diff blocks, terminal output blocks, per-step expand/collapse.
  - Claude patterns to consider: artifact panels, compact status chips, nested thought/tool traces.
- Update `docs/architecture/frontend-rules.md` with chat-timeline-specific rules for tool cards (summary line, output preview, no raw JSON as primary view).

#### 4.5 Tests & validation
- Add unit tests for `humanizeToolAction`, `buildToolOutputPreview`, and the new content-type renderers.
- Add Rust tests for subagent step serialization and `update_message_steps` validation.
- Register `test:subagent-execution-preview` in `package.json` scripts and add it to the CI verifier suite.
- Run the full verifier suite (`node test/verify-*.mjs`) after changes.
- Run `npx tsc --noEmit` and `cd src-tauri && cargo check --all-targets`.

---

### Acceptance Criteria

- A spawned subagent appears in the chat timeline as a first-class execution step with its name, task, running state, and final result visible.
- Reloading the app restores the subagent step and its child tool calls from persisted `steps_json` (backward compatible with older rows).
- Tool-call cards show the right content-type preview (diff, terminal, search, artifact) without surfacing raw JSON as the primary view.
- Stray tool-call cards do not appear after reload; backend IDs reconcile with optimistic placeholders.
- New verifier script and Rust tests pass; TypeScript and cargo checks pass.

---

### Validation

- `npx tsc --noEmit` passes.
- `cd src-tauri && cargo check --all-targets` passes.
- New verifier script `test/verify-subagent-execution-preview.mjs` passes end-to-end.
- Stray tool call reproducer (send a message, reload before `chat:done`, confirm no ghost cards) passes.
- Manual visual check against Codex/Claude reference screenshots.

---

### Out of Scope

- Deep-research / orchestrator timeline persistence (still emits `message_id: None`; may be covered in a future phase).
- New premium card types for subagent output (reuse existing `PremiumCard` / GenUI infrastructure).
- Backend agent runner architecture changes beyond event emission and step serialization.

---

### Known Risks & Open Questions

- **Schema churn:** Adding `subagent` to the `Step` union touches frontend, backend, and DB persistence. We should version or migrate carefully.
- **Backward compatibility:** Existing persisted `steps_json` rows lack `steps_version`. The frontend normalizer must default them to version `1` and gracefully ignore unknown future fields so the new shape can be introduced without a mandatory migration.
- **Performance:** Nested subagent traces with many child tool calls could bloat `steps_json`. We may need a depth/count cap and lazy expansion.
- **Mid-stream reload:** If a subagent is running when the user reloads, we can only show the persisted partial trace (Phase 1 already stores `steps_json`, but live in-memory state is still lost).
- **Tool content heuristics:** Detecting whether a tool output is a diff, terminal output, or search result is heuristic. We should prefer explicit tool metadata from the backend over sniffing.

---

### References

- `src/atlas/components/chat/ToolCallCard.tsx`
- `src/atlas/components/chat/AgentExecutionTrace.tsx`
- `src/atlas/components/chat/ExecutionGroup.tsx`
- `src/atlas/components/chat/AssistantMessage.tsx`
- `src/atlas/components/chat/assistantMessageParts.ts`
- `src/atlas/components/chat/tool/toolOutputPreview.ts`
- `src/atlas/hooks/stream/useChatChunkEvent.ts`
- `src/api/chatApi.ts`
- `src-tauri/src/agent/runner/loop.rs`
- `src-tauri/src/agent/tools/spawn_tools.rs`
- `src-tauri/src/agent/tools/child_runner.rs`
- `src-tauri/src/agent/tools/delegate_to_agent.rs`
- `src-tauri/src/agent/swarm.rs`
- `src-tauri/src/agent/event_bus.rs`
- `src-tauri/src/commands/chat/crud.rs`
- `docs/audits/phase3-ui-audit.md`
- `docs/architecture/frontend-rules.md`

---

## Phase 5 — Verification & Hardening

**Status:** ✅ Completed (2026-07-25)

**Goal:** Add the missing verifier scripts and pure helper functions that prove the Phase 4 chat inline UI changes are reload-safe and behave as designed.

**Changes:**
- Extracted stray-tool-ledger reconciliation from `useChatChunkEvent.ts` into a pure helper `reconcileStrayToolLedgers` in `src/atlas/hooks/stream/strayToolLedger.ts` so it can be unit-tested without pulling in React or Zustand.
- Updated `useChatChunkEvent.ts` to delegate to the new helper.
- Added `test/verify-stray-tool-ledger-reconciliation.mjs` covering:
  - basic stray merge into the real assistant,
  - preservation of non-matching ledgers,
  - deduplication against existing tools,
  - merging multiple stray tools for the same turn.
- Added `test/verify-subagent-execution-preview.mjs` covering:
  - rehydration of `stepsJson` containing subagent, tool-call, and text steps,
  - preservation of subagent-specific fields (agent name, task, status, result summary, child tool IDs).
- Registered both verifiers as npm scripts (`test:stray-tool-ledger-reconciliation`, `test:subagent-execution-preview`).

**Validation:**
- `npx tsc --noEmit` passes.
- `test/verify-stray-tool-ledger-reconciliation.mjs` passes.
- `test/verify-subagent-execution-preview.mjs` passes.

**References:**
- `src/atlas/hooks/stream/strayToolLedger.ts`
- `src/atlas/hooks/stream/useChatChunkEvent.ts`
- `src/atlas/components/chat/types.ts`
- `test/verify-stray-tool-ledger-reconciliation.mjs`
- `test/verify-subagent-execution-preview.mjs`

---

## Phase 6 — Reload-Safe Persistence for Deep Research & Orchestrator Timelines

**Status:** 🟡 Planned

**Goal:** Make deep-research and orchestrator progress timelines survive app reload and rehydrate identically on restart.

### Problem Statement

While Phase 1 introduced `steps_json` and Phase 4/5 made tool-call and subagent steps reload-safe, two long-running flows still lose their timeline on reload:

1. **Orchestrator progress events still carry `message_id: None`.**
   - `src-tauri/src/agent/orchestrator/loop.rs` and `execution.rs` emit `orchestrator:progress` without a target DB message ID.
   - `useAgentEvents.ts` therefore appends orchestrator steps only to the in-memory assistant message and never calls `chatApi.updateMessageSteps`.
   - After reload, the orchestrator timeline is empty.

2. **Deep-research steps are stored only in `message.metadata` and flushed once at the end.**
   - `src-tauri/src/agent/deep_research/mod.rs` accumulates `research_steps_events` in memory and writes them to `metadata` only when the run finishes or fails.
   - If the app reloads mid-research, the partially built timeline is lost.
   - The existing `chat:research-step` event already carries `message_id`, but the frontend only updates in-memory `metadata.researchSteps` and never persists back to the DB.

### Backend Changes

1. **Create/resolve the assistant message before emitting orchestrator progress.**
   - In `src-tauri/src/agent/orchestrator/loop.rs`, create the assistant DB row at the start of the orchestrator turn using the same `queries::add_message` pattern as `deep_research/mod.rs` (or resolve the existing one) and store the resulting `message_id` in the orchestrator state.
   - All subsequent `orchestrator:progress` events must carry this real `message_id`. The following sites were identified by a code audit and should be re-verified with ripgrep at implementation time:
     - `src-tauri/src/agent/orchestrator/loop.rs` (around lines 167, 363, 443)
     - `src-tauri/src/agent/orchestrator/execution.rs` (around lines 469, 496, 519, 541)
     - `src-tauri/src/agent/runner/loop.rs` (around lines 314, 657)
   - Since `AgentEvent::OrchestratorProgress` currently wraps a flexible `serde_json::Value`, add a top-level `message_id` field to that JSON before emitting.

2. **Add `message_id` to the orchestrator payload type.**
   - Add `message_id?: string` to the `orchestrator:progress` payload type in `src/api/events.ts` (model it as part of `AgentActionEventPayload`).
   - Update the Tauri event bridge so the new field is forwarded unchanged.

3. **Persist deep-research steps incrementally from the backend.**
   - In `src-tauri/src/agent/deep_research/mod.rs` and `phases.rs`, after each phase or sub-agent event, call `queries::update_message` with the updated `metadata` (containing `researchSteps`, `researchScope`, `researchProgress`) using the known `message_id`.
   - Only update the `metadata` column; do **not** touch `content` or `is_complete` until the final report is ready, to avoid corrupting the final state.
   - Do **not** wait until the run finishes; the DB must hold partial progress so a mid-stream reload can reconstruct the timeline.
   - If an incremental metadata write fails, log the error and continue the run; the worst case is that the latest few seconds of progress are lost on reload, not that the run aborts.
   - Enforce a size cap / truncation strategy (e.g., keep the most recent 250 research step events) so the metadata payload stays well under the existing 2 MB guard.

4. **Mirror research steps into the canonical `steps_json` (deferred).**
   - If the generic `AssistantMessage` timeline should also display research/orchestrator steps, a future iteration can write a `Step[]` snapshot into `steps_json` at the same time the metadata is flushed.
   - For this phase, the deep-research UI continues to use `metadata.researchSteps` as the source of truth; `steps_json` is only a fallback for other consumers. Do not implement the mirror unless it is required for a concrete UI change.

5. **Runner-level progress events.**
   - Audit `src-tauri/src/agent/runner/loop.rs` for any remaining `message_id: None` emissions.
   - Thread the active assistant message ID to those events, or route them through `update_message_steps` if they represent timeline progress.

### Frontend Changes

1. **Do not persist from the frontend.**
   - The backend is now the single writer for deep-research and orchestrator steps.
   - In `useAgentEvents.ts`, on `chat:research-step` and `orchestrator:progress`, update only the in-memory message (for immediate UI feedback). Do not call `updateMessageSteps` from the frontend for these events.
   - Events that arrive without a `message_id` (old cached events or pre-upgrade payloads) are handled gracefully: fall back to the current active assistant message in memory and skip the DB write.

2. **Rehydrate from the DB after reload.**
   - In `normalizeVercelMessage`, continue loading `metadata.researchSteps`, `researchScope`, and `researchProgress` for the deep-research UI.
   - For orchestrator progress, load any `stepsJson` containing `type: "orchestrator"` steps and merge them into the message's `steps` array.
   - If both `metadata.researchSteps` and `stepsJson` are present, prefer `metadata.researchSteps` for deep-research rendering; use `stepsJson` as a fallback/supplement only.

3. **Idempotent merge when the stream resumes.**
   - When a `chat:research-step` or `orchestrator:progress` event arrives after reload, merge it with the rehydrated steps by `id`/`eventId` rather than blindly appending.
   - This prevents duplicate timeline entries if the backend continues running while the frontend reloads.

4. **Mid-stream reload UX.**
   - If a message is in status `"sending"` on reload and persisted progress exists, render the progress UI as still running and keep the cancel/retry affordance enabled.
   - The cancel action must target the same backend `message_id` that was persisted before reload.

5. **Types, schema, and tests.**
   - Add `message_id?: string` to the `orchestrator:progress` payload type in `src/api/events.ts`.
   - Add `type: "research"` and `type: "orchestrator"` step variants to the frontend `Step` union if generic rendering is desired.
   - Add Rust unit tests that assert the `OrchestratorProgress` JSON payload contains a top-level `message_id` after each progress emission.
   - Add a TypeScript type-level test (or verifier) that asserts `AgentActionEventPayload` exposes `message_id` for orchestrator progress.

### Validation

- **TypeScript:** `npx tsc --noEmit` passes.
- **Rust:** `cd src-tauri && cargo check --all-targets` passes.
- **Rust tests:** new tests for `OrchestratorProgress` `message_id` propagation.
- **TypeScript tests:** `message_id` is present in the `orchestrator:progress` payload type.
- **Verifier scripts:**
  - `test/verify-deep-research-reload.mjs` — start a deep-research run, simulate a reload mid-run, and assert that `researchSteps` are restored.
  - `test/verify-orchestrator-reload.mjs` — start an orchestrator task, reload mid-progress, and assert that progress steps reappear.
  - `test/verify-orchestrator-fallback-no-message-id.mjs` — emit an `orchestrator:progress` event without `message_id` and confirm it stays in-memory only and never writes to the DB.
- **Manual QA:** Start each flow, note the progress UI, reload the app, and confirm the same progress UI appears without duplicate steps.

### Acceptance Criteria

- An orchestrator assistant message is created before any `orchestrator:progress` event is emitted.
- Orchestrator progress steps survive an app reload and reappear in the same assistant message.
- Deep-research sub-agent and phase steps survive an app reload; no step is duplicated after the stream resumes.
- `message_id: None` is eliminated for orchestrator and deep-research events that target a specific assistant message.
- Persisted timeline is incremental (not only at the end) so mid-stream reloads show the latest progress.
- TypeScript and Rust type checks pass; new verifier scripts pass.

### Out of Scope

- Rewriting the deep-research UI (`DeepResearchRunMessage`) — this phase only changes how its data is persisted and rehydrated.
- New orchestrator UI surfaces — reusing the existing `AssistantMessage`/`AgentExecutionTrace` timeline.
- Migrating existing historical deep-research rows to a new schema (old rows continue to work via `metadata` fallback).

### References

- `src-tauri/src/agent/orchestrator/loop.rs`
- `src-tauri/src/agent/orchestrator/execution.rs`
- `src-tauri/src/agent/deep_research/mod.rs`
- `src-tauri/src/agent/deep_research/phases.rs`
- `src-tauri/src/agent/runner/loop.rs`
- `src-tauri/src/agent/event_bus.rs`
- `src/atlas/hooks/stream/useAgentEvents.ts`
- `src/atlas/components/chat/deepResearchTypes.ts`
- `src/atlas/components/chat/DeepResearchRunMessage.tsx`
- `src/api/events.ts`
- `src/api/chatApi.ts`

---

## How to Update This File

1. Mark phases as `Completed` when all deliverables and validation are done.
2. Add new phases as they are agreed on.
3. Move or archive scope items that are deprioritized.
4. Reference ADRs, tests, and verifier scripts in each phase.
