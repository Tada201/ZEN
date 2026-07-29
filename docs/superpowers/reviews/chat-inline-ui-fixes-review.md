# Review: Chat Inline UI Flow Fixes

**Spec:** `docs/superpowers/specs/2026-07-24-chat-inline-ui-flow-analysis.md`  
**Review date:** 2026-07-25  
**Verdict:** NEEDS_FIXES

## Summary

The P0 stray-tool-call guard and the P1 reload/dedupe fixes are directionally correct and the targeted tests pass. TypeScript also passes. However, the P2 animation consistency work introduced a clear UI regression in `ToolCallCard` because it was dropped into `FoldOutCardTrigger` without accounting for that trigger's own chevron and child-wrapping layout. There are also smaller consistency gaps in the `activeAssistantByChat` sessionStorage cleanup and in the chat-status phase mapping. The broader `AssistantMessage.tsx` changes (fold-out PremiumCards, inline card interleaving, `ExecutionGroup`) are largely scope creep beyond the spec and need product/UX review before they ship.

## Verification Run

- `node_modules/.bin/tsc --noEmit` — **passed** (no output, exit 0).
- `npm run test:tool-event-reducer` — passed.
- `npm run test:history-replay-coalescing` — passed.
- `npm run test:live-ledger-merge` — passed.
- `npm run test:mock-agentic-ui-pipeline` — passed.
- `npm run test:agentic-trace-composition` — passed (ran as part of `test:agentic-ui`, which timed out before finishing the full chain).

No ESLint configuration is present in the repo, so lint was not run.

---

## Per-fix findings

### 1. `src/atlas/hooks/stream/toolEventReducer.ts` — P0 stray tool-call fix

**What changed:** `findTargetMessageIndex` now receives `chatId` and, when no `status === "sending"` assistant is found, falls back to `useChatStore.getState().getActiveAssistantForChat(chatId)`.

**Assessment:**
- Correctly narrows the race window described in the spec by matching `findWritableAssistantIndex` behavior.
- The orphan `tool-ledger-${incoming.id}` fallback at lines 98–117 is still produced when every heuristic fails. `MessageItem` now filters these out at render time, so the visible symptom is fixed, but the spec also asked to "prevent orphan tool-ledger messages" / "merge any pending tool-ledger-* messages into the final assistant message." That cleanup is missing; the reducer still creates ephemeral system messages that are lost on reload.
- Calling `useChatStore.getState()` inside a reducer function is pragmatically synchronous and safe, but it makes the reducer impure and harder to test in isolation. Document or extract into an explicit resolver if this pattern spreads.

**Line references:** lines 32, 56–65, 98–117.

**Recommended fix:** Keep the targeting improvement, but add a `chat:done` cleanup pass (or make the fallback create/attach to a synthetic assistant message) so `tool-ledger-*` rows are not left as orphaned system messages.

---

### 2. `src/atlas/components/chat/MessageItem.tsx` — P0 tool-ledger render guard

**What changed:** Early return `null` for any message whose `id` starts with `tool-ledger-`.

