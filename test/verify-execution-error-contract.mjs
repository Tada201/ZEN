import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { closeSourceModuleLoader, loadSourceModule } from "./test-loader.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const errorModel = read("src/atlas/agentRuntime/executionError.ts");
const assistant = read("src/atlas/components/chat/AssistantMessage.tsx");
const toolCard = read("src/atlas/components/chat/ToolCallCard.tsx");
const generic = read("src/atlas/components/chat/tool/content/GenericContent.tsx");
const toolFallback = read("src/atlas/components/chat/tool/ToolErrorFallback.tsx");
const subagent = read("src/atlas/components/chat/SubagentExecutionCard.tsx");
const markdown = read("src/atlas/components/chat/MarkdownHelperComponents.tsx");
const stream = read("src/atlas/hooks/stream/useChatChunkEvent.ts");
const types = read("src/atlas/components/chat/types.ts");

assert(errorModel.includes("export type ExecutionErrorCategory"), "error taxonomy must be canonical");
assert(errorModel.includes("rate_limit") && errorModel.includes("quota") && errorModel.includes("approval_expired"), "provider and approval edge cases must be classified");
assert(errorModel.includes("export function presentExecutionError"), "all surfaces must share one presentation function");
assert(errorModel.includes("technicalDetails") && errorModel.includes("retryable"), "error presentation must separate safe details and recovery semantics");

const { presentExecutionError } = await loadSourceModule("../src/atlas/agentRuntime/executionError.ts");
const cases = [
  ["429 too many requests", "rate_limit", true],
  ["quota exceeded", "quota", false],
  ["invalid api key", "authentication", false],
  ["request timed out", "timeout", true],
  ["connection lost", "network", true],
  ["approval expired", "approval_expired", true],
  ["permission denied", "permission", false],
];
for (const [message, category, retryable] of cases) {
  const result = presentExecutionError(message, { context: "assistant" });
  assert.equal(result.category, category, `${message} should classify as ${category}`);
  assert.equal(result.retryable, retryable, `${message} retryability should be explicit`);
  assert(result.summary.length <= 280, `${message} summary must remain concise`);
}
const redacted = presentExecutionError("Error: authorization: Bearer super-secret\n at provider.ts:12:4", { context: "tool" });
assert(!redacted.technicalDetails.includes("super-secret"), "technical details must redact credentials");
assert(!redacted.technicalDetails.includes("at provider.ts"), "technical details must omit stack frames");

assert(assistant.includes("presentExecutionError") && assistant.includes("actionLabel"), "assistant failures must use canonical recovery copy");
assert(assistant.includes('context: "persistence"') && assistant.includes("tracePersistencePresentation"), "persistence failures must use canonical recovery copy");
assert(toolCard.includes("presentExecutionError"), "tool summaries must use canonical error classification");
assert(generic.includes("Technical details") && generic.includes("presentExecutionError"), "tool detail failures must disclose safe diagnostics");
assert(toolFallback.includes("Copy safe details") && toolFallback.includes("Retry display"), "renderer failures must have safe copy and isolated retry");
assert(subagent.includes("presentExecutionError") && subagent.includes("Technical details"), "subagent failures must use the same taxonomy");
assert(markdown.includes("presentExecutionError") && markdown.includes("role=\"alert\""), "markdown renderer failures must be isolated and announced");
assert(stream.includes("presentExecutionError") && stream.includes("errorCategory"), "transport failures must preserve canonical category metadata");
assert(types.includes("errorTechnicalDetails") && types.includes("errorRetryable"), "message metadata must preserve safe recovery context");

await closeSourceModuleLoader();
console.log("execution error contract ok");
