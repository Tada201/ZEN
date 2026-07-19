# Subagent Module: Architecture Review & Improvement Proposals

> **Date:** 2026-07-19
> **Author:** Buffy (AI Research)
> **Status:** Proposals — not yet implemented

---

## 1. Current Architecture Summary

The subagent system follows the **Supervisor pattern**: a central coordinator (generalist agent) spawns child agents via `spawn_agent` or `handoff_to_agent` tools. Each child runs an independent `Runner` loop with bounded iterations.

### Flow

```
User Message
  → Runner::run() [depth 0]
    → LLM decides to call spawn_agent tool
      → SpawnAgentTool::do_spawn()
        → child_runner::resolve_agent() / resolve_adhoc_agent()
        → child_runner::build_delegation_prompt()
        → child_runner::build_child_messages()  [last 10 parent messages]
        → child_runner::build_child_runner()
        → Runner::child() → child_runner_instance.run()
      → Result returned as tool output to parent LLM
```

### Key Components

| Component | File | Responsibility |
|---|---|---|
| `SwarmCoordinator` | `src-tauri/src/agent/swarm.rs` | Agent registry + lifecycle tracking |
| `SpawnAgentTool` | `src-tauri/src/agent/tools/spawn_tools.rs` | Tool interface for spawning children |
| `DelegateToAgentTool` | `src-tauri/src/agent/tools/delegate_to_agent.rs` | Deprecated alias for spawn |
| `child_runner` | `src-tauri/src/agent/tools/child_runner.rs` | Child runner construction + delegation prompt |
| `Runner` | `src-tauri/src/agent/runner/lifecycle.rs` | Agent execution lifecycle |
| `Runner::run()` | `src-tauri/src/agent/runner/loop.rs` | Main agent loop (max 30 iterations) |
| `AgentEvent` | `src-tauri/src/agent/event_bus.rs` | Event bus for cross-component communication |

### Hardcoded Limits

| Parameter | Value | Purpose |
|---|---|---|
| `MAX_SPAWN_DEPTH` | 3 | Prevents infinite delegation recursion |
| `MAX_PARALLEL_SUBAGENTS` | 8 | Cap on concurrent child agents per batch |
| Default `max_iterations` | 10 | Per-child iteration limit |
| `fetch_parent_context` | last 10 messages | Context passed to child agents |

---

## 2. Issues & Flaws Identified

### 🔴 Critical Issues

#### Issue 1: Memory Scope Is Dead Code

**Location:** `src-tauri/src/agent/runner/lifecycle.rs`

```rust
pub fn with_memory_scope(self, _scope: String) -> Self {
    self  // ← Does nothing!
}
```

The `subagent_memory_scope()` function in `child_runner.rs` generates a SHA-256-based scope ID:

```rust
pub(crate) fn subagent_memory_scope(agent_id: &str, task: &str) -> String {
    format!("subagent:{}:{}:{}", agent_id, timestamp, task_hash)
}
```

But `with_memory_scope` is a no-op. Subagents share the **exact same memory namespace** as their parent. This means:
- Subagent conversation history bleeds into parent context
- No isolation between sibling agents running in parallel
- Memory bloat accumulates across delegated tasks
- Task hash collisions (8 hex chars) could cause scope overwrites

**Industry standard:** LangGraph uses separate `StateSchema` per subgraph. OpenAI Agents SDK isolates conversation history per handoff. Claude Code gives subagents a "clean slate" with only the task recipe.

**Impact:** High — affects correctness and cost when multiple subagents run concurrently.

---

#### Issue 2: Parent Context Dump Is Unfiltered

**Location:** `src-tauri/src/agent/tools/child_runner.rs`

```rust
pub(crate) async fn build_child_messages(
    app: &AppHandle, chat_id: &str, delegation_prompt: &str,
) -> Vec<ChatMessage> {
    let mut messages = fetch_parent_context(app, chat_id, 10).await;
    messages.push(/* delegation prompt as user message */);
    messages
}
```

Every child agent receives the **last 10 raw parent messages** including:
- Parent's internal system nudges ("CRITICAL: You received tool results...")
- Tool result payloads irrelevant to the delegated task
- Conversation state that confuses the child's reasoning
- Compact/summarized messages that lose important detail

This is **"context dumping"** — the #1 anti-pattern identified in multi-agent research.

**Industry standard:** CrewAI passes only "context" from previous task outputs. LangGraph uses State Reducers to filter what flows to child graphs. Anthropic recommends "fresh context + task recipe" for subagents.

**Impact:** High — degrades child agent performance and wastes tokens on irrelevant context.

---

