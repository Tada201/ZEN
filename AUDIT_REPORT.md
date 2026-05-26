# ZEN Codebase Audit Report — RESCAN (v2)

**Date:** 2026-05-26
**Previous Audit:** 2026-05-25
**Scope:** Full-stack re-scan (5 parallel subagents) covering 3 recent commits
**Key Changes:** Added `services/secret.rs`, `services/security.rs`, `services/logging.rs`, `services/tool.rs`

---

## What Changed Since Last Audit

| Issue | Previous Status | Current Status |
|-------|----------------|----------------|
| CSP null | CRITICAL | **RESOLVED** — full CSP with connect-src whitelist |
| MCP binds 0.0.0.0 | CRITICAL | **PARTIALLY RESOLVED** — now 127.0.0.1, still no auth |
| `get_active_messages` no LIMIT | CRITICAL | **RESOLVED** — LIMIT 500 subquery added |
| GTSM cache unbounded | HIGH | **IMPROVED** — TTL eviction added, still no capacity cap |
| New services (secret, security, logging, tool) | N/A | **4 NEW FILES** — infrastructure scaffolding, not yet fully integrated |

**Net:** 2 criticals resolved, 1 critical downgraded, 4 new infrastructure files added. All other pre-existing issues (terminal allowlist, fs_tools read bounds, SSRF, RwLock, block_on, reqwest clients, dual tool registry) remain unchanged.

---

## CRITICAL (6 findings — same as before minus CSP + LIMIT fix)

### C1. API Keys Still Plaintext in SQLite
- **File:** `src/services/secret.rs:26-27`, `services/settings.rs:45-57`
- **New `SecretService`** is a thin audit-logging wrapper. Calls `self.settings.get(key)` and `self.settings.set(key, value)` directly — zero encryption. No OS keychain, no AES-GCM, no DPAPI. The name `SecretService` is misleading. `is_secret_key()` at `:93` uses substring match (`contains("api_key")`) — a key named `send_slack_api_key_enabled` would be falsely treated as a secret.

### C2. No Terminal Command Allowlist (Unchanged)
- **File:** `src/services/terminal.rs:23-80` and `src/terminal/mod.rs`
- Shell commands from LLM output still executed with no allowlist. `powershell.exe` / `bash` accept arbitrary input. Only `cwd` is workspace-validated.

### C3. ReadDocumentTool — No Workspace Bounds (Unchanged)
- **File:** `src/agent/tools/fs_tools.rs:98-158`
- Reads any file on disk with zero workspace validation. Write tools enforce bounds; read tools don't. `risk_level: Medium` is incorrect — should be High/Critical.

### C4. No SSRF Protection in WebFetch (Unchanged)
- **File:** `src/tools/web_fetch.rs:202-213`
- Only checks if URL starts with `http://` or `https://`. No DNS resolution, no private IP blocking. `http://169.254.169.254/latest/meta-data/` passes validation. `nine_router_fetch_fallback` delegates to a third-party service, bypassing local controls.

### C5. `std::sync::RwLock` in Async Context (Unchanged)
- **Files:** `llm/openai_compat/mod.rs:77,87`, `stream.rs:306`, `models.rs:24`, `llm/lmstudio/mod.rs:23`, `terminal/mod.rs:16`
- `.read().unwrap()` and `.write().unwrap()` called from async functions. Poisons on panic, blocks runtime workers on contention. Replace with `tokio::sync::RwLock`.

### C6. Quad Tool Registry — Now 4 Abstractions
- **Files:** `agent/tools/mod.rs` (v1 `AgentTool`), `tools/mod.rs` (v2 `Tool`), `tools/manager.rs` (ToolManager bridge), `services/tool.rs` (ToolService wrapper)
- **Worsened**: The new `ToolService` added a 4th tool abstraction without removing any of the 3 existing ones. v1 registry: 28 tools via progressive loading. v2 registry: 8 tools. ToolManager: lists both. ToolService: wraps v2 + SecurityService but is **only used by MCP server** — the main agent Runner bypasses it entirely for direct registry access.
- **4 dead AgentTool modules** declared but never instantiated: `handoff_tools.rs`, `info_tools.rs`, `map_tools.rs`, `search_tools.rs`
- **2 dead progressive metadata** entries (`activate_space_observatory`, `deep_space_query`) have no factory

---

## HIGH (15 findings)

### Security (H1-H3)

#### H1. Credential Leakage in Error Logs (Unchanged)
- **Files:** `llm/anthropic.rs:591`, `llm/ollama.rs:260`
- Full HTTP response bodies logged at ERROR level. New `logging.rs` init sets up file logging globally but has no tracing layer for automatic credential redaction.

