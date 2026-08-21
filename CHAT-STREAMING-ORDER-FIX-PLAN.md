# Chat Streaming Order-Stability Fix — Plan & Tracker

> Delete this file once every item is checked and verified. Not committed.
> Created 2026-08-20. Source: two-agent review (web research + Zen code audit) — see
> memory `subagent-panel-display-gaps` sibling notes and `token-streaming-burst-rendering`.

## Problem (user-reported)
1. First content delayed, then a "first-token fill" burst.
2. A streamed text block visually splits — fragments render above *and* below a tool-call card.
3. Interleaving of text / tool card / subagent-delegation / reasoning is not hardened; order
   feels unstable during live streaming and can differ after reload.

## Root causes (file:line, from code audit)
- **R1 — No single canonical ordering.** Tool/action reducers append in browser arrival order
  (`src/atlas/hooks/stream/toolEventReducer.ts:147`, `agentActionLedger.ts:442`); a separate
  runtime path sequence-sorts only text/reasoning (`src/atlas/agentRuntime/types.ts:142-152`).
  Two independently-ordered sources merged with incomplete metadata → cross-category order races.
- **R2 — Index-based React keys for text/reasoning.** `getExecutionStepKey` returns
  `${step.type}-${index}` for text/reasoning (and identity-less action/subagent)
  (`src/atlas/components/chat/AssistantMessage.logic.ts:163-165`). Insert/reorder changes React
  identity → `MarkdownContent` remounts, reveal state rebinds to a different fragment → the
  "half char above/below the tool card" split.
- **R3 — Subagent steps drop the ordering field.** `chat:subagent-step` builds a `Step` with no
  `sequence` (`src/atlas/hooks/stream/useAgentEvents.ts:598-624`), though backend supplies it.
- **R4 — Finalization creates unsequenced tail text.** `reconcileFinalTextSteps` slices done
  content by text-step lengths and appends an anonymous tail step
  (`src/atlas/hooks/stream/chatChunkBuffer.ts:186-225`, used by `replaceTextStepsWithContent:252`).
- **R5 — Live vs reload divergence.** Persistence maps without sorting
  (`src/atlas/hooks/stream/projectStepsForPersistence.ts:342-376`); hydration replays that array
  (`src/atlas/components/chat/types.ts:575-584`); legacy fallback reconstructs a fixed
  reasoning→all-tools→text order (`types.ts:639-664`). No shared canonical projection.
- **R6 — Two stacked rAF reveal layers.** Runtime scheduler caps 180 chars/frame
  (`src/atlas/agentRuntime/runScheduler.ts:21-45`) then `SmoothMarkdown` does its own rAF reveal,
  also 180/frame (`src/atlas/components/chat/SmoothMarkdown.tsx:93-141`). Text paced twice →
  delay-then-burst.

## Backend already provides the ordering signal (consume it, don't re-derive)
- `event_sequence: AtomicU64` (`src-tauri/src/agent/runner/lifecycle.rs:44`),
  `next/peek_event_sequence()` (`:312-320`).
- Tool start/complete carry `sequence` (`src-tauri/src/agent/event_bus.rs:326-402`).
- Child commentary carries + sorts by sequence (`event_bus.rs:291-323`); runner tags iteration
  commentary via `peek_event_sequence` to sit before that iteration's tools (`loop.rs:342,1042`).
- Frontend types already have `Step.sequence`, `ActionMeta.sequence`, `ToolCall.sequence`
  (`src/atlas/components/chat/types.ts`), just not wired through uniformly.

## Reference pattern (EXAMPLE_NO_EDITS/palot-main — do not edit that folder)
- Canonical part model keyed by stable `part.id`: `buffer[messageID][part.id]`
  (`.../renderer/atoms/streaming.ts:16,107-150`); overlay replaces by id, adds only unseen
  (`.../derived/session-chat.ts:97-126`); UI walks ordered parts keyed by `part.id`
  (`.../components/chat/chat-turn.tsx:252-289,794-868`); single 50ms throttle.

---

## Task list (check off + verify each)

### Phase 1 — Stop the visible split & reorder (highest impact)
- [x] **T1. Stable keys for text/reasoning.** `getExecutionStepKey` now keys any
      step by its `eventId` when present (runtime `runtime:<partId>` or a locally
      minted `local:text|reasoning:<n>`), falling back to the index only for
      id-less legacy steps. Text/reasoning steps get their id at creation in
      `chatChunkBuffer.ts` (`applyDeltaSegment`, `reconcileFinalTextSteps`,
      `replaceTextStepsWithContent`); runtime parts already carried `runtime:`.
- [x] **T2. Preserve `sequence` on every Step at creation.** `chat:subagent-step`
      Steps now inherit the parent spawn tool-call's `sequence` so the delegation
      card sorts beside its launcher instead of on the MAX_SAFE_INTEGER tail
      (`useAgentEvents.ts`); `createActionStep` mirrors `metadata.sequence` onto
      `Step.sequence` (`agentActionLedger.ts`); tool + runtime text already carry it.

