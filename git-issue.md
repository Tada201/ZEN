# Uncommitted Git Changes Review Report

> Generated: 2026-07-19
> Scope: Full working-tree review (staged + unstaged + untracked)
> Diff Stats: 150 files changed, +7,306 / -10,572 lines
> Build Status: `cargo check` passes with warnings; `npx tsc --noEmit` passes

---

## 1. Executive Summary

The working tree contains a very large, high-risk refactor spanning the Rust backend (`src-tauri`) and the TypeScript frontend (`src`). The changes move the project from an internal MCP **server** model to an MCP **client** model, delete the monolithic chat command handler in favor of a modular directory, remove agent-config file support, add a skills/media/context-viewer subsystem, and overhaul the chat timeline UI.

**Overall health:** Type-checking and Rust compilation succeed, but the repository is in a fragile partial-staging state. Several critical files are untracked while their old counterparts have been deleted, which means a naive `git commit` would drop core functionality.

---

## 2. Critical Issues (Blockers)

### 2.1 Untracked Replacement for Deleted `src-tauri/src/commands/chat.rs`

- **What changed:** `src-tauri/src/commands/chat.rs` is deleted (-1,222 lines). A new directory `src-tauri/src/commands/chat/` exists on disk but is **untracked**.
- **Risk:** If the user commits the current index, every chat command (`create_chat`, `send_message`, `delete_chat`, etc.) disappears. The app will fail to register most chat commands and will not compile once the deleted file is actually gone from the tree.
- **Evidence:**
  - `git status` shows ` D src-tauri/src/commands/chat.rs` and `?? src-tauri/src/commands/chat/`.
  - `src-tauri/src/commands/chat/` contains: `mod.rs`, `archive.rs`, `crud.rs`, `folders.rs`, `helpers.rs`, `lifecycle.rs`, `send.rs`, `tags.rs`, `title.rs`.
- **Action required:** Stage the new `src-tauri/src/commands/chat/` directory and verify all command registrations in `src-tauri/src/lib.rs` still resolve.

### 2.2 Large Number of Untracked New Files

- **What changed:** 75 files are currently untracked.
- **Risk:** Many of these files are required for the refactor to function (new command modules, agent tools, UI components, tests). Leaving them untracked means the commit is incomplete and the build state is misleading.
- **Notable untracked groups:**
  - `src-tauri/src/commands/chat/` (entire chat command replacement)
  - `src-tauri/src/agent/prompt_safety.rs`, `skills.rs`, `tools/handoff_context.rs`, `tools/skill_tool.rs`
  - `src-tauri/src/commands/context_viewer.rs`, `media.rs`, `skills.rs`
  - `src-tauri/src/services/media.rs`
  - `src-tauri/src/mcp/client.rs`
  - `src-tauri/src/tools/patch_parser.rs`
  - `src-tauri/src/utils/` (replaces deleted `utils.rs`)
  - New frontend components under `src/atlas/components/chat/`, `src/components/widgets/orchestrator/`, `src/components/settings/Tabs/plugins/MCPExternalServers.tsx`
  - New test verifiers and SSOT helpers
- **Action required:** Review each untracked file, stage the intentional ones, and add any generated/irrelevant files to `.gitignore`.

### 2.3 MCP Architecture Shift Without Full IPC Audit

- **What changed:** The internal MCP server (`src-tauri/src/mcp/http.rs`, `server.rs`, `stdio.rs`) was deleted and replaced by an MCP client (`src-tauri/src/mcp/client.rs`). Four MCP commands were removed from `src-tauri/src/lib.rs`: `mcp_get_status`, `mcp_start_server`, `mcp_stop_server`, `mcp_list_tools`.
- **Risk:** Any frontend code still calling the removed commands will fail at runtime. The API boundary is not type-checked across the Tauri IPC.
- **Evidence:**
  - `src/api/mcpApi.ts` removed `getStatus`, `listTools`, `startServer`, `stopServer`.
  - `src/api/index.ts` no longer exports `McpStatus` or `McpTool`.
- **Action required:** Search the frontend for any remaining references to the removed MCP commands/types and remove or migrate them.

### 2.4 Agent Config Support Removed

- **What changed:** `src-tauri/src/commands/agent_config.rs` and the `src/components/settings/Tabs/agents/*` UI components were deleted. Seven `agent_config` commands were removed from `src-tauri/src/lib.rs`.
- **Risk:** Frontend code that imported `AgentConfig`, `AgentConfigFileData`, `AgentConfigFileInfo`, or `ToolMetadataItem` from `src/api/agentsApi.ts` will break.
- **Evidence:**
  - `src/api/agentsApi.ts` removed those interfaces and related methods.
  - `src/api/index.ts` no longer exports them.
- **Action required:** Verify no remaining imports of the deleted types/methods exist in `src/`.

---

## 3. High-Risk Issues

### 3.1 New `unwrap()` and `expect()` Additions in Rust

- **Count:** 42 new `.unwrap()` calls and 2 new `.expect()` calls in `src-tauri/src/`.
- **Hotspots:**
  - `src-tauri/src/agent/tools/spawn_tools.rs`: 3 unwraps including `DependencyGraph::new(nodes).unwrap()`.
  - `src-tauri/src/agent/runner/loop.rs`: multiple `mw.enrich(&mut ctx).await.unwrap()` in tests and production-adjacent code.
  - `src-tauri/src/llm/`: `provider.list_models().await.unwrap()`.
  - `src-tauri/src/agent/tools/`: `serde_json::from_str(...).unwrap()` and filesystem helpers.
- **Risk:** These can panic on malformed input, network failures, or dependency cycles. In async agent loops, a panic can abort the entire runner.
- **Action required:** Replace with proper `Result` propagation or `match` handling, especially in production paths.