#### Issue 3: No Verification After Tool Execution

**Location:** `src-tauri/src/agent/tools/spawn_tools.rs`

```rust
// After child_runner_instance.run() completes:
let content = response.content.unwrap_or_else(|| "Sub-agent completed with no output.");
let parsed: Result<serde_json::Value, _> = serde_json::from_str(&content);
let structured_result = match parsed {
    Ok(json) => json,
    Err(_) => json!({
        "status": "success",
        "summary": content.chars().take(500).collect::<String>(),
        "full_content": content,
    }),
};
```

Problems:
- A plain text response is auto-wrapped as "success" even if the child failed silently
- No validation that the child actually accomplished the task
- No structural check on the output format
- No retry mechanism if the output is malformed
- Empty responses get wrapped with "Sub-agent completed with no output." marked as success

**Industry standard:** Claude Code uses a formal "Validation" agent that approves build output against the original plan. OpenAI Codex uses artifact-based handoffs with structured JSON schemas.

**Impact:** High — parent agents make decisions based on potentially invalid child output.

---

#### Issue 4: SwarmCoordinator Is Decoupled From Runner

**Location:** `src-tauri/src/agent/swarm.rs`

The `SwarmCoordinator` maintains its own `HashMap<String, AgentInstance>` but the actual subagent spawning goes through `SpawnAgentTool` → `child_runner` → `Runner::child()`. The SwarmCoordinator is never consulted during spawn, and agents registered in it aren't the ones actually executing.

This creates two parallel tracking systems that can drift:
- `SwarmCoordinator.agents` tracks spawned instances
- `Runner::run()` tracks actual execution state independently
- `agent:spawn` / `agent:complete` events go through `app.emit()`, not through the coordinator

**Impact:** Medium — creates confusion about which component is the source of truth for agent state.

---

### 🟡 Moderate Issues

#### Issue 5: No Token Budget or Cost Guard

There's no token budget or cost limit per subagent. A child agent with `max_iterations: 10` could burn through expensive cloud model tokens with no cap. The `call_llm_with_escalation` escalates from local to cloud automatically, but no budget tracks total cost across the delegation tree.

```rust
// In Runner::run():
total_tokens_in += response.tokens_in.unwrap_or(0) as i64;
total_tokens_out += response.tokens_out.unwrap_or(0) as i64;
// ← These are never checked against any budget
```

**Industry standard:** Production systems implement circuit breakers — if a task sequence exceeds token/retry thresholds, it halts and defers to human-in-the-loop.

**Impact:** Medium — can lead to unexpected cost spikes.

---

#### Issue 6: Parallel Spawn Has No Result Aggregation Strategy

The parallel batch in `SpawnAgentTool::run()` uses `futures::future::join_all` and collects results into a flat array:

```rust
let settled = futures::future::join_all(futures).await;
let results = settled.into_iter().map(|result| match result {
    Ok(value) => value,
    Err(error) => json!({ "status": "error", "error": error.to_string() }),
}).collect::<Vec<_>>();
```

Missing:
- Dependency graph between parallel tasks
- Result merging/reduction logic
- Partial failure handling (if 3 of 8 succeed, parent gets `"partial"` status with no guidance)
- Timeout per individual subagent (only parent cancellation token exists)

**Industry standard:** LangGraph uses Reducer Functions to deterministically merge parallel results. CrewAI chains task outputs as context for subsequent tasks.

**Impact:** Medium — limits usefulness of parallel delegation.

---

#### Issue 7: Error Propagation Is Lossy

```rust
Err(e) => {
    Ok(json!({ "status": "error", "error": e.to_string(), ... }))
}
```

The error is serialized as a string and returned as a tool result. The parent LLM sees `"error": "Maximum agent nesting depth (3) reached"` but has no structured way to handle it:
- No retry logic
- No fallback strategy
- No escalation path
- No distinction between transient vs permanent failures

**Impact:** Medium — reduces recovery capability.

---

#### Issue 8: `fetch_parent_context` Fetches From DB, Not Current Conversation

**Location:** `src-tauri/src/agent/tools/child_runner.rs`

```rust
pub(crate) async fn fetch_parent_context(
    app: &AppHandle, chat_id: &str, max_messages: usize,
) -> Vec<ChatMessage> {
    // Queries SQLite for messages
    let Ok(parent_msgs) = crate::db::queries::get_messages(&db, chat_id).await else {
        return Vec::new();
    };
    ...
}
```

