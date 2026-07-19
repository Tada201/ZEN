# Tool Registry v2 Migration Plan

> **Goal:** Migrate every remaining `AgentTool` (v1) implementation to the `Tool` (v2) trait, remove the dual-registry bridge, and make `ToolRegistry` the single source of truth for tool discovery, permission, and execution.

---

## 1. Current State

### 1.1 Two co-existing traits

| v1 `AgentTool` | v2 `Tool` |
|---|---|
| `src-tauri/src/agent/tools/mod.rs` | `src-tauri/src/tools/mod.rs` |
| `id()` | `name()` |
| `description()` | `description()` |
| `input_schema()` | `parameters_schema()` |
| `run(app, chat_id, input, depth, allowed_tools, token)` | `execute(app, chat_id, args)` |
| `timeout_seconds()` | implicit / caller-managed |

### 1.2 Bridge code that must disappear

- `ToolRegistry::legacy_tools` (`src-tauri/src/tools/mod.rs`)
- `ToolRegistry::register_legacy_tool`
- `ToolRegistry::get_legacy`
- `ToolManager` holding both `v1: Arc<RwLock<V1ToolRegistry>>` and `v2: GlobalToolRegistry`
- `ToolManager::sync_legacy_tool_definitions`
- `commands/mod.rs` building a v1 registry and copying tools into v2
- `services/tool.rs` accepting `Option<Arc<dyn AgentTool>>` in `AgentToolParams`

### 1.3 Tools still on v1

Files containing `impl AgentTool for …`:

- `src-tauri/src/agent/tools/fs_tools.rs` — `ListDocumentsTool`, `ReadDocumentTool`, `GrepDocumentsTool`, `WriteFileTool`, `EditFileTool`, plus `ApplyPatchTool` adapter
- `src-tauri/src/agent/tools/spawn_tools.rs` — `SpawnAgentTool`
- `src-tauri/src/agent/tools/terminal_tools.rs` — `RunCommandTool`
- `src-tauri/src/agent/tools/drawing_tools.rs` — `DrawTool`
- `src-tauri/src/agent/tools/geofence_tools.rs` — `CreateGeofenceTool`
- `src-tauri/src/agent/tools/graph_session.rs` — `GraphSessionTool`
- `src-tauri/src/agent/tools/handoff_tools.rs` — `HandoffTool`
- `src-tauri/src/agent/tools/map_tools.rs` — `MapTool`
- `src-tauri/src/agent/tools/osint_tools.rs` — `EarthquakeTool`, `WeatherTool`, `MilitaryTrackingTool`
- `src-tauri/src/agent/tools/routing_tools.rs` — `RouteTool`, `GeocodeTool`, `ReverseGeocodeTool`
- `src-tauri/src/agent/tools/session_memory_tools.rs` — `WriteToMemoryTool`, `SearchSessionMemoryTool`, `GetMemoryStatsTool`
- `src-tauri/src/agent/tools/skill_tool.rs` — `SkillTool`
- `src-tauri/src/agent/tools/system_tools.rs` — `SystemMetricsTool`
- `src-tauri/src/agent/tools/task_tools.rs` — `WriteTodosTool`
- `src-tauri/src/agent/tools/search_tools.rs` — `VectorSearchTool`
- `src-tauri/src/agent/tools/progressive.rs` — `ProgressiveToolRegistry`
- `src-tauri/src/agent/tools/progressive/discovery.rs` — `ToolsSearchTool`, `ListToolsStandalone`
- `src-tauri/src/agent/tools/progressive/guidance.rs` — `GuidanceTool`
- `src-tauri/src/agent/tools/progressive/vector_search.rs` — `VectorSearchStandalone`
- `src-tauri/src/agent/tools/delegate_to_agent.rs` — `DelegateToAgentTool`
- `src-tauri/src/agent/tools/manage_board.rs` — `ManageBoardTool`
- `src-tauri/src/search/tool.rs` — `WebSearchTool`
- `src-tauri/src/tools/web_fetch.rs` — `WebFetchTool`

Some of these already have a v2 `Tool` implementation in `src-tauri/src/tools/` (e.g., `RunCommandTool`, `WebFetchTool`, `SystemMetricsTool`, `WebSearchTool`, file-system tools). Those only need their v1 `AgentTool` impl removed and callers updated.

---

## 2. Migration Priority

### Phase A — Foundation (must happen first)

1. Unify execution context (depth, allowed_tools, cancellation token).
2. Introduce a v2 adapter for the few tools that are hard to migrate immediately.
3. Make `ToolRegistry` the single registry.
4. Update `ToolManager` to own only v2.
5. Update `commands/mod.rs` initialization.

