# Chat Session Architecture Improvements — Implementation Plan

## Overview

Improve Zen's chat session architecture across 5 phases, from quick bug fixes to advanced memory systems. All changes are local-first (SQLite + LanceDB), no cloud dependencies.

---

## Phase 0: Quick Wins (1-2 hours)

### 0.1 Fix Orchestrator Routing Heuristic

**File:** `src-tauri/src/commands/chat.rs:229`

**Current:**
```rust
let use_orchestrator = web_search.unwrap_or(false) || content.len() > 500;
```

**Problem:** 500 chars is too low — pasted code, error logs, or detailed questions all trigger the heavy multi-agent Orchestrator unnecessarily.

**Fix:**
```rust
let use_orchestrator = web_search.unwrap_or(false)
    || (content.len() > 3000 && has_complexity_markers(&content));

fn has_complexity_markers(content: &str) -> bool {
    let code_blocks = content.matches("```").count();
    let questions = content.matches('?').count();
    let newlines = content.matches('\n').count();
    (code_blocks >= 2) || (questions >= 3 && newlines > 10)
}
```

**Impact:** Simple chat goes through fast Runner path; only truly complex requests use Orchestrator.

---

### 0.2 Wire Up `chat:message` Listener

**File:** `src/atlas/hooks/useGlobalStreamListener.ts:304-314`

**Current:**
```typescript
unlistenHandlers.push(
  await listen("chat:message", (event: any) => {
    // Placeholder — does nothing
    return prev;
  })
);
```

**Problem:** Structured message events (approval requests, agent handoffs, agent spawns) arrive from backend but are never rendered in the UI.

**Fix:** Parse the event payload and insert appropriate message types into the Zustand store:

```typescript
await listen("chat:message", (event: any) => {
  const payload = event.payload as ChatMessageEvent;
  const { chat_id, message } = payload;

  if (chat_id !== activeSessionId) return;

  const newMessage: Message = {
    id: message.id,
    sessionId: chat_id,
    role: message.role,
    content: message.content,
    kind: message.kind, // "approval_request" | "agent_handoff" | "agent_spawn"
    status: "sent",
    createdAt: message.created_at,
    metadata: message.metadata,
  };

  setSessionMessages(chat_id, (prev) => [...prev, newMessage]);
});
```

**Also needed:** Add UI rendering for `kind: "approval_request"` messages in the chat message component (tool approval buttons).

---

### 0.3 Remove Default Tool Injection for Simple Chat

**File:** `src-tauri/src/commands/chat.rs:179`

**Current:**
```rust
if tool_ids.is_empty() {
    tool_ids.push("read_file".to_string());
    tool_ids.push("list_dir".to_string());
    tool_ids.push("run_command".to_string());
}
```

**Problem:** Every chat gets file/command tools injected, bloating the system prompt and confusing models that don't need them.

**Fix:** Only inject tools when the active model supports tool calling AND the user has enabled tool use for this session. Add a `tools_enabled` flag to the settings.

---

## Phase 1: Hierarchical Memory System (4-6 hours)

### 1.1 Add LLM-Based Summarization to Runner

**Files:** `src-tauri/src/agent/runner.rs`, `src-tauri/src/llm/mod.rs`

**Architecture:**

```
┌─────────────────────────────────────────────────┐
│  Conversation Context (sent to LLM)             │
├─────────────────────────────────────────────────┤
│  [System Prompt]                                │
│  [Summary of old conversation]  ← NEW           │
│  [Recent messages verbatim]     ← existing      │
│  [Tool results (truncated)]     ← existing      │
└─────────────────────────────────────────────────┘
```

**Implementation:**

1. **Add `summarize_messages()` to `Runner`:**
   ```rust
   async fn summarize_messages(
       &self,
       messages: &[ChatMessage],
       provider: &dyn LlmProvider,
   ) -> Result<String> {
       // Use a lightweight model for summarization (configurable)
       // Send messages as: "Summarize this conversation in 3-4 sentences..."
       // Return compact summary string
   }
   ```

2. **Modify compaction trigger** — instead of truncating/removing, summarize:
   - When messages > 30 OR tokens > 40K:
     - Take oldest N messages (leaving last 10 verbatim)
     - Call `summarize_messages()` with a cheap model (e.g., `llama3.2:1b` or `nomic-embed-text` if available)
     - Replace old messages with a single `role: "system", content: "[Previous conversation summary: ...]"` message
     - Persist summary to DB in `messages` table with `kind: "summary"`

3. **Add `summarization_model` to `RunConfig`:**
   ```rust
   pub struct RunConfig {
       // ... existing fields
       pub summarization_model: Option<String>, // e.g. "llama3.2:1b"
       pub summarization_token_budget: usize,    // default: 2000
   }
   ```

4. **Persist summaries to DB** — add a `conversation_summaries` table:
   ```sql
   CREATE TABLE conversation_summaries (
       id TEXT PRIMARY KEY,
       chat_id TEXT NOT NULL,
       summary TEXT NOT NULL,
       message_count INTEGER,
       token_count INTEGER,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
   );
   ```

**Key design decisions:**
- Summarization runs async in the background after the LLM response completes (doesn't block the user)
- Uses a separate, cheap model to avoid cost/latency impact
- Summary is prepended to context on next turn
- Old messages that were summarized are marked `is_compacted: true` in DB (not deleted, for audit)

---

### 1.2 Add Summary + Buffer Memory Pattern

**File:** `src-tauri/src/agent/runner.rs`

**Replace the current binary compaction with a 3-tier approach:**

| Tier | Content | Token Budget |
|------|---------|-------------|
| **Hot** | Last 10 messages verbatim | ~8K tokens |
| **Warm** | Summary of previous 20-30 messages | ~2K tokens |
| **Cold** | Summaries of older sessions (from `conversation_summaries`) | ~1K tokens |

**Context assembly becomes:**
```rust
let mut full_context = vec![system_message];