### Phase 1 verification (done)
- `tsc --noEmit` clean; `lint:tokens` 446 files clean.
- Full `npm test`: 126/160 pass, 34 fail — byte-identical set to the `d16e8fc`
  baseline (stash-and-rerun diff shows 0 new, 0 fixed). No regression.
- Extended `AssistantMessage.logic.test.ts` with a stable-key-by-id case.

### Phase 2 — One canonical ordering
- [x] **T3. Single ordering projection.** `orderSteps(steps)` added in
      `agentRuntime/types.ts` (stable sort on `sequence`, tie-broken by arrival
      index). Now the SSOT for all three paths that previously ordered
      independently: `mergeRuntimeTextPartsIntoSteps` (runtime merge), the render
      path (`AssistantMessage.tsx` orders before `groupAssistantSteps`), and
      `projectStepsForPersistence` (orders before compacting). Kills R1 + R5.
- [x] **T4. Append-to-open-text-part rule.** Backend now stamps `sequence` on
      every `chat:chunk`/`chat:chunk:first` (`peek_event_sequence` at emit —
      constant while a stream segment produces prose, higher after that
      iteration's tools). The runtime reducer synthesizes the part key from that
      sequence (`${type}@${sequence}`), so text resuming after a tool opens a NEW
      part instead of merging backward; `run-finish` no longer overwrites/collapses
      a multi-part turn. Message-content projection now concatenates all text
      parts in sequence (`useChatChunkEvent.ts`, `projectAgentTurnToMessage`).

### Phase 2 verification (done)
- `tsc --noEmit` clean; `cargo check` clean; `lint:tokens` 446 files clean.
- Full `npm test`: 126/160, 34 fail — identical set to `d16e8fc` baseline
  (0 new, 0 fixed). No regression.
- Extended `verify-message-order-contract.mjs` (shared `orderSteps` across
  render + persist + runtime; stable-id keys) and `verify-agent-runtime-reducer.mjs`
  (post-tool split, same-sequence contiguity, multi-part run-finish guard).

### Phase 3 — Finalization & pacing
- [x] **T5. Finalization reconciles the ledger, not anonymous tail text.** The
      `chat:done` tail text `reconcileFinalTextSteps` may add is now ONE stable
      part: fixed `eventId = "local:final-tail"` (re-running finalization updates
      the same row instead of appending a duplicate / remounting) with an explicit
      end `sequence` (`nextTailSequence`) so `orderSteps` places it after the tool
      timeline deterministically rather than via the array-index fallback. File:
      `chatChunkBuffer.ts`.
- [x] **T6. Collapse to one rAF reveal layer.** Instant mode in `SmoothMarkdown`
      now reveals the whole pending target in one frame (`perFrame = remaining`)
      instead of re-throttling at 180 chars/frame. The runtime scheduler
      (`runScheduler.revealAgentRun`, 180/frame) is the SOLE bounded reveal, so
      streamed text is paced once, not twice — removing the delay-then-burst
      stutter (R6). Suffix reconciliation, the reveal loop, and the `onComplete`
      drain are all preserved; typewriter mode is unchanged.

### Phase 3 verification (done)
- `tsc --noEmit` clean; `lint:tokens` 446 clean.
- Full `npm test`: 33 fail — one FEWER than the 34-fail `d16e8fc` baseline
  (`execution-trace-delegation-ux` now passes after the lane retirement + verifier
  updates), 0 new failures.
- `verify-stream-reveal-pacing`, `verify-agent-runtime-reducer`,
  `verify-stream-completion-and-abort` all green.

### Phase 4 — Verify
- [x] **T7. tsc / lint:tokens clean** (all phases).
- [x] **T8. npm test — no NEW failures vs baseline; verifiers extended**
      (message-order-contract, agent-runtime-reducer split cases).
- [ ] **T9. Manual/behavioral check** (requires the running Tauri app): interleaved
      `text → tool → text` keeps order live and after reload; no text fragment
      splits around a tool card; first token appears promptly without a burst.

## Bonus (done alongside, from the subagent re-review)
- Retired the legacy `AgentDelegationLane` from the parent timeline — it leaked up
  to 12K chars of child live output inline and carried a "Complete" vs "Done" label
  mismatch. Parent delegation now renders only through the canonical
  `SubagentExecutionCard`; the lane component remains only as the Agents-panel
  detail leaf + dev harness. `AssistantMessageTrace.tsx` no longer imports it.
- `SubagentExecutionCard`: added a persistent `sr-only aria-live` region so
  completed/failed transitions are announced (was running-only); added
  `duration-200 motion-reduce:transition-none` to the nested chevron.
- Fixed the stale "Child transcripts are dropped" comment in
  `projectStepsForPersistence.ts` (it does persist bounded/redacted resultContent
  + intermediateContent).

## Guardrails
- Frontend edits under `src/` must follow `docs/architecture/frontend-rules.md`; design tokens
  only; reduced motion via `html[data-motion="off"]`, never `prefers-reduced-motion`.
- Do NOT edit `EXAMPLE_NO_EDITS/`. Do NOT read/update `specs/`.
- No commits unless the user asks.

## Status
All code tasks (T1–T8) done and verified. Only T9 — the manual behavioral check
in the running Tauri app — remains; it needs a human at the app. This file can be
deleted once T9 is confirmed.
