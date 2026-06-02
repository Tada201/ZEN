# Zen Tool System — Critical Consolidated Review

**Scope:** Full tool system of the Tauri + React AI app at `D:\DATA_VOLUME_D\VScode\GG_ANTIGRAV\ZEN`.
**Method:** Five parallel subagent reviews covering (1) LLM-facing surface, (2) security and permission model, (3) user experience and approval flow, (4) architecture and code health, (5) error handling, audit, and observability. Findings aggregated and ranked below.
**Verdict:** The system is functional but has critical defects that block the LLM, the user, and future work. Tier 1 must be fixed before shipping any new tool; Tier 2 before claiming "production" status.

---

## TIER 1 — LLM-Blocking & Security-Critical (fix first)

### 1. `tool_exec` meta-tool bypasses the per-agent `tool_ids` gate
**Where:** `src-tauri/src/agent/runner/tool_dispatch.rs:32-55`, `src-tauri/src/agent/runner/tool_pipeline.rs:76-86`

**Defect:** `Runner::authorized_tools_for_agent` always returns `meta_tool_definitions()` regardless of the agent's `tool_ids`. `tool_exec` resolves against *any* tool in v1+v2 and dispatches through `execute_agent_tool`, which only consults the v2 `ToolPermissions` — never the agent's `tool_ids`.

**LLM impact:** An agent with `tool_ids: ["web_search"]` can `tool_exec({tool_id: "write_file", ...})` and succeed. The LLM has no model-side rule forbidding it; the runner has no enforcement.

**Fix:** In `tool_pipeline.rs:76-86`, reject `tool_exec` if the resolved `real_id` is not in `authorized_tool_ids`. Audit-log with `operation: PrivilegedOperation::MetaToolExec` and both names.

---

### 2. The "approval modal" is dead code; users see only inline buttons
**Where:** `src/components/Zen/modals/ToolAuthorizationModal.tsx` (192 lines, never imported) vs. real control at `src/atlas/components/chat/AssistantMessageTrace.tsx:391-415`

**Defect:** `grep "import.*ToolAuthorizationModal"` returns zero call sites. The rich modal (risk colors, argument preview, suggested-pattern chips, focus trap) does not exist in the user's view. The real `InlineApprovalControls` is two grey buttons.

**LLM impact:** Every safety affordance the backend carefully builds (risk visualization, always-allow patterns) is invisible. The LLM is operating against a UX that cannot show the user what it intends to do.

**Fix:** Delete the orphan, port its design into `InlineApprovalControls` as a blocking `<Dialog>`. Render risk color, `arguments_preview`, agent identity, and suggested patterns.

---

### 3. `tool_list` advertises ghost v2-only tools that fail at `tool_exec`
**Where:** `src-tauri/src/tools/manager.rs:217-280` (merging), `src-tauri/src/agent/runner/tool_dispatch.rs:230` (v1 lookup)

**Defect:** `ToolManager::list_allowed_matching` merges v1 + v2 metadata. The runner's execution registry is v1 only. So `web_fetch`, `activate_2d_operational_map`, and any future v2-only tool are listed in `tool_list`, but `execute_agent_tool` returns `{"error": "Tool 'web_fetch' not found"}`. The error even tells the LLM to use `handoff_to_agent` — wrong path.

**LLM impact:** A model following the documented `tool_list → tool_info → tool_exec` workflow gets a clean schema, then a confusing failure. Burns 2-3 turns per discovery.

**Fix:** Filter `list_allowed_matching` by tools that exist in the execution registry; or change the runner to dispatch v2-only ids through `ToolService::execute_with_permission`.

---

### 4. `tool_info` returns `risk_level: None` for every tool the LLM will call
**Where:** `src-tauri/src/tools/manager.rs:411-447`, `src-tauri/src/agent/tools/mod.rs:25-44`

**Defect:** `get_info` short-circuits to v1 on hit and returns `risk_level: None, examples: []`. The v2 `ToolDefinition` carries risk; the v2 branch is only hit for v2-only tools. The v1 `AgentTool` trait has no `risk_level` method at all.

**LLM impact:** `run_command` (Critical) looks identical to `geocode_search` (Medium) in `tool_info`. The model cannot prefer low-risk paths, cannot warn before destructive calls, cannot self-correct on user feedback.

