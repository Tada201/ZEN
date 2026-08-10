import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const backend = readFileSync(new URL("../src-tauri/src/agent/tools/spawn_tools.rs", import.meta.url), "utf8");
const lane = readFileSync(new URL("../src/atlas/components/chat/AgentDelegationLane.tsx", import.meta.url), "utf8");
const laneModel = readFileSync(new URL("../src/atlas/components/chat/agentDelegationLaneModel.ts", import.meta.url), "utf8");
const panelModel = readFileSync(new URL("../src/components/widgets/orchestrator/agentOrchestratorModel.ts", import.meta.url), "utf8");

assert(backend.includes("MAX_PARALLEL_SUBAGENTS"), "parallel delegation must have a hard concurrency limit");
assert(backend.includes('input.get("agents")'), "spawn_agent must accept a canonical agents batch");
assert(backend.includes("futures::future::join_all"), "independent child requests must run concurrently");
assert(backend.includes('"partial"'), "batch results must preserve partial success");
assert(backend.includes('"results": results'), "the parent must receive every settled child result");
assert(backend.includes('"spawn_id": spawn_id'), "child results must expose stable lifecycle identity");
assert(panelModel.includes("spawn?.spawnId"), "frontend lanes must merge lifecycle events by spawn id");
assert(panelModel.includes("failedAgents"), "orchestration panel must expose failed child count");
// batchId propagation was moved into the lane model so the .tsx file stays
// under its size budget.
assert(laneModel.includes("batchId: spawn.batchId") && laneModel.includes("batchId?: string"), "delegation lanes must identify explicit batches when available");
assert(lane.includes("aria-expanded"), "delegation details must remain accessible and expandable");

console.log("subagent batch contract ok");
