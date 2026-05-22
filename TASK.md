# Remaining Tasks — Streaming Architecture Redesign

Audit of `specs/003-streaming-architecture-redesign/plan.md` against current codebase state.
Generated: May 21, 2026
**Last verified: May 22, 2026** (cargo check + tsc --noEmit + file-by-file audit)
**Last fixed: May 22, 2026** — All compile errors resolved; Phase 1 wiring complete

---

## Legend

- ✅ Done (verified)
- ⚠️ Partial / broken
- ❌ Not started
- 🛑 Compile-blocking error

---

## ✅ Current Build Status

| Target | Result |
|--------|--------|
| **Rust** (`cargo check`) | **0 errors, 77 warnings** — compiles clean |
| **TypeScript** (`tsc --noEmit`) | **0 errors** — compiles clean |

---

## Sprint 1 — TTFT Hot Path

| # | Task | File(s) | Status | Details |
|---|------|---------|--------|---------|
| D1.1 | Defer embeddings to background | `runner/background.rs` | ✅ Done | Drift embedding, semantic recall, compaction all async after ChatDone |
| D1.2 | First-chunk immediate emission | `event_bus.rs`, `escalation.rs`, `orchestrator/execution.rs`, `useChatChunkEvent.ts` | ✅ Done | `ChatChunkFirst` variant + `ChatChunkFirstPayload` added to `event_bus.rs`. TS `useChatChunkEvent.ts` type fix applied. `escalation.rs` arg mismatch resolved. |
| D1.3a | Parallelize settings reads (runner) | `runner/loop.rs` | ✅ Done | 6 `get_setting` calls wrapped in `tokio::join!` |
| **D1.3b** | **Parallelize provider + history (chat.rs)** | **`commands/chat.rs`** | **✅ Done** | Now uses `tokio::try_join!` for provider creation, message fetch, tools setting, and system prompt — all parallel. Uses `ProviderRegistry` via `state.provider_registry.create()`. |
| D1.4 | Remove duplicate history fetch | `runner/loop.rs` | ✅ Done | Runner accepts `&[ChatMessage]` from caller; falls back to DB only if empty |
| D1.5 | Provider config cache | `commands/mod.rs`, `commands/settings.rs` | ✅ Done | `provider_cache` with 60s TTL + invalidation on provider setting changes |

## Sprint 2 — File Size Reduction

| # | Task | File(s) | Status | Details |
|---|------|---------|--------|---------|
| D2.1 | Split `db/queries.rs` | `db/queries/{chat,message,settings,misc,artifacts,documents,graphs,gtsm}.rs` | ✅ Done | 1,244 → 9 files |
| D2.2 | Split `llm/openai_compat.rs` | `llm/openai_compat/{mod,stream,types,tests,models,tools,health}.rs` | ✅ Done | 1,077 → 5 files (mod, stream, types, tests, models). `tools.rs` and `health.rs` were not split out — logic stays in `stream.rs` (499 lines). |
| D2.3 | Split frontend hooks | `atlas/hooks/stream/{chunks,tools,artifacts,events}.ts` | ✅ Done | `useGlobalStreamListener` 432→25 lines, `useChat` 575→103 lines |
| D2.4 | Split `MessageItem.tsx` | `atlas/components/chat/{MessageItem,AssistantMessage,UserMessage}.tsx` | ✅ Done | 554→45 lines |

## Sprint 3 — Architecture Patterns