**Fix:** Add `fn risk_level(&self) -> RiskLevel` to `AgentTool`; merge v2 `default_tool_risk` lookup (`tools/mod.rs:300-316`) into the v1 short-circuit. Remove the dead `examples` field or wire it up.

---

### 5. `SecurityService::evaluate` is dead code on the actual decision path
**Where:** `src-tauri/src/services/security.rs:34-39`, real logic at `src-tauri/src/tools/permission.rs:78-130`

**Defect:** `SecurityService::evaluate` is a 4-line stub. The real 6-layer permission system lives in `ToolPermissions::from_input`. `ToolService::check_permission` calls the latter directly; `SecurityService::evaluate` is invoked redundantly and its result is overwritten. RULES.md:140 says "all privileged operations pass through SecurityService" — they don't.

**LLM impact:** Indirect, but a reviewer assuming the centralized service is authoritative is wrong. The audit-only `record_audit` is the only durable `SecurityService` output.

**Fix:** Move the 6-layer decision into `SecurityService::evaluate` and have `ToolRegistry::check_permission` delegate; or delete `evaluate` and rename the surviving service.

---

### 6. No audit for the actual tool execution result; only for the permission decision
**Where:** `src-tauri/src/services/tool.rs:425-447` (`execute_v2_authorized`), `:287-423` (`execute_agent_tool`)

**Defect:** Both code paths call `tool.execute(...)` and return its result, but emit no `record_audit` for the outcome. The audit rows that *do* fire all carry `reason: "tool registry allowed execution"`. A `WebFetchTool` that times out, panics, or returns 500 looks identical to a successful call in the log.

**LLM impact:** Indirect for the LLM, but the audit log is the user's only safety net. A user reviewing history cannot tell what actually ran.

**Fix:** Bracket the call in `execute_v2_authorized` with a pre-`record_audit` and a `finally` `record_audit` carrying `outcome: "executed" | "failed" | "timeout" | "cancelled"`.

---

### 7. Every tool audit is bucketed as `McpToolCall` — no forensic distinguishability
**Where:** `src-tauri/src/services/tool.rs:449-459`

**Defect:** `ToolService::audit` hardcodes `operation: PrivilegedOperation::McpToolCall` for every event. The 8-variant `PrivilegedOperation` enum exists (`ShellCommand`, `FileRead`, `FileWrite`, `NetworkFetch`, `SecretRead`, ...) but only `services/secret.rs` and `services/terminal.rs` use the precise values. `WriteFileTool` writing to disk and `WebFetchTool` exfiltrating data are indistinguishable in the audit.

**LLM impact:** The audit log cannot answer "did the agent read a `.env` last week" without parsing `target` and guessing.

**Fix:** Add `map_tool_to_op(name) -> PrivilegedOperation` (`run_command`→`ShellCommand`, `read_*`→`FileRead`, `write_*`→`FileWrite`, `web_*`→`NetworkFetch`). Pass it as a parameter to `audit`.

---

### 8. `session_permissions` "always allow" is broken — read but never written
**Where:** Read: `src-tauri/src/agent/runner/tool_dispatch.rs:308-319`; write path: nowhere (grep confirmed)

**Defect:** The Trusted Patterns button on the modal calls `onApprove(req, pattern)` → `resolve_tool_approval` → `oneshot::Sender<bool>`. The expected `state.session_permissions.lock().await.insert(...)` never executes. The "always allow" affordance is a UI illusion.

**LLM impact:** Combined with #2, every LLM call to a "remembered" tool still prompts. Trains the user to click Allow reflexively (modal-fatigue attack).

**Fix:** In `commands/agent.rs:217-247`, on `approved && pattern`, compute the cache key and insert. Persist to SQLite. Surface the persistence in the UI.

---

### 9. MCP-originated tool calls bypass user confirmation when `global_default: AlwaysAllow`
**Where:** `src-tauri/src/mcp/server.rs:393-414`, `src-tauri/src/services/tool.rs:224-285`