#### H2. MCP Server — Localhost but No Auth
- **File:** `mcp/server.rs:39`
- Binding fixed to `127.0.0.1:8989` (was `0.0.0.0`). But still **zero authentication** — any local process can POST `/mcp` to execute tools. No CSRF token, no API key, no origin check.

#### H3. unsafe impl Send/Sync with Incomplete Safety Docs (Unchanged)
- **File:** `services/tts_service/mod.rs:20-21`
- `unsafe impl Send for AudioHandle {}` + `unsafe impl Sync` — doesn't document invariants for Windows WASAPI thread affinity.

### Architecture & Dead Code (H4-H10)

#### H4. `agent/booster.rs` — 523 Lines Dead Code
- Zero production callers. `agent/mod.rs:26` re-exports with `#[allow(unused_imports)]` suppressing the dead-code warning.

#### H5. `AppState.settings` — Zombie HashMap Field
- **File:** `commands/mod.rs:112`
- `Arc<RwLock<HashMap<String, String>>>` initialized empty, never populated, never synced with `SettingsService`. Dead field causing confusion.

#### H6. ToolService Underutilized
- **File:** `services/tool.rs` (446 lines, well-designed)
- Only used by `mcp/server.rs`. The main agent Runner and `chat/service.rs` bypass it for direct v1/v2 registry access. Security/audit wrapper exists but is an empty shell for the hot path.

#### H7. SecurityService Only Partially Enforced
- **File:** `services/security.rs:34-39`
- Defines 8 `PrivilegedOperation` variants but only 3 are checked: `McpToolCall`, `SecretRead`, `SecretWrite`. `ShellCommand`, `FileRead`, `FileWrite`, `NetworkFetch`, `UntrustedRender` are defined but never enforced at call sites.

#### H8. Dual PermissionDecision/RiskLevel Enums
- **Files:** `services/security.rs:80-85` vs `tools/permission.rs:44-52`
- Two separate `PermissionDecision` enums, two separate `RiskLevel` enums. `ToolService::map_tool_risk()` manually converts between them at `services/tool.rs:439-446`.

#### H9. Agent Runner Core Loop — 0 Tests
- **File:** `agent/runner/loop.rs` (1,115 lines)
- The most critical function in the codebase (`Runner::run()`) has zero tests. No mocked LLM responses, no integration tests for the streaming pipeline.

#### H10. `chat/service.rs` Possibly Dead
- Exports `ChatService` but `commands/chat.rs` imports `Runner` directly, not `ChatService`. May be an unused module.

### Performance (H11-H15)

#### H11. `block_on()` Startup — Still Blocking (Unchanged)
- **File:** `lib.rs:35-176`
- All DB, speech, TTS, RAG, Ollama, orchestrator init still in a single `block_on()`.

#### H12. 28 `reqwest::Client` Creation Sites — No Shared Client
- 28 `.rs` files each create their own `reqwest::Client`. No connection pooling reuse. New services don't add more but don't fix existing.

#### H13. Swarm Spawns ALL Tasks Concurrently — No Semaphore
- **File:** `agent/swarm.rs:367`
- `execute_tasks_concurrent()` spawns a `tokio::spawn` for every assignment with no concurrency limit.

#### H14. EventBus Double Serialization
- **File:** `agent/event_bus.rs:618,629`
- `serde_json::to_value()` per payload struct, then `app.emit()` serializes again. Broadcast channel at capacity 256 may drop events.

#### H15. TTS `std::thread::sleep` + `block_on` Anti-Pattern
- **File:** `services/tts_service/mod.rs:199-266`
- `std::thread::spawn` + `rt.block_on()` to call async process manager. `std::thread::sleep(duration_ms)` to estimate audio playback.

---

## MEDIUM (20 findings)

### Security & Safety
- M16: `workspace.rs:24-28` — TOCTOU race in path validation still present
- M17: `mcp/server.rs:357,443` — `.unwrap()` panics on serialization failure
- M18: `secret.rs:93` — `is_secret_key()` substring match too broad (false positives)
- M19: `db/mod.rs:182-211` — multi-statement migration may silently fail (only first statement executed)

### Architecture
- M20: `agent/mod.rs:25-51` — blanket `#[allow(unused_imports)]` on 13 re-exports
- M21: `agent/agents/mod.rs` — empty comment shell ("no agents currently registered")
- M22: All 16 modules in `lib.rs` are `pub mod` — should be `pub(crate)`
- M23: `search/` module exists only to re-export one tool (vestigial)
- M24: `services/process_manager.rs` + `services/terminal.rs` — overlapping process management

