# Agentic Workbench Completion Plan

**Status:** Active — consolidated replacement plan
**Planning date:** 2026-08-13
**Scope:** Agent execution trace, inline execution ledger, Run Inspector, subagent UX, and remaining Premium Chat Input hardening
**Source of truth:** Current repository code, `RULES.md`, frontend/security contracts, and this document

This plan replaces the two superseded planning files that previously tracked the
Premium Chat Input redesign and Agent Execution Trace work. It records what is
already stable, then sequences the remaining work needed to make the agentic
workbench truthful, inspectable, and production-ready.

## 1. Current baseline

### Stable baseline already delivered

The Premium Chat Input has completed its automated phases for:

- semantic composer tokens and theme-aware surfaces,
- popup and disclosure accessibility semantics,
- shared layout-mode composition,
- responsive geometry and bounded textarea growth,
- motion normalization and reduced-motion behavior,
- duplicate task-system cleanup,
- development fixture coverage across 320px–1440px and light/dark themes,
- aggregate composer regression verification.

The current composer gate is:

```text
npm run test:premium-chat-input-system
npx tsc --noEmit
npm run build
```

### Agentic trace work already present

The repository already contains partial implementations for:

- frontend `ExecutionNode` and lifecycle normalization,
- trace/run/message/sequence metadata,
- backend parent-child subagent propagation,
- bounded normalized execution-trace tables,
- checkpoint persistence and reload hydration,
- compact inline execution grouping,
- tool result previews and sanitized error presentation,
- delegation trees and nested subagent cards,
- a summary/timeline/tree/diagnostics Run Inspector,
- execution accessibility, motion, and responsive contracts.

These are foundations, not proof that the execution trace is authoritative.

## 2. Non-negotiable architecture rules

1. One canonical execution trace model must power inline chat, subagents, reload,
   persistence, export, and Run Inspector.
2. Backend ownership must be explicit before a trace is rendered as user-facing
   execution. No permanent `tool-ledger-*` fallback rows.
3. Lifecycle states must have one vocabulary across Rust, TypeScript, storage,
   and accessibility labels.
4. Technical payloads stay behind explicit diagnostics; normal chat remains
   summary-first and safe.
5. Existing send, provider routing, tool authorization, persistence keys, and
   composer behavior must remain backward compatible.
6. No new UI framework, state library, parallel registry, or raw IPC path.
7. Every phase requires a focused test gate and a rollback boundary before the
   next phase begins.

## 3. Priority order

| Priority | Workstream | Reason |
|---|---|---|
| P0 | Canonical trace authority | Prevents incorrect ownership, duplicate rows, and reload divergence. |
| P1 | Durable persistence and direct hydration | Makes the Inspector and replay truthful after reload. |
| P2 | Inline ledger and tool result quality | Makes execution understandable without raw logs. |
| P3 | Subagent hierarchy | Makes delegation and nested work auditable. |
| P4 | Run Inspector completion | Provides the dedicated diagnostic surface promised by the architecture. |
| P5 | Live QA and composer hardening | Closes the remaining release and visual-quality risks. |

# Phase 8 — Canonical trace authority

## Goal

Make one backend-owned execution record authoritative and remove the remaining
parallel ownership paths.

## Work

- Define the canonical node contract for Rust and TypeScript, including:
  - `id`, `traceId`, `runId`, `messageId`, `parentId`, `agentId`, `agentName`,
  - `sequence`, `kind`, `phase`, timestamps, duration,
  - summary, target, result summary,
  - safe details, bounded `outputPreview`, retry count.
- Add the missing `outputPreview` representation to the shared runtime/storage
  contract or document a deliberate equivalent.
- Replace the split `AgentRunStatus`, `ExecutionTracePhase`, and backend status
  vocabularies with one normalized lifecycle mapping.
- Preserve explicit backend `message_id` ownership on every tool and subagent
  event.
- Remove runtime dependence on `tool-ledger-*` rows:
  - route events to a real assistant owner,
  - keep unmatched events in a non-rendered recovery buffer,
  - reconcile before completion or expose a visible persistence/recovery state,
  - delete the temporary ledger path after parity tests pass.
- Ensure parent and child IDs are written at start, updated during execution, and
  preserved through completion and reload.
- Keep orphan/recovery diagnostics available only through an explicit technical
  surface.

## Exit gate

- No production renderer depends on `tool-ledger-*` messages.
- A single lifecycle enum maps every backend event and UI status.
- The same fixture trace produces identical node identity and parentage in live,
  persisted, and reloaded representations.
- Contract tests cover duplicate events, late message IDs, missing parents,
  nested children, and out-of-order completion.

## Rollback boundary

Keep the existing legacy projection behind the persistence adapter while the
canonical owner and reconciliation tests are migrated. Do not remove legacy
storage until reload parity passes.

## Phase 8 completion record — 2026-08-13

