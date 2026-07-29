# Execution Timeline Persistence

**Status:** Accepted

**Date:** 2026-07-25

## Context

Assistant messages in Zen render a live execution timeline (`steps`) that includes text chunks, tool calls, reasoning blocks, subagent lanes, and other transient UI state. Before this ADR, that timeline existed only in memory. After an app reload, the timeline was reconstructed from legacy `toolInvocations` / `toolCalls`, which frequently produced stray or missing tool cards and a different visual state than during the live stream.

This ADR describes the persistence flow that keeps the timeline identical before and after reload.

## Decision

When a chat stream completes, the frontend serializes the final assistant-message `steps` to JSON and persists them in the `messages.steps_json` column via a dedicated Tauri command. On reload, `normalizeVercelMessage` rehydrates `steps` from `stepsJson` before falling back to legacy reconstruction.

## Flow

```text
Backend Runner
     |
     v
chat:done ------------------> Frontend useChatChunkEvent
{ chat_id, message_id }             |
                                    v
                         chatApi.updateMessageSteps
                                    |
                                    v
                         Backend update_message_steps
                         validate JSON (reject malformed) + size cap
                                    |
                                    v
                         queries::update_message_steps
                         UPDATE messages SET steps_json = ? ...
                                    |
                                    v
                         Reload / listMessages
                                    |
                                    v
                         normalizeVercelMessage(msg)
                         msg.steps = JSON.parse(msg.stepsJson)
```

## Key Code Snippets

### 1. Backend emits `chat:done` with the persisted message ID

`src-tauri/src/agent/runner/loop.rs`

```rust
self.emit(AgentEvent::ChatDone(ChatDonePayload {
    chat_id: chat_id.clone(),
    content: Some(final_content),
    tokens_in: total_tokens_in,
    tokens_out: total_tokens_out,
    reason: "complete".to_string(),
    done: true,
    message_id: assistant_message_id.clone(), // backend row ID
})); // variable names are illustrative
```

### 2. Frontend handler serializes and persists `steps`

`src/atlas/hooks/stream/useChatChunkEvent.ts`

```ts
const unlistenDone = await listenAppEvent("chat:done", (event) => {
  // ... flush chunks and finalize the in-memory message ...

  const finalAssistantId = event.payload.message_id || assistantIdBeforeFinalize;
  if (finalAssistantId) {
    const assistant = useChatStore.getState().sessionMessages[chatId]
      ?.find((m) => m.id === finalAssistantId);

    if (assistant?.steps && assistant.steps.length > 0) {
      chatApi.updateMessageSteps(
        chatId,
        finalAssistantId,
        JSON.stringify(assistant.steps)
      ).catch((err) => {
        console.error("[chat:done] Failed to persist message steps:", err);
      });
    }
  }

  // ... stop streaming ...
});
```

### 3. Typed API wrapper invokes the Tauri command

`src/api/chatApi.ts`

```ts
export const chatApi = {
  // ...
  updateMessageSteps: (chatId: string, messageId: string, stepsJson: string) =>
    callCommand<void>("update_message_steps", { chatId, messageId, stepsJson }),
};
```

### 4. Backend command validates and persists the payload

`src-tauri/src/commands/chat/crud.rs`

```rust
#[tauri::command]
pub async fn update_message_steps(
    state: State<'_, AppState>,
    chat_id: String,
    message_id: String,
    steps_json: String,
) -> ZenResult<()> {
    validate_steps_json(&steps_json)?;

    let db = state.db().await?;
    queries::update_message_steps(&db, &chat_id, &message_id, &steps_json).await?;
    Ok(())
}
```

### 5. Query layer stores `steps_json` only for assistant rows

`src-tauri/src/db/queries/message.rs`

```rust
pub async fn update_message_steps(
    pool: &SqlitePool,
    chat_id: &str,
    message_id: &str,
    steps_json: &str,
) -> ZenResult<()> {
    let result = sqlx::query(
        "UPDATE messages SET steps_json = ? WHERE id = ? AND chat_id = ? AND role = 'assistant'"
    )
    .bind(steps_json)
    .bind(message_id)
    .bind(chat_id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(crate::error::ZenError::Custom(
            UPDATE_MESSAGE_STEPS_NOT_FOUND.to_string(),
        ));
    }

    Ok(())
}
```

### 6. Rehydration reads `stepsJson` on load

`src/atlas/components/chat/types.ts`

```ts
export function normalizeVercelMessage(msg: unknown): Message {
  // ...

  let normalizedSteps: Step[] | undefined;
  if (typeof msg.stepsJson === "string" && msg.stepsJson.trim()) {
    try {
      const parsed = JSON.parse(msg.stepsJson) as unknown;
      if (Array.isArray(parsed)) {
        normalizedSteps = parsed.map((step) =>
          role === "assistant" && step?.type === "text"
            ? { ...step, content: stripToolProtocolText(step.content || "") }
            : step
        ) as Step[];
      }
    } catch {
      // Fall through to legacy reconstruction if the JSON is corrupt.
    }
  }

  if (!normalizedSteps) {
    // Legacy reconstruction from in-memory steps when steps_json is absent.
    normalizedSteps = Array.isArray(msg.steps)
      ? (msg.steps as Step[]).map((step) => step)
      : undefined;
  }

  // ...
}
```

## Validation and Guardrails

* `steps_json` must be valid JSON.
* `steps_json` is capped at 2 MB to prevent a single row from growing unbounded.
* Only rows with `role = 'assistant'` are updated.
* The `UPDATE` is scoped to the exact `chat_id` + `message_id` pair to prevent cross-chat overwrites.
* `chat:done` carries the backend `message_id`; the frontend uses it rather than the optimistic in-memory ID.

## Consequences

* Reloading the app reproduces the exact same grouped tool-call / action timeline that was visible at the end of the stream.
* Legacy reconstruction from `toolInvocations` / `toolCalls` remains as a fallback for older messages.
* Branches that cannot emit a real backend `message_id` (deep research, orchestrator) currently do not persist their timeline. They should be updated to emit the persisted ID before calling `updateMessageSteps`.
* `steps` must contain only serializable JSON; storing non-serializable data will break reload.
