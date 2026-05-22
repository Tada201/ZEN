# Chat Session Improvements — Tasks

## Phase 0: Quick Wins

### Task 0.1: Fix Orchestrator Routing Heuristic
**File:** `src-tauri/src/commands/chat.rs:229`
**Dependency:** None
- [x] Replace `content.len() > 500` with complexity-based heuristic
- [x] Add `has_complexity_markers()` helper function
- [x] Test: send simple 600-char message → should use Runner, not Orchestrator
- [x] Test: send message with 3+ code blocks → should use Orchestrator

### Task 0.2: Wire Up `chat:message` Listener
**File:** `src/atlas/hooks/useGlobalStreamListener.ts:304-314`
**Dependency:** None
- [x] Replace placeholder listener with proper message insertion logic
- [x] Add `ChatMessageEvent` TypeScript interface
- [x] Handle `approval_request`, `agent_handoff`, `agent_spawn` message kinds
- [x] Test: trigger an agent handoff → verify message appears in chat

### Task 0.3: Remove Default Tool Injection
**File:** `src-tauri/src/commands/chat.rs:179`
**Dependency:** None
- [x] Add `tools_enabled` setting or derive from model capabilities
- [x] Only inject tools when model supports tool calling AND tools are enabled
- [x] Test: simple chat without tools → verify no tool prompts in system context

---

## Phase 1: Hierarchical Memory

### Task 1.1: Add Conversation Summaries Table
**File:** `src-tauri/src/db/mod.rs`
**Dependency:** None
- [x] Add SQL migration for `conversation_summaries` table
- [x] Add `is_compacted` column to `messages` table (ALTER TABLE)
- [x] Add queries: `save_summary()`, `get_current_summary()`, `get_previous_summaries()`

### Task 1.2: Implement LLM-Based Summarization
**File:** `src-tauri/src/agent/runner.rs`
**Dependency:** Task 1.1
- [x] Add `summarize_messages()` method to `Runner`
- [x] Add `summarization_model` and `summarization_token_budget` to `RunConfig`
- [x] Integrate summarization into compaction trigger (replace truncation)
- [x] Run summarization async after response completes (non-blocking)
- [x] Test: 40+ turn conversation → verify summary is created and used in next turn

### Task 1.3: Implement Summary + Buffer Context Assembly
**File:** `src-tauri/src/agent/runner.rs`
**Dependency:** Task 1.2
- [x] Modify `run()` context assembly to include: cold summaries → warm summary → hot verbatim
- [x] Set token budgets: Hot ~8K, Warm ~2K, Cold ~1K
- [x] Test: long conversation → verify context contains summary + recent messages

---

## Phase 2: Semantic Memory Recall

### Task 2.1: Create Conversation Vector Store
**File:** `src-tauri/src/rag/conversation_store.rs` (new)
**Dependency:** None (LanceDB already initialized)
- [x] Create `ConversationStore` struct wrapping LanceDB table
- [x] Define `ConversationVector` schema (768-dim vectors)
- [x] Implement `add()`, `search()`, `delete_by_chat_id()` methods
- [x] Initialize in `lib.rs` alongside existing document store
- [x] Test: add vectors, search, verify results

### Task 2.2: Embed Messages on Completion
**File:** `src-tauri/src/agent/runner.rs`
**Dependency:** Task 2.1
- [x] In `chat:done` handler, extract user messages (>50 chars)
- [x] Generate embeddings via existing `provider.embed()` or `embedding_model`
- [x] Store in LanceDB `conversation_vectors` collection
- [x] Handle failures gracefully (silent skip)
- [x] Test: complete a chat turn → verify vectors are stored in LanceDB

### Task 2.3: Semantic Recall in Context Assembly
**File:** `src-tauri/src/agent/runner.rs`
**Dependency:** Task 2.1, Task 2.2
- [x] Before building `full_context`, embed latest user message
- [x] Query LanceDB for top 5 similar past messages
- [x] Inject recalled context into system prompt (max 1500 tokens)
- [x] Only inject when similarity score > 0.5
- [x] Test: ask about a topic discussed in a previous session → verify recall

### Task 2.4: Memory Management Tauri Commands
**File:** `src-tauri/src/commands/memory.rs` (new)
**Dependency:** Task 2.1
- [x] Create `get_conversation_memories(chat_id, query, limit)` command
- [x] Create `clear_conversation_memories(chat_id)` command
- [x] Create `get_memory_stats()` command
- [x] Register all three in `lib.rs` invoke_handler
- [x] Test: call each command from frontend, verify responses

---

## Phase 3: Streaming Resilience

### Task 3.1: Add Checkpoint Saves During Streaming
**File:** `src-tauri/src/agent/runner.rs`
**Dependency:** None
- [x] Add 500ms interval timer in streaming loop
- [x] On tick, call `update_message_partial()` if content changed
- [x] On cancellation/error, save whatever partial content exists
- [x] Test: abort mid-stream → verify partial content is saved to DB

### Task 3.2: Add Partial Update Query
**File:** `src-tauri/src/db/queries.rs`
**Dependency:** Task 3.1
- [x] Create `update_message_partial()` function
- [x] Test: call during active stream → verify DB updates without breaking

### Task 3.3: Frontend Stream Heartbeat
**File:** `src/atlas/hooks/useGlobalStreamListener.ts`
**Dependency:** None
- [x] Add 10-second timeout during streaming state
- [x] If no `chat:chunk` arrives, show "Connection interrupted" indicator
- [x] Add retry button to re-fetch messages from DB
- [x] Test: simulate stream pause → verify indicator appears

---

## Phase 4: Context Drift Detection

### Task 4.1: Add Drift Tracker to Runner
**File:** `src-tauri/src/agent/runner.rs`
**Dependency:** None (uses existing embedding model)
- [x] Create `ContextTracker` struct with initial topic vector
- [x] Implement `check_drift()` using cosine similarity
- [x] Emit `chat:context-drift` event when score drops below threshold
- [x] Add `drift_threshold` to `RunConfig` (default: 0.3)
- [x] Test: change topic mid-conversation → verify drift event fires

---

## Phase 5: Settings UI

### Task 5.1: Create Memory Settings Tab
**File:** `src/components/settings/Tabs/IntelligenceSettings.tsx`
**Dependency:** Tasks 1.1, 2.1, 4.1
- [x] Create settings component/sections with toggles for:
  - Enable summarization
  - Summarization model selector
  - Enable semantic recall
  - Max recalled messages slider
  - Enable drift detection
  - Drift threshold slider
- [x] Wire to existing settings store (add `MemorySlice`)
- [x] Register tab in `SettingsModal.tsx` under "Intelligence" group
- [x] Test: toggle settings → verify persistence and backend reads them

### Task 5.2: Create Memory Stats Widget
**File:** `src/components/widgets/MemoryStatsWidget.tsx` (new)
**Dependency:** Task 2.1
- [x] Create widget showing: total vectors, storage size, recall hits
- [x] Call `get_memory_stats()` Tauri command
- [x] Add to right sidebar widget list
- [x] Test: widget displays accurate stats after several chat sessions