**Defect:** `McpServer::handle_tools_call` routes through `execute_non_interactive`, which is correct only when the decision is `Allow`. With `global_default: AlwaysAllow`, MCP silently runs `run_command` and `write_file` with no prompt and no UI event. The MCP HTTP server has no auth token, no rate limit. Any local process (including browser JS) can hit it.

**LLM impact:** A prompt-injected agent instructs the LLM to call `tool_exec({tool_id: "write_file", ...})` via the localhost MCP server; the LLM is not involved, but the user's machine is.

**Fix:** (a) Floor: `RiskLevel::Critical` always requires `execute_interactive`; (b) per-launch random auth token required on `POST /mcp`; (c) per-IP rate limit (10/min).

---

## TIER 2 — LLM Efficiency & Trust (fix before "production" label)

### 10. System-prompt section is rebuilt and re-sent on every LLM turn
**Where:** `src-tauri/src/agent/middleware.rs:205-275` (enrichment), `src-tauri/src/agent/runner/loop.rs:223-243`

**Defect:** `## Tool System (Deferred Discovery)`, agent roster, UI rules, meta-tool schemas — all static — are appended to `ctx.system_content` every iteration. With `max_iterations: 20` and 12 agents, ~30K-50K extra tokens per chat. Anthropic prompt caching is not enabled.

**LLM impact:** Token cost grows linearly; latency on local models inflates.

**Fix:** Move static block to a one-time `extra_system_messages` slot (populate from `OnceCell<String>`). Enable `cache_control: ephemeral` on Anthropic.

---

### 11. `tool_list` is missing risk + return-shape; forces a second `tool_info` round-trip
**Where:** `src-tauri/src/tools/manager.rs:11-18` (`ToolDescriptor`)

**Defect:** `ToolDescriptor` has no `risk_level` or `returns` summary. The LLM, after `tool_list`, has to call `tool_info` on every candidate to triage.

**LLM impact:** Discovery cost is 2-3x what it should be.

**Fix:** Add `risk_level: Option<String>` and a one-line `returns: String` to `ToolDescriptor`; populate from `default_tool_risk(id)`.

---

### 12. Meta-tool schemas and 12+ real-tool schemas lack `additionalProperties: false`
**Where:** `src-tauri/src/tools/manager.rs:486-535`; real tools: `routing_tools.rs:35-48`, `delegate_to_agent.rs:53-78`, `spawn_tools.rs:58-82`, `web_fetch.rs:279-290`, `osint_tools.rs`, `session_memory_tools.rs`

**Defect:** OpenAI strict mode requires it. The runner silently drops extra fields (`tool_pipeline.rs:25, 42-46`). The LLM has no feedback loop to learn the actual contract.

**LLM impact:** Garbage-in-garbage-out; the model invents fields, the tool ignores them, the model retries.

**Fix:** Add `"additionalProperties": false` to every object schema, including nested objects in `GraphSessionTool`.

---

### 13. `RouteTool` schema is wrong; LLM is set up to fail
**Where:** `src-tauri/src/agent/tools/routing_tools.rs:35-48`

**Defect:** No `required` field, no enum on `profile`, no `oneOf` to model the `origin | (start_lat AND start_lon)` alternative. The tool accepts `{}`; the internal logic requires either form. Invalid profiles silently map to `Car`.

**LLM impact:** A `{}` call errors; an invented `profile: "submarine"` silently becomes `Car`.

**Fix:** Use `oneOf` + `"enum": ["car","walk","bicycle","truck"]` + `"additionalProperties": false`.

---

### 14. Text-mode tool-call format is inconsistent with the meta-tool format
**Where:** `src-tauri/src/agent/middleware.rs:233-235` (system prompt), `src-tauri/src/agent/helpers.rs:180-223` (parser)

**Defect:** When `tools_supported == false`, the LLM is told to emit `{"tool":"TOOL_NAME","args":{}}`. But `tool_exec` requires `{"tool_id": "...", "arguments": {...}}` — a doubly-nested shape the prompt does not show. Three plausible wrong forms are documented; all fail resolution.

**LLM impact:** On every text-mode turn, the LLM is at high risk of producing a `tool_exec` payload that fails to resolve.

**Fix:** Show the correct double-nested shape in the system prompt's text-mode example.

---

