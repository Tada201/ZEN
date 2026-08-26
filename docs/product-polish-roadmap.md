# ZEN Product Polish Roadmap

**Last updated:** 2026-08-01  
**Status:** Active planning; execution-trace motion audit and first remediation slice shipped  
**Scope:** Product polish and workflow maturity compared with Claude Code and OpenAI Codex

This roadmap tracks improvements that make ZEN feel safer, clearer, more coherent, and more effective as a developer workbench. It is intentionally focused on **user-visible workflows**, not simply adding more backend capability.

## Product Position

ZEN already has strong feature breadth and a substantial agent platform. The list below describes implemented or partially implemented capabilities, not necessarily polished end-to-end workflows:

- Streaming chat and agent execution traces
- Tool calls, approvals, retries, and structured previews
- Child agents, delegation, handoffs, and orchestration
- Deep research and task/workflow events
- MCP over HTTP and stdio paths
- Interactive terminal sessions
- Workspace/file tools and artifact inspection
- Session memory, persistence, reload-safe timelines on covered paths, voice, themes, and canvas surfaces

The main gap versus Claude Code and Codex is not raw capability. It is **workflow packaging**:

1. Make the execution mode obvious.
2. Make the security boundary obvious.
3. Make changes reversible.
4. Make parallel/background work isolated.
5. Make project instructions, skills, hooks, and memory feel like one system.
6. Make Git review and promotion a first-class workflow.

### UI blueprint decision — 2026-07-31

`EXAMPLE_NO_EDITS/codex-gpt_Ui-replica` is now the approved **visual and interaction blueprint** for the next ZEN chatbot redesign. It is a frontend-only, deterministic Codex-style mockup; it is reference material, not a source of backend behavior or a replacement application.

The redesign starts with ZEN's core user-facing surface: the **agent execution trace and display**. We will translate the mockup's calm, dense workspace language into the existing ZEN chat architecture incrementally, preserving the canonical event, permission, persistence, tool, and session contracts.

Blueprint principles:

- summary-first execution rows instead of raw event/log presentation;
- progressive disclosure for tool details, output, diffs, and diagnostics;
- explicit lifecycle states for running, approval, failure, completion, and cancellation;
- reasoning that expands during streaming and retains a useful completion summary without removing content unexpectedly;
- compact parent-agent and subagent summaries with deeper traces opened on demand;
- grouped parallel work with wall-clock duration rather than misleading summed duration;
- solid semantic surfaces, shared tokens, restrained motion, keyboard access, and reduced-motion support.

Do not copy the mockup's deterministic runner, mock terminal/browser behavior, or frontend store into ZEN. Treat it as a design contract and interaction reference only.

### Mockup-to-ZEN feature inventory

This matrix is the transition checklist. “Mockup status” describes what is visibly implemented in the isolated replica, not what its documentation suggests. “ZEN status” distinguishes real product capability from a visual gap.

| Mockup surface | Mockup status | Current ZEN equivalent | Transition target |
|---|---|---|---|
| Three-pane workspace shell | Implemented: sidebar, transcript, and collapsible context panel with responsive drawers | Multiple workspace/chat/right-panel shells exist; composition and density are fragmented | **Phase 1–2:** establish one shell contract after the trace foundation; preserve existing navigation and routing |
| Session/project navigation | Implemented: grouping, search, sorting, pin/archive/rename/delete flows | Session persistence and sidebar exist; project/workspace context is not consistently visible | **Phase 2:** align session identity, workspace root, branch/worktree, and task status |
| Execution timeline | Implemented with deterministic task scripts, explicit states, compact rows, plans, approvals, retries, and final review | Real streaming timeline, event ledger, grouped tools, approvals, reasoning, subagents, and reload-safe paths exist | **Phase 1:** make the real ZEN trace match the summary-first interaction contract |
| Tool/reasoning disclosure | Implemented: collapsible reasoning/tool rows and progressive disclosure | `AgentExecutionTrace`, `ToolCallCard`, `ExecutionRow`, and `ReasoningBlock` already provide the foundation | **Phase 1:** unify row semantics, labels, density, disclosure defaults, and streaming transitions |
| Subagent detail | Implemented visually: parent summary opens a deeper child trace | Real delegation/orchestration and `SubagentExecutionCard` exist, but presentation is distributed | **Phase 1–3:** parent summary first; isolated child timeline and durable task identity later |
| Right workbench | Implemented: Activity, Files, Terminal, Review, Browser, Side chat, and Subagent instance tabs | Right panel, insights, artifacts, terminal, approval center, and agent panels exist with overlapping surfaces | **Phase 2:** one typed workbench registry and one trace/artifact projection; no parallel representation |
| Files/diffs/review | Implemented visually: changed-file rows, diff preview, review state | Structured previews, artifact panel, checkpoint Undo, and diff details exist; Git promotion is incomplete | **Phase 3:** review, reject/revert, branch, commit, patch export, and worktree promotion |
| Terminal/browser views | Implemented as safe mock views only; no real shell or remote browser | Real terminal and URL-safety infrastructure exist; browser/tool display is separate | **Phase 2–3:** expose real capabilities with explicit policy, truncation, cleanup, and approval states; never copy mock execution |
| Composer controls | Implemented: model/mode controls, slash commands, skills, queued messages, attachments, and task brief | Chat composer, model/permission/workspace controls, voice, and command palette exist with uneven placement | **Phase 2:** consolidate controls, scope indicators, slash/skill affordances, and queued-send behavior |
| Settings and command palette | Implemented: broad settings categories, shortcuts, notifications, MCP, worktrees, and command palette | Settings, feature flags, command palette, and MCP surfaces exist but concepts are spread across shells | **Phase 4:** central registries, discoverability, diagnostics, and consistent keyboard contracts |
| Automation/scheduled tasks | Implemented visually: inbox, cadence templates, create flow, and task list | Task queue/orchestrator/background surfaces exist, but durable task product is incomplete | **Phase 3:** durable task center with needs-input, ready-for-review, pause, cancel, retry, and recovery states |
| Motion/responsive/accessibility | Implemented in CSS/UI contracts: reduced motion, focus behavior, responsive drawers, compact density | Theme tokens, reduced-motion hooks, and focused verifiers exist; coverage is inconsistent | **Phase 1 and 5:** tokenized motion/density contract, keyboard/focus audit, narrow-layout and performance budgets |