### 3.2 `std::fs` Operations in Tests Without Cleanup Guarantees

- **What changed:** New test code uses `std::fs::create_dir_all`, `std::fs::write`, and `std::fs::remove_dir_all` chained with `.unwrap()` or `.ok()`.
- **Risk:** Tests may leave temporary directories behind or fail non-deterministically on Windows path handling.
- **Action required:** Use `tempfile` crate or ensure `Drop`/cleanup guards.

### 3.3 `eprintln!` Added for `MediaService` Setup Failure

- **Location:** `src-tauri/src/llm/openai_compat/stream.rs` (or initialization path).
- **What:** `eprintln!("Warning: MediaService setup failed: {}. Wallpaper features will be unavailable until restart.", e);`
- **Risk:** Direct stderr printing bypasses the app's logging/tracing infrastructure and may leak in release builds.
- **Action required:** Replace with `tracing::warn!`.

### 3.4 `cargo check` Warnings

- `serde::Deserialize` unused import in `src-tauri/src/commands/chat/helpers.rs`.
- Unused field `drift_detection_enabled` in `MemoryRunSettings` (`src-tauri/src/agent/runner/memory_bootstrap.rs`).
- Future incompatibility warning from `nom` 1.2.4.
- **Action required:** Clean up the first two; evaluate the `nom` warning for upgrade path.

---

## 4. Medium-Risk Issues

### 4.1 Frontend API Contract Changes

- `SendMessageRequest` gained `modelContextWindow?: number | null`.
- `chatApi` gained `generateSessionTitle`.
- `toolsApi` removed `setYoloMode`.
- **Risk:** Callers that do not pass `modelContextWindow` should be fine (optional), but any code still importing `setYoloMode` will fail.
- **Action required:** Search for `setYoloMode` usage and migrate to the new permission-mode setting.

### 4.2 Settings Store Schema Changes

- Added: `toolPermissionMode`, `agentTokenBudget`, `compactMode`, `optimizedVideos`, `titleMaker*` fields.
- Removed: `agentConfigs` from provider slice, `voiceDisplayAgentBoardMemoryLimit`.
- **Risk:** Existing persisted settings may not map cleanly; migration logic should be verified.
- **Action required:** Confirm `settingsBridge.ts` and `settingsMapper.ts` handle missing/legacy keys.

### 4.3 New `FileReadTracker` and Stale-Read Logic

- **What changed:** `src-tauri/src/agent/runner/loop.rs` now tracks file modification times and injects stale-read warnings.
- **Risk:** If mtime resolution is coarse or files are on network drives, false positives could bloat the context window.
- **Action required:** Add tests for stale-read detection and verify it does not trigger on identical content.

### 4.4 Context Breakdown Cache Locking

- **What changed:** `Runner::run()` writes to `state.context_breakdown_cache.write().await`.
- **Risk:** Holding a write lock while doing I/O or LLM work could block other tasks.
- **Action required:** Ensure the lock is held only long enough to insert the computed breakdown.

---

## 5. Low-Risk / Code Quality Issues

### 5.1 Debug Print Statement

- See 3.3 above.

### 5.2 Large Number of `.clone()` Additions

- **Count:** 98 new `.clone()` calls in `src-tauri/src/`.
- **Risk:** Mostly acceptable for a refactor of this size, but some clones around conversation buffers could be optimized further (the diff already uses `std::mem::take` in places).
- **Action required:** Spot-review clones in hot paths (`loop.rs`, `spawn_tools.rs`).

### 5.3 Documentation Deletions

- Deleted: `HANDOFF_INSTRUCTIONS.md`, `docs/superpowers/plans/2026-07-01-background-media-video.md`, `docs/superpowers/plans/2026-07-01-right-side-panels-theme-alignment.md`, `docs/superpowers/plans/2026-07-01-wallpaper-display-mode.md`.
- **Risk:** Other docs may still reference these.
- **Action required:** Search for dead references.

### 5.4 `.gitignore` Additions

- Added entries for `.codex/`, `.claude/`, `.freebuff/`, `.specify/`, `.vscode/`, `.zcode/`.
- **Risk:** Fine, but `.specify/` is duplicated.
- **Action required:** Remove duplicate `.specify/` entry.

---

## 6. Verification Checklist

- [ ] Stage `src-tauri/src/commands/chat/` and all other intentional untracked files.
- [ ] Run `cargo test` in `src-tauri`.
- [ ] Run frontend unit/integration tests (`npm test` / `vitest`).
- [ ] Run the full verifier suite (`node test/verify-*.mjs`).
- [ ] Search frontend for removed MCP/agent-config imports.
- [ ] Replace production `.unwrap()` calls with proper error handling.
- [ ] Replace `eprintln!` with `tracing::warn!`.
- [ ] Clean up `cargo check` warnings.
- [ ] Verify Tauri capabilities/allowlist still covers new media and filesystem scopes.
- [ ] Perform a manual end-to-end chat send to confirm IPC boundary is intact.

---

## 7. Summary of Recommended Next Steps

1. **Fix the untracked-file crisis first.** Run `git add src-tauri/src/commands/chat/` and any other required new files, then re-run `cargo check` and `npx tsc --noEmit`.
2. **Audit the Tauri IPC boundary.** Search `src/` for removed command names (`mcp_get_status`, `startServer`, `setYoloMode`, `AgentConfig`, etc.) and migrate or delete callers.
3. **Harden error handling.** Replace the new `.unwrap()` calls in production code, especially in `spawn_tools.rs` and `loop.rs`, and convert the `eprintln!` to a tracing log.