// Cold: previous session summaries (if any)
if let Some(prev_summaries) = get_previous_summaries(chat_id).await? {
    full_context.extend(prev_summaries);
}

// Warm: current session summary (if compacted)
if let Some(summary) = get_current_summary(chat_id).await? {
    full_context.push(summary);
}

// Hot: recent verbatim messages
full_context.extend(recent_messages);
```

---

## Phase 2: Semantic Memory Recall via LanceDB (6-8 hours)

### 2.1 Create Conversation Vector Store

**Files:** `src-tauri/src/rag/conversation_store.rs` (new), `src-tauri/src/lib.rs`

**Current state:** LanceDB exists but is only used for document RAG. We'll add a second collection for conversations.

**New collection schema:**
```rust
// conversation_vectors table in LanceDB
struct ConversationVector {
    id: String,           // UUID
    chat_id: String,      // parent session
    message_id: String,   // specific message
    vector: [f32; 768],   // embedding of message content
    text: String,         // original message text (first 2000 chars)
    role: String,         // "user" | "assistant"
    timestamp: i64,       // unix epoch
    metadata: String,     // JSON: {model, tokens, tool_calls}
}
```

**Initialization in `lib.rs`:**
```rust
let conversation_db = lancedb::connect(app_dir.join("lancedb/"))
    .execute()
    .await?;
let conv_table = conversation_db
    .create_table("conversation_vectors", schema)
    .execute()
    .await?;
state.conversation_store = Arc::new(ConversationStore::new(conv_table));
```

---

### 2.2 Embed Messages on Completion

**File:** `src-tauri/src/agent/runner.rs` (in `chat:done` handler)

When a message completes (`is_complete=true`):
1. Extract user messages and significant assistant responses (>100 chars)
2. Generate embeddings via `provider.embed()` (Ollama `nomic-embed-text`)
3. Store in LanceDB `conversation_vectors` collection
4. If embedding fails, silently skip (non-critical)

```rust
// After message is saved to DB
if let Some(store) = &state.conversation_store {
    if let Some(embedder) = &state.embedding_model {
        let user_messages: Vec<_> = saved_messages
            .iter()
            .filter(|m| m.role == "user" && m.content.len() > 50)
            .collect();

        for msg in user_messages {
            if let Ok(vector) = embedder.encode(&msg.content).await {
                store.add(ConversationVector {
                    id: Uuid::new_v4().to_string(),
                    chat_id: chat_id.clone(),
                    message_id: msg.id.clone(),
                    vector,
                    text: msg.content.chars().take(2000).collect(),
                    role: msg.role.clone(),
                    timestamp: msg.created_at.timestamp(),
                    metadata: serde_json::to_string(&msg.metadata).unwrap_or_default(),
                }).await.ok();
            }
        }
    }
}
```

---

### 2.3 Semantic Recall During Context Assembly

**File:** `src-tauri/src/agent/runner.rs` (in `run()` before context assembly)

Before building `full_context`, query LanceDB for relevant past messages:

```rust
// Semantic memory recall
let mut recalled_context = String::new();
if let Some(store) = &state.conversation_store {
    // Use the latest user message as query
    let query_text = &conversation
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.clone())
        .unwrap_or_default();

    if let Some(embedder) = &state.embedding_model {
        if let Ok(query_vector) = embedder.encode(query_text).await {
            let results = store.search(&query_vector, 5).await.ok();

            if let Some(results) = results {
                if !results.is_empty() {
                    recalled_context = format!(
                        "[Relevant Past Conversations]\n{}\n",
                        results.iter()
                            .map(|r| format!("- {}", r.text.chars().take(200).collect::<String>()))
                            .collect::<Vec<_>>()
                            .join("\n")
                    );
                }
            }
        }
    }
}