Completed the canonical-ownership slice without changing tool execution:

- New unowned tool events stay in a bounded, non-rendered recovery buffer keyed
  by backend `messageId`; no new `tool-ledger-*` message is synthesized.
- Duplicate late start/complete events coalesce, and completion reconciles both
  optimistic and backend assistant IDs into the ordered assistant timeline.
- The legacy ledger is retained only as a migration adapter for old persisted
  rows and is no longer referenced by the production renderer.
- Added the bounded/redacted `outputPreview` field to the frontend node/tool
  contract, persistence projection, normalized SQLite event schema, and export.
- Centralized run-level status normalization behind `normalizeExecutionStatus`
  while retaining richer trace phases for node detail.
- Added authority coverage for late ownership, duplicate events, recovery
  consumption, lifecycle mapping, and preview redaction.

Focused gates passed:

```text
npm run test:execution-trace-authority
npm run test:stray-tool-ledger-reconciliation
npm run test:tool-event-reducer
npm run test:execution-trace-contract
npm run test:normalized-trace-storage-contract
npx tsc --noEmit
cargo check --all-targets
```

The remaining shared Rust/TypeScript node schema and direct normalized Inspector
hydration are intentionally Phase 9 work; legacy reads remain the rollback path.

# Phase 9 — Durable persistence and reload authority

## Goal

Make normalized trace rows authoritative for new runs and make reload behavior
match live behavior.

## Work

- Persist canonical node fields directly rather than reconstructing them only
  from legacy `Step[]` payloads.
- Keep `steps_json` as a read-only compatibility projection for legacy history.
- Upgrade all new normalized traces to version 2 consistently.
- Make Run Inspector hydrate through `getExecutionTrace` or the normalized trace
  store instead of rebuilding primarily from `Message.steps` and `toolCalls`.
- Change export metadata to the active trace version and include redaction policy.
- Make migration of legacy rows explicit, idempotent, observable, and bounded.
- Preserve flush behavior for completion, cancellation, pagehide, and application
  close; expose a calm retryable state when both persistence paths fail.
- Add transactional tests for replacement, retention, malformed payloads, large
  payloads, duplicate node IDs, and partial IPC failure.

## Exit gate

- Live and reloaded traces have the same node IDs, order, phase, parentage, and
  summaries.
- The Inspector reads normalized trace data directly.
- No new run depends on `steps_json` for authoritative execution state.
- Export version, storage version, and frontend model version agree.

## Rollback boundary

Retain legacy reads and dual writes until two-version reload fixtures pass. A
failed normalized write must not erase a valid legacy checkpoint.

## Phase 9 completion record — 2026-08-13

Completed the normalized persistence and reload-authority migration slice:

- Normalized trace events now persist direct v2 node fields for run identity,
  ownership, agent identity, ordering, lifecycle phase, summaries, bounded output
  previews, and safe diagnostic details.
- SQLite migration adds the new node columns idempotently while preserving old
  databases and the legacy `steps_json` projection.
- Trace snapshots now expose `nodes` as the authoritative v2 representation and
  retain `steps` only as a compatibility projection.
- Chat reload projects v2 normalized nodes directly into the message timeline;
  absent, malformed, and pre-v2 traces continue through the legacy adapter.
- Run Inspector reads the normalized trace list directly, while retaining the
  message projection as a safe fallback when no normalized trace is available.
- Inspector exports now declare trace version 2 and the `safe-details-v1`
  redaction policy.
- Added reload-parity coverage for node order, tool identity, targets, output
  previews, status, trace metadata, direct Inspector hydration, and migration
  boundaries.

Focused gates passed:

```text
npm run test:execution-trace-reload-parity
npm run test:normalized-trace-storage-contract
npm run test:trace-persistence-contract
npm run test:run-inspector-contract
npm run test:agent-execution-trace-model
npm run test:agent-execution-trace-rendering
npm run test:premium-chat-input-system
npx tsc --noEmit
npm run build
cargo check --all-targets
```

The compatibility projection and dual-write rollback path remain intentionally
active until the transactional/live Tauri scenarios in Phase 13 are complete.

# Phase 10 — Inline ledger and tool-result quality

## Goal

Make normal chat calm, honest, and useful for every common tool category.

## Work

- Keep one compact grouped execution row per meaningful action or parallel batch.
- Remove duplicate planned/ready/executing rows for the same canonical node.
- Keep active, failed, approval, interrupted, and retry states visible.
- Collapse successful completed work after completion and reload while preserving
  an explicit disclosure.
- Complete purpose-built collapsed and expanded renderers for:
  - file edits and diffs,
  - terminal commands and bounded output,
  - search results and result navigation,
  - artifacts and previews,
  - approvals with risk, target, safe arguments, and decisions.
- Add explicit retry, undo/checkpoint, copy, and technical-details actions where
  the tool contract supports them.