The in-memory `conversation` in the parent's `Runner::run()` may have been compacted, summarized, or modified by middleware. The child gets the DB version, not the actual context the parent was reasoning with. This can cause:
- Stale context (DB hasn't been flushed yet)
- Missing compacted messages that were important
- Double-compaction if middleware runs on the child too

**Impact:** Medium — context mismatch between parent reasoning and child execution.

---

### 🟢 Minor Issues / Opportunities

#### Issue 9: No Inter-Agent Communication After Spawn

Once a child is spawned, there's no mechanism for:
- Parent to send additional instructions mid-execution
- Sibling agents to share findings
- Parent to observe child's intermediate progress (only final result)

The `agent:spawn` and `agent:complete` events are fire-and-forget.

**Impact:** Low — limits advanced orchestration patterns.

---

#### Issue 10: Ad-Hoc Agent Tool Ceiling Is Hardcoded to Generalist

```rust
let ceiling: Vec<String> = agent_registry
    .get("generalist")
    .map(|a| a.tool_ids.clone())
    .unwrap_or_default()
```

If the generalist agent's tools change, all ad-hoc agents silently inherit the new set. This is fragile — the ceiling should be configurable per-delegation.

**Impact:** Low — coupling risk.

---

#### Issue 11: Delegation Prompt Is Generic

The `build_delegation_prompt` function produces a templated prompt with "Use all your available tools" and "If you need to hand off to another specialist, use handoff_to_agent" — even for deeply nested subagents that shouldn't delegate further.

```rust
prompt.push_str(&format!(
    r#"## Task Delegation

### Your Role
You are {}, a specialized AI agent.
{}

### Task
{}

### Instructions
1. Focus on completing this specific task efficiently
2. Use all your available tools
3. Provide a comprehensive, well-structured result
4. If you need to hand off to another specialist, use handoff_to_agent
"#,
    resolved.agent.name,
    resolved.agent.instructions.lines().take(50)...,
    task
));
```

**Impact:** Low — suboptimal but functional.

---

## 3. Comparison with Industry Leaders

| Feature | Zen (Current) | Claude Code | Cursor | OpenAI Codex |
|---|---|---|---|---|
| Delegation pattern | Spawn + context dump | Supervisor + recipe | Supervisor + IDE | Swarm/Parallel |
| Context filtering | ❌ Raw last 10 msgs | ✅ Task recipe only | ✅ File-scoped | ✅ Handoff function |
| Memory isolation | ❌ Shared namespace | ✅ Clean slate | ✅ Per-session | ✅ Per-handoff |
| Output validation | ❌ Accept all | ✅ Validator agent | ✅ Implicit | ✅ Artifact schema |
| Token budget | ❌ None | ✅ Per-turn limits | ✅ Model-aware | ✅ Budget caps |
| Circuit breaker | ⚠️ Depth only | ✅ Multi-signal | ✅ Timeout + retry | ✅ TTL + hops |
| Parallel execution | ⚠️ Flat join_all | ✅ Fan-out + reduce | ✅ Multi-file | ✅ Native parallel |
| Inter-agent comms | ❌ Fire-and-forget | ⚠️ Limited | ⚠️ Limited | ✅ Shared state |

---

## 4. Improvement Proposals

### Proposal 1: Structured Handoff Context (Priority: 🔴 Critical)

**Goal:** Replace the raw parent context dump with a typed `HandoffContext` struct.

```rust
pub struct HandoffContext {
    pub task: String,
    pub role: String,
    pub relevant_files: Vec<String>,
    pub constraints: Vec<String>,
    pub success_criteria: String,
    pub parent_summary: Option<String>,  // Compressed parent state, not raw messages
    pub tool_results_relevant: Vec<ToolResultRef>,  // Only tool results the child needs
}
```

**Changes:**
- Modify `build_child_messages()` to accept `HandoffContext` instead of raw messages
- Add a filtering step that extracts only relevant tool results based on task keywords
- Replace `fetch_parent_context()` with `build_handoff_context()` that produces structured data
- Update the delegation prompt template to use structured fields

**Expected impact:** 40-60% reduction in child agent token usage, improved task focus.

---

### Proposal 2: Memory Scope Enforcement (Priority: 🔴 Critical)

**Goal:** Make `with_memory_scope()` actually work by implementing scoped conversation storage.

**Approach:**
- Add `ScopedMemoryStore` to `Runner` that maps `scope_id → Vec<ChatMessage>`
- Child agents write to their own scope, not the parent's
- On completion, only the final summary crosses the boundary back
- Sibling agents cannot see each other's intermediate state

```rust
pub struct ScopedMemoryStore {
    scopes: HashMap<String, Vec<ChatMessage>>,
}

impl ScopedMemoryStore {
    pub fn create_scope(&mut self, scope_id: &str) -> &mut Vec<ChatMessage> { ... }
    pub fn get_scope(&self, scope_id: &str) -> Option<&[ChatMessage]> { ... }
    pub fn merge_to_parent(&mut self, child_scope: &str, parent_scope: &str) { ... }
}
```

**Expected impact:** Eliminates memory bleed, reduces context bloat by 30-50%.

---

### Proposal 3: Per-Agent Token Budget (Priority: 🟡 Moderate)

**Goal:** Add token budget tracking and auto-termination.

**Changes:**
- Add `token_budget: Option<u64>` to `Agent` config
- Track cumulative `tokens_in + tokens_out` in `Runner::run()`
- Check budget at the start of each iteration
- Return a structured `BudgetExceeded` error if limit hit

```rust
// In Runner::run(), at iteration start:
if let Some(budget) = self.config.token_budget {
    if total_tokens_in + total_tokens_out > budget as i64 {
        return Err(anyhow::anyhow!("Token budget exceeded: {}/{}", 
            total_tokens_in + total_tokens_out, budget));
    }
}
```

**Expected impact:** Prevents runaway cost, enables predictable budgeting.

---

### Proposal 4: Output Validation Step (Priority: 🟡 Moderate)

**Goal:** Validate child agent output before returning to parent.

**Approach:**
- Define `SubagentResult` schema with required fields
- Parse child output against schema
- If validation fails, retry once with adjusted prompt
- If retry fails, return structured error with partial results

```rust
pub struct SubagentResult {
    pub status: TaskStatus,  // completed | partial | failed
    pub summary: String,
    pub artifacts: Vec<String>,
    pub confidence: Option<f32>,
}

fn validate_child_output(content: &str) -> Result<SubagentResult, ValidationError> {
    // Parse and validate...
}
```

**Expected impact:** Reduces silent failures, improves parent decision-making.

---

### Proposal 5: Circuit Breaker (Priority: 🟢 Nice-to-have)

**Goal:** Add global subagent circuit breaker.

**Components:**
- Global `Semaphore` limiting `max_concurrent_subagents` across all parents
- Consecutive failure counter per agent type
- Auto-halt when failure rate exceeds threshold
- Cooldown period before retry

```rust
pub struct SubagentCircuitBreaker {
    max_concurrent: usize,
    semaphore: Arc<Semaphore>,
    failure_counts: HashMap<String, u32>,
    failure_threshold: u32,
    cooldown_secs: u64,
}
```

**Expected impact:** Prevents cascading failures, protects against API rate limits.

---

## 5. Recommended Implementation Order

| Phase | Proposal | Effort | Impact |
|---|---|---|---|
| Phase 1 | Structured Handoff Context | Medium | 🔴 Critical |
| Phase 1 | Memory Scope Enforcement | Medium | 🔴 Critical |
| Phase 2 | Output Validation Step | Low | 🟡 Moderate |
| Phase 3 | Per-Agent Token Budget | Low | 🟡 Moderate |
| Phase 4 | Circuit Breaker | Medium | 🟢 Nice-to-have |

**Phase 1** addresses the two critical issues that cause context pollution and memory bleed. These should be implemented together since they're interrelated.

**Phase 2** adds validation with minimal code changes — just a post-execution check.

**Phase 3** adds budget tracking, which is a straightforward counter check.

**Phase 4** adds global coordination, which requires more architectural changes.

---

## 6. Research Sources

- LangGraph Subgraphs Documentation — isolated state per subgraph
- CrewAI Hierarchical Process — manager agent with task context filtering
- OpenAI Agents SDK — handoff-based delegation with conversation isolation
- Anthropic "Building Effective Agents" — prompt chaining, routing, parallelization patterns
- Mem0 Blog (Multi-Agent Memory Systems) — memory engineering and scoping
- NeuralTrust (Preventing Loops) — circuit breakers and loop detection
- Zylos Research (Memory Patterns) — shared vs isolated vs hierarchical memory architectures

---

## 7. Open Questions

1. **Should ad-hoc agents inherit the parent's model tier or default to a cheaper model?** Currently they inherit the parent's config, which may be overkill for simple subtasks.

2. **Should we support inter-agent communication during execution?** This would enable more complex workflows but adds significant complexity.

3. **How should partial failures in parallel batches be handled?** Should the parent decide, or should there be a configurable policy (fail-fast, best-effort, majority-rules)?

4. **Should the delegation prompt be model-specific?** Different LLMs respond differently to structured instructions.

5. **Should we persist subagent execution traces for debugging?** Currently they're only in the event bus and not queryable after the session ends.