// Inject into system prompt
let system_content = format!(
    "{}\n\n{}",
    base_system_prompt,
    recalled_context
);
```

**Token budget for recalled context:** Max 1500 tokens (~5 results × 300 chars each). This is appended to the system prompt, not the conversation history.

---

### 2.4 Add Tauri Commands for Memory Management

**File:** `src-tauri/src/commands/memory.rs` (new)

```rust
#[tauri::command]
async fn get_conversation_memories(
    state: State<'_, AppState>,
    chat_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<MemoryResult>> {
    // Search LanceDB for relevant past conversations
}

#[tauri::command]
async fn clear_conversation_memories(
    state: State<'_, AppState>,
    chat_id: String,
) -> Result<()> {
    // Delete all vectors for a given chat
}

#[tauri::command]
async fn get_memory_stats(
    state: State<'_, AppState>,
) -> Result<MemoryStats> {
    // Return: total vectors, vectors per chat, storage size
}
```

Register in `lib.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    get_conversation_memories,
    clear_conversation_memories,
    get_memory_stats,
])
```

---

## Phase 3: Streaming Resilience (3-4 hours)

### 3.1 Add Chunk Buffer with Retry

**File:** `src-tauri/src/agent/runner.rs` (`call_llm_with_callback`)

**Current:** If the SSE stream drops mid-chunk, the partial content is lost.

**Fix:** Implement a rolling buffer that saves partial content every N seconds:

```rust
// In the streaming loop
let mut last_saved_content = String::new();
let mut save_interval = tokio::time::interval(Duration::from_millis(500));