### Performance
- M25: `agent/cache.rs:89` — `cleanup_expired()` Vec alloc + individual remove instead of `retain()`
- M26: `agent/task_queue.rs:123` — O(n) scan for `pop_next()` (should be BinaryHeap)
- M27: `rag/session_memory.rs:45` — `Vec<MemoryEntry>` per session grows unbounded
- M28: `services/speech_service/mod.rs:563,580` — WAV write-to-disk-then-read-back double I/O
- M29: `db/mod.rs:21` — connection pool still `max_connections(5)` (too low)
- M30: `db/mod.rs:71-519` — 14+ `ALTER TABLE` statements every startup (schema versioning needed)
- M31: `Cargo.toml` — `tracing` lacks `release_max_level_info`; `candle-*` not feature-gated
- M32: `services/tool.rs:70-75` — write lock on global registry held during entire tool execution
- M33: `agent/swarm.rs:375,788` — large `.clone()` of full agent/task maps in hot paths

### Frontend (re-scanned)
- M34: **BLOCKER** — `useUIStore` + `useSettingsStore` both track `activeModel`/`activeProvider`/`theme`. Two `useTheme.ts` implementations conflict over `document.documentElement.classList`.
- M35: **BLOCKER** — `taskStore.ts:47-121` — 8 `listen()` calls with discarded `UnlistenFn` values. Never cleaned up.
- M36: **BLOCKER** — No root-level React error boundary. Crashes to white screen.
- M37: MAJOR — Duplicate `chart.js`+`recharts`, `highlight.js`+`prismjs` still in `package.json`
- M38: MAJOR — `vite.config.ts` has no `manualChunks` for cesium/three/monaco
- M39: MAJOR — `CesiumMapRenderer.tsx` still 1332 lines (not split)
- M40: MAJOR — `any` usage worsened to 169 occurrences (up from ~100)
- M41: MAJOR — Duplicate `useOverflow.ts` (identical copies), conflicting `useTheme.ts`
- M42: MINOR — 15 stores, no consolidation; premium cards still `{ data: any }`

---

## New Files Assessment

### `services/secret.rs` (133 lines)
**Grade: D.** Provides audit logging (good) and a placeholder-write filter (good), but the core requirement — encrypting credentials at rest — is completely absent. Misleading name. `is_secret_key()` has false positives.

### `services/security.rs` (151 lines)
**Grade: C.** Clean policy engine design. Types are well-defined. But only enforced in 3 of 8 operation variants. Must be wired into terminal, file tools, and web fetch to be effective.

### `services/logging.rs` (40 lines)
**Grade: B.** Simple, functional. Daily rolling file appender. Lacks credential redaction layer and console output in debug mode. Used globally — good.

### `services/tool.rs` (446 lines)
**Grade: B.** Well-designed execution boundary with security integration and approval UI flow. Biggest problem: nobody uses it except MCP. The main agent Runner bypasses it entirely.

---

## Risk Summary

| Area | Critical | High | Medium | Changed Since v1 |
|------|----------|------|--------|------------------|
| Security | 4 | 3 | 4 | 2 resolved, 1 downgraded |
| Architecture / Dead Code | 1 | 6 | 5 | 4 new infra files, no cleanup |
| Performance / Concurrency | 1 | 4 | 9 | LIMIT fixed, 1 new issue |
| Frontend | 3 | 5 | 2 | some minor improvements |
| **TOTAL** | **9** | **18** | **20** | **Net: +1** (new files added scaffolding without removing old issues) |

---

## Verdict: Attempting Repair, But Without a Cleanup Cycle

The 4 new services files show intent to address previous audit findings. However:
- **secret.rs** adds logging without encryption — the hard part remains undone
- **security.rs** defines policies without enforcing them — the hard part remains undone  
- **tool.rs** creates a clean execution boundary that nobody uses — a bridge to nowhere
- **logging.rs** works but doesn't solve the credential leakage in existing error logs

The codebase has **grown more complex** (4th tool abstraction, 2nd PermissionDecision enum, zombie AppState field) without removing any existing technical debt. The dual registry is now a quadruple registry.

**Recommendation:** Stop adding infrastructure wrappers. Do a dedicated cleanup cycle:
1. Pick ONE tool registry and migrate everything to it
2. Encrypt API keys with OS keychain (not a wrapper around plaintext SQLite)
3. Wire SecurityService into all `PrivilegedOperation` variants at the call sites
4. Add a one-line `resolve_workspace_path()` call to ReadDocumentTool
5. Replace all `std::sync::RwLock` with `tokio::sync::RwLock`
6. Create one shared `reqwest::Client`
7. Add command allowlist to terminal
8. Add DNS/IP validation to web_fetch
9. Decompose `block_on` init into parallel spawns

These 9 items are all <50 line changes each. The fixes are straightforward — the accumulation of unaddressed findings is the real problem.
