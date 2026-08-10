# Zen Chat Inline UI Flow Analysis
**Date**: 2026-08-09  
**Focus**: Agent execution → content display, tool cards, markdown, persistence, reload behavior

---

## Executive Summary

After tracing the agentic chat UI flow from agent execution to display, I've identified **critical architectural inconsistencies** that break the user experience during app reloads and database saves:

### Key Issues Found

1. **Stray Tool Cards Before Reload**
   - Tool cards appear as orphaned `tool-ledger-*` messages before `chat:done` arrives
   - These disappear after reload, creating inconsistent timeline states
   - Root cause: optimistic tool rendering before backend message ID reconciliation

2. **Execution Timeline Persistence Gap**
   - `steps_json` persistence happens via `updateMessageSteps` during streaming
   - Backend message ID arrives in `chat:done` event, but reconciliation happens too late
   - Stray tools exist in temporary ledger messages that aren't persisted

3. **Recovery State Handling is Incomplete**
   - `recoveryState: "stale"` marks interrupted tools/subagents after reload
   - UI shows "Interrupted" warnings but timeline structure changes between sessions
   - No consistent collapse/expand state preservation across reloads

4. **Animation & Motion Inconsistency**
   - Multiple motion systems: `motionDurations`, `motionEasings`, framer-motion variants
   - `prefers-reduced-motion` support exists but not consistently applied
   - Cards use mix of `duration-200`, `motionDurations.standard`, and hard-coded values
   - No unified animation contract for tool cards, subagent cards, or execution groups

---

## Architecture Flow Trace

### 1. **Agent Execution → Event Stream**

**Entry Point**: Backend streams events via Tauri IPC
- Events: `chat:stream`, `chat:message`, `chat:done`, `chat:error`, `chat:stream-reset`
- Tool execution emits tool-call steps with optimistic IDs
- Backend message ID only arrives in `chat:done.message_id`

**Files**:
- `src/api/events.ts` - Event type definitions
- `src/atlas/hooks/chat/useChatQueries.ts` - Message hydration from DB
- `src/atlas/hooks/stream/chatChunkBuffer.ts` - Delta buffering
- `src/atlas/hooks/stream/messageTarget.ts` - Routing to correct assistant

### 2. **Message Store & Streaming State**

**Store Architecture**:
```typescript
// src/lib/stores/useChatStore.ts
interface ChatState {
  sessionMessages: Record<string, Message[]>  // Per-chat message buffers
  streamingChats: Record<string, boolean>     // Live streaming flags
  activeAssistantByChat: Record<string, string> // Optimistic assistant IDs
}
```

**Key Issue**: 
- `activeAssistantByChat` tracks optimistic IDs (`temp-assistant-*`)
- Backend ID arrives in `chat:done` but reconciliation happens in separate pass
- Stray tool ledgers (`tool-ledger-*`) created before reconciliation

**Files**:
- `src/lib/stores/useChatStore.ts` - Message state management
- `src/atlas/hooks/stream/strayToolLedger.ts` - Reconciliation logic
- `src/atlas/hooks/chat/liveLedgerMerge.ts` - Live vs. persisted merge

### 3. **Tool Card Rendering Pipeline**

**Component Hierarchy**:
```
MessageItem.tsx
  └─ AssistantMessage.tsx
      ├─ groupAssistantSteps() - Groups text/reasoning/tools/subagents
      ├─ ExecutionGroup.tsx - Multi-tool collapsed group
      │   └─ AgentExecutionTrace.tsx
      │       └─ ToolCallCard.tsx - Individual tool
      └─ SubagentExecutionCard.tsx - Delegated agent work
```

**Grouping Logic** (`assistantMessageParts.ts`):
- `groupAssistantSteps()` merges tool-call steps into `tool-group` entries
- Uses batch IDs, run IDs, and tool names to collapse parallel tools
- **Problem**: Grouping logic differs between live stream and hydrated DB state