### What the mockup deliberately does not prove

The replica does not prove LLM streaming, real permissions, filesystem safety, Git isolation, terminal process lifecycle, browser security, persistence, multi-window behavior, or crash recovery. Its deterministic stores and scripts are useful for visual state coverage only. Any production port must bind the visual state to ZEN's canonical events, typed APIs, backend permission decisions, persisted messages, checkpoint records, and session workspace resolution.

### Official parity notes and missing product concepts

The following gaps were added after comparing the mockup and ZEN against the official product documentation. These are product patterns to investigate, not claims that ZEN must copy another product:

- **Execution modes and plan/act separation:** Codex documents environment/mode and approval controls; Claude Code documents plan mode and permission modes. ZEN should make the active policy, planned mutations, and transition to execution visible, while unsupported backend modes remain explicitly planned. Sources: <https://learn.chatgpt.com/docs/environments/modes>, <https://learn.chatgpt.com/docs/en/agent-approvals-security>, <https://code.claude.com/docs/en/common-workflows>.
- **True isolated workspaces:** Codex documents Git worktree-based environments. ZEN currently has session workspace binding, not worktree creation, branch lifecycle, or promotion. Source: <https://learn.chatgpt.com/docs/environments/git-worktrees>.
- **Checkpoint/rewind semantics:** Claude Code documents checkpointing and rewind; ZEN's current recovery slice is a bounded, process-local file-mutation ledger. Named checkpoints, conversation rewind, shell-state recovery, and durable manifests remain separate work. Source: <https://code.claude.com/docs/en/checkpointing>.
- **Background work that needs attention:** A polished task center needs durable “needs input”, “waiting for approval”, “ready for review”, “failed”, and “completed” states—not only a running spinner or a notification. This should be backed by the task/research persistence work in `PHASES.md`.
- **Project context as an inspectable system:** Claude Code documents project/user memory, skills, and subagents. ZEN should expose precedence, loaded instructions, tool grants, skill arguments, hook interception, and memory controls instead of presenting them as unrelated settings. Sources: <https://code.claude.com/docs/en/memory>, <https://code.claude.com/docs/en/skills>, <https://code.claude.com/docs/en/sub-agents>.
- **Review and promotion:** A workbench should make branch, base commit, changed files, tests, artifacts, and promotion consequences explicit. This is a workflow gap, not merely a missing diff component.
- **Large-output and developer-tool resilience:** Real terminal/browser/MCP output needs bounded previews, spill-to-artifact, search/copy, stderr distinction, process cleanup, private-address policy, and stale-run recovery. The mockup's terminal/browser panels cannot substitute for these contracts.

### Mockup-to-ZEN transition phases

The order below is dependency-driven. Each phase has a visual deliverable and a contract boundary so the redesign does not become a screenshot port.

#### Phase 1 — Execution trace foundation (start here)

- Create the trace-state matrix for reasoning → grouped tool → approval/error/completion → final summary.
- Apply one summary-first row contract to grouped tools, individual tools, approvals, failures, and subagents.
- Make status, duration, outcome, disclosure, keyboard focus, reduced motion, and streaming behavior consistent.
- Keep persisted event/message/tool contracts unchanged unless a separate `PHASES.md` task approves the change.

**Exit:** the representative real ZEN trace is calm at a glance, technically inspectable on demand, reload/replay safe, accessible, and free of duplicate/orphan cards under covered event paths.

#### Phase 2 — Workspace shell and trust surfaces

- Bring the mockup's density, spacing, surface hierarchy, and responsive three-pane composition to the real app.
- Consolidate the execution header, workspace selector, permission mode, security boundary, approval center, and task status.
- Establish a typed workbench/tab registry for Activity, Files, Review, Terminal, Browser, Side chat, Subagents, and Artifacts.
- Make the active chat, workspace, branch/environment, model, mode, and pending attention visible without opening settings.

**Exit:** users can identify what is running, where it can act, what needs approval, and where its outputs are located from the primary shell.

#### Phase 3 — Recovery, review, and parallel work

- Persist checkpoint manifests and add multi-file review before attempting conversation rewind.
- Add Git-aware worktree creation, branch/base metadata, promotion, discard, and handoff flows.
- Build a durable background task center with needs-input/ready-for-review states and reload recovery.
- Add review actions per file, artifact provenance, test results, and explicit promotion consequences.

**Exit:** users can leave work running, return after reload, inspect/review changes, recover safely, and promote or discard isolated work without guessing.

#### Phase 4 — Composer, project context, and command ergonomics

