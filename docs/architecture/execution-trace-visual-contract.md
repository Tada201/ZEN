# ZEN Execution-Trace Visual Contract

**Status:** Proposed for Phase 1 frontend implementation  
**Date:** 2026-07-31  
**Blueprint:** `EXAMPLE_NO_EDITS/codex-gpt_Ui-replica`

## Purpose

This document is the implementation contract for the first frontend refinement slice of ZEN's agent execution trace. It translates the Codex-style replica's calm, dense, summary-first interaction model into the existing ZEN components without replacing the real event, permission, persistence, tool, or workspace architecture.

The first representative path is:

```text
reasoning → grouped tool execution → approval/error or completion → final answer
```

The trace is a **progress ledger**, not a terminal transcript. A user should understand the current action, target, status, result, and required decision without opening technical details.

## Source of truth and ownership

| Concern | Owner | Contract |
|---|---|---|
| Backend execution and permission decision | Canonical agent/tool services | The renderer presents decisions; it never authorizes work. |
| Stream event identity | Typed event payloads | Use backend `message_id`, `tool_call_id`, `run_id`, `trace_id`, and batch IDs when present. |
| Persisted timeline | `messages.steps_json` | `stepsJson` is the reload source of truth; legacy tool reconstruction is fallback only. |
| Runtime chat state | Chat store and stream hooks | Buffer and reconcile live events without creating a second execution ledger. |
| Grouped trace projection | `agentExecutionTraceModel.ts` and `AgentExecutionTrace.tsx` | Group tools, calculate status precedence, and report wall-clock duration. |
| Individual tool presentation | `ExecutionRow.tsx` and `ToolCallCard.tsx` | Own the shared row anatomy, user-facing verbs, disclosure, and tool-specific preview. |
| Reasoning presentation | `ReasoningBlock.tsx` | Expand while active; collapse to a useful duration summary after completion. |
| Delegation presentation | `SubagentExecutionCard.tsx` and `AgentDelegationLane.tsx` | Keep child work behind a parent summary; do not stream child transcripts into the parent by default. |
| Artifact presentation | Existing artifact panel/viewer | Open artifacts as a projection of the canonical tool/message record. |

## Status vocabulary

The UI must not invent a new backend lifecycle. It normalizes existing owner-specific states into a shared presentation vocabulary.

| Owner/state | User-facing label | Semantic meaning | Default disclosure |
|---|---|---|---|
| Tool `running` | Running / Reading / Editing / Running tests | Work is active and may update in place. | Expanded or visibly active |
| Tool `awaiting_approval` | Needs approval | The backend is waiting for a user decision before execution. | Expanded |
| Tool `error` | Failed | The operation ended unsuccessfully or was blocked. | Expanded |
| Tool `completed` | Complete | The operation ended successfully. | Collapsed unless the result is immediately useful |
| Execution event `pending` | Preparing | A lifecycle owner exposes a pre-execution state. Do not map this to `ToolCall.status` unless the owner supports it. | Visually active |
| Execution event `cancelled` | Cancelled | The owning lifecycle stopped before normal completion. | Collapsed with reason, or expanded when recovery is available |
| Subagent `running` | Working | Delegated work is active. | Expanded while active |
| Subagent `completed` | Complete | Delegated work produced a result. | Collapsed unless result needs attention |
| Subagent `failed` | Failed | Delegated work ended unsuccessfully. | Expanded |
| Subagent `cancelled` | Cancelled | Delegated work was stopped. | Collapsed with reason |
| Assistant `sending` | Thinking / Executing / Responding | The parent turn is still streaming. | Show one compact live status indicator |
| Assistant `sent` | — | The final answer is available. | Hide low-value completed execution from the main transcript by default |
| Assistant `failed` | Operation failed | The turn failed and has a recovery action. | Expanded |

**Important:** `ToolCall.status` currently supports only `running`, `awaiting_approval`, `completed`, and `error`. Cancellation belongs to `ExecutionEventStatus` and subagent lifecycle types today. A visual cancellation row may be rendered only where its owning event or subagent contract supplies that state.

## Group status precedence

When several tools share one grouped row, human-attention states win over background activity:

```text
awaiting_approval > error > running > completed
```

Examples:

- One approval plus two running tools → group is **Needs approval**.
- One failure plus one running tool → group is **Failed**.
- All tools complete → group is **Complete**.
- Parallel duration is `latest completion − earliest start`, never the sum of child durations.

The grouped summary must include enough information to explain mixed states, for example:

```text
3 actions · 1 waiting · 1 running
3 actions · 1 failed
3 actions · 1.8s
```

