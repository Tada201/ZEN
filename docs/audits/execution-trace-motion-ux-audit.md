# Execution-Trace Motion and UX Behavior Audit

**Date:** 2026-08-01  
**Scope:** ZEN chat execution trace, reasoning, delegation, subagent, and live-status surfaces  
**Blueprint:** `EXAMPLE_NO_EDITS/codex-gpt_Ui-replica`  
**Status:** Audit and first remediation slice shipped; deeper validation remains

## Audit conclusion

The execution trace is substantially calmer and more coherent than the pre-blueprint implementation. The shared summary rows, bounded previews, semantic status tokens, reduced-motion utilities, and progressive disclosure are good foundations.

The remaining discomfort risk is not excessive animation volume alone. It is **automatic motion that changes information density while the user is watching**. A trace should make active state obvious without taking content away, moving newly-arrived work through a waterfall, or replaying entrances because a live group gained another tool.

## Findings

> The observations below describe the **pre-remediation baseline** that motivated this audit. The decisions and validation status that follow record which behaviors have since shipped and which remain outstanding.

### P1 — Automatic collapse can remove content the user is reading

**Owners:**

- `src/atlas/components/chat/ReasoningBlock.tsx`
- `src/atlas/components/chat/AgentExecutionTrace.tsx`
- `src/atlas/components/chat/AgentDelegationLane.tsx`
- `src/atlas/components/chat/SubagentExecutionCard.tsx`

**Observed behavior (pre-remediation):**

- Reasoning scheduled `setExpanded(false)` one second after thinking stopped when the user had not toggled it.
- Grouped execution collapses when `running`/`awaiting_approval`/`error` transitions to `completed` unless the user has toggled the group.
- Delegation lanes collapse after an active/error lane becomes terminal unless the user toggled the lane.
- Subagent cards synchronize their open state with `shouldDefaultOpen`, which closes an untouched running/failed card when it becomes completed.

**Why this can feel invasive:**

The user may be reading the newly completed reasoning, result summary, error context, or child trace. The automatic close changes scroll position and removes the very detail that just became available. It is logically consistent with summary-first history, but surprising during a live transition.

**Decision — shipped:** Summary-first defaults remain for newly loaded completed history, while surfaces opened automatically during the current live run stay open until the user explicitly collapses them. The distinction remains ephemeral and does not alter persistence.

### P1 — Staggered tool-row entrances create a streaming waterfall

**Owner:** `src/atlas/components/chat/AgentExecutionTrace.tsx`

**Observed behavior (pre-remediation):**

Tool rows used `slide-in-from-top-2`, a 200ms entrance, and an index-based delay of up to 50ms per row while streaming.

**Why this can feel invasive:**

Parallel tools arrive close together but appear sequentially. The trace communicates artificial ordering and repeatedly shifts the visible content while the user is trying to scan status. This is especially noticeable in a narrow transcript or nested subagent rail.

**Decision — shipped:** Streaming stagger and directional tool-row entrances were replaced with a short opacity-only fade. Rows are never delayed by index during an active run.

### P1 — Live tool-group keys can replay the group entrance

**Owner:** `src/atlas/components/chat/AssistantMessage.tsx`

**Observed behavior (pre-remediation):**

The visible step key for a tool group included the joined child tool IDs. As new tool IDs were merged into a live group, the key changed. The wrapper carrying `animate-in fade-in slide-in-from-top-1` could therefore remount and replay its entrance.

**Why this can feel invasive:**

The user sees a previously visible group appear to enter again whenever another tool is attached. This is not a meaningful state transition and can create flicker or repeated vertical movement.

**Decision — shipped with explicit boundary:** Live groups use canonical batch/execution identity when available, with an immutable per-render fallback that survives late metadata and child reordering for identifiable groups. Changing child-ID lists are not used as React keys. Two separate groups with identical tool names and no upstream IDs are inherently indistinguishable; the UI cannot guarantee identity across their reordering until the backend supplies a batch/execution identity.

### P2 — Decorative shimmer on active action labels competes with status information

**Owner:** `src/atlas/components/chat/AssistantMessageTrace.tsx`

**Observed behavior (before this slice):**

Active action labels can use `text-premium-shimmer`, an infinite opacity animation defined in `src/styles/index.css`.

**Why this can feel invasive:**

An infinite shimmer draws more attention than the actual status icon and can read as promotional/decorative rather than operational. The execution contract calls for one restrained active indicator, not animated text.

**Decision — shipped:** Active action and research labels now use stable semantic colors. Motion is reserved for the adjacent motion-safe spinner or status indicator, so operational text does not shimmer.

### P1 — Two live “working” signals can compete for attention

**Owners:**

- `src/atlas/components/chat/AssistantMessage.tsx`
- `src/atlas/components/chat/assistantMessageParts.ts`
- `src/atlas/components/chat/ReasoningBlock.tsx`

**Observed behavior (pre-remediation):**

The compact breathing indicator could appear while `showPostToolWorking` also rendered a separate `Working on the response...` status row. Reasoning could also remain visibly active during the same turn.

**Why this can feel surprising:**

The user could receive multiple nearby status signals for one parent run. They may not know whether the agent is thinking, executing, or responding, and the repeated status rows could make the transcript feel busier than the underlying work.