- Rework the composer around visible scope: model, permission mode, workspace, attachments, slash commands, skills, queued messages, and context usage.
- Unify project instructions, skills, agents, hooks, memory, MCP, and permissions with visible scope and precedence.
- Add `/init`, `/doctor`, inspect/edit/disable controls, skill argument hints, hook decisions, and command-palette coverage.
- Keep all controls on shared typed registries rather than duplicating labels and policy logic.

**Exit:** users can understand why an instruction, skill, hook, memory item, tool grant, or model setting affected a run and can change it safely.

#### Phase 5 — Specialized workbench and resilience polish

- Refine terminal, browser/developer tools, deep research, voice, artifacts, and canvas around the same task/execution model.
- Add bounded large-output handling, artifact spill, search/copy, stale-run recovery, focus restoration, empty/error states, and cross-platform process validation.
- Establish measurable budgets for first token, first trace row, typing latency, scroll stability, and large-trace memory/render cost.

**Exit:** specialized surfaces feel like one ZEN product, not separate demos, and remain usable under long streams, failures, reloads, narrow widths, keyboard-only navigation, and reduced motion.

### Transition rules

1. Port visual contracts and interaction states, not mockup stores or fake capabilities.
2. Keep one canonical execution model; right-panel and artifact views are projections, never alternate ledgers.
3. Do not claim Codex/Claude parity until the corresponding backend, security, persistence, and recovery contract is verified.
4. Separate visual work from event-schema, permission, persistence, and workspace changes; record the latter in `PHASES.md`.
5. Every phase requires representative loading, streaming, approval, error, empty, reload, narrow-layout, keyboard, and reduced-motion states.

This roadmap is the product-polish source of truth. `PHASES.md` remains the implementation source of truth for committed streaming and persistence phases; link changes between the two rather than duplicating detailed task plans.

## Priority Legend

- **P0 — Trust:** Users must understand and safely recover from agent actions.
- **P1 — Workflow parity:** Core developer workflows should be as coherent as leading tools.
- **P2 — Differentiation:** Build on ZEN's visual, research, voice, and workbench strengths.
- **P3 — Refinement:** Quality, accessibility, performance, and operational polish.

Status values:

- `[ ] Planned`
- `[~] In progress / partially implemented`
- `[x] Complete`
- `[!] Needs investigation`
- `[-] Deferred or intentionally out of scope`

---

# P0 — Trust and Control

## P0.1 First-class execution modes

**Status:** `[~]` The frontend selector and shared mode registry exist; end-to-end backend semantics and session-scoped policy are still being consolidated.

### Goal

Give every chat a clear, visible execution mode comparable to Claude Code plan mode and Codex read-only/workspace-write controls.

### Proposed modes

- **Plan only** — read and inspect; no edits or commands.
- **Ask before changes** — approvals for mutations and elevated actions.
- **Workspace auto-edit** — edits inside the approved workspace proceed automatically; elevated actions still ask.
- **Full autonomy** — explicit, high-friction opt-in with a strong warning.

### Acceptance criteria

- The active mode is visible next to the composer and in the execution header.
- The UI explains file-write, terminal, and network behavior for each mode.
- Switching modes affects the backend policy, not only frontend presentation.
- Every approval request identifies which mode and policy caused the interruption.
- The selected mode is persisted as a user preference and restored after reload.
- A future session-scoped override is explicitly separate from the global preference; Phase 1 does not claim session isolation.

### Current frontend delivery

- The composer exposes four registered mode options through one accessible selector: Plan mode, Ask before changes, Edit automatically, and Full access.
- Composer and Settings consume the shared `src/lib/constants/permissionModes.ts` registry.
- Selecting a mode projects the canonical mode plus compatibility fields and triggers backend permission auto-sync.
- Full Access requires explicit confirmation; backend hard security rules remain authoritative.
- Persistence failures are surfaced as an error toast instead of a false success.
- This confirms frontend discoverability and settings projection—not that every mode has complete session-scoped or OS-level enforcement.

### Remaining backend/policy work

### Likely touchpoints

- `src-tauri/crates/zen-security/src/policy.rs`
- `src-tauri/crates/zen-tools/src/registry.rs`
- `src-tauri/crates/zen-agent/src/runner/dispatch/`
- `src/atlas/components/PermissionModeMenu.tsx`
- `src/components/settings/Tabs/ToolsSettings.tsx`
- `src/lib/constants/permissionModes.ts`
- `src-tauri/src/commands/settings.rs`

## P0.2 Visible sandbox and security boundary

**Status:** `[~]` Workspace validation and permission infrastructure exist; the first compact boundary surface landed on 2026-07-31, with backend capability discovery and OS-level isolation still incomplete.

### Goal

Show users exactly what the current agent can access.

### Proposed security status bar

```text
Workspace: project-root
File writes: workspace only
Network: disabled
Terminal: approval required
MCP: 2 connected servers
```

### Acceptance criteria

- The status is visible without opening advanced settings.
- Workspace root, writable paths, network state, terminal state, and MCP state are inspectable.
- Dangerous changes require explicit confirmation and explain the impact.
- Backend decisions remain authoritative; renderer-supplied approval flags are never trusted.
- Denials include a clear remediation path.

### Phase 2 delivery

- Added a compact, keyboard-accessible **Security boundary** popover to the active chat header.
- Shows the configured workspace, file-write scope, terminal policy, MCP configuration/connection summary, and a deliberately qualified network policy statement.
- Reads existing typed settings state and `mcpApi` list/status APIs; no new privileged command or renderer-side approval authority was introduced.
- Explicitly labels the current view as application-level policy rather than OS/kernel sandboxing.
- Remaining: expose authoritative per-session/network capability state, unify approval context, add remediation actions, and evaluate cross-platform OS isolation.