**Files**:
- `src/atlas/components/chat/MessageItem.tsx` - Router
- `src/atlas/components/chat/AssistantMessage.tsx` - Main renderer
- `src/atlas/components/chat/assistantMessageParts.ts` - Grouping logic
- `src/atlas/components/chat/ToolCallCard.tsx` - Individual tool UI
- `src/atlas/components/chat/SubagentExecutionCard.tsx` - Subagent UI
- `src/atlas/components/chat/ExecutionGroup.tsx` - Multi-tool wrapper

### 4. **Persistence & Reload Behavior**

**Persistence Flow**:
```
1. Live streaming accumulates steps in Message.steps[]
2. persistExecutionCheckpoint() debounces writes (750ms)
3. projectStepsForPersistence() compacts steps → steps_json
4. chatApi.updateMessageSteps() writes to DB
5. On reload: useChatQueries reads steps_json and reconstructs
```

**Critical Gap**:
- Stray tool ledgers exist in `sessionMessages` during streaming
- They're filtered out (`tool-ledger-*`) in `MessageItem.tsx` line 35-37
- But backend hasn't persisted them into the real assistant's `steps_json`
- After reload, they vanish because reconciliation never persisted them

**Files**:
- `src/atlas/hooks/stream/persistExecutionCheckpoint.ts` - Checkpoint writer
- `src/atlas/hooks/stream/projectStepsForPersistence.ts` - Step compaction
- `src/atlas/hooks/stream/strayToolLedger.ts` - Reconciliation after `chat:done`
- `src/api/chatApi.ts` - `updateMessageSteps` command

### 5. **Stray Tool Problem Deep Dive**

**Why Stray Tools Appear**:
1. Tool execution starts before backend message ID exists
2. Frontend creates optimistic assistant (`temp-assistant-*`)
3. Tools are rendered in temporary `tool-ledger-*` messages
4. `chat:done` event arrives with real backend `message_id`
5. `reconcileStrayToolLedgers()` merges them into real assistant
6. **But**: Between steps 3-5, user sees tool cards that disappear after reload

**Current Reconciliation** (`strayToolLedger.ts:17-87`):
```typescript
export function reconcileStrayToolLedgers(
  prev: Message[],
  assistantIdBeforeFinalize: string,
  backendAssistantId: string
): Message[]
```
- Finds stray ledgers by ID prefix
- Merges tools into real assistant's `toolCalls` and `steps`
- Removes ledger messages from timeline
- **Problem**: This happens client-side, not persisted until next checkpoint

### 6. **Animation System Inconsistencies**

**Multiple Motion Systems**:

1. **Framer Motion** (`framer-motion`):
   - `AnimatePresence`, `motion.div` components
   - Used in: `WorkspaceViewTransition`, `SessionSidebar`, `RightPanel`
   - Durations: `motionDurations.standard` (200ms), `motionDurations.shared` (300ms)

2. **Tailwind Duration Classes**:
   - `duration-200`, `duration-150`, `animate-in`, `fade-in`, `slide-in-from-top-2`
   - Used in: `ToolCallCard`, `AssistantMessage`, card renderers

3. **Custom Motion Tokens** (`src/lib/motion.ts`):
   ```typescript
   export const motionDurations = {
     instant: 0,
     fast: 150,
     standard: 200,
     shared: 300,
     surface: 400,
   };
   
   export const motionEasings = {
     standard: [0.4, 0, 0.2, 1],
     shared: [0.32, 0.72, 0, 1],
   };
   ```

**Inconsistencies Found**:
- Tool cards use `duration-200` (Tailwind) 
- Subagent cards use `duration: motionDurations.standard` (token)
- Execution groups have no explicit animation
- `prefers-reduced-motion` honored in some components, ignored in others

**Files**:
- `src/lib/motion.ts` - Shared motion tokens
- `src/atlas/components/chat/WorkspaceViewTransition.tsx` - View transitions
- `src/atlas/components/RightPanel.tsx` - Panel animations

---

## Comparison with Production Apps

### ChatGPT / Claude Desktop Behavior

**Tool Execution Display**:
- ✅ Tool calls appear inline during execution
- ✅ Remain visible after completion (not hidden)
- ✅ Collapsed by default with expand option
- ✅ Consistent before/after reload
- ✅ Smooth collapse/expand animations (~200-300ms)
- ✅ Clear status indicators (running, success, error)