**Decision — shipped:** Parent-level status now uses one selector with explicit precedence. Live reasoning and actionable execution groups own the announcement and suppress the compact parent label; a terminal tool group projects one `Responding...` state while response text is still streaming; provider/chat-status phases project at most one compact `Thinking...`, `Planning tools...`, or `Executing...` label. The former post-tool status row is no longer rendered separately. Detailed execution rows remain visible and retain approval/error semantics.

### P2 — The reasoning duration timer updates more often than the UI needs

**Owner:** `src/atlas/components/chat/ReasoningBlock.tsx`

**Observed behavior (pre-remediation):**

While thinking, an interval updated elapsed time every 100ms and triggered a React state update.

**Why this can feel uncomfortable:**

The displayed duration is rounded to seconds, so most of those updates do not change visible text. During long reasoning or multiple concurrent traces, the extra work can contribute to unnecessary rerenders and reduce the calmness of the surface.

**Decision — shipped:** Reasoning duration now updates at a one-second cadence aligned with displayed precision, and disclosure toggles do not restart the timer.

### P2 — Per-step entrance wrappers can replay motion during stream reconciliation

**Owner:** `src/atlas/components/chat/AssistantMessage.tsx`

**Observed behavior (pre-remediation):**

Each visible grouped step was wrapped in `animate-in fade-in slide-in-from-top-1`. If a streamed step was replaced or received a new identity during reconciliation, the wrapper could remount and replay its entrance even when no new user-visible event occurred.

**Why this can feel surprising:**

Previously visible reasoning or execution content can appear to enter again, which makes the timeline feel unstable and can distract from the actual state change.

**Decision — shipped for the representative trace:** Stable group identity and opacity-only wrappers prevent the targeted execution-group replay path. Broader executable reconciliation fixtures remain follow-up coverage.

### P2 — Breathing-indicator slide is unnecessary, but the indicator itself is useful

**Owner:** `src/atlas/components/chat/AssistantMessage.tsx`

**Observed behavior (pre-remediation):**

The compact `Thinking...` / `Planning tools...` / `Executing...` indicator entered with a fade plus `slide-in-from-top-1`.

**Why this can feel surprising:**

It is a top-level live status anchor, but the vertical slide duplicates movement already occurring in the trace below. The phase label is useful; the directional entrance is not.

**Decision — shipped for the compact phase indicator:** The directional slide was removed while the single polite status region and reduced-motion behavior were retained. Competing parent-level status cleanup remains a follow-up.

## Motion that is intentional and should remain

- A semantic spinner on an actively running tool or subagent communicates ongoing work.
- A small active dot/pulse in the reasoning or top-level status indicator communicates live state; it must remain `motion-safe` and stop at terminal state.
- A short opacity or height transition for an explicit disclosure communicates the result of the user's click.
- A single parent-level live phase indicator is useful when it does not duplicate a visible reasoning, tool, or post-tool status surface.
- Focus rings and hover transitions are feedback, not decoration.
- Skeleton pulse is acceptable while content has not arrived, provided it is motion-safe and not used after real content is present.

## User-flow rules for remediation

1. Initial completed history may be compact.
2. Active, approval, and failure states must remain visible.
3. A surface opened during the current run must not lose content solely because the run completed.
4. New parallel rows should appear without artificial ordering or index-based delay.
5. A live group must keep a stable React identity while its child records merge.
6. One top-level phase indicator is enough; detailed trace rows remain the source for specific work.
7. Motion communicates state, navigation, feedback, or disclosure—never novelty.
8. Reduced motion removes entrance/looping motion without removing status, focus, or content.

## Validation status

The first runtime remediation slice is shipped and source-verified:

- lifecycle labels and live status semantics;
- keyboard disclosure and narrow-layout behavior;
- reduced-motion classes on the primary trace primitives;
- delegation live-output bounding;
- summary-first and duplicate/orphan prevention paths;
- stable live group identity for canonical or otherwise identifiable groups;
- no index-based streaming stagger or directional tool-row entrance;
- live-open reasoning, grouped traces, delegation lanes, and subagent cards remain open on completion;
- one-second reasoning duration cadence;
- cancellable textarea resize scheduling in the extracted composer hook;
- production TypeScript/Vite build and diff validation;
- source-level long-trace performance contracts for coalesced scroll work, cheap active reasoning, bounded output, and memoized trace derivation.

Still outstanding for full audit closure:

- Tauri-window validation of scroll stability and focus behavior when a runtime harness is available;
- mounted lifecycle harness coverage for reasoning, grouped tools, delegation lanes, and subagent disclosures is now available through the dev-only `?zen-harness=execution-disclosure` route; it verifies lifecycle semantics and mounted subtree/DOM teardown, while private component effect cleanup remains covered by source contracts; parent-status mounted coverage remains separate;
- mounted/Tauri runtime measurement of long-trace typing latency, scroll stability, and rerender cost (source contracts now cover the reasoning timer cadence);
- a follow-up visual review of the next motion slice;
- an upstream batch/execution identity for duplicate ID-less groups if providers need reorder-stable disclosure state.

The shipped remediation is intentionally frontend-only. Backend event, permission, persistence, and message-ID contracts are unchanged.

This audit does not change backend event, permission, persistence, or message-ID contracts.