## Representative trace-state matrix

| Trace stage | Compact row | Expanded body | Primary action | Required semantics |
|---|---|---|---|---|
| Reasoning active | `Thinking… 4s` | Live reasoning content, bounded and deferred during streaming | Collapse only by explicit user action | `role="status"`, `aria-live="polite"`, no decorative looping beyond the state indicator |
| Reasoning complete | `Thought for 8s` | Reasoning content on demand | Expand/collapse | User override must prevent automatic re-expansion/collapse |
| Grouped tools running | `Running 3 tools` + count/duration | Individual compact tool rows and live previews | Expand/collapse | Group has `aria-busy="true"`; do not expose raw event metadata |
| Tool awaiting approval | `Needs approval · Edit 3 files` | Risk, plain-language reason, redacted target/preview, decision controls | Approve / Deny | Approval controls are keyboard reachable; backend approval API remains authoritative |
| Group contains an error | `3 actions · 1 failed` | Concise failure, retry when supported, technical disclosure | Retry / inspect details | Error stays visible even if sibling work is running or complete |
| Tool complete with useful result | `Edited App.tsx  +24 −8` | Diff, structured result, artifact action, or concise output | Open diff/artifact/details | Hide raw JSON and full output by default |
| Tool complete with low-value result | `Read config.rs` / `Ran tests · exit 0` | Optional technical details | Expand/collapse | Completed background work is quiet after the final answer and on reload |
| Subagent active | `Delegated to Reviewer · Working · 18s` | Child tool rows and bounded live/result summary | Expand/collapse child trace | Never stream child token deltas into the parent timeline by default |
| Subagent complete | `Delegated to Reviewer · Complete` | Final handoff summary and child trace | Open details | Show task, owner, status, elapsed time, and useful outcome |
| Subagent failed/cancelled | `Delegated to Reviewer · Failed/Cancelled` | Recovery reason and available retry/reopen action | Retry/reopen when supported | Do not represent cancellation as a tool status that the type does not own |
| Final assistant answer | Normal answer content | Existing Markdown/artifact rendering | Copy, retry, regenerate as applicable | Low-value successful execution rows should not trail the answer |

## Shared row anatomy

Every grouped or individual execution row follows this order:

```text
[semantic status icon] [human verb + target]                 [duration]
                         [one-line outcome / attention summary] [chevron]
```

### Required content

- **Verb:** product language such as `Reading`, `Edited`, `Searched`, `Ran`, `Delegated`, or `Needs approval`.
- **Target:** filename, command, query, agent, artifact, or a redacted safe summary.
- **Status:** text and icon/structure; never color alone.
- **Duration:** elapsed time when meaningful; use wall-clock time for groups.
- **Outcome:** result count, file delta, exit code, artifact title, or concise failure reason.
- **Next action:** only when needed—Approve, Deny, Retry, Open diff, Open artifact, Copy, or Technical details.

### Content-type presentation

| Tool family | Collapsed summary | Expanded content |
|---|---|---|
| File read/list | Verb + path | Structured file/result preview; no raw protocol envelope |
| File edit/write/patch | Verb + filename + `+N −M` | Unified diff first; full diff may open in the artifact panel |
| Terminal/shell | `Ran <command>` + exit status | Monospaced output, bounded preview, copy, full-output disclosure |
| Search/web/MCP result | `Searched <query>` + result count | Numbered snippets, safe source links/chips, server context where useful |
| Artifact | Artifact title + Open artifact | Existing artifact viewer/preview; do not duplicate full content in chat |
| Subagent | Agent + task + status + duration | Child execution trace and final handoff summary |
| Generic tool | Human verb + target | Structured preview if available, otherwise Technical details disclosure |

## Visual tokens and density

Use existing semantic tokens and shared primitives rather than introducing a second palette.

| Element | Contract |
|---|---|
| Primary surface | Solid `bg-card`, `bg-muted`, or `bg-background`; no glassmorphism on the timeline |
| Border | `border-border`; category may use the existing thin left accent |
| Text | Normal labels at least 11px; body content at least 12px; meaningful text uses full semantic foreground/muted tokens |
| Row title | 12px–13px, medium weight, single-line truncation where necessary |
| Row metadata | 10px–11px, tabular duration, readable muted token |
| Radius | Compact cards use the existing `rounded-md`/`rounded-lg` language; avoid adding a new radius family |
| Spacing | Dense rows use the existing 8px rhythm; expanded bodies add space only around meaningful content |
| Motion | `duration-200`–`duration-220` disclosure/entry transitions; no bounce or decorative shimmer |
| Running indicator | One restrained spinner/pulse communicates active work; it stops when the state becomes terminal |
| Reduced motion | Remove looping/entrance motion while preserving status, layout, and focus behavior |