### 15. YOLO is a single-click toggle with no confirmation and no persistent indicator
**Where:** `src/atlas/components/chat/input/PlusActionMenu.tsx:139-147` (toggle), `src/components/settings/Tabs/ToolsSettings.tsx:240-262` (settings)

**Defect:** A misclick flips YOLO on; from that moment *every* tool (including Critical) auto-runs. The "Manual" label in `PinnedActionBar.tsx:177-183` only appears when YOLO is **off** — so on-state has no persistent indicator. The warning banner only shows on the settings tab.

**LLM impact:** An LLM running under YOLO has no friction. The user cannot tell YOLO is on.

**Fix:** Add a confirmation `<Dialog>` to enable; add a permanent red pill in the navbar when on; add session/agent scope.

---

### 16. 120-second approval timeout silently auto-denies
**Where:** `src-tauri/src/services/tool.rs:189-201`

**Defect:** Hardcoded `Duration::from_secs(120)`. On timeout, `false` is returned, the pending entry is removed, and the audit says "user denied or timed out" — indistinguishable from an explicit Deny. No Tauri event is emitted to close the modal.

**LLM impact:** The user returns to find a "Failed" card with no explanation. The LLM gets an opaque denial.

**Fix:** Emit `tool:authorization_timeout` event; surface in `ToolCallCard` as a distinct state with a "Re-request" button; make timeout configurable (default 30-60s).

---

### 17. No argument snapshot at approval time ("shadow approval")
**Where:** `src-tauri/src/services/tool.rs:181-187`

**Defect:** Only `tool_call.id` is stored in `pending_approvals`. `arguments_preview` is captured at request time but never compared to the arguments at execution. A `rm -rf ./build` approval can execute `rm -rf /` if the in-memory args were altered.

**LLM impact:** The user's mental model ("I approved *this exact* command") is not enforced.

**Fix:** Store `(tool_call_id, args_hash, args_snapshot, request_ts)`; re-check `args_hash` before execution; abort on mismatch.

---

### 18. Agent identity is invisible in the approval card
**Where:** `src-tauri/src/services/tool.rs:21-30` (context struct) vs `src/atlas/components/chat/AssistantMessageTrace.tsx:391-415` (render)

**Defect:** `ToolApprovalExecutionContext` carries `agent_name`, `parent_agent_id`, `iteration` — but the inline approval shows only the tool name. A sub-agent at iteration 3 writing a file looks like a top-level direct request.

**LLM impact:** The user cannot tell if a delegated mutation is happening.

**Fix:** Render `agentName (iter N)` as the first line; add a per-agent permission matrix.

---

## TIER 3 — Architecture & Test Gaps (block future work)

### 19. v1/v2 trust boundary: v1 tools have no risk declaration
**Where:** `src-tauri/src/agent/tools/mod.rs:25-44`, `src-tauri/src/tools/permission.rs:300-316`

**Defect:** `AgentTool` trait has no `risk_level` method. v1 `WriteFileTool`, `RunCommandTool`, `EditFileTool` default to `RiskLevel::Low` when reached via the v2 check. The v2 `default_tool_risk` table is only consulted for `register_known_tool` entries.

**LLM impact:** A misconfigured or malicious v1 tool can be treated as Low-risk and auto-approved.

**Fix:** Add `fn risk_level(&self) -> RiskLevel` to `AgentTool`; consult v1's declared risk in `ToolService::check_permission` before falling back to the table.

---

### 20. `register_known_tool` phantom tools pollute UI but cannot execute
**Where:** `src-tauri/src/tools/mod.rs:333-366` (33 `register_known_tool` calls)

**Defect:** These are *not* `Tool` impls. The Runner reaches them through v1 only; the user cannot independently invoke them; MCP `tools/call` rejects with "Tool not found"; the settings UI shows toggles that do nothing useful.

**LLM impact:** The LLM sees a tool in `tool_list` and can sometimes call it (via Runner), sometimes not (via MCP). Inconsistent.

**Fix:** Either convert each to a real v2 adapter, or hide them from `list_metadata` unless `tool_registry.get(name).is_some()`.

---