### Phase B — Core built-ins (high value, low risk)

- `calculator`
- `SystemMetricsTool`
- `RunCommandTool`
- file-system tools (`ListDocumentsTool`, `ReadDocumentTool`, `GrepDocumentsTool`, `WriteFileTool`, `EditFileTool`, `ApplyPatchTool`, `VectorSearchTool`)
- `WebFetchTool`
- `WebSearchTool`
- `ImageGenerationTool`
- `ActivateOperationalMapTool`

These already have v2 implementations or are simple wrappers.

### Phase C — Agent-centric tools (medium risk)

- `SpawnAgentTool`
- `DelegateToAgentTool`
- `HandoffTool`
- `SkillTool`
- `WriteTodosTool`
- `ManageBoardTool`

### Phase D — Domain tools (low churn, can be migrated in parallel)

- Drawing: `DrawTool`
- Maps/Geofence/Routing: `MapTool`, `CreateGeofenceTool`, `RouteTool`, `GeocodeTool`, `ReverseGeocodeTool`
- OSINT: `WeatherTool`, `EarthquakeTool`, `MilitaryTrackingTool`
- Memory: `WriteToMemoryTool`, `SearchSessionMemoryTool`, `GetMemoryStatsTool`
- Graph: `GraphSessionTool`

### Phase E — Progressive / meta-tools (last)

- `ProgressiveToolRegistry`
- `ToolsSearchTool`
- `ListToolsStandalone`
- `GuidanceTool`
- `VectorSearchStandalone`

These are the most entangled with v1 discovery. Once the rest of the system is on v2, the progressive loader can be re-implemented as a v2 plugin loader rather than a v1 registry.

---

## 3. Required Trait / Registry Changes

### 3.1 Extend v2 `Tool` trait with execution context

The v1 `run()` signature carries `depth`, `allowed_tools`, and `token`. The v2 `execute()` signature does not. Add an optional execution-context object so v2 tools can receive the same runtime data without breaking existing v2 tools.

```rust
// src-tauri/src/tools/mod.rs
pub struct ToolExecutionContext {
    pub depth: u32,
    pub allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
    pub token: CancellationToken,
}

#[async_trait]
pub trait Tool: Send + Sync {
    // ... existing methods ...

    async fn execute(
        &self,
        app: AppHandle,
        chat_id: String,
        args: serde_json::Value,
        ctx: Option<ToolExecutionContext>,
    ) -> Result<ToolOutput, ToolError>;
}
```

Provide a default implementation or helper so simple tools can ignore the context.

### 3.2 Remove legacy bridge fields from `ToolRegistry`

Delete from `src-tauri/src/tools/mod.rs`:

- `legacy_tools: HashMap<String, Arc<dyn crate::agent::tools::AgentTool>>`
- `register_legacy_tool`
- `get_legacy`
- Any `AgentTool`-only code paths in `list()`, `list_definitions()`, `check_permission()`, `validate_arguments()`

Keep `known_tool_risks` and `known_tool_definitions` for external MCP tools only.

### 3.3 Introduce a temporary v1→v2 adapter (optional safety net)

For tools that cannot be migrated immediately, provide an adapter:

```rust
// src-tauri/src/tools/adapter.rs
pub struct AgentToolAdapter<T: crate::agent::tools::AgentTool> {
    inner: T,
}

#[async_trait]
impl<T: crate::agent::tools::AgentTool + 'static> Tool for AgentToolAdapter<T> {
    fn name(&self) -> &str { self.inner.id() }
    fn description(&self) -> &str { self.inner.description() }
    fn parameters_schema(&self) -> serde_json::Value { self.inner.input_schema() }

    async fn execute(
        &self,
        app: AppHandle,
        chat_id: String,
        args: serde_json::Value,
        ctx: Option<ToolExecutionContext>,
    ) -> Result<ToolOutput, ToolError> {
        let token = ctx.map(|c| c.token).unwrap_or_default();
        let allowed_tools = ctx.map(|c| c.allowed_tools).unwrap_or_default();
        let result = self.inner.run(app, chat_id, args, 0, allowed_tools, token).await;
        result
            .map(|v| ToolOutput { content: v, metadata: None })
            .map_err(|e| ToolError::ExecutionFailed { message: e.to_string() })
    }
}
```

This adapter lets the migration proceed tool-by-tool without ever needing the dual registry.

---

## 4. Step-by-Step Tool Migration

