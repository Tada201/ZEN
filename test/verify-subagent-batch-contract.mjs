import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const backend = [
  "child.rs", "completion.rs", "deps.rs", "failure.rs", "messaging.rs",
  "model_select.rs", "outcome.rs", "params.rs", "tool.rs",
].map((f) => readFileSync(new URL(`../src-tauri/src/agent/tools/spawn_tools/${f}`, import.meta.url), "utf8")).join("");
const progressive = readFileSync(new URL("../src-tauri/src/agent/tools/progressive.rs", import.meta.url), "utf8");
const capability = readFileSync(new URL("../src-tauri/src/tools/capability.rs", import.meta.url), "utf8");
const systemPrompt = readFileSync(new URL("../src-tauri/src/agent/middleware/system_prompt.rs", import.meta.url), "utf8");
const runner = readFileSync(new URL("../src-tauri/src/agent/runner/loop.rs", import.meta.url), "utf8");
const generalist = readFileSync(new URL("../src-tauri/resources/agents/generalist.json", import.meta.url), "utf8");
// ZEN-DOCS (researcher) and ZEN-TAC (operational_expert) were retired; the
// shipped defaults are generalist, explore, and voice_display.
const explore = readFileSync(new URL("../src-tauri/resources/agents/explore.json", import.meta.url), "utf8");
const rendererRegistry = readFileSync(new URL("../src/atlas/components/chat/tool/renderers/registry.tsx", import.meta.url), "utf8");
const lane = readFileSync(new URL("../src/atlas/components/chat/AgentDelegationLane.tsx", import.meta.url), "utf8");
const laneModel = readFileSync(new URL("../src/atlas/components/chat/agentDelegationLaneModel.ts", import.meta.url), "utf8");
// The legacy orchestrator panel model was retired; spawn-id merging and failed
// child accounting now live in the canonical delegation tree.
const delegationTree = readFileSync(new URL("../src/atlas/agentRuntime/delegationTree.ts", import.meta.url), "utf8");

assert(backend.includes("MAX_PARALLEL_SUBAGENTS"), "parallel delegation must have a hard concurrency limit");
assert(backend.includes('input.get("agents")'), "spawn_agent must accept a canonical agents batch");
assert(backend.includes("futures::future::join_all"), "independent child requests must run concurrently");
assert(backend.includes('"partial"'), "batch results must preserve partial success");
assert(backend.includes('"results": results'), "the parent must receive every settled child result");
assert(backend.includes('"spawn_id": spawn_id'), "child results must expose stable lifecycle identity");
assert(progressive.includes('"spawn_agent"'), "spawn_agent must remain the canonical delegation tool");
assert(!progressive.includes('"handoff_to_agent"'), "handoff_to_agent must not be exposed as a second delegation tool");
assert(!progressive.includes('"delegate_to_agent"'), "delegate_to_agent must not be exposed as a deprecated duplicate");
assert(capability.includes('"activate_2d_operational_map" | "activate_3d_globe"'), "legacy map tools must be explicitly marked disabled");
assert(capability.includes('status: "disabled_future"'), "future map tools must be clearly marked as disabled");
assert(!progressive.includes('"get_weather"'), "weather must not remain in the agent tool catalog");
assert(!progressive.includes('"create_geofence"'), "geofence must not remain in the agent tool catalog");
assert(systemPrompt.includes("Use only `spawn_agent`"), "system prompt must direct all delegated work through spawn_agent");
assert(systemPrompt.includes("Do not call or invent"), "system prompt must reject duplicate delegation tool names");
assert(!runner.includes('tool_call.name == "handoff_to_agent"'), "runner must not retain a second delegation path");
assert(!generalist.includes("handoff_to_agent"), "generalist instructions must not teach the removed handoff tool");
assert(!explore.includes("handoff_to_agent"), "explore config must not expose the removed handoff tool");
assert(!explore.includes("get_weather"), "explore must use web search instead of a removed weather tool");
// A child must never launch with an empty model id: built-in profiles ship with
// `model_override: null`, so the resolver has to fall back to the parent turn's
// model and fail loudly when nothing is configured anywhere.
{
  const childRunner = readFileSync(new URL("../src-tauri/src/agent/tools/child_runner.rs", import.meta.url), "utf8");
  assert(
    childRunner.includes("fn selected_model(") && childRunner.includes('eq_ignore_ascii_case("inherit")'),
    "child model resolution must normalize blank and 'inherit' selections instead of passing them through",
  );
  assert(
    !childRunner.includes("agent.model_override.clone().unwrap_or_default()"),
    "child model resolution must not default a null model override to an empty string",
  );
  assert(
    childRunner.includes("No model configured for agent"),
    "a child with no resolvable model must fail with an actionable error before the provider call",
  );
  assert(
    backend.includes("inherited_model_for_child("),
    "spawn_agent must supply the parent turn's model as the child's inheritance fallback",
  );
}
assert(!rendererRegistry.includes("get_weather"), "frontend must not render a removed weather tool card");
assert(!rendererRegistry.includes("delegate_to_agent"), "frontend must not advertise a removed delegation alias");
assert(delegationTree.includes("record.spawnId"), "frontend delegation must merge lifecycle events by spawn id");
assert(delegationTree.includes("failedChildToolCount"), "delegation tree must expose failed child accounting");
// batchId propagation was moved into the lane model so the .tsx file stays
// under its size budget.
assert(laneModel.includes("batchId: spawn.batchId") && laneModel.includes("batchId?: string"), "delegation lanes must identify explicit batches when available");
assert(lane.includes("aria-expanded"), "delegation details must remain accessible and expandable");

console.log("subagent batch contract ok");