### Implementation and verification

- `src/atlas/components/chat/SecurityBoundarySummary.tsx`
- `src/atlas/sections/WorkspaceSection.tsx`
- `test/verify-security-boundary-summary.mjs`
- `npm run test:security-boundary-summary`

### Follow-up investigation

Evaluate whether OS-level sandboxing or a restricted command runner is feasible for Windows, macOS, and Linux. Application-level permission checks should not be described as kernel isolation.

## P0.3 Checkpoints, undo, and rewind

**Status:** `[~]` Phase 1 delivered on 2026-07-31: safe current-process undo for canonical file mutations.

### Goal

Provide session-level recovery comparable to Claude Code checkpointing and Codex worktree snapshots.

### Phase 1 delivery

- The canonical v2 tool service captures exact file bytes immediately before `write_file`, `edit_file`, `file_write`, and `apply_patch` mutations.
- Successful mutations return structured checkpoint metadata containing the tool-call ID and affected-file count.
- Completed file-edit cards expose an explicit, confirmation-gated **Undo** action.
- Undo serializes against in-process file mutations, validates the workspace boundary, and compares exact post-mutation bytes before writing anything; external edits fail closed with a conflict message.
- Modified files are restored and files created by the agent are removed.
- The service is bounded to 256 mutation records per chat and is process-local. This is a narrow recovery ledger, not a Git/worktree snapshot.

### Intentionally not claimed in Phase 1

- Conversation rewind, named checkpoints, checkpoint comparison, or restore of arbitrary shell/external changes.
- Durable checkpoints across app restart or session resume.
- Full Git/worktree isolation or a replacement for user-managed version control.
- Automatic recovery of multi-step turns as one atomic transaction.
- Failed multi-file `apply_patch` calls are not automatically rolled back; their checkpoint records are discarded rather than presented as a misleading Undo action.
- The current process-local mutation lock serializes file-tool execution for safety; nested file-tool dispatch must remain out of scope until a re-entrant transaction boundary exists.

### Acceptance criteria

- [x] A checkpoint is created before a canonical file mutation.
- [x] File changes are recoverable without requiring the user to understand Git internals.
- [x] The UI clearly distinguishes this narrow file ledger from shell/external changes that cannot be automatically restored.
- [ ] Checkpoints survive session resume according to a documented retention policy.
- [x] Restore actions require confirmation and fail closed when affected files changed.

### Implementation and verification

- `src-tauri/src/services/checkpoint.rs`
- `src-tauri/src/commands/checkpoint.rs`
- `src-tauri/src/services/tool.rs`
- `src/atlas/components/chat/ToolCallCard.tsx`
- `src/api/toolsApi.ts`
- `test/verify-checkpoint-recovery.mjs`
- `npm run test:checkpoint-recovery`

### Next slice

Persist checkpoint manifests and add a reviewable, multi-file checkpoint surface before attempting conversation rewind or Git/worktree promotion.

## P0.4 Unified approval center

**Status:** `[~]` Phase 1 delivered on 2026-07-31: pending canonical tool approvals now have a shared right-rail center and command-surface entry; terminal grants remain a separate synchronous flow.

### Goal

Give users one place to see, approve, deny, remember, or revoke pending actions.

### Phase 1 delivery

- Added a visible **Approval Center** right-rail tab derived from the existing live chat ledger; pending tool approvals are deduplicated by tool-call ID across chat and background sessions.
- Added a persistent right-rail badge and a command-palette action for discoverability.
- Reused the existing typed `toolsApi.resolveApproval` contract for **Approve once**, **Deny**, and **Remember exact**; the backend remains the permission authority.
- Kept inline chat approval controls, so the center complements rather than duplicates the existing chat decision surface.

### Intentionally not claimed in Phase 1

- Terminal approval is currently a synchronous `requestApproval` → single-use spawn grant with no pending-approval event/list command, so it is explicitly not represented as a pending center item.
- MCP, network, and agent-spawn approvals appear in the center only when they use the canonical tool approval event; no new backend approval registry was invented.
- Approval history, revocation, session-wide remembered-permission management, expiration display, and durable cross-reload pending state remain future backend/API work.
- The center reads the bounded in-memory session message ledger; it does not claim durable approval discovery after restart or after runtime session eviction.

### Implementation and verification

- `src/atlas/components/chat/right-panel/ApprovalCenter.tsx`
- `src/atlas/components/chat/right-panel/approvalCenterModel.ts`
- `src/atlas/components/chat/approvalActions.ts`
- `src/lib/features/frontendFeatures.ts`
- `src/atlas/components/RightPanel.tsx`
- `src/components/Zen/SecondaryActivityBar.tsx`
- `src/atlas/CommandPalette.tsx`
- `test/verify-tool-approval-hardening.mjs`
- `test/verify-right-panel-features.mjs`

### Acceptance criteria

- `[~]` Canonical tool approvals are visible in chat, the right rail, and the command surface without duplicates; terminal grants remain a separate synchronous UI flow.
- `[x]` “Approve once” and “Remember exact” are distinct and route through the backend approval command; session-wide approval is not yet exposed.
- `[ ]` Approval history, remembered-permission revocation, and durable cross-reload pending state require a backend/API surface.
- `[~]` Expired or already-resolved tool approvals now fail explicitly; a dedicated expired-item recovery view is still future work.

---

# P1 — Developer Workflow Parity

## P1.1 Isolated workspace and worktree mode