### 4.1 Filesystem tools (`src-tauri/src/tools/fs_tools/`)

Current v2 implementations exist for `VectorSearchTool`, `ListDocumentsTool`, `ReadDocumentTool`, `GrepDocumentsTool`, `WriteFileTool`, `EditFileTool`, `ApplyPatchTool`.

Actions:

1. Verify each v2 tool implements `Tool` correctly.
2. Delete the corresponding `impl AgentTool for …` blocks in `src-tauri/src/agent/tools/fs_tools.rs`.
3. Move any logic that only exists in the v1 impl into the v2 impl.
4. Update `init_tool_registry` to register the v2 structs (already done for most).
5. Remove `register_known_tool` entries for these tools from `init_tool_registry`.

### 4.2 Terminal tool (`src-tauri/src/tools/terminal_tools.rs`)

Actions:

1. Confirm `RunCommandTool` v2 impl is complete.
2. Delete `impl AgentTool for RunCommandTool` in `src-tauri/src/agent/tools/terminal_tools.rs`.
3. Remove `register_known_tool("run_command", …)` from `init_tool_registry`.

### 4.3 Web tools

- `WebFetchTool` in `src-tauri/src/tools/web_fetch.rs` already has a v2 impl; remove its `AgentTool` impl.
- `WebSearchTool` in `src-tauri/src/search/tool.rs` already has a v2 impl; remove its `AgentTool` impl.
- Remove `register_known_tool` entries.

### 4.4 System / calculator / image / map activation

- `SystemMetricsTool` v2 exists; remove v1 impl.
- `CalculatorTool` v2 exists.
- `ImageGenerationTool` v2 exists.
- `ActivateOperationalMapTool` v2 exists.
- Remove `register_known_tool` entries.

### 4.5 Spawn / delegate / handoff / skill / task / manage_board

These tools depend on `tool_registry: Arc<RwLock<ToolRegistry>>` (v1) and `permissions: GlobalToolRegistry`.

Actions:

1. Refactor each tool to depend only on `GlobalToolRegistry` (v2) and the app handle.
2. Replace internal calls to v1 registry with v2 registry calls.
3. Implement `Tool` trait in the same file or in a new `src-tauri/src/tools/` module.
4. Delete the `impl AgentTool for …` block.
5. Register the new v2 tool in `init_tool_registry`.

Example for `SpawnAgentTool`:

```rust
// src-tauri/src/tools/spawn_tool.rs
pub struct SpawnAgentTool {
    permissions: GlobalToolRegistry,
}

#[async_trait]
impl Tool for SpawnAgentTool {
    fn name(&self) -> &str { "spawn_agent" }
    fn description(&self) -> &str { "Spawn a child agent to work on a task." }
    fn parameters_schema(&self) -> serde_json::Value { /* existing schema */ }
    fn risk_level(&self) -> RiskLevel { RiskLevel::High }

    async fn execute(&self, app: AppHandle, chat_id: String, args: serde_json::Value, _ctx: Option<ToolExecutionContext>) -> Result<ToolOutput, ToolError> {
        // existing spawn logic, using self.permissions if needed
    }
}
```

### 4.6 Maps / geofence / routing / OSINT / drawing / memory / graph

Follow the same pattern:

1. Move struct and logic to `src-tauri/src/tools/` (or keep in `src-tauri/src/agent/tools/` if domain-specific).
2. Implement `Tool`.
3. Delete `AgentTool` impl.
4. Register in `init_tool_registry`.

### 4.7 Progressive / meta-tools

The progressive registry is a v1 concept. After Phase B–D, re-implement it as a v2 plugin loader:

1. `ProgressiveToolRegistry` becomes a v2 `Tool` that loads other v2 tools on demand.
2. `tools_search`, `list_tools`, `guidance`, `vector_search` become regular v2 tools.
3. The factory pattern (`tool_factory`) is replaced by direct v2 registration or a lazy loader that returns `Arc<dyn Tool>`.

---

## 5. Runner / Dispatch Updates

### 5.1 `services/tool.rs`

- Remove `AgentToolParams::tool: Option<Arc<dyn AgentTool>>`.
- Replace the legacy execution path with a single v2 path:
  - Build `ToolCall` from the incoming request.
  - Call `registry.execute_with_permission(app, chat_id, tool_call).await`.
- Pass `ToolExecutionContext` when invoking tools that need depth/allowed_tools/token.

### 5.2 `agent/runner/tool_dispatch.rs`

- Remove any branch that resolves a tool from the v1 registry.
- Use `GlobalToolRegistry` exclusively.
- Build `ToolCall` and call `check_permission` / `execute_authorized`.