**Assessment:**
- Simple, effective band-aid for the stray card symptom.
- Risk is low because the synthetic IDs are scoped to this reducer.
- This is only a render-side guard; the underlying orphan creation should still be fixed (see #1).

**Line references:** lines 36–38.

---

### 3. `src/atlas/hooks/chat/chatTimelineReplay.ts` — P1 step duplication on reload

**What changed:** `flushPendingIntoMessage` now builds `assistantToolIds` from the assistant message's `toolCalls` and filters out pending `tool-call` steps whose ID already exists there. Also replaced `Date.now()` synthetic IDs with `getSyntheticTimelineId`.

**Assessment:**
- Correctly removes duplicate `tool-call` steps caused by DB `toolCalls` + action-message reconstruction.
- Note that `toolCalls` itself is still concatenated without deduplication (`toolCalls: [...toolCalls, ...(message.toolCalls || [])]`). Downstream `groupToolCalls` / `mergeGroupedToolCall` hide this, but the array can still contain the same ID twice with divergent status. Prefer deduping the concatenated `toolCalls` as well.
- `getSyntheticTimelineId` can return `timeline:${sessionId}:empty` when both `eventId` and tool id are missing. If multiple orphaned action groups land in the same session with no stable key, React key collisions are possible. Previously `Date.now()` guaranteed uniqueness. Consider adding an incrementing counter or timestamp fallback.

**Line references:** lines 85–89, 266–282.

**Recommended fix:** Dedupe the merged `toolCalls` array by ID in `flushPendingIntoMessage`; add a monotonic fallback in `getSyntheticTimelineId` to avoid `empty` collisions.

---

### 4. `src/lib/stores/useChatStore.ts` — P1 activeAssistantByChat sessionStorage persistence

**What changed:** Added `readActiveAssistantsFromSession` / `writeActiveAssistantsToSession`; initialized `activeAssistantByChat` from sessionStorage; writes on `setActiveAssistantForChat`.

**Assessment:**
- Addresses the spec goal of surviving a mid-stream page refresh.
- `setStreamingForChat` deletes `activeAssistantByChat[chatId]` when streaming stops but does **not** write the updated map to sessionStorage (lines 141–152). `clearSessionRuntime` has the same omission (lines 191–205). This leaves a stale assistant ID in sessionStorage after a stream ends. On reload, `findTargetMessageIndex` could route a late/stray event to the old assistant.
- `readActiveAssistantsFromSession` validates `typeof chatId === "string"`, but `Object.entries` keys are always strings; harmless but redundant.

**Line references:** lines 20–53, 141–152, 154–166, 191–205.

**Recommended fix:** Call `writeActiveAssistantsToSession(nextActiveAssistantByChat)` in both `setStreamingForChat` (when `!streaming`) and `clearSessionRuntime`.

---

### 5. `src/atlas/hooks/chat/useChatQueries.ts` — P1 incomplete message status mapping

**What changed:** `mapDbMessageToMessage` now maps incomplete rows with content or tool calls to `"sending"` instead of `"failed"`.

**Assessment:**
- Fixes the false "Operation Failed" red box after a refresh that lands before the backend marks `isComplete = 1`.
- The spec recommended guarding this with a staleness timeout ("30-second heartbeat"). No timeout is implemented, so a backend crash that leaves a row incomplete will now appear to be sending forever instead of eventually failing. This trades one failure mode for another.
- If the backend populates `metadata.error` but `isComplete !== 1`, the row becomes `status: "sending"` and the inline error block in `AssistantMessage` (which only renders for `status === "failed"`) will not show. Real errors may be suppressed.

**Line references:** lines 151–157, 172–181.

**Recommended fix:** Either add a staleness timeout (e.g., createdAt older than N seconds with no recent chunk) or keep `status: "failed"` when `parsedMetadata.error` is present, even if the row has content.

---

### 6. `src/atlas/components/chat/AgentExecutionTrace.tsx` — P2 tool entrance animation, stagger, status crossfade

**What changed:** Replaced custom expand markup with `FoldOutCard`; added per-tool `animate-in fade-in slide-in-from-top-2 duration-300` with `animationDelay: idx * 50ms`; added `transition-colors duration-300` to the status dot; added `isStreaming` prop.

**Assessment:**
- Consistent expand/collapse primitive is the right move.
- Staggered entrance is well-implemented and keys are stable enough (`tc.id || tc.runId || idx`).
- The status-dot crossfade is present.
- `isStreaming` is accepted but only used to gate stagger delay. Consider whether `preferCompact` should still default-open for active/error groups; the existing `useEffect` at lines 155–158 still auto-opens on `trace.active || trace.errorCount > 0`, which is correct.
- Minor: indentation inside `FoldOutCardContent` is inconsistent.

**Line references:** lines 110–120, 168–209, 231–239.

---

### 7. `src/atlas/components/chat/ToolCallCard.tsx` — P2 status icon crossfade

**What changed:** Replaced `<div>` + `<button>` expand with `FoldOutCard`; added `transition-colors duration-300` to the status icon.

**Assessment:** This change has a **blocking UI regression**.

`FoldOutCardTrigger` (`src/components/ui/fold-out-card.tsx`) already renders its own `<ChevronRight>` and then wraps all children in:

```tsx
<span className="truncate flex-1 font-mono tracking-tight">{children}</span>
```

`ToolCallCard` passes its own header children (status icon, action text, summary, duration, and another `<ChevronRight>`) into `FoldOutCardTrigger`. The result is:
1. **Duplicate chevron:** the trigger's chevron plus the card's chevron both render.
2. **Broken header layout:** the entire header is forced into a single truncated monospaced span, so the status icon, duration, and secondary summary line lose their flex layout and are all subject to the same `truncate` behavior.
3. **Font styling drift:** the header text becomes `font-mono tracking-tight`, which does not match the previous sans-serif card header.

**Line references:** lines 8, 164–184.

**Recommended fix:** Do not pass the internal chevron or layout spans into `FoldOutCardTrigger`. Pass only a single text summary node, and move the status icon / duration / sub-label outside the trigger if they must remain visible. Alternatively, wrap the existing header markup in a plain `<button>` and drive `open` state manually, or extend `FoldOutCardTrigger` to accept a non-wrapped `children` variant.

---

### 8. `src/atlas/components/chat/AssistantMessage.tsx` — P2 phase badges, breathing indicator, spinner animation

**What changed:** Added `VISIBLE_CHAT_STATUS_PHASES`, `getBreathingPhaseLabel`, `latestVisibleChatStatusStep` hook, breathing indicator UI, inline card interleaving via `splitOnCardTokens`, fold-out wrappers for selected PremiumCard types, and switched tool groups from `AgentExecutionTrace` to `ExecutionGroup`.

**Assessment:**
- The breathing indicator itself is well implemented: `aria-live="polite"`, `role="status"`, respects `motion-safe`, and maps phases to friendly labels.
- **Phase duplication:** `isVisibleChatActionStep` returns `true` for visible `chat_status` steps, so they still render as full timeline rows via `AgentActionStep` while also driving the breathing indicator. The spec asked to "render them as compact inline badges rather than full timeline rows." The current implementation shows both, which is more verbose than intended.
- **Missing phase:** `CHAT_STATUS_PHASES.ToolExecuting` is not in `VISIBLE_CHAT_STATUS_PHASES`. If the backend emits it, `getBreathingPhaseLabel` falls through to "Responding..." while the agent is actually executing tools.
- **Dependency array:** `visibleGroupedSteps` useMemo depends only on `groupedSteps` (line 378), but `shouldShowToolGroupInTimeline` reads `message.status === "sending"` and `hasAssistantAnswerText`. Because `groupedSteps` is recomputed on every `message` change, this is usually safe, but the dependency array is incomplete and would fail `eslint-plugin-react-hooks`.
- `void AgentExecutionTrace;` (line 32) prevents the unused-import error but is a code smell. Either use the component or remove the import; the comment about "keeping the dependency chain" is not a strong reason.

**Line references:** lines 28–32, 46–91, 253–304, 372–378, 403–422, 468–492, 526–535.

---

### 9. `src/atlas/components/chat/AssistantMessageTrace.tsx` — P2 exported getActionPresentation

**What changed:** `getActionPresentation` is now exported.

**Assessment:** Clean, minimal, and correct. No concerns.

**Line references:** line 43.

---

### 10. `src/styles/index.css` — P2 reduced-motion media query for tool-expand-grid

**What changed:** Moved the `tool-expand-grid` transition inside `@media (prefers-reduced-motion: no-preference)`.

**Assessment:** Good accessibility improvement. Note that `tool-expand-grid` is no longer used by the components that were migrated to `FoldOutCard`, so this primarily benefits legacy/other consumers.

**Line references:** lines 178–193.

---

## Unintended scope-creep findings

Several changes in `AssistantMessage.tsx` go beyond the listed fixes and should be reviewed separately:

### A. Fold-out PremiumCard wrappers

`RenderPremiumCard` (lines 306–346) wraps a hard-coded allow-list of card types in `FoldOutCard`. This is not in the spec and changes how generative UI cards are displayed. Risks:
- Cards not in `FOLDABLE_CARD_TYPES` still render fully inline, creating an inconsistent transcript.
- `getFoldOutSummary` has custom logic per card type; if a card payload uses different keys, the collapsed header will be unhelpful.
- The summary is forced into the trigger's `font-mono tracking-tight` style, which may not suit all card types.

**Recommendation:** Keep behind a feature flag or move to a separate PR with design QA. Do not block the P0/P1 fixes on this.

### B. Inline card interleaving

`renderTextStepWithInlineCards` (lines 253–304) uses `splitOnCardTokens` to place cards at the exact position of `%%CARD_N%%` markers. This is a new feature, not a bug fix. Risks:
- If `orderedCards` and `cards` get out of sync (e.g., a persisted message with cards but no orderedCards), the legacy fallback stacks all cards above prose, which is fine.
- Every text step now runs `parseCardTags` via `groupAssistantSteps` and then re-splits in render. The work is memoized at the step level, but with many cards it is non-trivial.

**Recommendation:** Acceptable to keep if tests cover it, but it should have been its own task.

### C. ExecutionGroup usage

Tool groups now render via `ExecutionGroup` (lines 526–535) instead of `AgentExecutionTrace` directly. `ExecutionGroup` adds its own summary header ("3 actions / Working") and then nests `AgentExecutionTrace` (which has its own header, "Running 3 tools") inside. This creates:
- Two nested expandable headers for the same tool batch.
- An extra click to reach tool details.
- Potential state conflicts between the two `FoldOutCard` instances.

The spec said "Replace all inline expand/collapse implementations with FoldOutCard," not "add a grouping wrapper." This change is the most likely to confuse users and should be reverted or redesigned.

**Recommendation:** Revert to `<AgentExecutionTrace ... preferCompact />` for this PR. If a grouped header is desired, design it so that `ExecutionGroup` replaces `AgentExecutionTrace`'s header entirely rather than wrapping it.

---

## Recommended next steps

1. **Fix `ToolCallCard` header before merging.** Either stop passing internal layout children to `FoldOutCardTrigger` or use a custom trigger wrapper. This is the only blocking issue.
2. **Synchronize sessionStorage cleanup.** Add `writeActiveAssistantsToSession` calls in `setStreamingForChat` (when stopping) and `clearSessionRuntime`.
3. **Address suppressed errors in status mapping.** Keep `status: "failed"` when `parsedMetadata.error` is present, or implement the spec's staleness heartbeat so incomplete rows eventually fail.
4. **Reconcile chat-status phase visibility.** Either hide `chat_status` timeline rows when they are in `VISIBLE_CHAT_STATUS_PHASES`, or remove the duplicate breathing indicator. Add `ToolExecuting` to the visible set.
5. **Revert or gate scope creep.** Move fold-out PremiumCards and `ExecutionGroup` usage out of this PR, or put them behind explicit UX review and additional tests.
6. **Add/adjust tests.** Add a rendering test that asserts `ToolCallCard` renders exactly one chevron and preserves its flex header layout. Add tests for sessionStorage cleanup and for the status mapping edge cases above.

After these items, the PR can be re-reviewed and should be approvable.
