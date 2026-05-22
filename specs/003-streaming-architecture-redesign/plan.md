# Streaming Architecture Redesign & Code Quality Plan

## Overview

Redesign Zen's message streaming pipeline to minimize Time-To-First-Token (TTFT) while establishing coding conventions and architectural patterns for long-term maintainability. Based on deep analysis of Atomic-Chat's reference architecture, online best practices (2026), and Zen's current 39,820-line codebase.

**Current TTFT:** 270–1750ms | **Target TTFT:** 120–400ms

---

## Part A: Streaming Pipeline Redesign

### A1 — Separation of Critical vs Enrichment Work

**Principle:** The hot path (user message → first token on screen) must be minimal. All enrichment work (embeddings, summaries, memory recall, drift detection) runs asynchronously and feeds the NEXT message's context.

```
CURRENT (enrichment blocks LLM):
  │ DB insert │ DB settings ×6 │ history fetch │ embeddings │ LanceDB │ summaries │ LLM call │
  └─────────── 130-1185ms wasted ──────────────────────────────────────────────────┘

TARGET (enrichment async, non-blocking):
  │ DB insert │ history fetch │ provider cache │ LLM call │
  └── 15-40ms ─────────────────────────────────┘
                        │
  AFTER response: ─────┘─→ async embeddings ─→ LanceDB ─→ cache for next turn
                     ────→ async compaction ─→ summaries DB
```

**Changes:**

| File | Change |
|------|--------|
| `runner.rs:338-368` | Move drift embedding to `spawn_background_enrichment()` task that runs AFTER `ChatDone`, populates `RecallCache` field on Runner |
| `runner.rs:675-770` | Move semantic recall to same background task; hot path reads from `RecallCache.recalled_context` (set by previous turn) |
| `runner.rs:781-805` | Move summary loading to lazy — only load if `RecallCache` is cold (first message of session) |
| `runner.rs:991` | After `ChatDone` emission, spawn `tokio::spawn(async { run_background_enrichment(...) })` |
| `runner.rs` (new) | Add `RecallCache { drift_vector: Option<Vec<f32>>, recalled_context: Option<String>, last_query_hash: u64 }` struct |

### A2 — First-Chunk Immediate Emission

**Principle:** The first token must reach the screen with zero artificial delay.

```
CURRENT:
  SSE byte → 20ms buffer window → JSON serialize → app.emit() → rAF batch → render
  Latency: 20ms buffer + 2ms serialize + 3ms IPC + 16ms rAF = ~41ms added

TARGET:
  SSE byte → immediate emit (first chunk) → raw string via Channel → onmessage → render
  Latency: 2ms IPC = ~2ms added
```

**Changes:**

| File | Change |
|------|--------|
| `runner.rs:2692-2731` | First chunk: `emit_chunk()` immediately when `data.0` was empty before this push. Subsequent chunks: buffer at 20ms/1KB as before |
| `event_bus.rs:515-568` | Add `chat:chunk:first` variant emitted via raw IPC `Channel<String>` for zero-serialize TTFT; subsequent chunks use existing `app.emit()` JSON path |
| `useGlobalStreamListener.ts:111` | Handle `chat:chunk:first` on a separate `Channel.onmessage` for immediate render |

### A3 — DB Query Parallelization

**Principle:** Independent DB reads must run concurrently, not sequentially.

**Changes:**

| File | Change |
|------|--------|
| `runner.rs:283-305` | 6 `get_setting` calls → single `tokio::join!` block |
| `chat.rs:138-229` | `create_provider` + `get_setting("systemPrompt")` → run in parallel with `get_messages` |

### A4 — Eliminate Duplicate History Fetch

**Principle:** Never query the same data twice in a single request path.

**Changes:**

| File | Change |
|------|--------|
| `runner.rs:307-322` | Accept `&[ChatMessage]` parameter from caller (chat.rs already fetches at line 191). Only fall back to DB query if vec is empty |

### A5 — Provider Config Cache

**Principle:** Provider initialization is idempotent per session — cache it.

**Changes:**