### 21. Three-registry ownership fan-out: Runner, Orchestrator, Swarm, McpServer each hold a different subset
**Where:** `src-tauri/src/agent/runner/lifecycle.rs:51-67`, `src-tauri/src/agent/orchestrator/mod.rs:83-103`, `src-tauri/src/agent/swarm.rs:31-42`, `src-tauri/src/mcp/server.rs:62, 95`

**Defect:** The same component is held in four different combinations. Runner re-fetches `tool_service` from `AppState` 3 times per tool batch via `self.app.state::<AppState>()`. Phase 2 (canonical tool system) is blocked because `ToolService` is invisible to Runner's API.

**LLM impact:** Indirect — but a v2-only fast path (e.g. permission skip for read-only) requires editing every call site, not just `ToolService`.

**Fix:** Add `tool_service: Arc<ToolService>` to `Runner::new` and `Orchestrator::new`; remove the `state()` lookups; make `AppState::tool_service` the only construction point.

---

### 22. Late-bound `McpServer.tool_service` has no compile-time guarantee; DB init failure silently leaves it `None`
**Where:** `src-tauri/src/mcp/server.rs:62, 95, 108-110, 126-130`, `src-tauri/src/lib.rs:64-67, 211`

**Defect:** `McpServer::new` takes `tool_service: Option<...> = None`; `set_tool_service` is called after construction. The init cycle doesn't exist — `AppState` constructs both. A DB init failure at `lib.rs:64-67` early-returns silently, so MCP starts with no service and the only error is "MCP server requires ToolService before startup."

**LLM impact:** MCP-originated tool calls become "service unavailable" with no UX signal.

**Fix:** Make `tool_service` non-optional; construct in `AppState::new`.

---

### 23. `ToolManager::update_permissions` silently drops updates on lock contention
**Where:** `src-tauri/src/tools/manager.rs:123-136`

**Defect:** `try_write` returns `Err` if held. The function `eprintln!`s and returns. `sync_tool_permissions` returns `Ok(())` regardless.

**LLM impact:** User toggles YOLO off, it stays on; next `run_command` is auto-allowed. Classic "settings saved" lie.

**Fix:** Use `tokio::sync::RwLock` with `.write().await`; propagate error to IPC; log via `tracing::error!`.

---

### 24. Zero `#[tracing::instrument]` on the tool path; no `run_id`/`execution_id` in spans
**Where:** `src-tauri/src/services/tool.rs`, `src-tauri/src/services/security.rs`, `src-tauri/src/mcp/`, `src-tauri/src/agent/runner/`

**Defect:** `ToolApprovalExecutionContext` (tool.rs:21-30) carries rich context that is only used in event payloads — never in tracing spans. A developer cannot correlate a `tracing::info!` to a `tool_call_id`.

**LLM impact:** Production incidents are un-diagnosable.

**Fix:** Add `#[tracing::instrument]` to `execute_interactive`, `check_permission`, `request_interactive_approval`, `execute_v2_authorized`, `execute_agent_tool`. `Span::current().record("run_id", &run_id)` once known.

---

### 25. Frontend `mergeToolCall` loses tool input on out-of-order / replayed events
**Where:** `src/atlas/hooks/stream/toolEventReducer.ts:24-51`, `src/atlas/hooks/stream/useToolEvents.ts:101-143`

**Defect:** The `tool:complete` listener constructs `input: {}`. `mergeToolCall` guards against empty inputs, but a `tool:complete` arriving before a `tool:start` (reload mid-tool) creates a `toolCall` with empty `input` and `output: "..."` and a `-1` `findTargetMessageIndex` produces an orphan `tool-ledger-*` system message.

**LLM impact:** The chat history shows a tool that ran with no arguments — confusing for the user, breaks the audit narrative.

**Fix:** Have the backend include `input` in `ToolCompletePayload`; if `targetIdx === -1 && status === "completed"`, queue for late delivery rather than orphan-spawning.

---

### 26. Test coverage gaps block future development
**Where:** `src-tauri/src/services/tool.rs` (2 tests), `src-tauri/src/agent/tools/*` (zero), `src-tauri/src/mcp/server.rs` (1)

**Defect:** No test for: MCP-originated `WriteFileTool`, sub-agent escalation, YOLO mode, hook-modified args, `session_permissions` write path, 9Router fallback, v1 tool risk drift, `tool_exec` triggering permission check, 120s timeout, audit ordering.