### 5.3 `agent/runner/tool_pipeline.rs`

- Ensure the pipeline emits the same events (`tool:start`, `tool:complete`, etc.) using v2 results.
- Map `ToolError` variants to the existing event payloads.

---

## 6. ToolManager & Registry Initialization

### 6.1 `ToolManager`

Change from:

```rust
pub struct ToolManager {
    v1: Arc<RwLock<V1ToolRegistry>>,
    v2: GlobalToolRegistry,
    permissions: RwLock<ToolPermissions>,
}
```

To:

```rust
pub struct ToolManager {
    registry: GlobalToolRegistry,
    permissions: RwLock<ToolPermissions>,
}
```

- Delete `sync_legacy_tool_definitions`.
- Update `list_allowed`, `list_metadata`, `get_info`, `exists`, and `resolve_tool_exec` to read from the single v2 registry.
- Keep progressive discovery by querying a lazy-loader plugin if still needed, or remove it if all tools are registered eagerly.

### 6.2 `commands/mod.rs`

- Remove construction of `ProgressiveToolRegistry` + v1 `ToolRegistry`.
- Build only the v2 `ToolRegistry` via `init_tool_registry(permissions)`.
- Remove the loop that calls `register_legacy_tool`.
- Update `AppState` to store only `tools: GlobalToolRegistry` (remove `tool_registry_v1`).
- Update all command handlers that read `state.tool_registry_v1` to use `state.tools`.

### 6.3 `agent/orchestrator/mod.rs`, `agent/runner/lifecycle.rs`, `agent/tools/child_runner.rs`

- Remove `tool_registry: Arc<RwLock<ToolRegistry>>` (v1) fields.
- Use `permissions: GlobalToolRegistry` or `tools: GlobalToolRegistry` instead.

---

## 7. Frontend / API Impact

### 7.1 API types

- `src/api/toolsApi.ts` already talks to the v2 manager; no change expected.
- `src/api/events.ts` tool event payloads remain the same.

### 7.2 Meta-tools

The frontend and LLM still see `tool_list`, `tool_info`, `tool_exec`. These are implemented in `ToolManager::meta_tool_definitions` and do not need to change unless the progressive loader is removed.

### 7.3 Settings

- `ToolsSettings.tsx` reads tool metadata from `ToolManager::list_metadata`. No change needed as long as the manager API is stable.

---

## 8. Testing Strategy

### 8.1 Existing verifiers

Run and update:

- `test/verify-tool-system-final-hardening.mjs`
- `test/verify-tool-contract-hardening.mjs`
- `test/verify-tool-approval-hardening.mjs`

### 8.2 New verifiers to add

- `test/verify-tool-registry-v2-only.mjs`
  - Assert no `AgentTool` impl remains.
  - Assert `ToolManager` does not expose v1 registry.
  - Assert every tool in `init_tool_registry` is registered as a v2 `Tool`.

### 8.3 Rust tests

- Update `src-tauri/src/services/tool.rs` unit tests to use v2 `ToolCall`.
- Update `src-tauri/src/tools/manager.rs` tests to construct only a v2 registry.
- Add integration test in `src-tauri/tests/` that exercises each migrated tool through the v2 registry.

### 8.4 Build checks

```bash
cd src-tauri
cargo check
cargo test --lib tools
cargo test --lib services::tool
```

---

## 9. Rollback / Safety

1. **Feature flag:** Keep a compile-time feature `legacy-agent-tools` that re-enables the v1 registry and bridge for one release.
2. **Adapter fallback:** Use `AgentToolAdapter` for any tool that cannot be migrated in a single PR.
3. **Staged PRs:** One PR per tool family. Do not merge the bridge-removal PR until all tools are migrated.
4. **Canary tests:** Run the full verifier suite on each PR.

---

## 10. Definition of Done

- [ ] No `impl AgentTool for` blocks remain outside of tests.
- [ ] `src-tauri/src/agent/tools/mod.rs` is deleted or reduced to shared helpers.
- [ ] `ToolRegistry` has no `legacy_tools`, `register_legacy_tool`, or `get_legacy`.
- [ ] `ToolManager` owns only the v2 registry.
- [ ] `AppState` has no `tool_registry_v1`.
- [ ] `commands/mod.rs` builds only the v2 registry.
- [ ] All existing tool verifiers pass.
- [ ] New `verify-tool-registry-v2-only.mjs` verifier passes.
- [ ] `cargo check` and `cargo test --lib` pass.