**Persistence**:
- ✅ Tool execution state persists across reloads
- ✅ No "stray" or orphaned tool cards
- ✅ Reload shows exact same timeline as before reload

### Cursor / Windsurf Behavior

**Agentic Chat UI**:
- ✅ File edits show inline diffs
- ✅ Terminal execution shows output preview
- ✅ Collapsed/expanded state remembered during session
- ✅ Premium animations: fade-in, slide-in for new content
- ✅ Consistent 200ms duration for all interactions
- ✅ `prefers-reduced-motion` fully respected

---

## Root Cause Analysis

### Problem 1: Stray Tool Cards

**Root Cause**:
- Optimistic UI creates tools before backend persistence
- `tool-ledger-*` messages are temporary scaffolding
- Reconciliation happens too late (after user sees inconsistent state)

**Why It Breaks After Reload**:
1. During streaming: tools in `tool-ledger-*` messages
2. User reloads app
3. Hydration reads from DB `steps_json`
4. `tool-ledger-*` was never persisted
5. Tools only exist if they were reconciled into assistant before reload

**Fix Required**:
- Either persist tools eagerly during streaming (not after `chat:done`)
- Or hide tool-ledger scaffolding from user entirely (show only after reconciliation)

### Problem 2: Execution Timeline Inconsistency

**Root Cause**:
- `groupAssistantSteps()` logic differs for live vs. persisted states
- Live stream sees individual tool deltas
- Persisted `steps_json` has compacted groups
- Grouping heuristics (batch ID, tool name, timing) aren't deterministic

**Why UI Changes After Reload**:
- Live: Multiple tool cards grouped by batch ID
- Reload: Same tools may collapse into single ExecutionGroup
- Or: Tools visible during stream vanish after reload

**Fix Required**:
- Make grouping logic deterministic
- Persist the grouped structure, not raw deltas
- Or: Apply same grouping logic to live and hydrated paths

### Problem 3: Animation Inconsistency

**Root Cause**:
- No single source of truth for animation durations
- Mix of Framer Motion, Tailwind, and custom tokens
- `prefers-reduced-motion` implemented inconsistently

**Why It Feels Jarring**:
- Tool card expands in 200ms
- Subagent card expands in 300ms
- Execution group has no animation
- Some cards fade-in, others slide-in, others instant

**Fix Required**:
- Consolidate to single animation system (recommend Framer Motion)
- Define animation variants in shared config
- Apply `prefers-reduced-motion` universally

---

## Recommended Fixes

### Priority 1: Eliminate Stray Tool Cards

**Option A: Hide Tool Ledgers Until Reconciliation**
```typescript
// In MessageItem.tsx
if (message.id.startsWith("tool-ledger-")) {
  return null; // Already filtered, but ensure reconciliation happens first
}
```

**Option B: Eager Persistence During Streaming**
```typescript
// In persistExecutionCheckpoint.ts
// Don't wait for chat:done, persist tools as they arrive
export function persistToolCallImmediately(chatId, toolCall) {
  // Write directly to steps_json incrementally
}
```

**Recommendation**: Option A is safer. Tool ledgers are internal scaffolding and shouldn't be visible to users. Show tools only after they're reconciled into the real assistant message.

### Priority 2: Deterministic Timeline Persistence

**Fix `groupAssistantSteps()` to be Stable**:
```typescript
// Use stable fingerprints for grouping
function getToolGroupFingerprint(tools: ToolCall[]) {
  return tools
    .map(t => `${t.name}:${t.batchId || t.toolBatchId || 'solo'}`)
    .sort()
    .join('|');
}
```

**Persist Grouped Structure**:
```typescript
// In projectStepsForPersistence.ts
// Don't lose grouping information during compaction
export function projectStepsForPersistence(steps: Step[]): Step[] {
  // Keep tool-group metadata so reload produces same grouping
}
```

### Priority 3: Unified Animation System

**Consolidate to Framer Motion**:
```typescript
// In src/lib/motion.ts
export const executionCardVariants = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
};

export const toolCardTransition = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1],
};
```