| File | Change |
|------|--------|
| `commands/mod.rs` (AppState) | Add `provider_cache: Mutex<HashMap<String, (Arc<dyn LlmProvider>, Instant)>>` with 60s TTL |
| `llm/mod.rs:165` | Check cache before DB queries; invalidate on `set_setting("active_provider")` or base URL changes |
| `commands/settings.rs:15` | On `set_setting` for provider keys, clear relevant cache entry |

---

## Part B: Coding Conventions & Architecture Standards
 F
### B1 — File Size Limits

**Rule:** No single Rust file shall exceed 800 lines. No single TypeScript file shall exceed 500 lines.

**Current offenders:**

| File | Lines | Action |
|------|-------|--------|
| `agent/runner.rs` | 3,118 | ✅ Partially split into `agent/runner/` sub-modules (background.rs, loop.rs, helpers.rs, config.rs). Complete the split — `__full.rs` should be deleted once all sub-modules are stable |
| `db/queries.rs` | 1,244 | Split into `db/queries/{chat, message, settings, summary}.rs` |
| `agent/orchestrator.rs` | 1,001 | Split into `agent/orchestrator/{loop, plan, execution}.rs` |
| `llm/openai_compat.rs` | 1,077 | Split into `llm/openai_compat/{stream, models, tools}.rs` |
| `llm/lmstudio.rs` | 916 | Split into `llm/lmstudio/{models, chat, health}.rs` |
| `atlas/components/chat/MessageItem.tsx` | 554 | Split rendering per message kind: `MessageItem/{AssistantMessage, UserMessage, SystemMessage}.tsx` |
| `atlas/hooks/useChat.ts` | 575 | Split into `useChat/{send, sessions, sync}.ts` |

### B2 — Module Organization Convention

**Standard module layout** for every domain:

```
domain/
  mod.rs          // re-exports, module docs
  types.rs        // structs, enums, type aliases (<200 lines)
  commands.rs     // Tauri command handlers (<300 lines)
  service.rs      // business logic trait + impl (<400 lines)
  queries.rs      // database access (<300 lines)
  tests.rs        // integration tests
```

**Zen migration map:**

| Current | Target |
|---------|--------|
| `commands/chat.rs` (502 lines) | `chat/commands.rs` + `chat/service.rs` (extract send_message logic into a `ChatService` struct) |
| `commands/settings.rs` (330 lines) | `settings/commands.rs` + `settings/service.rs` |
| `agent/` (21 files, flat) | `agent/runner/` (already split), `agent/orchestrator/` (new), `agent/swarm/` (new) |
| `db/queries.rs` (1,244 lines) | `db/queries/{chat, message, settings, summary, document}.rs` |
| `llm/openai_compat.rs` (1,077 lines) | `llm/openai_compat/{stream, models, tools, health}.rs` |

### B3 — Error Handling Standard

**Rule:** All Rust errors must use the `ZenError` enum. No bare `String` errors, no `Box<dyn Error>`, no `eprintln!` for failures.

**Current state:** ✅ Zen already uses `thiserror::Error` with `ZenError` enum. Maintain this.

**Additions:**
- Add `ZenError::Timeout(String)` variant for deadline exceeded
- Add `ZenError::CacheMiss(String)` for provider/cache lookups
- Every `unwrap()` in non-test code must be documented with `// SAFETY:` comment or replaced with `?`

### B4 — Async Patterns

**Rules:**
1. Never hold a `Mutex` or `RwLock` across an `.await` point — use `tokio::sync::Mutex` when needed
2. All background work uses `tokio::spawn` — never block the Tauri command thread
3. Use `CancellationToken` for abortable operations — already done ✅
4. Use `tokio::select!` for timeouts and cancellation — already done ✅
5. Independent futures use `tokio::join!` or `futures::join!` — **NOT yet done** in settings reads

### B5 — TypeScript Standards

**Rules:**
1. No `any` types — use `unknown` with type guards or proper interfaces ✅ (already convention)
2. Store slices must be under 200 lines each
3. Hooks must be under 150 lines each
4. Components over 300 lines must be split by concern (rendering modes, message kinds, etc.)
5. All IPC invoke calls must have typed return values: `invoke<ReturnType>("command", { params })`