## Interaction and accessibility contract

- Expand/collapse is a focusable button with `aria-expanded`.
- Running rows expose `aria-busy="true"`; terminal rows do not.
- Status is communicated through text/icon/structure, not color alone.
- Approval and error controls remain visible without hover and retain visible focus.
- Live streaming updates use a polite status region and do not steal focus.
- Do not auto-scroll unless the user is already near the bottom of the chat.
- On narrow widths, truncate targets safely and preserve status/action controls.
- A user toggle overrides automatic expansion behavior for the lifetime of that rendered record.
- Raw arguments, provider payloads, stack traces, stdout/stderr dumps, and child transcripts stay behind intentional diagnostic disclosures.
- Existing delegation lanes still need the same token cleanup and explicit status-label treatment as the newer execution-row primitives; this is an implementation follow-up, not permission to create a second status system.

## Persistence and reload contract

1. `stepsJson` is read before legacy `toolInvocations` or `toolCalls` reconstruction.
2. The final persisted timeline uses the backend assistant `message_id` from `chat:done`; optimistic IDs are never used for durable updates.
3. Tool and subagent identity uses stable backend IDs (`tool_call_id`, `trace_id`, `spawn_id`, and related run/batch IDs).
4. The same persisted steps must produce the same grouping, status, summary, and **default** disclosure behavior before and after reload. User-toggled expansion is currently ephemeral unless a later persistence slice explicitly stores it.
5. Reasoning disclosures use the persisted `reasoningDisclosureDensity` preference: `compact` and `balanced` remain summary-first, while `detailed` opens unspecified completed blocks; explicit caller defaults and user toggles always win.
6. Completed low-value groups remain hidden after the answer and on reload unless the persisted `revealCompletedToolHistory` preference intentionally opts into historical visibility.
6. Duplicate tool calls from steps and legacy fields are merged by stable ID.
7. Persisted steps remain bounded and serializable; full output, base64 assets, and child transcripts belong in their dedicated surfaces.
8. If a branch cannot supply a real backend message ID, it must not pretend that its timeline is durably persisted.

## Phase 1 implementation gates

The first frontend pass is complete only when all of the following are true:

- [ ] The representative reasoning → grouped tools → approval/error/completion → final answer path follows this matrix.
- [ ] `ExecutionRow`, `ToolCallCard`, `AgentExecutionTrace`, `ReasoningBlock`, and subagent cards share the same status, disclosure, surface, and motion language.
- [ ] Completed low-value groups disappear after the answer and on reload, while approvals/errors remain visible.
- [ ] File, terminal, search, artifact, generic, and subagent previews use the content-type rules above.
- [ ] Keyboard, screen-reader, reduced-motion, and narrow-layout behavior is verified.
- [ ] Existing reload, event-ordering, ledger, live-status, and execution-card verifiers pass.
- [ ] No backend permission, audit, workspace, or persistence semantics were reimplemented in React.

## Explicitly deferred

This contract does not implement or claim:

- Git worktree creation or promotion
- Durable background task recovery
- Conversation rewind or durable multi-file checkpoints
- Session-scoped permission policy
- New tool statuses not present in the owning backend/event type
- A second execution store for the right panel
- A production terminal/browser implementation copied from the mockup

## Implementation owners

- `src/atlas/components/chat/AgentExecutionTrace.tsx`
- `src/atlas/components/chat/agentExecutionTraceModel.ts`
- `src/atlas/components/chat/ExecutionGroup.tsx`
- `src/atlas/components/chat/tool/ExecutionRow.tsx`
- `src/atlas/components/chat/ToolCallCard.tsx`
- `src/atlas/components/chat/tool/ToolDetailView.tsx`
- `src/atlas/components/chat/ReasoningBlock.tsx`
- `src/atlas/components/chat/SubagentExecutionCard.tsx`
- `src/atlas/components/chat/AgentDelegationLane.tsx`
- `src/atlas/components/chat/AssistantMessage.tsx`
- `src/atlas/components/chat/types.ts`

## Verification references

- `test/verify-agent-execution-trace-rendering.mjs`
- `test/verify-tool-execution-card-ux.mjs`
- `test/verify-reasoning-block-ux.mjs`
- `test/verify-agent-live-status-ux.mjs`
- `test/verify-live-ledger-merge.mjs`
- `test/verify-chat-reload-contract.mjs`
- `test/verify-streaming-layering.mjs`
- `test/verify-tool-event-ordering.mjs`