**Status:** `[~]` Phase 1 delivered on 2026-07-31: chats can persist an optional session workspace and route canonical/legacy file and terminal tools without mutating the global root; the full user-facing worktree workflow is not established.

### Goal

Allow multiple agent tasks to work in parallel without colliding with the user's active checkout.

### Proposed environments

- Current workspace
- New isolated worktree
- Temporary sandbox
- Background task workspace

### Phase 1 delivery

- Added persisted `Chat.workspaceRoot` state with an idempotent SQLite migration.
- New chats capture the current global root once; changing the global root later does not silently retarget an existing chat.
- The active chat header exposes a compact workspace selector; clearing it intentionally returns the chat to the global-workspace compatibility fallback.
- Canonical v2 tools, legacy agent filesystem/terminal bridges, checkpoint undo, and session mutations resolve the chat workspace through one backend helper.
- Chat imports scrub machine-local workspace roots rather than trusting an export path; the conversation remains usable under the global fallback until the user explicitly selects a local root.
- Browser mock mode mirrors the typed workspace update contract.

### Intentionally not claimed in Phase 1

- This is session workspace binding, not Git worktree creation, branch management, promotion, or OS-level sandboxing.
- Interactive terminal Tauri commands and non-chat document/media commands still use the global workspace because those command contracts do not carry a chat ID.
- Plan-mode permission configuration is still process/global; per-session plans-root policy requires a future request-scoped permission context.
- Existing chat roots must remain available on disk; an unavailable persisted root fails closed rather than silently switching to another directory. Imported chats intentionally start unbound and use the global fallback until explicitly configured.

### Acceptance criteria

- `[x]` The session workspace is selected from the active chat and persisted.
- `[~]` The UI shows the workspace path and scope label; branch/base commit and lifecycle state belong to the future worktree slice.
- `[ ]` Users can inspect, open, promote, hand off, or discard an isolated task.
- `[ ]` Ignored setup files are handled through an explicit, secure mechanism.
- `[x]` Canonical and legacy chat tool execution cannot silently mutate the global root when a chat-specific root is set.

### References

- `src-tauri/src/workspace.rs`
- `src/api/workspaceApi.ts`
- `src/atlas/components/`
- Official Codex worktrees: <https://learn.chatgpt.com/docs/environments/git-worktrees>

## P1.2 Durable background task center

**Status:** `[~]` Task queue, orchestrator, subagents, and activity panels exist; they are not yet one durable task product.

### Goal

Let users leave work running, return later, and understand what happened.

### Task states

- Queued
- Running
- Waiting for approval
- Paused
- Completed
- Failed
- Cancelled
- Needs review

### Acceptance criteria

- Tasks remain discoverable after navigating between sessions or restarting the app.
- Each task shows agent, model, workspace, permissions, progress, artifacts, and final summary.
- Users can pause, cancel, retry, resume, or open the related session.
- Long-running tasks persist incremental progress and recover gracefully after reload.
- Background task failures do not disappear into a toast or log.

### Likely touchpoints

- `src-tauri/crates/zen-agent/src/orchestrator/`
- `src/atlas/hooks/stream/useAgentEvents.ts`
- `src/components/widgets/orchestrator/`

## P1.3 Git-aware review and promotion workflow

**Status:** `[~]` Diff and artifact previews exist; Git promotion workflow needs a first-class surface.

### Proposed actions

- Review all changes
- Expand/collapse all diffs
- Accept or reject a file
- Revert a file
- Create branch
- Commit changes
- Export patch
- Open pull request
- Promote isolated worktree to local workspace

### Acceptance criteria

- The change summary shows files, additions, deletions, tests, branch, and workspace.
- File diffs are available from the execution timeline and a dedicated review panel.
- The user can reject individual files without discarding the entire task.
- Promotion actions explain branch/worktree consequences before proceeding.
- Review state survives reload.

### Likely touchpoints

- `src/atlas/components/chat/tool/ToolDetailView.tsx`
- `src/components/shared/ArtifactPanel.tsx`
- Workspace/Git APIs
- New change-review component and backend commands

## P1.4 Project instructions, skills, hooks, and memory as one system

**Status:** `[~]` Rules, skills, hooks, and memory surfaces exist at different maturity levels.

### Goal

Create a coherent project automation model that can import or interoperate with common conventions.

### Proposed model

```text
.zen/
  instructions.md
  rules/
  skills/
  agents/
  hooks/
```