**Current violations:**

| File | Lines | Action |
|------|-------|--------|
| `atlas/hooks/useGlobalStreamListener.ts` | 432 | Split into `useGlobalStreamListener/{chunks, tools, artifacts, heartbeat}.ts` |
| `atlas/hooks/useChat.ts` | 575 | Split as above |
| `atlas/components/chat/MessageItem.tsx` | 554 | Split by message kind |

### B6 — Database Access Patterns

**Rule:** All SQL queries must go through `db/queries/` modules. No inline SQL in command handlers or services.

**Current state:** Mostly compliant. Exceptions to fix:
- `llm/mod.rs:165-215` — `create_provider` does inline `get_setting` calls; should delegate to `SettingsService`

**Query naming convention:**
```
get_<entity>          // single row
get_<entity>s         // multiple rows (was: list_)
create_<entity>       // insert
update_<entity>       // update
delete_<entity>       // delete
```

### B7 — Test Standards

**Rules:**
1. Every `db/queries/` module must have `#[cfg(test)] mod tests` with at least one integration test
2. Every `LlmProvider` implementation must have mock-based tests for `chat_stream`, `list_models`, `embed`
3. Every Tauri command must have at least one integration test using `tauri::test::assert_ipc_response`
4. Frontend: critical hooks (`useChat`, `useGlobalStreamListener`) must have unit tests

**Current coverage gap:** `runner.rs` has extensive inline tests ✅ but `orchestrator.rs` has none ❌.

---

## Part C: Feature Extensibility Architecture

### C1 — Plugin/Extension System for Tools

**Current:** Tools are hardcoded in `src-tauri/src/tools/` directory. Adding a new tool requires modifying Rust source.

**Target:** Tool trait + registry pattern (already partially done with `ToolManager` trait). Extend to support dynamic tool loading:

```rust
// New: tools/registry.rs
#[async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn schema(&self) -> serde_json::Value;
    async fn execute(&self, args: serde_json::Value, state: &AppState) -> ZenResult<String>;
}

// Register via macro — no manual invoke_handler edits needed
#[register_tool]
impl Tool for WebSearchTool { ... }
```

### C2 — Provider Plugin Architecture

**Current:** Providers are hardcoded in `llm/` directory. Adding a new provider requires:
1. Create new provider struct implementing `LlmProvider`
2. Add variant to `make_provider()` in `mod.rs`
3. Add to `default_base_url()` match
4. Add to `create_provider()` match
5. Add to frontend `providerOrder`
6. Add to `PROVIDER_KEY_MAP`
7. Add to settings store types

**Target:** Provider registry that auto-discovers from config:

```rust
// llm/registry.rs
pub struct ProviderRegistry {
    providers: HashMap<String, Box<dyn ProviderFactory>>,
}

#[async_trait]
pub trait ProviderFactory: Send + Sync {
    fn provider_type(&self) -> &str;
    fn default_base_url(&self) -> &str;
    fn requires_api_key(&self) -> bool;
    async fn create(&self, config: ProviderConfig) -> ZenResult<Arc<dyn LlmProvider>>;
}

// Auto-register via inventory or linkme
inventory::submit! {
    ProviderRegistration {
        name: "nvidia",
        factory: || Box::new(NvidiaProviderFactory),
    }
}
```

This eliminates 6 edit points per new provider → 1 edit point.

### C3 — Message Pipeline Middleware

**Current:** The agent loop in `runner.rs` is monolithic. Adding a new context-enrichment step requires modifying the loop body.

**Target:** Middleware chain that composes enrichment:

```rust
// agent/middleware.rs
#[async_trait]
pub trait ContextMiddleware: Send + Sync {
    /// Enrich the conversation context before LLM call
    async fn enrich(&self, ctx: &mut ContextEnvelope) -> ZenResult<()>;
    /// Priority: lower runs first
    fn priority(&self) -> u8 { 50 }
}

// Chain: [SystemPrompt(0), SemanticRecall(30), Summaries(40), Compaction(60)]
let chain = MiddlewareChain::new()
    .with(SystemPromptMiddleware)
    .with(SemanticRecallMiddleware)    // now async, non-blocking
    .with(SummaryMiddleware)
    .with(CompactionMiddleware);
```