loop {
    tokio::select! {
        Some(chunk) = stream.next() => {
            // ... existing chunk processing
            current_content.push_str(&delta);

            // Periodic checkpoint save
            if save_interval.tick().await && current_content != last_saved_content {
                // Update DB with partial content (is_complete=false)
                queries::update_message_partial(
                    &state.db,
                    &chat_id,
                    &assistant_message_id,
                    &current_content,
                    estimated_tokens,
                ).await.ok();
                last_saved_content = current_content.clone();
            }
        }
        _ = token.cancelled() => {
            // Save whatever we have
            queries::complete_message(..., &current_content, ..., is_complete: false).await;
            break;
        }
        else => break,
    }
}
```

### 3.2 Add `update_message_partial` Query

**File:** `src-tauri/src/db/queries.rs`

```rust
pub async fn update_message_partial(
    pool: &SqlitePool,
    chat_id: &str,
    message_id: &str,
    content: &str,
    tokens_out: usize,
) -> Result<()> {
    sqlx::query!(
        r#"UPDATE messages SET content = ?, tokens_out = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND chat_id = ?"#,
        content,
        tokens_out as i64,
        message_id,
        chat_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}
```

### 3.3 Frontend Stream Recovery

**File:** `src/atlas/hooks/useGlobalStreamListener.ts`

Add a heartbeat mechanism: if no `chat:chunk` event arrives for 10 seconds during streaming, mark the stream as potentially failed and show a "Connection interrupted" indicator with a retry button.

---

## Phase 4: Context Drift Detection (2-3 hours)

### 4.1 Add Drift Detection to Runner

**File:** `src-tauri/src/agent/runner.rs`

Track the topic of the first user message and compare with recent messages using embedding cosine similarity:

```rust
pub struct ContextTracker {
    initial_topic_vector: Option<Vec<f32>>,
    recent_vectors: Vec<Vec<f32>>,
    drift_threshold: f32, // default: 0.3
}

impl ContextTracker {
    pub fn check_drift(&self, current_vector: &[f32]) -> f32 {
        if let Some(initial) = &self.initial_topic_vector {
            cosine_similarity(initial, current_vector)
        } else {
            1.0
        }
    }
}
```

When drift score drops below threshold, emit a `chat:context-drift` event to the frontend, which can show a subtle indicator: "Conversation topic has shifted significantly. Consider starting a new session."

---

## Phase 5: Settings UI Integration (2-3 hours)

### 5.1 Add Memory Settings Tab

**File:** `src/components/settings/Tabs/intelligence/MemorySettings.tsx` (new)

Controls:
- [ ] Enable conversation summarization
- [ ] Summarization model selector (dropdown of available Ollama models)
- [ ] Enable semantic memory recall
- [ ] Max recalled messages (slider: 1-10)
- [ ] Enable context drift detection
- [ ] Drift threshold (slider: 0.1-0.5)

Register in `SettingsModal.tsx` under the "Intelligence" group.

### 5.2 Add Memory Stats Widget

**File:** `src/components/widgets/MemoryStatsWidget.tsx` (new)

Display in right sidebar:
- Total conversation vectors indexed
- Storage used (LanceDB file size)
- Recent recall hits (how often semantic memory was useful)

---

## File Change Summary

| File | Phase | Change Type |
|------|-------|-------------|
| `src-tauri/src/commands/chat.rs` | 0.1, 0.3 | Modify routing + tool injection |
| `src/atlas/hooks/useGlobalStreamListener.ts` | 0.2, 3.3 | Wire chat:message + heartbeat |
| `src-tauri/src/agent/runner.rs` | 1.1, 1.2, 2.2, 2.3, 3.1, 4.1 | Major: add summarization, semantic recall, checkpoint saves, drift detection |
| `src-tauri/src/llm/mod.rs` | 1.1 | Add `summarize()` helper |
| `src-tauri/src/db/mod.rs` | 1.1 | Add `conversation_summaries` table migration |
| `src-tauri/src/db/queries.rs` | 1.1, 3.2 | Add summary queries + partial update |
| `src-tauri/src/rag/conversation_store.rs` | 2.1 | New: LanceDB conversation vector store |
| `src-tauri/src/lib.rs` | 2.1, 2.4 | Init conversation store, register memory commands |
| `src-tauri/src/commands/memory.rs` | 2.4 | New: memory management Tauri commands |
| `src/components/settings/Tabs/intelligence/MemorySettings.tsx` | 5.1 | New: settings UI |
| `src/atlas/components/SettingsModal.tsx` | 5.1 | Add MemorySettings tab |
| `src/components/widgets/MemoryStatsWidget.tsx` | 5.2 | New: sidebar widget |
| `src/lib/stores/settings/types.ts` | 5.1 | Add memory config fields |

---

## Dependency Order

```
Phase 0 (Quick Wins)
    ├── 0.1 Fix routing ← independent
    ├── 0.2 Wire chat:message ← independent
    └── 0.3 Tool injection ← independent

Phase 1 (Hierarchical Memory)
    ├── 1.1 Summarization ← depends on: nothing
    └── 1.2 Summary+Buffer ← depends on: 1.1

Phase 2 (Semantic Recall)
    ├── 2.1 Conversation store ← depends on: nothing (LanceDB already init'd)
    ├── 2.2 Embed on complete ← depends on: 2.1
    ├── 2.3 Semantic recall ← depends on: 2.1, 2.2
    └── 2.4 Memory commands ← depends on: 2.1

Phase 3 (Streaming Resilience)
    ├── 3.1 Checkpoint saves ← depends on: nothing
    ├── 3.2 Partial update query ← depends on: 3.1
    └── 3.3 Frontend heartbeat ← depends on: nothing

Phase 4 (Drift Detection)
    └── 4.1 Drift tracker ← depends on: embedding model (already exists)

Phase 5 (Settings UI)
    ├── 5.1 Memory settings ← depends on: 1.1, 2.1, 4.1
    └── 5.2 Memory widget ← depends on: 2.1
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Summarization LLM call fails | Medium | Low | Fallback to existing truncation compaction |
| LanceDB embedding generation slow | Medium | Low | Async, non-blocking, silent skip on failure |
| Context recall injects irrelevant info | Low | Medium | Limit to 5 results, 1500 token budget, only when similarity > 0.5 |
| DB migration breaks existing chats | Low | High | Migration is additive (new table), no ALTER on existing tables |
| Streaming checkpoint write contention | Low | Low | Use separate DB connection, ignore errors |

---

## Estimated Effort

| Phase | Hours | Complexity |
|-------|-------|------------|
| 0. Quick Wins | 1-2 | Low |
| 1. Hierarchical Memory | 4-6 | Medium |
| 2. Semantic Recall | 6-8 | High |
| 3. Streaming Resilience | 3-4 | Medium |
| 4. Drift Detection | 2-3 | Low |
| 5. Settings UI | 2-3 | Low |
| **Total** | **18-26 hours** | |