- Keep raw JSON, full prompts, credentials, and unbounded output out of normal
  chat.

## Exit gate

- Every common tool category has a readable collapsed summary and useful detail.
- Parallel work is grouped once and reports wall-clock duration.
- Error and approval rows remain actionable without exposing unsafe payloads.
- A reload never replays the full execution animation or duplicates rows.

## Rollback boundary

Tool-specific renderers may fall back to the generic safe preview. Do not alter
backend tool execution or authorization semantics in this phase.

## Phase 10 completion record — 2026-08-13

Completed the inline ledger and tool-result quality slice without changing
backend execution or authorization:

- Reload replay now merges action-message tools with assistant-row tools by
  canonical ID, preserving terminal status and bounded output previews instead
  of producing duplicate execution cards.
- Duplicate tool-call steps receive the merged terminal record, so expanded
  details and collapsed ledger summaries agree after reload.
- Tool cards and expanded details fall back to the canonical redacted
  `outputPreview` when full output is unavailable in a normalized trace.
- Specialized renderers now resolve `tool_exec` envelopes through their inner
  `tool_id`/`tool` identity, keeping category-specific layouts reachable after
  backend normalization.
- Grouped tool-call merges and live reload merges preserve `outputPreview`.
- Added `test:inline-ledger-quality` covering reload deduplication, late
  terminal ownership, preview preservation, and source-level renderer routing.
- Corrected the existing result-quality verifier to accept the implementation's
  redacted normalized diff variable rather than requiring an incidental local
  variable name.

Focused gates passed:

```text
npm run test:inline-ledger-quality
npm run test:inline-premium-ledger-contract
npm run test:tool-result-quality-contract
npm run test:tool-output-preview
npm run test:tool-execution-card-ux
npm run test:tool-compact-preview
npm run test:tool-input-preview
npm run test:tool-event-reducer
npm run test:history-replay-coalescing
node test/verify-chat-reload-contract.mjs
npm run test:live-ledger-merge
npm run test:live-reload-part-parity
npm run test:agent-execution-trace-model
npm run test:agent-execution-trace-rendering
npx tsc --noEmit
```

The remaining Phase 10 rollback path is intact: unknown or malformed outputs
continue through the generic redacted preview, while backend tool execution and
approval semantics are unchanged.

## Phase 9–10 edge-case audit — 2026-08-13

Reviewed the persistence, reload, replay, ledger, preview, and renderer paths
again for malformed and out-of-order data. The following failure modes were
confirmed and hardened:

- A terminal `error`, `timeout`, or `completed` status now overrides a stale
  `tool_running` phase instead of leaving a spinner active after failure.
- Duplicate normalized nodes are sanitized by stable ID; invalid rows are
  ignored or given a safe generic tool identity, and terminal records do not
  regress to an older running duplicate.
- Replay/group merges no longer allow an unknown or older terminal update to
  overwrite a newer terminal state.
- Error-only previews remain expandable even when they contain no stderr or
  non-zero exit code.
- Recovered stale tool rows use the interrupted visual signal rather than the
  successful/running dot color.
- Run Inspector summaries can use the canonical bounded preview after reload.
- Multiple traces returned for one message are selected deterministically by
  trace version and update timestamp instead of backend array order.
- Added `test:phase-9-10-edge-cases` covering these malformed, duplicate,
  stale-phase, and terminal-regression scenarios.

Remaining intentionally unverified boundaries are live Tauri interruption,
partial IPC failure during a real database transaction, and backend-generated
trace identity violations. Those stay in the Phase 13 live verification gate;
the frontend now fails closed into safe summaries rather than rendering raw
payloads or indefinite active states.

Focused gates passed:

```text
npm run test:phase-9-10-edge-cases
npm run test:inline-ledger-quality
npm run test:execution-trace-reload-parity
npm run test:execution-trace-authority
npm run test:tool-result-quality-contract
npm run test:tool-output-preview
npm run test:history-replay-coalescing
npm run test:premium-chat-input-system
npx tsc --noEmit
npm run build
cargo check --all-targets
```

# Phase 11 — Authoritative subagent hierarchy

## Goal

Make delegation inspectable without flooding the parent conversation.

## Work

- Render delegation edges from explicit parent/child IDs first.
- Retain trace-ID fallback only for legacy records and label it internally as a
  migration path.
- Attach child tools to their owning subagent without broad sibling matching.
- Preserve nested-agent order, status, duration, result summary, and failed-child
  details after reload.
- Keep the parent chat at summary level and place detailed child work in the
  agent panel or Inspector.
- Add child trace selection and parent-to-child navigation in the Inspector.
- Ensure cancellation, incomplete, uncertain, stale, and failed child statuses
  use the same lifecycle presentation contract.

## Exit gate