**LLM impact:** Future bug fixes cannot be regression-tested; the "implementing a tool" checklist is unverifiable.

**Fix:** Add the 10+ tests listed for v1/v2 trust boundary, MCP, runner, and audit.

---

## Cross-Cutting Themes

1. **The LLM-facing surface and the user-facing surface both fail at the same point: the contract.** The system-prompt says `tool_list → tool_info → tool_exec`; the runner does not honor that contract (v1 vs v2 split, ghost tools, dead modal). The system-prompt says risk is visible; `tool_info` returns `None`. The system-prompt says the LLM cannot call real tools directly; the runner allows it. **The fix for ~40% of findings is a single refactor: make the meta-tool surface the source of truth, route v1 lookups through v2 for tools that exist in both, and expose `risk_level` on every `ToolSchema`.**

2. **The audit log is a forensic dead-end.** Two sources of drift (schema duplication, operation bucketing) and one missing read API (no Tauri command for `list_audit_events`) mean the user cannot investigate incidents. This is the single highest-trust-impact defect.

3. **The security model is correct in two places and broken in one.** `ToolPermissions::from_input` (6-layer) is well-designed; `HARDCODED_SECURITY_RULES` is well-tested; but `SecurityService::evaluate` is a 4-line stub that misnames the real policy engine. A reviewer assuming the centralized service is authoritative is wrong.

