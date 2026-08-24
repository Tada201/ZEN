import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const engine = await read("src-tauri/src/agent/deep_research/engine.rs");
const llm = await read("src-tauri/src/agent/deep_research/llm.rs");
const moduleSource = await read("src-tauri/src/agent/deep_research/mod.rs");
const events = await read("src/api/events.ts");
const reducer = await read("src/atlas/hooks/stream/useAgentEvents.ts");
const card = [
  await read("src/atlas/components/chat/DeepResearchMessage.tsx"),
  await read("src/atlas/components/chat/DeepResearchRunMessage.tsx"),
  await read("src/atlas/components/chat/ResearchClarificationCard.tsx"),
].join("\n");
const settingsTab = await read("src/components/settings/Tabs/DeepResearchSettings.tsx");
const settingsSchema = await read("src/lib/stores/settings/schema.ts");
const chatQueries = await read("src/atlas/hooks/chat/useChatQueries.ts");
const chunkHandler = await read("src/atlas/hooks/stream/useChatChunkEvent.ts");
const settingsFeatures = await read("src/lib/features/frontendFeatures.ts");
const chatCommand = [
  await read("src-tauri/src/commands/chat/mod.rs"),
  await read("src-tauri/src/commands/chat/send.rs"),
].join("\n");
const phases = (await Promise.all([
  "analyze.rs", "dispatch.rs", "plan.rs", "report.rs", "search.rs",
].map((f) => read(`src-tauri/src/agent/deep_research/phases/${f}`)))).join("");

expect(engine.includes("fn milestone_progress") && engine.includes("AtomicU8"),
  "Deep research must maintain monotonic backend milestone progress.");
expect(engine.includes('"researchProgress"') && moduleSource.includes('"progress_percent"'),
  "Research progress must be emitted and persisted for reloads.");
expect(engine.includes("investigation tasks"),
  "The LLM-generated research plan must expose its planned task count.");
expect(llm.includes("const MAX_ATTEMPTS: u8 = 3") && llm.includes("self.token.cancelled()"),
  "Internal research LLM calls must retry with cancellation support.");
expect(events.includes("step_id?: string") && events.includes("progress_percent?: number"),
  "Research event payloads must carry stable IDs and progress.");
expect(events.includes('status?: Message["status"]') && moduleSource.includes('"status": if done_reason == "cancelled"'),
  "Deep research final events must preserve failed or cancelled terminal state.");
expect(reducer.includes("const stepId = payload.step_id") && reducer.includes("researchProgress"),
  "The frontend reducer must preserve stable research step identity and backend progress.");
expect(card.includes("h-[280px]") && card.includes("width: `${progressPercent}%`") && card.includes("visibleProcessSteps"),
  "The research card must have stable geometry, authoritative progress, and bounded activity output.");
expect(settingsTab.includes("Research model") && settingsTab.includes("Research Scope"),
  "Deep Research settings must expose a focused model and bounded workload configuration.");
expect(settingsSchema.includes("deepResearchModel") && settingsSchema.includes("deepResearchParallelAgents"),
  "Deep Research settings must be typed and persisted through the settings schema.");
expect(settingsFeatures.includes('"deep-research"') && chatCommand.includes("deep_research_model"),
  "The Deep Research settings tab and runtime model override must be wired end to end.");
expect(chatCommand.includes("deep_research_parallel_agents") && engine.includes("sub_agent_count.clamp(1, 4)"),
  "Deep Research worker parallelism must be configured and bounded by the backend.");
expect(chatQueries.includes('const isPendingDeepResearch = msg.kind === "deep_research" && msg.isComplete !== 1') &&
  chatQueries.includes('status: isPendingDeepResearch ? "sending"'),
  "An unfinished deep-research placeholder must remain live during query reconciliation.");
expect(chatQueries.includes("fetchedMessages.length === 0 && currentMessages.length > 0"),
  "A stale empty message page must not erase a populated live session.");
expect(chunkHandler.includes("chat:done may arrive") && chunkHandler.includes("assistant.content.trim()"),
  "chat:done must not complete an empty deep-research placeholder before chat:message arrives.");
expect(phases.includes("scope gate for a deep-research system") && phases.includes("Locked research scope"),
  "Deep research must resolve and carry a scoped objective before planning or search.");
expect(moduleSource.includes("researchClarification") && card.includes("Research scope needed"),
  "Ambiguous research requests must stop before search and render a clarification form.");

if (failures.length > 0) {
  console.error("Deep research progress contract failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Deep research progress contract passed.");