- Nested subagents remain attached to the correct parent across live events,
  persistence, reload, and out-of-order completion.
- Parent chat contains one delegation summary instead of child transcript noise.
- The Inspector can open a selected child node and show its exact descendants.

## Rollback boundary

Keep legacy trace-ID inference for imported history only. New backend events must
use explicit ownership fields.

## Phase 11 completion record — 2026-08-13

Completed the authoritative subagent hierarchy hardening slice:

- Explicit `childToolCallIds` now remain authoritative across runtime selection,
  nested cards, the Agents panel, persistence, and reload; trace-id and
  parent-tool inference are fallback paths for imported history only.
- Lifecycle records merge by stable `spawnId`, preserve start timestamps and
  partial ownership, union child tool ids, and refuse late running or duplicate
  terminal events that would reopen or rewrite a finished child.
- Malformed subagent events without a stable spawn id are rejected before they
  enter the chat timeline or scoped runtime store.
- Duplicate persisted lifecycle rows collapse into one canonical nested card,
  direct-tool counts exclude nested spawn tools, and parent/child edges are
  bounded and cycle-broken so corrupt traces retain a visible root.
- Child tool selection is centralized in one ownership helper; broad
  parent-agent matching remains prohibited.
- Persistence now retains explicit child ids, enabling nested hierarchy parity
  after reload instead of forcing legacy trace inference.
- Added `test:phase-11-subagent-hierarchy` covering late events, duplicate ids,
  explicit-vs-legacy ownership, nested reload shape, failed children, malformed
  identity, and cyclic parentage. Updated the older orchestration contract to
  assert the canonical helper rather than brittle inline implementation text.

Focused gates passed:

```text
npm run test:phase-11-subagent-hierarchy
npm run test:subagent-orchestration-contract
npm run test:subagent-execution-preview
npm run test:agent-delegation-lane-model
npm run test:phase-9-10-edge-cases
npm run test:execution-trace-reload-parity
npm run test:execution-trace-authority
npm run test:agent-execution-trace-model
npm run test:agent-execution-trace-rendering
npm run test:live-reload-part-parity
npm run test:history-replay-coalescing
npm run test:live-ledger-merge
npm run test:premium-chat-input-system
npx tsc --noEmit
npm run build
cargo check --all-targets
git diff --check
```

The compatibility trace-id fallback remains intentionally enabled for imported
history. New backend events continue to carry explicit parent and child identity;
live Tauri interruption/reload evidence remains part of Phase 13.

# Phase 12 — Run Inspector completion

## Goal

Deliver the full diagnostic run surface described by the agentic architecture.

## Work

- Build the Inspector from the canonical normalized trace model.
- Complete views:
  - Summary,
  - chronological Timeline,
  - parent/child Tree,
  - Agents/delegation lanes,
  - Diagnostics.
- Add filters by phase, agent, tool, status, and approval state.
- Add search within summaries, targets, results, and safe details.
- Add selected-node deep linking from chat, subagent cards, approvals, and failed
  tools.
- Add safe redacted JSON export using the active trace version.
- Add virtualization or bounded rendering for traces with 100+ nodes.
- Add empty, loading, missing-trace, persistence-failure, and stale-run states.
- Verify keyboard navigation, focus restoration, screen-reader labels, and
  reduced-motion behavior.
- Add command-palette and keyboard-shortcut entry points only through existing UI
  routing conventions.

## Exit gate

- A user can explain a successful or failed run without reading raw logs.
- Timeline and Tree show the same canonical node set.
- Exported data is redacted, versioned, bounded, and replayable.
- Large traces remain responsive and selected-node navigation is stable.

## Rollback boundary

The Inspector may remain an opt-in right-panel surface. It must not change the
normal chat timeline or agent execution behavior.

## Phase 12 completion record — 2026-08-13

Completed the Run Inspector diagnostic-surface slice:

- Added a canonical, bounded Inspector view model for summary, timeline, tree,
  delegation agents, and diagnostics views.
- Added deterministic normalized-trace selection by version and update time,
  preserving the newest v2 trace when duplicate backend rows are returned.
- Added phase, status, agent, tool, approval, and safe-diagnostic search
  filtering without exposing raw event payloads.
- Added parent-first tree ordering, bounded cycle-safe hierarchy handling, and a
  240-node render budget with an honest truncation message. The model retains
  the full canonical node set for filtering and export.
- Added bounded redacted export with the active trace metadata and an explicit
  truncated-node count.
- Added loading, refresh, missing-trace, normalized-history failure, and retry
  states while preserving the local message projection as a fallback.
- Added Inspector deep links from failed, approval, and interrupted tool cards,
  alongside the existing subagent and run-status entry points.
- Added selected-node diagnostics with parent/descendant context and safe
  output previews.
- Updated the long-trace verifier to accept the implementation's equivalent
  scroll-intent and deferred-reasoning guards instead of brittle exact source
  expressions.
