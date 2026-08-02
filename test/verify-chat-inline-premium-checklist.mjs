import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const trace = read("src/atlas/components/chat/AgentExecutionTrace.tsx");
const row = read("src/atlas/components/chat/tool/ExecutionRow.tsx");
const detail = read("src/atlas/components/chat/tool/ToolDetailView.tsx");
const content = read("src/atlas/components/chat/tool/content/ToolContentSwitch.tsx");
const card = read("src/atlas/components/chat/ToolCallCard.tsx");
const subagent = read("src/atlas/components/chat/SubagentExecutionCard.tsx");
const genui = read("src/atlas/components/genui/PremiumCard.tsx");
const agentStep = read("src/atlas/components/genui/premium/AgentStepCard.tsx");
const shell = read("src/atlas/components/genui/premium/CardShell.tsx");
const motion = read("src/atlas/components/genui/premium/motion/CardMotion.tsx");
const replay = read("src/atlas/hooks/chat/chatTimelineReplay.ts");
const queries = read("src/atlas/hooks/chat/useChatQueries.ts");
const reload = read("test/verify-chat-reload-survivability.mjs");
const mcpUi = read("src/components/settings/Tabs/plugins/MCPSettings.tsx");

const includesAll = (source, values, label) => {
  for (const value of values) assert(source.includes(value), `${label}: missing ${value}`);
};

includesAll(trace, [
  'status === "awaiting_approval"',
  'status === "error"',
  'status === "running"',
  "Math.max(...completedAt) - Math.min(...startedAt)",
], "execution trace");
includesAll(row, ["getExecutionStatusLabel", "aria-busy", "focus-visible:ring"], "execution row");
includesAll(detail, ["DiffCard", "Open full diff", "parseUnifiedDiff"], "file diff surface");
includesAll(content, ["TerminalContent", "SearchContent", "ImageContent", "ArtifactContent"], "tool content routing");
includesAll(card, ["Approval context", "Technical details", "Retry", "Approve", "Deny"], "tool card actions");
includesAll(subagent, ["resultSummary", "childToolCalls", "AgentExecutionTrace"], "subagent surface");
includesAll(genui, ["Suspense", "Technical details", "ChartCardFallback", "CardMotion", "PremiumCardBody"], "GenUI fallback/lifecycle");
includesAll(agentStep, ["CardShell", "motion-safe:animate-spin"], "agent step card");
includesAll(shell, ["CardMotion"], "premium shell motion");
includesAll(motion, ["useReducedMotion", "shouldReduceMotion", "duration: shouldReduceMotion ? 0"], "premium motion accessibility");
includesAll(replay, ["getSyntheticTimelineId", "timeline:${sessionId"], "timeline replay identity");
includesAll(queries, ["stepsJson", "parsedSteps"], "persisted execution replay");
includesAll(reload, ["reload", "survivability"], "reload verification");
includesAll(mcpUi, ["subscribeServerStatus", "listServers", "reconnect"], "MCP UI lifecycle");

console.log("chat inline premium checklist contract passed");