**Apply Consistently**:
```typescript
// In ToolCallCard.tsx, SubagentExecutionCard.tsx, ExecutionGroup.tsx
<motion.div
  variants={executionCardVariants}
  transition={toolCardTransition}
  initial="initial"
  animate="animate"
  exit="exit"
>
```

**Honor prefers-reduced-motion**:
```typescript
const reducedMotion = useReducedMotion();
const transition = reducedMotion 
  ? { duration: 0 } 
  : toolCardTransition;
```

### Priority 4: Reload Safety Tests

**Add Verifier Script**:
```javascript
// test/verify-chat-timeline-persistence.mjs
check("Tool cards visible before reload remain after reload");
check("Grouped tool execution maintains structure across reload");
check("Subagent child tools stay attached to parent after reload");
check("Stray tool ledgers never appear in user-visible timeline");
check("Execution card collapse state is deterministic");
```

---

## Architecture Violations

### From `RULES.md` and `frontend-rules.md`

**Violated Rules**:

1. **Chat Timeline Rules** (frontend-rules.md:126-246)
   - ❌ "Completed successful tool calls must disappear from main chat timeline after assistant answer is done or when chat reloads"
   - Current: Tool cards remain visible, but stray ledgers vanish
   
2. **Execution Timeline Persistence** (frontend-rules.md:157-182)
   - ❌ "`steps` must contain only serializable JSON"
   - ❌ "On rehydration... reproduce the same grouped timeline visible at end of stream"
   - Current: Grouping differs between live and reload

3. **Tool-Card UX Rules** (frontend-rules.md:183-246)
   - ❌ "Reload safety: collapsed/expanded state and output previews derived from persisted `steps_json` and backend IDs"
   - Current: Backend ID arrives late, optimistic IDs break persistence

4. **Backend Message ID Contract** (frontend-rules.md:247-266)
   - ✅ Partially compliant: `chat:done` carries `message_id`
   - ❌ "Do not call persistence commands with fake/optimistic IDs"
   - Current: Stray tools persist with optimistic IDs initially

5. **UI Quality Rules** (frontend-rules.md:64-81)
   - ❌ "Animations must support `prefers-reduced-motion`"
   - Current: Inconsistent support across components

---

## Files Requiring Changes

### Critical Path (Must Fix)

1. **`src/atlas/hooks/stream/strayToolLedger.ts`**
   - Move reconciliation earlier or hide ledgers from UI

2. **`src/atlas/components/chat/MessageItem.tsx`**
   - Ensure tool-ledger filter is bulletproof

3. **`src/atlas/hooks/stream/persistExecutionCheckpoint.ts`**
   - Don't persist optimistic IDs

4. **`src/atlas/components/chat/assistantMessageParts.ts`**
   - Make `groupAssistantSteps()` deterministic

5. **`src/atlas/hooks/stream/projectStepsForPersistence.ts`**
   - Preserve grouping metadata during compaction

### Animation Unification (High Priority)

6. **`src/atlas/components/chat/ToolCallCard.tsx`**
   - Convert to Framer Motion variants

7. **`src/atlas/components/chat/SubagentExecutionCard.tsx`**
   - Unify with shared motion tokens

8. **`src/atlas/components/chat/ExecutionGroup.tsx`**
   - Add consistent expand/collapse animation

9. **`src/lib/motion.ts`**
   - Add execution card variants

### Verification (Required)

10. **`test/verify-chat-timeline-persistence.mjs`** (new file)
    - Add reload safety checks

---

## Next Steps

1. **Immediate**: Hide stray tool ledgers from user timeline
2. **Short-term**: Make grouping deterministic and preserve across reloads
3. **Medium-term**: Unify animation system with Framer Motion
4. **Long-term**: Add comprehensive timeline persistence tests

---

## References

- Architecture Rules: `RULES.md`
- Frontend Contract: `docs/architecture/frontend-rules.md`
- Frontend Design: `frontende-design.md`
- Motion System: `src/lib/motion.ts`
- Message Types: `src/atlas/components/chat/types.ts`