- Added `test:phase-12-run-inspector` covering filtering, safe search, large
  traces, hierarchy ordering, and Inspector deep-link contracts.

Focused gates passed:

```text
npm run test:phase-12-run-inspector
npm run test:run-inspector-contract
npm run test:long-trace-performance
npm run test:execution-trace-accessibility
npm run test:execution-trace-responsive
npm run test:execution-trace-delegation-ux
npm run test:execution-trace-reload-parity
npm run test:execution-trace-authority
npm run test:subagent-orchestration-contract
npx tsc --noEmit
```

The Inspector remains an opt-in right-panel surface. Real Tauri interruption,
partial IPC failure, and screenshot-level manual review remain Phase 13/14 work.

## Phase 11–12 edge-case audit — 2026-08-13

Re-reviewed the hierarchy and Inspector work for malformed, partial, stale, and
cross-surface failures. Confirmed and hardened:

- Unknown subagent lifecycle strings now fail closed as `uncertain` / "Needs
  review" instead of reaching the live renderer as an untyped status.
- A real terminal event can resolve a stale reload marker, while late running
  events still cannot reopen a finished child.
- Inspector trace selection now ignores pre-v2 and malformed node payloads and
  compares malformed timestamps safely instead of calling `localeCompare` on
  unknown values.
- An empty or invalid normalized trace no longer erases a usable legacy message
  projection during partial IPC or migration failure.
- Circular safe diagnostic payloads no longer crash Inspector search.
- Cross-chat deep links cannot retain a node selection from another chat, and
  switching run/message context clears stale filters.
- Legacy tool rows without `messageId` now receive the owning assistant ID for
  Inspector navigation, preventing failed/approval links from opening the wrong
  run in multi-turn chats.
- Filtered tree results reset orphaned child indentation and cycle-safe ordering
  retains every canonical node without recursive render loops.

Added these cases to the Phase 11/12 regression coverage. Remaining unknowns are
runtime-only: a real Tauri IPC/database failure during a concurrent reload,
backend identity collisions across independent runs, and browser-level focus
restoration after a native panel closes. Those remain Phase 13 live verification
work rather than being hidden behind source-only assumptions.

Focused audit gates passed:

```text
npm run test:phase-11-subagent-hierarchy
npm run test:phase-12-run-inspector
npm run test:run-inspector-contract
npm run test:execution-trace-reload-parity
npm run test:long-trace-performance
npx tsc --noEmit
```

# Phase 13 — Production controls, performance, and live verification

## Goal

Close the release gates for the full agentic workbench.

## Work

- Verify autonomy indicator and permission-mode semantics in normal and Inspector
  surfaces.
- Verify Stop, Pause, Continue, Retry, Queue follow-up, and Undo/checkpoint paths.
- Run live Tauri scenarios:
  1. text-only stream,
  2. text → tool → text,
  3. parallel tools,
  4. approval request,
  5. tool failure and retry,
  6. nested subagent,
  7. cancellation,
  8. connection drop,
  9. reload during tool execution,
  10. reload during subagent execution,
  11. large terminal output,
  12. model escalation,
  13. narrow viewport,
  14. reduced motion.
- Confirm event bursts are batched, unrelated messages do not rerender, markdown
  is not reparsed per token, and auto-scroll respects user pinning.
- Fix stale or brittle verifiers and expose every existing verifier through a
  valid npm script.
- Add a single `npm run test:agentic-workbench` aggregate gate after all focused
  verifiers exist.

## Exit gate

- All focused tests and the aggregate gate pass.
- `npx tsc --noEmit`, `npm run build`, `cargo check --all-targets`, backend tests,
  and diff checks pass.
- Live Tauri evidence exists for every listed scenario.
- No known P0/P1 trace ownership, persistence, recovery, or safety issue remains.

## Phase 13 automated production-controls slice — 2026-08-13

Completed the deterministic release-control hardening that can be verified without
launching a native Tauri window:

- Stop now treats a failed abort IPC as a failed control request instead of
  immediately labeling the visible run cancelled while the backend may still be
  executing.
- Pause, Continue, and Stop requests are sequence-guarded so a late response
  from an older click cannot overwrite a newer control intent.
- Pause and Continue IPC failures now leave the current execution state intact
  and provide an actionable toast rather than silently logging the failure.
- Removed the abort path's ineffective empty-map chunk cleanup call; live stream
  ownership remains with the global stream listener and terminal event cleanup.
- Exposed the previously orphaned execution-recovery verifier and added the
  Phase 13 production-controls verifier.
- Added `npm run test:agentic-workbench`, a single focused aggregate gate for
  trace authority, persistence/reload, ledger, hierarchy, Inspector, recovery,
  control, error, rendering, and composer contracts.