Support compatible discovery/import for:

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/skills/`
- `.codex/`

### Acceptance criteria

- `/init` creates a reviewable project setup proposal.
- `/doctor` reports missing configuration, broken tools, and unsafe settings.
- `/skills`, `/agents`, `/memory`, and `/permissions` are discoverable.
- Project, user, and session scopes are visible and precedence is documented.
- Skills can be invoked explicitly and loaded automatically when appropriate.
- Hooks have a typed lifecycle contract and fail closed for security-sensitive actions.
- Memory has explicit inspection, edit, delete, and disable controls.

### Likely touchpoints

- `src/lib/features/frontendFeatures.ts`
- `src/atlas/components/SkillsSettingsContent.tsx`
- `src-tauri/crates/zen-agent/src/middleware/`
- `src-tauri/crates/zen-agent/src/`
- `AGENTS.md`, `CLAUDE.md`, and project rules

## P1.5 Deep-research and orchestrator reload safety

**Status:** `[ ]` Planned in `PHASES.md` Phase 6.

### Goal

Make long-running research and orchestration timelines survive mid-stream reloads.

### Acceptance criteria

- Orchestrator progress has a real `message_id` before the first progress event.
- Deep-research progress is persisted incrementally, not only at completion.
- Reload restores partial progress without duplicate events.
- Cancel/retry after reload targets the correct backend run/message.
- Progress payloads remain bounded and version-compatible.

### Reference

See `PHASES.md` — **Phase 6 — Reload-Safe Persistence for Deep Research & Orchestrator Timelines**.

---

# P2 — ZEN Differentiation

## P2.1 Blueprint-led agent execution trace and display

**Status:** `[~]` Existing trace infrastructure is substantial; the Codex-style replica is now the approved blueprint. The solid workspace-context/workbench shell, representative trace accessibility/lifecycle refinement, responsive/keyboard pass, delegation-lane refinement, first motion remediation slice, mutually exclusive parent-status cleanup, active-label shimmer removal, executable disclosure lifecycle fixtures, and the Tauri-mounted disclosure harness were delivered on 2026-08-01. Tauri-window/runtime measurement and broader mounted lifecycle coverage remain.

### Goal

Make the agent execution trace the clearest, calmest explanation of what ZEN is doing while preserving the real backend stream and security boundary underneath it.

### Design reference

- Blueprint root: `EXAMPLE_NO_EDITS/codex-gpt_Ui-replica`
- Blueprint architecture: `EXAMPLE_NO_EDITS/codex-gpt_Ui-replica/docs/architecture.md`
- Blueprint product notes: `EXAMPLE_NO_EDITS/codex-gpt_Ui-replica/README.md`
- Blueprint right-panel contract: `EXAMPLE_NO_EDITS/codex-gpt_Ui-replica/docs/superpowers/specs/2026-07-29-right-panel-workspace-design.md`
- ZEN Phase 1 visual contract and state matrix: `docs/architecture/execution-trace-visual-contract.md`

### Current ZEN owners

- `src/atlas/components/chat/AgentExecutionTrace.tsx` — grouped execution surface and compact/expanded trace rendering
- `src/atlas/components/chat/agentExecutionTraceModel.ts` — summaries, status counts, parallel batches, owners, and outcomes
- `src/atlas/components/chat/agentExecutionLedger.ts` — agent hierarchy, batches, handoffs, and execution ownership
- `src/atlas/components/chat/ExecutionGroup.tsx` — assistant-message integration for grouped execution
- `src/atlas/components/chat/ToolCallCard.tsx` — summary row, approval/error actions, previews, technical disclosure, and undo
- `src/atlas/components/chat/tool/ExecutionRow.tsx` — shared status-row primitive and accessibility state
- `src/atlas/components/chat/SubagentExecutionCard.tsx` — delegated-work summary and child tool trace
- `src/atlas/components/chat/ReasoningBlock.tsx` — streaming reasoning, duration, and user-controlled disclosure
- `src/atlas/components/chat/types.ts` — persisted message, step, tool-call, approval, and subagent contracts

### First slice — execution display foundation

This is the first implementation slice before redesigning the broader workspace layout:

1. Establish one visual contract for every execution row: human verb, target, status, duration, and useful outcome.
2. Align grouped tool execution, individual tool cards, approvals, failures, and subagent cards to the same summary-first hierarchy.
3. Make the default disclosure behavior consistent: running/approval/error states are visible; successful background work is compact; technical payloads remain explicit disclosures.
4. Preserve the current persisted `steps`/`steps_json` and backend message-ID behavior so the final trace is identical before and after reload.
5. Make reasoning and tool transitions feel continuous during streaming without adding per-delta rendering or decorative animation.
6. Validate the trace at narrow widths, with keyboard navigation, screen readers, reduced motion, background sessions, and parallel tool calls.

### Acceptance criteria

- `[ ]` A single user-facing execution-row contract is documented and applied across grouped tools, individual tools, approvals, errors, and subagents.
- `[ ]` Running, awaiting approval, failed, and completed states have consistent labels, icons, semantics, and disclosure defaults; cancellation is covered where the owning lifecycle already exposes it and is not invented as a new `ToolCall` status in this UI slice.
- `[ ]` A completed tool shows a concise outcome such as a file delta, search-result count, artifact, or command result without exposing raw payloads by default.
- `[ ]` Technical details, raw output, approval context, and full child traces are available only through intentional disclosure.
- `[ ]` Parallel execution reports wall-clock duration and does not imply that parallel work ran sequentially.
- `[~]` Reasoning expands while active, reports duration at a one-second cadence, and keeps completed content available for explicit user disclosure; historical compact defaults remain summary-first.
- `[ ]` Subagent rows show delegated task, owner, status, elapsed time, and final summary without flooding the parent transcript with child deltas.
- `[ ]` The representative trace reloads and replays without stray, duplicate, or orphan tool cards; broader event-family coverage follows afterward.
- `[~]` The representative trace remains responsive during streaming and does not broaden high-frequency subscriptions unnecessarily. The source-level long-trace contract now covers coalesced scroll writes, bucketed stream signatures, cheap active reasoning, short-text markdown bypass, memoized trace derivation, and bounded delegation/research/tool output; Tauri runtime measurement remains deferred.
- `[ ]` Focus, `aria-expanded`, `aria-busy`, live-region, approval, and reduced-motion behavior for the representative trace are covered by verifiers or focused tests.

### Explicit boundaries

- This phase changes presentation, grouping, disclosure, accessibility, and interaction polish before changing backend execution semantics.
- The live ZEN event stream, canonical tool service, permission checks, audit events, checkpoint behavior, workspace binding, and persisted message IDs remain authoritative.
- The replica's mock runner, mock terminal/browser, frontend stores, deterministic scripts, and layout code must not be copied into production ZEN.
- New backend or persistence work belongs in `PHASES.md` and must be linked here rather than hidden inside a UI-polish task.
- The first shell refinement now gives the main chat and right workbench solid, semantic context headers. The shared `src/components/workbench/WorkbenchHeader.tsx` alignment primitive keeps both headers on one spacing contract, while each owner retains its semantic header, local controls, and state. The right header also surfaces the typed registry description when available. The right activity rail now uses the shared `src/components/Zen/WorkbenchTabButton.tsx` primitive, so tab identity, copy, selection semantics, badges, and reduced-motion behavior are no longer duplicated in the rail. The primary chat context is now extracted into `src/atlas/components/chat/WorkspaceContextHeader.tsx`, projecting session/workspace, model/provider, permission mode, execution status, security boundary, and settings through existing typed owners. Subsequent work should continue consolidating the typed workbench registry and task-status projection without introducing a second trace representation.

### Initial delivery checklist

- `[x]` Existing summary-first `ExecutionRow` and `ToolCallCard` primitives identified as the initial visual foundation.
- `[x]` Existing grouped execution, subagent, reasoning, approval, preview, checkpoint, and ledger paths mapped.
- `[x]` Create a trace-state matrix for the first representative path: reasoning, grouped tool execution, approval/error or completion, and final summary.
- `[x]` Produce a small visual contract for row density, spacing, typography, semantic colors, and transition timing based on the blueprint.
- `[~]` Refine the representative end-to-end trace before broadening to subagents, parallel lanes, reload edge cases, and specialized event types. The current slices cover summary-first grouped execution, lifecycle status announcements, attention-state expansion, live-open completion behavior, manual disclosure overrides, responsive/keyboard behavior, delegated-agent lane lifecycle disclosure with bounded live output, stable live group identity, calm opacity-only row entrances, mutually exclusive parent-level status selection, and shared shell-header alignment with registry-derived workbench context. Tauri-window/runtime validation and mounted component lifecycle coverage remain.
- `[~]` Add/update user-facing verifiers for the representative path, then expand coverage to reload, streaming, parallelism, accessibility, and narrow-layout checks. Focused trace, reasoning, tool-card, reload, keyboard, narrow-surface, delegation-lifecycle, motion-remediation, parent-status precedence, composer-input responsiveness, and Tauri-mounted disclosure harness contracts now cover the shipped path. The audit is recorded in `docs/audits/execution-trace-motion-ux-audit.md`; runtime measurement and broader mounted component coverage remain.

### Verification references

- `test/verify-agent-execution-trace-rendering.mjs`
- `test/verify-tool-execution-card-ux.mjs`
- `test/verify-reasoning-block-ux.mjs`
- `test/verify-agent-live-status-ux.mjs`
- `test/verify-execution-trace-delegation-ux.mjs`
- `test/verify-execution-trace-motion-remediation.mjs`
- `test/verify-execution-disclosure-lifecycle.mjs`
- `test/verify-execution-disclosure-mounted-harness.mjs`
- `test/verify-input-responsiveness.mjs`
- `test/verify-long-trace-performance.mjs`
- `test/verify-live-ledger-merge.mjs`
- `docs/audits/execution-trace-motion-ux-audit.md`
- `test/verify-streaming-layering.mjs`
- `test/verify-tool-event-ordering.mjs`

### Next step

The representative path, accessibility/responsive/delegation slices, first motion remediation, mutually exclusive parent-level status selector, active-label shimmer cleanup, pure disclosure lifecycle fixtures, composer-input responsiveness contract, source-level long-trace performance slice, the dev-only `ExecutionDisclosureHarness` Tauri-mounted disclosure harness, and the shared registry-driven workbench tab primitive and the extracted registry-aware workspace context header are implemented. Browser automation is intentionally out of scope because ZEN requires a Tauri window. The harness is dev-only and runs when the Tauri dev window is opened with `?zen-harness=execution-disclosure`; it mounts the production disclosure owners, drives running/completed/manual-collapse/attention-recovery phases, and reports ARIA-based results without backend or persistence changes.

### Related architecture rules

- `RULES.md` — chat timeline and tool-card contracts
- `docs/architecture/frontend-rules.md` — summary-first rendering, reload safety, accessibility, and performance
- `frontende-design.md` — Zen execution UI design language

## P2.2 Deep research as an inspectable product

**Status:** `[~]` Backend and UI exist; improve source trust and resumability.

### Goals

- Show research question, plan, sources, subagents, findings, uncertainty, and final synthesis.
- Let users inspect why a result was included.
- Resume or continue a partially completed research task.

### Acceptance criteria

- Sources are clearly separated from model-generated conclusions.
- Failed or stale sources are visible.
- Research progress can be paused, resumed, and continued with a follow-up request.
- Final reports link back to source evidence and artifacts.

## P2.3 Voice-first developer workflow

**Status:** `[~]` Voice infrastructure and UI exist; workflow integration needs polish.

### Goals

- Speak a request, inspect the resulting plan, approve changes, and hear concise progress.
- Avoid voice reading raw tool output or noisy execution traces.
- Preserve the same task, approval, and checkpoint model as text chat.

### Acceptance criteria

- Voice and text share one canonical task state.
- Voice can request plan mode and approval explicitly.
- Long tool output is summarized instead of spoken verbatim.
- Errors offer a clear visual and spoken recovery action.

## P2.4 Artifact and canvas workflow

**Status:** `[~]` Artifacts and canvas surfaces exist; make them feel like a coherent output workspace.

### Acceptance criteria

- Artifacts are grouped by task/session and searchable.
- Code, diff, markdown, HTML, SVG, Mermaid, and generated assets have predictable preview modes.
- Users can copy, download, pin, compare, and reopen artifacts after reload.
- Artifact provenance identifies the agent, tool, task, and source message.

---

# P3 — Refinement and Operational Quality

## P3.1 Onboarding and diagnostics

**Status:** `[~]` Boot screen and settings exist; guided setup is incomplete.

### Add

- First-run workspace setup
- Provider connectivity check
- Tool permission explanation
- MCP connection test
- Terminal capability test
- `/doctor`-style health report
- Clear recovery instructions for missing runtime binaries/models

## P3.2 Keyboard and command ergonomics

**Status:** `[ ]` Planned.

### Add

- Central typed keymap registry
- Conflict detection
- Context-aware shortcuts
- Command palette coverage for major actions
- Consistent escape/cancel behavior
- Discoverable shortcuts in tooltips and menus

## P3.3 Performance and large-trace resilience

**Status:** `[~]` Source-level long-trace safeguards and contracts landed on 2026-08-01; Tauri runtime measurement and hard numeric budgets remain.

### Acceptance criteria

- `[~]` Large execution traces avoid per-token scroll writes, full active-reasoning markdown reparses, and unbucketed stream-signature churn through source-level contracts.
- `[x]` Tool output is capped and progressively revealable in delegation, research, and generic output surfaces.
- `[x]` Stream updates are batched at event/paint boundaries and short plain streaming text bypasses the rich markdown tree.
- `[~]` Background panels do not rerender unrelated sessions; source ownership is narrowed, while mounted/Tauri runtime measurement remains.
- `[ ]` Performance budgets cover time-to-first-token, first tool card, typing latency, scroll stability, and final message render with runtime measurements.

## P3.4 Security and privacy audit

**Status:** `[~]` Permission and redaction systems exist; perform a unified audit.

### Audit areas

- Prompt injection through web/MCP results
- Secret redaction in tool previews and logs
- Terminal process cleanup
- Workspace path traversal
- Network and local/private address access
- Approval replay and expiration
- Child-agent permission inheritance
- Artifact iframe/content isolation
- Session memory deletion and isolation

---

# Suggested Delivery Order

The release order follows the transition phases above. **Execution-trace redesign is intentionally Release 1**, even though the roadmap priority bucket for differentiation remains P2; it is the foundational UI slice for every later workbench surface.

## Release 1 — Trace and trust foundation

1. Blueprint-led agent execution trace and display
2. First-class execution modes
3. Visible sandbox/security status
4. Unified approval center
5. Deep-research/orchestrator persistence from `PHASES.md` Phase 6

## Release 2 — Workspace shell and recovery

1. Codex-style workspace shell and typed workbench registry
2. Checkpoints and rewind
3. Isolated worktree mode
4. Durable background task center
5. Git-aware review and promotion

## Release 3 — Configuration maturity

1. `/init` and `/doctor`
2. Unified instructions/skills/agents/hooks model
3. Inspectable memory and permission controls
4. Composer, command palette, and keyboard ergonomics

## Release 4 — Specialized workbench

1. Inspectable deep research
2. Voice workflow integration
3. Artifact/canvas output workspace
4. Terminal and browser/developer-tool refinement

## Release 5 — Hardening

1. Security audit
2. Large-trace performance budgets
3. Accessibility and responsive pass
4. Cross-platform terminal/process lifecycle validation

## Release 6 — Differentiation follow-through

1. Advanced multi-agent visualization
2. Research/source provenance polish
3. Rich artifact collaboration and presentation
4. Product-specific visual refinement beyond the blueprint

---

# Definition of Product Polish

A feature is not considered polished when its backend implementation merely exists. It is polished when:

- The user can discover it without reading source code.
- The active state and security implications are visible.
- The happy path is short and predictable.
- Errors explain what happened and what to do next.
- Long-running work can be observed, cancelled, resumed, or recovered.
- Changes can be reviewed and reversed.
- Reloading does not silently lose important state.
- Accessibility, keyboard, responsive, and reduced-motion behavior are intentional.
- Tests or verifiers cover the contract.
- The feature uses the same concepts as the rest of the product.

# Tracking Rules

For each roadmap item:

1. Add a status marker and date when work starts or finishes.
2. Link implementation files, ADRs, tests, and verifier scripts.
3. Record known limitations instead of hiding partial behavior.
4. Add acceptance criteria before implementation begins.
5. Update `PHASES.md` when an item becomes a committed streaming/persistence phase.
6. Re-check the official Claude Code and Codex documentation before making parity claims.

# External References

- Claude Code common workflows: <https://code.claude.com/docs/en/common-workflows>
- Claude Code subagents: <https://code.claude.com/docs/en/sub-agents>
- Claude Code skills: <https://code.claude.com/docs/en/skills>
- Claude Code memory: <https://code.claude.com/docs/en/memory>
- Claude Code checkpointing: <https://code.claude.com/docs/en/checkpointing>
- Codex environments: <https://learn.chatgpt.com/docs/environments/modes>
- Codex worktrees: <https://learn.chatgpt.com/docs/environments/git-worktrees>
- Codex approvals and security: <https://learn.chatgpt.com/docs/en/agent-approvals-security>

# Related Local Documents

- `PHASES.md`
- `ADOPTION.md`
- `frontende-design.md`
- `docs/architecture/frontend-rules.md`
- `docs/audits/`