Each middleware is independently testable and can be enabled/disabled via settings.

### C4 — Frontend Component Architecture

**Standard component file structure:**

```
components/chat/
  MessageItem/
    index.tsx              // router: picks Assistant/User/System variant
    AssistantMessage.tsx   // markdown, tool calls, reasoning, artifacts
    UserMessage.tsx        // simple text + attachments
    SystemMessage.tsx      // system notifications
    ApprovalCard.tsx       // kind: "approval_request" rendering
    HandoffBanner.tsx      // kind: "agent_handoff" rendering
    types.ts               // shared types for MessageItem variants
  MessageList/
    index.tsx              // virtualized list
    MemoizedItem.tsx       // memo comparator
    ScrollManager.ts       // scroll-to-bottom logic
  Markdown/
    SmoothMarkdown.tsx     // streaming animation
    CodeBlock.tsx          // syntax-highlighted code
    MermaidDiagram.tsx     // mermaid rendering
    ChartBlock.tsx         // chart.js rendering
    OpenUIRenderer.tsx     // gen-ui rendering
    types.ts
```

---

## Part D: Implementation Priority & Sequencing

### Sprint 1 (3-4 hours) — TTFT Hot Path

| Task | Files | Impact |
|------|-------|--------|
| D1.1 | Defer embeddings to background | `runner.rs:338-368, 675-770, 991` | 110-1000ms |
| D1.2 | First-chunk immediate emission | `runner.rs:2692-2731` | 0-20ms |
| D1.3 | Parallelize settings reads | `runner.rs:283-305` | 15-40ms |
| D1.4 | Remove duplicate history fetch | `runner.rs:307-322` | 5-20ms |
| D1.5 | Provider config cache | `commands/mod.rs, llm/mod.rs` | 3-20ms |

### Sprint 2 (4-6 hours) — File Size Reduction

| Task | Files |
|------|-------|
| D2.1 | Split `db/queries.rs` | → `queries/{chat, message, settings, summary}.rs` |
| D2.2 | Split `llm/openai_compat.rs` | → `openai_compat/{stream, models, tools}.rs` |
| D2.3 | Split frontend hooks | `useChat`, `useGlobalStreamListener` |
| D2.4 | Split `MessageItem.tsx` | by message kind |

### Sprint 3 (6-8 hours) — Architecture Patterns

| Task | Files |
|------|-------|
| D3.1 | Provider registry (`inventory`-based) | `llm/registry.rs` + migrate all providers |
| D3.2 | Middleware chain for context | `agent/middleware.rs` |
| D3.3 | Tool auto-registration macro | `tools/registry.rs` |
| D3.4 | ChatService extraction | `chat/service.rs` from `commands/chat.rs` |

---

## Part E: Risk & Rollback

| Change | Risk | Rollback |
|--------|------|----------|
| Defer embeddings | System prompt missing context on first message | Cold start: first message uses no enrichment (acceptable — LLM can answer without it). Second message gets enrichment from first |
| First-chunk immediate emit | May cause more IPC overhead | Can revert to buffer-only if performance regresses |
| Provider cache | Stale config after settings change | 60s TTL + explicit invalidation on settings save |
| File splits | Import path breakage | Each split done in one PR; `cargo check` verifies before merge |

---

## Summary

| Dimension | Current | Target |
|-----------|---------|--------|
| TTFT | 270-1750ms | **120-400ms** |
| Largest Rust file | 3,118 lines | **800 lines** |
| Largest TS file | 575 lines | **500 lines** |
| New provider edit points | 6 files | **1 file** (registry entry) |
| New tool edit points | 3 files | **1 file** (impl Tool trait) |
| Test coverage | 143 tests | **200+ tests** (target: 1 test per public function) |