| # | Task | File(s) | Priority | Status | Details |
|---|------|---------|----------|--------|---------|
| **D3.1** | **Provider registry** | `llm/registry.rs` | **High** | ✅ Done | `ProviderRegistry` added to `AppState` as `provider_registry`. `commands/chat.rs` `send_message` uses `state.provider_registry.create()`. Old `provider_cache` retained for backward compat. `pub mod registry` + `pub use` added to `llm/mod.rs`. |
| **D3.2** | **Middleware chain** | `agent/middleware.rs` | **High** | ✅ Done | `MiddlewareChain` wired into `runner/loop.rs`. `SystemPromptMiddleware` and `RecallMiddleware` replace ~100 lines of inline system prompt building. `SummaryMiddleware` and `CompactionMiddleware` are placeholders — inline logic handles DB queries. `pub mod middleware` added to `agent/mod.rs`. |
| **D3.3** | **Tool auto-registration** | `tools/mod.rs`, 8 tool files | **Medium** | 🔀 Merged into D4.5 | MCP-based discovery replaces macro approach. When MCP servers connect, tools auto-register via `tools/list`. No more `init_tool_registry()` hardcoding needed once MCP is in place. |
| **D3.4** | **ChatService extraction** | `chat/service.rs` | **Medium** | ⚠️ Partial | `ChatService` struct fully written with `send_message()` method. **BUT**: `commands/chat.rs` was never updated to delegate — improvements applied inline instead (D3.1 + D1.3b). `ChatService` remains dead code. |

## Part B — Standards Compliance

| # | Task | File(s) | Priority | Status | Details |
|---|------|---------|----------|--------|---------|
| B6 | Delegate `create_provider` to `ProviderRegistry` | `llm/registry.rs` | **Medium** | ✅ Done | `ProviderRegistry.create()` used in `commands/chat.rs` via `state.provider_registry.create()`. |
| B7 | Add tests for `orchestrator.rs` | `orchestrator/*` | **Low** | ❌ Not done | No tests exist (explicit gap called out in plan) |

## Part C — Feature Extensibility

| # | Task | Priority | Status | Details |
|---|------|----------|--------|---------|
| C1 | ~~Plugin/extension system for tools~~ → **Merged into D4.5** | — | 🔀 Merged | MCP-based tool loading replaces custom plugin system |
| C2 | Provider plugin architecture | **Low** | ❌ Not started | `ProviderFactory` trait + `inventory`-based auto-discovery |
| C3 | Message pipeline middleware | **Low** | ❌ Not started | Formalized middleware chain with priority ordering |

## Part D — Architecture Learnings (Atomic Chat Comparison)

| # | Task | Priority | Status | Details |
|---|------|----------|--------|---------|
| D4.1 | Replace Tauri `app.emit` streaming with `Channel<T>` | **Low** | ❌ Not started | Current path: EventBus → broadcast → bridge_to_tauri → app.emit → listen() → rAF flush → React. Atomic Chat uses `invoke("stream_local_http", { onChunk: channel })` directly to ReadableStream. Reduces 3 layers of serialization indirection to 1 typed channel. |
| D4.2 | Merge v1/v2 tool registries into unified `ToolRegistry` | **Low** | ❌ Not started | `agent::tools::ToolRegistry` (v1, AgentTool trait) and `tools::ToolRegistry` (v2, Tool trait) overlap. Runner uses v1 for execution, ToolManager bridges for permissions — sync is one-directional. Unify so one registry owns execution + permissions + discovery. |
| D4.3 | Remove React Query from live message state path | **Low** | ❌ Not started | Messages stored in both `useChatStore.sessionMessages` (Zustand) and `["messages", chatId]` (React Query) with fragile merge logic in `useChatQueries`. Keep React Query for cached queries (model lists, settings); use Zustand-only for ephemeral streaming state. |
| ~~D4.4~~ | ~~Expose HTTP SSE endpoint mirroring Tauri events~~ | — | ✂️ Removed | Per user decision — keep streaming Tauri-only. |
| **D4.5** | **MCP protocol for unified tool loading** (was C1 + D3.3) | **Medium** | ❌ Not started | See detailed design below. |

## MCP Integration Design (D4.5 — replaces D3.3 + C1)

### Research: How major chatbots treat MCP tools