4. **v1/v2 duality is the root cause of LLM failures.** Ghost tools (issue #3), missing risk (issue #4), missing v1 risk declaration (issue #19), dead modal (issue #2), and the `tool_exec` bypass (issue #1) all trace back to the v1/v2 split. RULES.md calls it forbidden long-term; `docs/architecture/tool-system.md` calls it "Phase 3.5". **The cut is blocked until: (a) the v1 `AgentTool` trait gains `risk_level`; (b) every `register_known_tool` entry becomes a real v2 adapter or is hidden; (c) Runner dispatches through `ToolService::execute_with_permission` instead of `execute_agent_tool`; (d) `McpServer` no longer needs the late-binding.**

5. **Modal fatigue is a security boundary.** Every defect that makes approval easier (single-click YOLO, Allow-focused default, broken always-allow, no batching of identical requests) compounds with every defect that makes requests more frequent (LLM calling ghost tools, calling real tools directly, retrying on cryptic errors). The combined effect is the "training the user to approve" threat model.

---

## Recommended Fix Order (4-week stack)

| Week | Theme | Items | Outcome |
|---|---|---|---|
| 1 | **LLM contract** | #1, #3, #4, #13, #14, #19, #20 | LLM can self-serve tools, `tool_exec` is gated, `tool_info` shows risk |
| 2 | **User contract** | #2, #8, #15, #16, #17, #18 | Modal exists, YOLO confirmed, timeout surfaced, agent visible |
| 3 | **Audit & security** | #5, #6, #7, #9 + extended hardcoded rules, MCP gating, write/edit symlink protection | Audit log is forensic, MCP gated, hardcoded rules extended |
| 4 | **Architecture** | #21, #22, #23, #24, #25, #26, continued from #19, #20 | v1/v2 cut unblocked; tracing, tests, lock safety, schema validation |

Items 10-12 (token efficiency, schema strictness, risk on `tool_list`) can be parallelized across weeks 1-2.

---

## Supporting Review Detail (subagent findings, not summarized above)

The 5 subagent reports contained additional findings beyond what was promoted into the main tiered list above. They are recorded here for completeness.

### LLM-facing surface — additional findings

- **Meta-tool schema quality:** `tool_list.query`, `tool_info.name`, `tool_exec.name`, `tool_exec.arguments` schemas lack `description` and example payloads. The LLM cannot infer the workflow from schema alone.
- **Per-tool description quality:** `WebFetchTool` (1 sentence) vs. `RunCommandTool` (8 lines) is a 6x disparity. `EditFileTool` does not document its exact-whitespace match requirement.
- **Provider mapping loss:** Anthropic takes `name/description/input_schema`; OpenAI wraps in `function`. JSON Schema features (e.g. `oneOf`) are provider-dependent.
- **Error feedback to the LLM:** Many tool errors return `"hint": "Try a different approach."` without telling the model which field was wrong. The `resolve_tool_exec` path is the only one with a useful error.
- **Tool name collision / namespace:** Meta-tool names are reserved against real tool names — but no enforcement exists at registration time.
- **Hidden capabilities:** `tools_search`, `list_tools`, `guidance` (progressive.rs:118-178) are stale legacy tools that confuse the LLM. `guidance` actively misinstructs the model (mentions non-existent `list_directory` / `read_file`).
- **`agent.tool_ids` not validated against v1 registry** (config.rs:221-241) — typos silently persist.

### Security & permission model — additional findings

- **Hardcoded rules are missing families:** `mkfs`, `dd if=`, `chmod -R 777`, `curl | sh`, `wget | sh`, `wget http://(10|172|192|169|127)`, `python -c`, `node -e`, `osascript -e`, `powershell -enc`. The SSRF blocklist is on `web_fetch` only, *not* on `run_command`.
- **`write_file`/`edit_file` no symlink protection:** `validate_workspace_path` canonicalizes the root but does not resolve symlinks inside the workspace. A `node_modules/.bin/... → /home/user/.ssh` symlink lets `write_file` escape the workspace. Windows `\\?\` and `\\.\` prefixes bypass the workspace check.
- **`spawn_agent` allows any `tool_ids` set:** If a user drops a JSON file in `resources/agents/`, the new agent can declare `tool_ids: ["*"]`. The orchestrator doesn't validate.
- **TOCTOU between permission check and execution:** `check_permission` is called twice (line 297 of tool_dispatch.rs and line 304 of tool.rs) with no `&mut` lock held across the boundary. A `HookDecision::Modify { new_args }` rewrites args after the first check, but the second check uses the *original* args — a malicious hook can bypass hardcoded rules.
- **TOCTOU on `read_document_content`:** `validate_workspace_path` is only invoked if the path *exists* (`fs_tools.rs:147-148`), and the `exists()` check is racy.
- **Web fetch DNS-rebinding:** Between `validate_resolved_ips` and the actual `reqwest::Client.get`, the resolver can return a different IP. The `reqwest::Client` has no `resolve` override.
- **9Router fallback bypasses SSRF guard:** When the direct fetch fails, `nine_router_fetch_fallback` sends the un-validated URL to a local proxy (default `http://localhost:20128/v1`) which fetches from its own network namespace.
- **MCP HTTP server has no auth, no rate limit:** `tower::limit` / `axum::middleware::from_fn` are not in use. A loop in a script can hammer `tools/call` 10s per call.
- **v1 risk drift:** `default_tool_risk` lookup table is only consulted for v2 `register_known_tool` entries, not for v1 `AgentTool` impls. A v1 tool that is also in `known_tool_risks` with the wrong risk is silently misclassified.
- **Audit log on a Swiss-cheese path:** `add_audit_event` is a single INSERT with no transaction; if the SQLite WAL is locked, the audit silently fails. The `tracing::warn!` in `services/security.rs:68` is at WARN, not ERROR.

### UX & approval flow — additional findings

- **No keyboard / focus / a11y management on the approval UI:** No `autoFocus` on Deny, no `tabIndex` ordering, no `onKeyDown` for `Escape`, no focus trap, no `aria-label`, no screen-reader announcement.
- **Streaming feedback invisible:** `ToolTimer` (`ToolTimer.tsx:30`) counts up but the per-tool `timeout_seconds()` (default 45) is server-side only. The 200KB output truncation in `services/tool.rs:366-382` is silent.
- **Per-agent tool selection is missing:** `ResponseToolsConfig.tsx` is two switches and a dropdown, not a per-agent matrix. Meta-tools are not visibly grouped. There are two near-duplicate UIs (`SkillsSettingsContent.tsx` and `ToolsSettings.tsx`) that write to slightly different settings and can desync.
- **Default focus is on the dangerous "Approve" button** in `ToolCallCard.tsx:194-205`. Industry best practice (Stripe, GitHub) focuses the destructive action.
- **`mergeToolCall` duplicates on replay:** `attempts` is concatenated (`toolEventReducer.ts:49`) so duplicate `tool:complete` events inflate counts. `mergeReplayToolCall` is documented but does not exist (grep returns 0 hits).
- **Per-tool cancel is unreachable:** The `CancellationToken` is plumbed in Rust but no `cancel_tool_call` Tauri command exists. The `onCancel` prop is wired to `resolveToolApproval(toolCall.id, false)` — a *denial*, not a cancellation.
- **Risk color palette is fragmented:** 5 different color maps across 5 files (modal, settings, card, skills, trace). Dual-case `RiskLevel` types (`"low"` from wire, `"Low"` from React) create bug surfaces.

### Architecture & code health — additional findings

- **`Tool::as_any` is dead code:** `as_any(&self) -> &dyn Any` is implemented in 7 places but never called. Anti-pattern that invites unsafe downcasting.
- **`ToolError::AwaitingConfirmation` is control flow, not an error:** Returned by `execute_with_permission` to signal "the user must confirm." Conflates a control-flow signal with `Result::Err`. The v2 frontend has no case for it. There is no `Timeout` or `Cancelled` variant even though `services/tool.rs:386, 390` produces them as strings.
- **DB schema duplication:** `audit_events` table is created in `db/queries/audit.rs:5-29` AND inline in `db/mod.rs:282-302`. The two are not byte-identical (inline adds `DEFAULT (datetime('now'))`). Production only runs the inline copy.
- **No `jsonschema` validation in the runner:** Each tool deserializes its own args and returns a generic `serde` error. The `ToolDefinition.parameters` is sent to the LLM but never used at validation time.
- **`ToolExecutionRecord` is write-only dead state:** Append-only `Vec<ToolExecutionRecord>` in `ToolRegistry` with no reader, no Tauri command, no DB persistence. Memory leak across long sessions.
- **No audit for: YOLO toggle, permission rule changes, MCP server start/stop, agent spawn, approval timeout** (all distinct from the tool-execution audit gap in #6).
- **`list_audit_events` has no filters:** No `caller`, `target`, `before_timestamp`, or `operation` filter. 500-row cap. Only `idx_audit_events_timestamp` exists.
- **Hardcoded deny + YOLO ordering bug:** `PermissionDecision::from_input` (permission.rs:78-130) short-circuits to `Allow` on YOLO after layer 1 but before layers 2-6. A user-configured `always_deny` is silently overridden.

### Error handling, audit, observability — additional findings

- **MCP `tools/call` errors collapse to `is_error=true` text:** The `JsonRpcError` codes (-32700..-32099) are never used for tool errors. The `data: {…}` field with structured `ToolError` is never set.
- **`add_audit_event` failures silently dropped:** `tracing::warn!` is at WARN, not ERROR. No counter exposed. No Tauri command reads the audit log.
- **`ToolError` lacks:** `Timeout { seconds: u64 }`, `Cancelled { by: CancellationSource }`, `NetworkError { kind, message }`, `RateLimited { retry_after_ms }`, `OutputTruncated { original_bytes, kept_bytes }`.
- **`execute_v2_authorized` does not re-verify permission:** Caller check is the only safeguard; the function takes `decision: &str` but does not re-call `check_permission` (services/tool.rs:425-447). A stale `Allow` from before a rule change is honored.
- **Hardcoded rule + `format C:` test missing:** `permission.rs` tests cover `rm -rf` variants but not `format C:`, `curl | sh`, `mkfs`, etc.
- **No tracing of `duration_ms` on tool completion** — slow tools are invisible.
- **Frontend `toolChatIdsRef` cache does not survive reload** — mid-flight tools lose state on page reload.
- **`rootAgentId: "main"` hard-coded** in `agentExecutionLedger.ts:195` — agent hierarchy summary is suspect.

---

## Sources

All citations above are anchored in 5 subagent reports covering:

- `src-tauri/src/{services,tools,agent,mcp,commands,db,llm}/`
- `src/{api,atlas,components}/`
- `RULES.md` (architecture contract, file size limits, security rules, tool system rules, phase rebuild order)
- `docs/architecture/tool-system.md` (the documented tool architecture)
- `src-tauri/tool-coverage.json` (the v1/v2 tool manifest)

Full per-finding subagent reports are available; ask to expand any specific item.
