# Thread Goals (`/goal`) and the Prompt Queue

Status: `partial` — core lifecycle, queueing, and continuation engine are
wired; token/time budgets for goals are not yet implemented.

## Prompt queue

Submitting while a turn is streaming **queues** the prompt instead of
aborting the run (Cursor/Codex-style). The queue is a client-side policy —
the backend stays strictly one-turn-at-a-time.

- **State**: `usePromptQueueStore` (`src/lib/stores/promptQueueStore.ts`), a
  per-chat FIFO of full send payloads (message, model, mode flags,
  attachments already converted to data URLs). Intentionally not persisted:
  a restart clears it rather than auto-sending stale prompts.
- **Enqueue**: `useSendHandler` when `isLoading` and a chat is active.
- **Drain**: `useChatTurnAdvance` (`src/atlas/hooks/chat/useChatTurnAdvance.ts`)
  listens for `chat:done`/`chat:error`. After a 250 ms grace period it
  replays the queue head through the normal send pipeline. Cancelled and
  errored turns never auto-drain — queued prompts stay visible and can be
  sent manually by clicking the pill.
- **UI**: `QueuedPromptsStrip` above the composer (per-item remove, click to
  send now). The footer's submit button always means "submit": send when
  idle, queue while streaming. Stop/Pause/Resume are separate footer chips.

## `/goal` command

A thread-scoped persistent objective modeled on Codex's Thread Goal.

- **Storage**: `thread_goals` table (one row per chat: objective, status,
  turns_count). SQL lives in `db/queries/goals.rs`.
- **Service**: `services/goal.rs` owns lifecycle rules and emits
  `goal:updated { chat_id, goal | null }` on every mutation. Statuses:
  `active | paused | complete | blocked`. Setting a new objective resets the
  run. Pause/resume/clear are user-only; complete/blocked are terminal.
- **Commands**: `get/set_thread_goal`, `update_thread_goal_status`,
  `clear_thread_goal` (`commands/goal.rs`), wrapped by `src/api/goalApi.ts`.
- **Slash surface**: `/goal <objective>`, `/goal pause|resume|clear`, `/goal`
  (view). Parsed client-side in `useSendHandler` via
  `chat/input/slashGoal.ts` — it executes immediately even mid-stream and
  never reaches the model. The backend `BUILTINS` list includes it for
  popover suggestions only.
- **Prompt injection**: `send_message` appends `goal_system_block` to the
  instructions of every turn while the goal is active, and exposes the
  `update_goal` agent tool (registered in `progressive.rs`, Low risk) so the
  model can mark the goal `complete` (evidence required) or `blocked`.
- **Continuation**: driven by `useChatTurnAdvance`. After a finished turn,
  if the queue is empty and a goal is active **and the finished turn used at
  least one tool** (no-spin guard via `tool:start` tracking in
  `useGoalStore`), it sends a `goal_continuation` turn through the normal
  pipeline. Guard rails:
  - continuation turns persist as user rows with `kind = goal_continuation`,
    rendered as a quiet marker row (`UserMessage`), identical after reload;
  - a turn with no tool calls suppresses the next continuation;
  - hard cap of 25 consecutive continuations, then the goal auto-pauses with
    a toast;
  - archiving a chat (single or bulk) pauses its goal server-side.
- **UI**: `GoalBanner` above the composer — objective, status chip, turn
  count, pause/resume/clear. `useGoalStore` mirrors `goal:updated` events and
  loads on session switch (via `useChat`).

## Ownership

| Concern | Owner |
|---|---|
| Goal lifecycle rules + events | `src-tauri/src/services/goal.rs` |
| Goal SQL | `src-tauri/crates/zen-db/src/queries/goals.rs` |
| Goal IPC | `src-tauri/src/commands/goal.rs` / `src/api/goalApi.ts` |
| Goal frontend mirror | `src/lib/stores/goalStore.ts` |
| Prompt queue state | `src/lib/stores/promptQueueStore.ts` |
| Post-turn decision (queue vs continuation) | `src/atlas/hooks/chat/useChatTurnAdvance.ts` |