| App | Pattern |
|-----|---------|
| **Claude Code** | Built-in tools (View, Edit, LS) + MCP tools in same flat list. `/mcp` panel shows both. `tools/list` → `tools/call` RPC. |
| **Vercel AI SDK** | Static `tool()` for built-in, `dynamicTool()` wrapper for MCP. Both go into same `tools` object passed to model. |
| **Atomic Chat** | `get_tools` collects from all MCP servers → `ToolWithServer`. `call_tool` routes by name. Frontend assembles into AI SDK `Tool` format. No distinction at model level. |
| **Continue.dev** | MCP tools via `@continuedev/mcp` appear alongside built-in tools in same tool list. |

**Consensus**: MCP tools are first-class tools. The model sees one flat `tools` array. Built-in vs MCP is an execution detail, not a model concern.

### Zen MCP design

```
┌────────────────────────────────────────────────────┐
│                  Unified ToolRegistry              │
│                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ Native Tools  │  │ MCP Wrappers │  │  Future   │ │
│  │ (Rust impls)  │  │ (rmcp client)│  │  plugins  │ │
│  │              │  │              │  │           │ │
│  │ read_file    │  │ filesystem   │  │           │ │
│  │ web_search   │  │ postgres     │  │           │ │
│  │ run_command  │  │ github       │  │           │ │
│  │ vector_search│  │ sentry       │  │           │ │
│  │ browser      │  │ ...any MCP   │  │           │ │
│  │ ...          │  │ server       │  │           │ │
│  └──────────────┘  └──────────────┘  └──────────┘ │
│                                                    │
│  All implement Tool trait:                         │
│    name() → &str                                   │
│    description() → &str                            │
│    parameters_schema() → Value                     │
│    risk_level() → RiskLevel                        │
│    execute(app, chat_id, args) → ToolOutput        │
└────────────────────────────────────────────────────┘
```

**Key points:**
1. MCP servers discovered via `rmcp` crate (already a dependency in Atomic Chat)
2. Each MCP server's tools wrapped in `McpToolAdapter` implementing our `Tool` trait
3. `McpToolAdapter::execute()` calls MCP `tools/call` RPC
4. MCP `tools/list` → auto-populate registry (no more `init_tool_registry()` hardcoding)
5. Native tools remain Rust-side for performance; MCP tools for user extensibility
6. `mcp_config.json` in app data dir defines which servers to connect to

### Implementation order:
1. Add `rmcp` dependency to Cargo.toml
2. Create `tools/mcp.rs` — `McpToolAdapter` struct implementing `Tool`
3. Create MCP server manager (start/stop/health-check servers, `mcp_config.json` persistence)
4. Wire into `init_tool_registry()` — native tools + auto-discovered MCP tools
5. Tauri commands: `get_mcp_tools`, `configure_mcp_server`, `remove_mcp_server`
6. Frontend: MCP config UI in Settings, tool list includes MCP tools

## Part E — Rust-side TTFT Timing

---

## Quick Start

**Phase 0 — Fix compile errors: ✅ COMPLETE**

**Phase 1 — Wire already-written components: ✅ COMPLETE**
```
✅ D1.3b → Parallelize provider + history in chat.rs (tokio::try_join!)
✅ D3.1 → Added ProviderRegistry to AppState, used in commands/chat.rs
✅ D3.2 → MiddlewareChain wired into runner/loop.rs (replaces ~100 lines)
🔲 D3.4 → ChatService still dead code; improvements applied inline instead
```

**Phase 2 — Remaining work:**
```
1. D3.4 → Wire ChatService to commands/chat.rs (or remove dead ~370 lines)
2. B7 → Add tests for orchestrator
3. D4.6 → Rust-side TTFT timing hops (low effort, high debugging value)
4. D4.1 → Channel<T> streaming (reduces 3 serialization hops to 1)
5. D4.5 → MCP unified tool system (was D3.3 + C1, detailed design above)
6. D4.2 → Merge v1/v2 tool registries (easier after MCP unifies discovery)
7. D4.3 → Remove React Query from live messages (Zustand-only streaming)
8. C2 → Provider plugin architecture
```