Automated Phase 13 gates passed for the changed control path. Native live evidence
is still required for interruption during an actual tool, nested subagent, approval,
connection drop, and WebView reload; those scenarios cannot be proven by source
contracts alone.

# Phase 14 — Premium Chat Input hardening and final visual QA

## Goal

Close the remaining risks from the completed composer redesign without reopening
its completed visual phases.

## Work

- Reconcile task-state data so compact task disclosures and detailed task views
  report the same progress, completion, failure, and recovery meaning.
- Remove blank capability slots and make unsupported actions either absent or
  visibly disabled with an explanation.
- Consolidate capability metadata, predicates, labels, pin state, and commands
  into one typed action registry.
- Document and normalize container geometry for chat, welcome, sidebar, and
  artifact-panel placements.
- Add a true artifact-panel fixture case.
- Complete browser screenshot and accessibility-tree review for 320px, 390px,
  480px, 768px, 1024px, and 1440px in light and dark themes.
- Verify Enter, Shift+Enter, IME, popup Escape/focus return, resizing, scrubber
  overlay behavior, read-only mode, and reduced motion in a real browser.

## Exit gate

- No blank capability state appears in any supported provider/model combination.
- Task summaries agree across every production surface.
- All composer routes use documented geometry contracts.
- Manual visual and accessibility evidence is recorded next to the fixture QA
  matrix.
- Composer and agentic workbench aggregate gates pass together.

## Phase 14 automated composer-hardening slice — 2026-08-13

Completed the research-backed deterministic portion of the final composer gate:

- Persisted capability pins are filtered against the selected model's supported
  capabilities before reaching either the pinned rail or add menu, preventing
  blank controls and hidden unsupported actions.
- Empty pinned rails return no layout node, eliminating reserved vertical space
  when a model has no currently supported pinned capability.
- Task-plan status normalization is shared between compact composer disclosure
  and detailed assistant task previews; running, complete, failed, and cancelled
  tasks now have distinct labels and icons.
- Failed task rows retain a bounded error explanation, and long task plans scroll
  within a capped disclosure instead of shifting the composer off-screen.
- Pause/Stop labels now follow composer container width rather than viewport
  breakpoints, preventing sidebar layout shifts.
- Slash and model popovers retain the WAI-ARIA combobox/listbox relationships and
  trigger focus restoration recommended by the W3C APG combobox pattern.
- Added `test:phase-14-composer-hardening` and included it in the aggregate
  `npm run test:agentic-workbench` gate.

The design review used the W3C APG Combobox Pattern and GitHub Primer's
Progressive Disclosure guidance: popups remain collapsed by default, focus stays
anchored to the invoking control, disclosure labels preserve context, and long
secondary content is bounded rather than competing with the primary composer.
Browser screenshot, IME, native focus, and reduced-motion evidence still require
live browser verification.

## Phase 13–14 edge-case audit — 2026-08-13

Re-reviewed the production-control and composer hardening paths against malformed
inputs, stale asynchronous results, no-op backend commands, session changes, and
storage failures. Online guidance used for this audit:

- MDN's [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
  and [AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)
  guidance supports treating cancellation as an explicit operation result rather
  than assuming a request was accepted.
- W3C's [ARIA19 error live-region guidance](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA19)
  and MDN's [live-region guidance](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions)
  reinforce that dynamic failures must be announced without stealing focus.
- Interruption-resilient chat UX guidance consistently recommends preserving
  partial output and separating Stop, Retry, Continue, and Keep partial outcomes.

Confirmed and hardened:

- Stop, Pause, and Continue IPC commands now return whether a live backend
  execution accepted the request. The frontend no longer fabricates cancelled,
  paused, or resumed state when the command was already a no-op.
- Mock IPC controls now return the same boolean contract as Tauri, preventing
  fixture-only behavior from diverging from production.
- Existing control sequence guards now check request freshness before showing a
  no-op toast, so a late response cannot announce stale information after a newer
  control action.
- Malformed task event text, status, progress, and error payloads are normalized
  before entering the task store; progress is clamped to 0–100 and task text is
  bounded.
- Switching chats closes an open task disclosure so task UI from one session
  cannot remain visually attached to another session.
- localStorage quota, private-mode, or disabled-storage failures no longer throw
  from the pinned-action persistence effect; the current session remains usable.

Remaining runtime-only risks are native IPC interruption during the exact
completion race, WebView reload while a control request is pending, and screen
reader announcement behavior across platform/browser combinations. These require
live Tauri/browser evidence rather than additional source-only assumptions.

## Compact workbench density pass — 2026-08-13

The current chat surface was visibly using a large-card rhythm: 16px message
insets, 24px markdown section margins, 24px code/card padding, and a 280–300px
fixed research/chart treatment. This was inconsistent with the requested VS
Code-like workbench density and made the composer and execution ledger compete
for vertical space.

Research calibration:

- [VS Code custom layout](https://code.visualstudio.com/docs/configure/custom-layout)
  documents a compact Activity Bar mode and layout controls that reclaim space
  without changing the user's work context.
- [VS Code compact-density feedback](https://github.com/microsoft/vscode/issues/325759)
  explicitly identifies unnecessary gaps between workbench regions as a
  usability problem and recommends targeted gap reductions rather than a second
  parallel layout system.
- [Claude MCP App design guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines)
  require inline cards to fit the conversation width, avoid nested scrolling,
  and adapt from 320px upward; they also distinguish compact inline summaries
  from full-screen detail surfaces.
- [Carbon spacing guidance](https://carbondesignsystem.com/elements/spacing/overview/)
  reinforces using a small, repeatable spacing scale for component-level
  relationships instead of arbitrary margins.

Applied the compact pass to the high-frequency chat path:

- Added shared `--zen-space-detail`, `--zen-space-control`,
  `--zen-space-section`, and `--zen-control-size` tokens.
- Reduced message row insets, execution/reasoning gaps, status notices, empty
  timeline padding, and composer editor/footer padding while retaining readable
  prose sizing and keyboard focus outlines.
- Tightened Markdown headings, lists, references, alerts, blockquotes, tables,
  code blocks, Mermaid placeholders, charts, and file-tree cards.
- Reduced fixed research/chart height where the card is a compact inline progress
  surface; detailed output remains available in the existing disclosure/panel
  paths.
- Kept control minimums at 30px rather than collapsing interactive targets into
  decorative 20–24px icons. Mobile touch-target QA remains required because
  Claude's guidance recommends 44pt targets on touch surfaces.
- Added `test:compact-density-contract` and included it in the agentic workbench
  aggregate gate.

The remaining density work is visual QA across the 320px–1440px fixture matrix,
light/dark themes, touch/keyboard input, and native panel geometry. The pass is
intentionally targeted rather than a global Tailwind scale override so prose
readability, accessibility targets, and third-party surfaces are not silently
compressed.

## Premium composer component geometry audit — 2026-08-13

Audited each production composer child rather than treating the input as one
undifferentiated card. The compact geometry contract now covers:

| Component | Compact geometry contract |
|---|---|
| `PremiumChatInput` shell | 6–8px outer rhythm, 8px route insets, 8px shell radius |
| `ChatInputTextAreaBlock` | 34px default / 30px welcome minimum row; 14px default text |
| `ChatInputFooter` | 8px horizontal / 6px vertical toolbar inset; fixed actions stay in one column |
| `PinnedActionBar` | no duplicate vertical padding; 4px action gaps; 12px thinking popover padding |
| `TaskDrawer` | medium top radius, 10px header inset, 6px list rhythm |
| `PlusActionMenu` | 4px outer popover gap, 4px shell padding, 4px section labels |
| `MenuItem` | 8px icon/label gap and 13px action text |
| `ModelSearchDropdown` | 4px popover offset, 6px search toolbar rhythm, 6px footer action padding |
| `PermissionModeMenu` | 30px trigger, 11px label, 6px menu-row padding |
| `ActionPills` | 8px row inset and 6px chip gap |
| `SuggestedPromptStrip` | 6px chip gap and 4px chip vertical padding |
| `ImagePresetStrip` | 6px strip gap and 4px preset vertical padding |
| `SlashCommandPopover` | 8px shell alignment inset and 4px header padding |
| `ThinkingConfig` | 12px section rhythm and compact segmented controls |
| `ContextViewerBadge` | 24px gauge with 10px popover inset and 8px section rhythm |

The audit removed the largest sources of false height: the pinned rail's
internal `px-3 py-2`, 16px task-panel radius, 16px composer shell radius,
24px task/attachment insets, and 16px thinking popover padding. It preserves
30px keyboard/mouse controls and does not collapse the 24px context gauge.

Added `npm run test:premium-chat-input-geometry`, which checks all listed child
components, their spacing/radius contracts, and the shared CSS minimum-size
contract. It is also included in both the premium composer system verifier and
the `npm run test:agentic-workbench` aggregate gate.

Live visual measurement remains required for computed layout, especially when
multiple pinned actions, task disclosures, model labels, image presets, or
sidebar width constraints appear simultaneously. The source contract prevents
regression; the browser fixture must confirm that the resulting controls do not
wrap, overlap, or become too small for the active input mode.

## Agent message source-order hardening — 2026-08-13

Fixed a reload-path ordering regression in `normalizeVercelMessage`. The
normalizer was correctly parsing `steps_json`, but then discarded that ordered
projection when constructing the `Message`, rebuilding the fallback sequence as
`reasoning → all tools → final text`. That made interleaved runs appear to batch
all thinking and tools at the top of the assistant bubble after reload.The persisted `steps_json`/`steps` array is now authoritative whenever it is
non-empty; the canonical reasoning/tool/text projection is used only for
legacy rows that have no ordered timeline. The live runtime bridge now projects
its revealed text/reasoning parts into the same step list, replacing only its
own runtime rows on each frame while retaining tool/action/subagent rows and
sorting by explicit sequence. Live tool insertion already appends in arrival
order and groups only contiguous compatible tool events, so this keeps
streaming and reload behavior aligned.


Regression coverage now verifies:

- `reasoning → tool → text → tool → reasoning → text` survives reload exactly.
- Separate tool phases remain separate when prose occurs between them.
- Adjacent parallel tools still collapse into one execution group.
- Legacy fallback messages remain renderable when no ordered steps exist.
- Runtime reveal frames do not duplicate thinking or answer blocks.
- Live runtime prose and execution steps share one ordered timeline.

Focused commands:

```text
npm run test:assistant-message-parts
npm run test:chat-reload-contract
npm run test:agentic-trace-composition
```

## Cross-layer chronological rendering and prompt contract — 2026-08-13

Hardened the ordering contract across live frontend rendering, reload
hydration, normalized backend traces, and model instructions.

- Tool rows now group only on an explicit matching `batchId` or `toolBatchId`.
  Missing batch identity creates separate rows, except a repeated tool id is
  merged as the lifecycle update for that same tool.
- Backend trace persistence repairs duplicate or regressed sequence values into
  a strictly increasing sequence before storage. Reload queries use sequence
  plus SQLite insertion order as a deterministic tie-breaker.
- Runtime thinking/text rows and execution rows share one sequence-aware live
  projection; frame updates replace runtime-owned rows instead of duplicating
  them.
- Added the invariant `Deterministic Message and Timeline Contract` to every
  backend prompt, including custom replacement prompts. It requires valid
  closed Markdown fences, raw JSON discipline for structured blocks, explicit
  distinction between parallel batches and sequential tools, no fabricated
  results, and no duplicated final content.
- Added `npm run test:message-order-contract` for cross-layer source contracts.

The remaining limitation is historical rows that never stored ordered steps or
backend sequence metadata. Those use the compatibility projection; new runs
now have deterministic ordering and batch identity at every persistence path.

# 4. Verification commands

Focused trace commands:

```text
npm run test:execution-trace-authority
npm run test:execution-trace-reload-parity
npm run test:execution-trace-contract
npm run test:agent-execution-trace-model
npm run test:agent-execution-trace-rendering
npm run test:execution-trace-accessibility
npm run test:execution-trace-responsive
npm run test:execution-trace-delegation-ux
npm run test:execution-trace-motion-remediation
npm run test:execution-disclosure-lifecycle
npm run test:normalized-trace-storage-contract
npm run test:trace-persistence-contract
npm run test:agentic-trace-composition
npm run test:run-inspector-contract
npm run test:phase-12-run-inspector
npm run test:subagent-execution-preview
npm run test:long-trace-performance
```

Composer commands:

```text
npm run test:premium-chat-input-system
npm run test:premium-chat-input-geometry
npm run test:premium-chat-input-runtime
```

Project gates:

```text
npx tsc --noEmit
npm run build
cargo check --all-targets
```

## 5. Known baseline issues to resolve

- The execution-recovery verifier is now exposed through
  `npm run test:execution-recovery-ux`.
- Legacy `tool-ledger-*` rows remain only in the reconciliation adapter for
  imported/old history; new runs use the non-rendered recovery buffer.
- Legacy v1 traces still use the compatibility projection until an explicit
  migration checkpoint upgrades their event rows to v2.
- Run Inspector uses normalized traces for new v2 records and falls back to the
  message projection for legacy/imported history; normalized IPC failure remains
  visible and retryable.
- Manual browser visual evidence has not yet been recorded.

## 6. Rollout and change ownership

- Phases 8–9 are foundational and must land before further Inspector polish.
- Phases 10–11 may be developed in parallel only after canonical identity tests
  pass.
- Phase 12 is opt-in until normalized reload parity is proven.
- Phase 13 is the release gate for agentic execution.
- Phase 14 is the final composer quality gate.
- Keep legacy reads and rollback adapters until the corresponding exit gates pass.
- Do not stage, discard, or overwrite unrelated working-tree modifications.
- Do not commit or deploy as part of this plan unless explicitly requested.

## Definition of done

The consolidated work is complete only when:

- one canonical trace model powers every execution presentation,
- no new run creates a user-visible or renderer-dependent orphan ledger,
- normalized persistence and reload are authoritative,
- inline execution remains concise and honest,
- tools and subagents are inspectable without transcript flooding,
- Run Inspector is versioned, redacted, performant, and accessible,
- live Tauri scenarios pass,
- composer task/capability/geometry risks are closed,
- all focused and aggregate tests, typechecks, builds, and required manual QA
  evidence are green.
