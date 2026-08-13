import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const backend = readFileSync(new URL("../src-tauri/src/agent/tools/spawn_tools.rs", import.meta.url), "utf8");
const progressive = readFileSync(new URL("../src-tauri/src/agent/tools/progressive.rs", import.meta.url), "utf8");
const capability = readFileSync(new URL("../src-tauri/src/tools/capability.rs", import.meta.url), "utf8");
const systemPrompt = readFileSync(new URL("../src-tauri/src/agent/middleware/system_prompt.rs", import.meta.url), "utf8");
const runner = readFileSync(new URL("../src-tauri/src/agent/runner/loop.rs", import.meta.url), "utf8");
const generalist = readFileSync(new URL("../src-tauri/resources/agents/generalist.json", import.meta.url), "utf8");
const researcher = readFileSync(new URL("../src-tauri/resources/agents/researcher.json", import.meta.url), "utf8");
const operationalExpert = readFileSync(new URL("../src-tauri/resources/agents/operational_expert.json", import.meta.url), "utf8");
const rendererRegistry = readFileSync(new URL("../src/atlas/components/chat/tool/renderers/registry.tsx", import.meta.url), "utf8");
const lane = readFileSync(new URL("../src/atlas/components/chat/AgentDelegationLane.tsx", import.meta.url), "utf8");
const laneModel = readFileSync(new URL("../src/atlas/components/chat/agentDelegationLaneModel.ts", import.meta.url), "utf8");
const panelModel = readFileSync(new URL("../src/components/widgets/orchestrator/agentOrchestratorModel.ts", import.meta.url), "utf8");

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
assert(!researcher.includes("handoff_to_agent"), "researcher config must not expose the removed handoff tool");
assert(!operationalExpert.includes("handoff_to_agent"), "operational specialist must not expose the removed handoff tool");
assert(!operationalExpert.includes("get_weather"), "operational specialist must use web search instead of a weather tool");
assert(!rendererRegistry.includes("get_weather"), "frontend must not render a removed weather tool card");
assert(!rendererRegistry.includes("delegate_to_agent"), "frontend must not advertise a removed delegation alias");
assert(panelModel.includes("spawn?.spawnId"), "frontend lanes must merge lifecycle events by spawn id");
assert(panelModel.includes("failedAgents"), "orchestration panel must expose failed child count");
// batchId propagation was moved into the lane model so the .tsx file stays
// under its size budget.
assert(laneModel.includes("batchId: spawn.batchId") && laneModel.includes("batchId?: string"), "delegation lanes must identify explicit batches when available");
assert(lane.includes("aria-expanded"), "delegation details must remain accessible and expandable");

console.log("subagent batch contract ok");
