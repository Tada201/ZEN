import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/components/chat/assistantMessageParts.ts", import.meta.url);
const reasoningSectionsSourcePath = new URL("../src/atlas/components/chat/reasoningSections.ts", import.meta.url);
const parserSourcePath = new URL("../src/atlas/components/chat/assistantCardParser.ts", import.meta.url);
const parserSource = readFileSync(parserSourcePath, "utf8")
  .replace(/export interface ParsedCard \{[\s\S]*?\n\}/, "")
  .replace(/export function parseCardTags/, "export function parseCardTags");
// Multi-line-aware strippers: assistantMessageParts.ts re-exports several names
// (parseCardTags + types + helper regexes + splitOnCardTokens) across multiple
// lines, so the prior single-line regex wouldn't match and the verifier
// crashed with "Identifier 'parseCardTags' has already been declared".
const stripImport = /import\s*\{[^}]*?\bparseCardTags\b[^}]*?\}\s*from\s*["'][^"']+["'];?/g;
const stripExport = /export\s*\{[^}]*?\bparseCardTags\b[^}]*?\}\s*from\s*["'][^"']+["'];?/g;
const reasoningSectionsSource = readFileSync(reasoningSectionsSourcePath, "utf8");
const source = `${parserSource}\n${reasoningSectionsSource}\n${readFileSync(sourcePath, "utf8")
  .replace(stripImport, "")
  .replace(stripExport, "")
  .replace(/import\s*\{\s*splitReasoningSections(?:,\s*type\s+ReasoningSection)?\s*\}\s*from\s*["'][^"']+["'];?/g, "")}`.replace(
  'import { CHAT_STATUS_PHASES } from "@/api/chatStatus";',
  `const CHAT_STATUS_PHASES = {
    AgentStreaming: "agent_streaming",
    ToolCallStreaming: "tool_call_streaming",
    ToolCallReady: "tool_call_ready",
    ToolBatchPlanned: "tool_batch_planned",
    ProviderReady: "provider_ready",
    ToolExecuting: "tool_executing",
  };`,
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "assistantMessageParts.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const {
  groupAssistantSteps,
  groupToolCalls,
  isToolVisibleInChat,
  legacyMessageToActionStep,
  parseCardTags,
  parentWorkingStatusLabel,
  selectParentWorkingStatus,
  splitReasoningSections,
  toolResultMetaToOutput,
} = await import(moduleUrl);

const typesSourcePath = new URL("../src/atlas/components/chat/types.ts", import.meta.url);
const typesSource = readFileSync(typesSourcePath, "utf8")
  .replace(
    'import { Globe, Terminal, FileText, Code2, type LucideIcon } from "lucide-react";',
    'const Globe = "Globe"; const Terminal = "Terminal"; const FileText = "FileText"; const Code2 = "Code2";',
  )
  .replace(
    'import { stripToolProtocolText } from "@/atlas/lib/toolProtocolText";',
    'const stripToolProtocolText = (text) => text;',
  )
  .replace(
    'import { projectCanonicalMessageParts } from "@/atlas/agentRuntime/messageProjection";',
    'const projectCanonicalMessageParts = (m) => ({ content: m.content ?? "", reasoning: m.reasoning, steps: m.steps, toolCalls: m.toolCalls });',
  );
const transpiledTypes = ts.transpileModule(typesSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "types.ts",
});
const typesModuleUrl = `data:text/javascript;base64,${Buffer.from(transpiledTypes.outputText).toString("base64")}`;
const { extractInlineThoughtBlocks } = await import(typesModuleUrl);

// Parent-level status regression contract: the compact status is a single
// projection and yields to detailed reasoning/execution surfaces.
assert.equal(
  selectParentWorkingStatus({
    isStreaming: false,
    chatStatusPhase: "agent_streaming",
    hasActiveReasoning: false,
    hasActiveExecution: false,
    hasPendingResponse: false,
  }),
  undefined,
  "terminal assistant messages must not expose a parent working status",
);
assert.equal(
  selectParentWorkingStatus({
    isStreaming: true,
    chatStatusPhase: "agent_streaming",
    hasActiveReasoning: true,
    hasActiveExecution: false,
    hasPendingResponse: false,
  }),
  undefined,
  "live reasoning owns the parent status announcement",
);
assert.equal(
  selectParentWorkingStatus({
    isStreaming: true,
    chatStatusPhase: "tool_executing",
    hasActiveReasoning: false,
    hasActiveExecution: true,
    hasPendingResponse: false,
  }),
  undefined,
  "running execution owns the parent status announcement",
);
const delegationFixtures = [
  { status: "running", ownsParentStatus: true },
  { status: "failed", ownsParentStatus: true },
  { status: "cancelled", ownsParentStatus: true },
];
for (const delegation of delegationFixtures) {
  assert.equal(
    selectParentWorkingStatus({
      isStreaming: true,
      chatStatusPhase: "agent_streaming",
      hasActiveReasoning: false,
      hasActiveExecution: false,
      // Mirrors SubagentStepData.status: each attention state suppresses the
      // parent label while its detailed row remains visible.
      hasActiveDelegation: delegation.ownsParentStatus && ["running", "failed", "cancelled"].includes(delegation.status),
      hasPendingResponse: false,
    }),
    undefined,
    `${delegation.status} subagent work owns the parent status announcement`,
  );
}
assert.equal(
  selectParentWorkingStatus({
    isStreaming: true,
    chatStatusPhase: "tool_executing",
    hasActiveReasoning: false,
    hasActiveExecution: false,
    hasPendingResponse: true,
  }),
  "responding",
  "post-tool response generation must replace stale execution phase text",
);
assert.equal(
  selectParentWorkingStatus({
    isStreaming: true,
    chatStatusPhase: "agent_streaming",
    hasActiveReasoning: false,
    hasActiveExecution: false,
    hasPendingResponse: true,
  }),
  "responding",
  "response text must replace a stale agent phase after the tool row is no longer last",
);
assert.equal(
  selectParentWorkingStatus({
    isStreaming: true,
    chatStatusPhase: "tool_batch_planned",
    hasActiveReasoning: false,
    hasActiveExecution: false,
    hasPendingResponse: false,
  }),
  "planning",
  "tool planning should use one compact planning status",
);
assert.equal(parentWorkingStatusLabel("thinking"), "Thinking...", "thinking status label should stay user-facing");
assert.equal(parentWorkingStatusLabel("planning"), "Planning tools...", "planning status label should stay user-facing");
assert.equal(parentWorkingStatusLabel("executing"), "Executing...", "execution status label should stay user-facing");
assert.equal(parentWorkingStatusLabel("responding"), "Responding...", "response status label should stay user-facing");

const parsed = parseCardTags('Before <card>{"type":"metric","data":{"value":42}}</card> After');
assert.equal(parsed.cards.length, 1, "card tags should be extracted");
assert.equal(parsed.cards[0].type, "metric", "card type should be preserved");
assert.equal(parsed.cleanText, "Before %%CARD_0%% After", "card markup should be replaced with a position marker so the renderer can interleave inline");
assert.equal(parsed.orderedCards.length, 1, "orderedCards should mirror the cards array length");
assert.equal(parsed.orderedCards[0].index, 0, "orderedCards index should be 0-based");
assert.equal(parsed.orderedCards[0].position, 7, "orderedCards position should point to the marker offset in cleanText");
assert.deepEqual(parsed.orderedCards[0].card, parsed.cards[0], "orderedCards entry should reference the same payload as cards[i]");

const partial = parseCardTags('Start <card>{"type":"metric"');
assert(partial.cleanText.includes("Generating card"), "partial card JSON should show a generation placeholder");
assert.equal(partial.cards.length, 0, "partial card JSON should not emit a card");

const malformedCompleteCard = parseCardTags('Before <card>{"type":</card> After');
assert.equal(malformedCompleteCard.cards.length, 0, "malformed complete card JSON should not create a card");
assert.equal(malformedCompleteCard.orderedCards.length, 0, "malformed complete card JSON should not create an orderedCards entry");
assert(!malformedCompleteCard.cleanText.includes("<card>"), "malformed complete card JSON should not leak raw opening tags");
assert(!malformedCompleteCard.cleanText.includes("</card>"), "malformed complete card JSON should not leak raw closing tags");
assert(malformedCompleteCard.cleanText.includes("Unable to render generated card"), "malformed complete card JSON should show a bounded fallback");

const cardWithAttributes = parseCardTags('Before <card data-kind="metric">{"card":"metric","data":{"value":7}}</card> After');
assert.equal(cardWithAttributes.cards.length, 1, "card tags with attributes should be extracted");
assert.equal(cardWithAttributes.cards[0].type, "metric", "card attribute form should preserve card type");

const cardWithClosingTagInJsonString = parseCardTags('Before <card>{"type":"metric","data":{"text":"literal </card> marker","value":9}}</card> After');
assert.equal(cardWithClosingTagInJsonString.cards.length, 1, "card parser should ignore closing tags inside JSON strings");
assert.equal(cardWithClosingTagInJsonString.cards[0].data.text, "literal </card> marker", "card parser should preserve JSON string content");
assert.equal(cardWithClosingTagInJsonString.cleanText, "Before %%CARD_0%% After", "card parser should replace the card wrapper with a position marker");
assert.equal(cardWithClosingTagInJsonString.orderedCards[0].position, 7, "orderedCards position should be the marker offset, not the original tag start");

const interleavedCards = parseCardTags('Intro <card>{"type":"stock","data":{"ticker":"AAPL"}}</card> middle <card>{"type":"weather","data":{"city":"Paris"}}</card> outro');
assert.equal(interleavedCards.cards.length, 2, "two card tags should produce two cards");
assert.equal(interleavedCards.orderedCards.length, 2, "two card tags should produce two orderedCards entries");
assert.equal(interleavedCards.orderedCards[0].index, 0, "first orderedCards entry should reference index 0");
assert.equal(interleavedCards.orderedCards[1].index, 1, "second orderedCards entry should reference index 1");
assert(interleavedCards.orderedCards[0].position < interleavedCards.orderedCards[1].position, "orderedCards positions should preserve source order");
assert(interleavedCards.cleanText.indexOf("%%CARD_0%%") < interleavedCards.cleanText.indexOf("%%CARD_1%%"), "card markers should appear in source order in cleanText");
assert(interleavedCards.orderedCards[0].position === interleavedCards.cleanText.indexOf("%%CARD_0%%"), "first orderedCards position should match first marker");
assert(interleavedCards.orderedCards[1].position === interleavedCards.cleanText.indexOf("%%CARD_1%%"), "second orderedCards position should match second marker");

// Regression: code-fence (```openui```) cards + <card> tag cards interleaved
// in non-source order. The parser pushes code-fence cards before tag cards,
// so the i-th push is NOT guaranteed to be the i-th token in cleanText —
// the token name (captured %%CARD_N%%) has to drive the position lookup.
// Without this test, an earlier off-by-one in the token-resolution loop
// passed the two-card-tag case but silently misaligned positions whenever an
// openui fence shared the source with a tag card.
const crossTypeCards = parseCardTags('```openui\n{"type":"fenceA","data":{}}\n``` middle <card>{"type":"tagB","data":{}}</card> end');
assert.equal(crossTypeCards.cards.length, 2, "code-fence + tag card should yield two cards in cards array");
assert.equal(crossTypeCards.orderedCards.length, 2, "code-fence + tag card should yield two orderedCards entries");
assert.equal(crossTypeCards.orderedCards[0].card.type, "fenceA", "orderedCards[0] should reference the first code-fence card (pushed first)");
assert.equal(crossTypeCards.orderedCards[1].card.type, "tagB", "orderedCards[1] should reference the <card> tag card (pushed second)");
assert(crossTypeCards.cleanText.indexOf("%%CARD_0%%") < crossTypeCards.cleanText.indexOf("%%CARD_1%%"), "tokens should still appear in source order in cleanText");
assert.equal(crossTypeCards.orderedCards[0].position, crossTypeCards.cleanText.indexOf("%%CARD_0%%"), "orderedCards[0].position must point at %%CARD_0%% in cleanText");
assert.equal(crossTypeCards.orderedCards[1].position, crossTypeCards.cleanText.indexOf("%%CARD_1%%"), "orderedCards[1].position must point at %%CARD_1%% in cleanText");

// Tighter regression for the same bug: REVERSED source order so push order and
// token-source order diverge. Push order is [fenceB @ idx 0, tagA @ idx 1]
// (code-fence regex runs before the <card>-tag regex), but the tokens appear
// in cleanText IN SOURCE ORDER as [%%CARD_1%% (tagA, source-first), %%CARD_0%%
// (fenceB, source-second)]. The OLD sequential `orderedCards[tokenIdx++]`
// resolution would map orderedCards[0].position to the %%CARD_1%% slot and
// orderedCards[1].position to the %%CARD_0%% slot — both wrong. The NEW
// token-name lookup reads %%CARD_N%% from the captured regex group to point
// each orderedCards entry at its own marker, regardless of source/push order.
const crossTypeCardsReversed = parseCardTags('<card>{"type":"tagA","data":{}}</card> ```openui\n{"type":"fenceB","data":{}}\n```');
assert.equal(crossTypeCardsReversed.cards.length, 2, "reversed code-fence + tag card should yield two cards");
assert.equal(crossTypeCardsReversed.orderedCards.length, 2, "reversed code-fence + tag card should yield two orderedCards entries");
assert.equal(crossTypeCardsReversed.orderedCards[0].card.type, "fenceB", "orderedCards[0] should reference the code-fence card even though it appears later in source");
assert.equal(crossTypeCardsReversed.orderedCards[1].card.type, "tagA", "orderedCards[1] should reference the tag card even though it appears earlier in source");
assert(crossTypeCardsReversed.cleanText.indexOf("%%CARD_1%%") < crossTypeCardsReversed.cleanText.indexOf("%%CARD_0%%"), "tokens should appear in source order in cleanText (%%CARD_1%% before %%CARD_0%%)");
assert.equal(crossTypeCardsReversed.orderedCards[0].position, crossTypeCardsReversed.cleanText.indexOf("%%CARD_0%%"), "orderedCards[0].position must match %%CARD_0%% slot in cleanText (fenceB's slot, NOT %%CARD_1%%'s slot)");
assert.equal(crossTypeCardsReversed.orderedCards[1].position, crossTypeCardsReversed.cleanText.indexOf("%%CARD_1%%"), "orderedCards[1].position must match %%CARD_1%% slot in cleanText (tagA's slot, NOT %%CARD_0%%'s slot)");

// Streaming partial-card: when a <card> opening tag splits across two
// text-fragment chunks that get merged in pushGroupedStep, the SINGLE
// parseCardTags call on the joined content must produce exactly one
// orderedCards entry whose position is the marker offset in cleanText.
const partiallyOpenCardAcrossFragments = groupAssistantSteps([
  { type: "text", content: 'A <card>{"type":"X","data":{"a":' },
  { type: "text", content: '1}}</card> B' },
]);
assert.equal(partiallyOpenCardAcrossFragments.length, 1, "split-open card fragments should merge into one text step");
assert.equal(partiallyOpenCardAcrossFragments[0].cleanText, "A %%CARD_0%% B", "merged split-card cleanText should contain exactly one marker between A and B");
assert.equal(partiallyOpenCardAcrossFragments[0].orderedCards.length, 1, "split-card across fragments should resolve to a single orderedCards entry");
assert.equal(partiallyOpenCardAcrossFragments[0].orderedCards[0].card.type, "X", "split-card type should be the parsed JSON card type");
assert.equal(partiallyOpenCardAcrossFragments[0].orderedCards[0].position, 2, "split-card orderedCards position should be the marker offset (2 = position of %%CARD_0%% in 'A %%CARD_0%% B')");

const titledSections = splitReasoningSections("Inspect the existing stream and constraints.");
assert.equal(titledSections.length, 1, "a reasoning payload should produce one readable section");
assert.equal(titledSections[0].title, "Context", "context-oriented reasoning should receive a useful title");

const explicitSections = splitReasoningSections("## Plan\n\n1. Keep the stream stable.\n\n## Verify\n\nRun the focused checks.");
assert.deepEqual(explicitSections.map((section) => section.title), ["Plan", "Verify"], "explicit reasoning headings should become section titles");

const interleavedReasoningSteps = groupAssistantSteps([
  { type: "reasoning", content: "Inspect the existing stream and constraints." },
  { type: "action", kind: "chat_status", content: "Provider update", status: "running", metadata: { phase: "agent_streaming" } },
  { type: "reasoning", content: "Plan the smallest safe grouping change." },
  { type: "action", kind: "orchestrator_progress", content: "Still working", status: "running" },
  { type: "reasoning", content: "Verify the result with focused tests." },
]);
const groupedInterleavedReasoning = interleavedReasoningSteps.find((step) => step.type === "reasoning");
assert(groupedInterleavedReasoning, "interleaved reasoning should remain a reasoning step alongside status updates");
assert.equal(groupedInterleavedReasoning.reasoningSections.length, 3, "interleaved thought chunks should become titled sections");
assert.deepEqual(
  groupedInterleavedReasoning.reasoningSections.map((section) => section.title),
  ["Context", "Approach", "Validation"],
  "section titles should reflect the purpose of each interleaved thought chunk",
);
assert(groupedInterleavedReasoning.content.includes("Inspect the existing stream") && groupedInterleavedReasoning.content.includes("Verify the result"), "merged reasoning should preserve every thought chunk");

const multiThought = extractInlineThoughtBlocks("A <think>first</think> B <thought>second</thought> C");
assert.equal(multiThought.reasoning, "first\n\nsecond", "all closed think/thought blocks should be preserved");
assert.equal(multiThought.content, "A  B  C", "all closed think/thought blocks should be removed from visible content");

const openThought = extractInlineThoughtBlocks("Visible <think>still streaming");
assert.equal(openThought.content, "Visible", "open think tag should keep preceding visible content");
assert.equal(openThought.reasoning, "still streaming", "open think tag should preserve streaming reasoning");

const steps = groupAssistantSteps([
  { type: "action", kind: "chat_status", content: "Planning tools", status: "running" },
  { type: "action", kind: "tool_call", content: "hidden duplicate", status: "running" },
  { type: "tool-call", toolCall: { id: "tool-1", name: "read_file", status: "running", input: { path: "a" }, output: "", batchId: "batch-initial" } },
  { type: "tool-call", toolCall: { id: "tool-2", name: "web_search", status: "running", input: { query: "b" }, output: "", batchId: "batch-initial" } },
  { type: "text", content: "Answer " },
  { type: "text", content: "stream" },
]);

assert.equal(steps.length, 3, "hidden tool action rows should be removed and adjacent tools/text grouped");
assert.equal(steps[0].type, "action", "status action should remain first");
assert.equal(steps[1].type, "tool-group", "parallel tool calls should become one tool group");
assert.equal(steps[1].toolCalls.length, 2, "tool group should contain both parallel tools");
assert.equal(steps[2].cleanText, "Answer stream", "adjacent text chunks should merge");
assert(Array.isArray(steps[2].orderedCards), "merged text step should expose an orderedCards array");
assert.equal(steps[2].orderedCards.length, 0, "text with no cards should have zero orderedCards");

const interleavedTextSteps = groupAssistantSteps([
  { type: "text", content: 'Hello <card>{"type":"metric","data":{"value":1}}</card> world ' },
  { type: "text", content: 'continues here' },
]);
assert.equal(interleavedTextSteps.length, 1, "two adjacent text chunks should still merge into one step");
assert.equal(interleavedTextSteps[0].orderedCards.length, 1, "merged text step should carry the single card extracted");
assert.equal(interleavedTextSteps[0].cleanText, "Hello %%CARD_0%% world continues here", "merged text should keep the card marker at the original position");
assert.equal(interleavedTextSteps[0].orderedCards[0].position, 6, "merged text step's orderedCards position should point to the marker in cleanText");

assert.equal(isToolVisibleInChat({ id: "list", name: "tool_list", status: "completed", input: {}, output: "[]" }), false, "tool_list should stay out of the chat transcript");
assert.equal(isToolVisibleInChat({ id: "info", name: "tool_info", status: "completed", input: {}, output: "{}" }), false, "tool_info should stay out of the chat transcript");
assert.equal(isToolVisibleInChat({ id: "wrapped-list", name: "tool_exec", status: "completed", input: { tool_id: "tool_list" }, output: "[]" }), false, "wrapped tool_list executions should stay out of the chat transcript");
assert.equal(isToolVisibleInChat({ id: "search", name: "tool_exec", status: "completed", input: { tool_id: "web_search", arguments: { query: "latest news" } }, output: '{"results":[{"title":"News"}]}' }), true, "actual web search executions should remain visible");

const filteredToolGroups = groupAssistantSteps([
  { type: "tool-call", toolCall: { id: "list", name: "tool_list", status: "completed", input: {}, output: "[]" } },
  { type: "tool-call", toolCall: { id: "info", name: "tool_info", status: "completed", input: {}, output: "{}" } },
  { type: "tool-call", toolCall: { id: "wrapped-list", name: "tool_exec", status: "completed", input: { tool_id: "tool_list" }, output: "[]" } },
  { type: "tool-call", toolCall: { id: "search", name: "tool_exec", status: "completed", input: { tool_id: "web_search", arguments: { query: "latest news" } }, output: '{"results":[{"title":"News"}]}' } },
]);
assert.equal(filteredToolGroups.length, 1, "only user-meaningful tool calls should render in grouped steps");
assert.equal(filteredToolGroups[0].type, "tool-group", "visible web search should still render as a tool group");
assert.equal(filteredToolGroups[0].toolCalls.length, 1, "discovery tools should be removed from the visible group");

const filteredPersistedTools = groupToolCalls([
  { id: "list", name: "tool_list", status: "completed", input: {}, output: "[]" },
  { id: "info", name: "tool_info", status: "completed", input: {}, output: "{}" },
  { id: "wrapped-list", name: "tool_exec", status: "completed", input: { tool_id: "tool_list" }, output: "[]" },
  { id: "search", name: "tool_exec", status: "completed", input: { tool_id: "web_search", arguments: { query: "latest news" } }, output: '{"results":[{"title":"News"}]}' },
]);
assert.equal(filteredPersistedTools.length, 1, "persisted discovery tool calls should not render after reload");
assert.equal(filteredPersistedTools[0].id, "search", "web search execution should remain visible after filtering");

const mergedAgentLifecycleSteps = groupAssistantSteps([
  {
    type: "action",
    kind: "agent_spawn",
    status: "running",
    content: "Inspect streaming",
    eventId: "agent:spawn:researcher",
    timestamp: 1000,
    metadata: {
      iteration: 1,
      spawn: {
        parentAgent: "Coordinator",
        childAgent: "Researcher",
        task: "Inspect streaming",
        status: "spawned",
      },
    },
  },
  {
    type: "action",
    kind: "agent_complete",
    status: "completed",
    eventId: "agent:complete:researcher",
    timestamp: 1600,
    metadata: {
      iteration: 1,
      resultSummary: "Streaming path verified.",
      spawn: {
        parentAgent: "Coordinator",
        childAgent: "Researcher",
        task: "Inspect streaming",
        status: "completed",
        durationMs: 600,
      },
    },
  },
]);
assert.equal(mergedAgentLifecycleSteps.length, 1, "matching agent spawn and completion should render as one evolving delegation row");
assert.equal(mergedAgentLifecycleSteps[0].kind, "agent_complete", "merged delegation row should use the latest lifecycle kind");
assert.equal(mergedAgentLifecycleSteps[0].status, "completed", "merged delegation row should use the latest status");
assert.equal(mergedAgentLifecycleSteps[0].metadata.resultSummary, "Streaming path verified.", "merged delegation row should preserve the final result summary");
assert.equal(mergedAgentLifecycleSteps[0].metadata.spawn.durationMs, 600, "merged delegation row should preserve completion duration");

const interleavedToolSteps = groupAssistantSteps([
  { type: "action", kind: "chat_status", content: "Parallel batch planned", status: "running", metadata: { phase: "tool_batch_planned", parallel: true } },
  { type: "tool-call", toolCall: { id: "tool-a", name: "read_file", status: "running", input: { path: "a" }, output: "", startTime: 1000, batchId: "batch-interleaved" } },
  { type: "action", kind: "chat_status", content: "Waiting for tools", status: "running", metadata: { phase: "tool_batch_running" } },
  { type: "tool-call", toolCall: { id: "tool-b", name: "web_search", status: "running", input: { query: "b" }, output: "", startTime: 1200, batchId: "batch-interleaved" } },
]);
assert.equal(interleavedToolSteps.length, 3, "status rows should not split one parallel tool batch");
assert.equal(interleavedToolSteps[1].type, "tool-group", "first tool should create a visible batch");
assert.equal(interleavedToolSteps[1].toolCalls.length, 2, "interleaved parallel tools should stay in one group");

const separatedToolSteps = groupAssistantSteps([
  { type: "tool-call", toolCall: { id: "tool-c", name: "read_file", status: "completed", input: {}, output: "ok", startTime: 1000 } },
  { type: "text", content: "Then " },
  { type: "tool-call", toolCall: { id: "tool-d", name: "run_command", status: "running", input: {}, output: "", startTime: 1100 } },
]);
assert.equal(separatedToolSteps.length, 3, "answer text should split separate tool phases");
assert.equal(separatedToolSteps[0].type, "tool-group", "first tool phase should remain visible");
assert.equal(separatedToolSteps[2].type, "tool-group", "second tool phase should remain visible");

const interleavedReasoningToolTextSteps = groupAssistantSteps([
  { type: "reasoning", content: "Choose the relevant files." },
  { type: "tool-call", toolCall: { id: "ordered-a", name: "read_file", status: "completed", input: { path: "a.ts" }, output: "a" } },
  { type: "text", content: "I found the first result." },
  { type: "tool-call", toolCall: { id: "ordered-b", name: "run_command", status: "completed", input: { command: "npm test" }, output: "passed" } },
  { type: "reasoning", content: "Validate the second result." },
  { type: "text", content: "The checks passed." },
]);
assert.deepEqual(
  interleavedReasoningToolTextSteps.map((step) => step.type),
  ["reasoning", "tool-group", "text", "tool-group", "reasoning", "text"],
  "reasoning, tools, and prose must remain in source order instead of being hoisted into one leading batch",
);
assert.deepEqual(
  interleavedReasoningToolTextSteps.filter((step) => step.type === "tool-group").map((step) => step.toolCalls[0].id),
  ["ordered-a", "ordered-b"],
  "separated tool phases must retain their original order",
);

const contiguousFarApartToolSteps = groupAssistantSteps([
  { type: "tool-call", toolCall: { id: "tool-e", name: "web_search", status: "completed", input: { query: "weather ho chi minh" }, output: "{}", startTime: 1000 } },
  { type: "action", kind: "chat_status", content: "Searching again", status: "running", metadata: { phase: "tool_batch_running" } },
  { type: "tool-call", toolCall: { id: "tool-f", name: "web_search", status: "completed", input: { query: "weather vung tau" }, output: "{}", startTime: 9000 } },
  { type: "action", kind: "orchestrator_progress", content: "Collecting results", status: "running" },
  { type: "tool-call", toolCall: { id: "tool-g", name: "web_search", status: "completed", input: { query: "weather route ho chi minh to vung tau" }, output: "{}", startTime: 18000 } },
]);
const contiguousFarApartVisibleGroups = contiguousFarApartToolSteps.filter((step) => step.type === "tool-group");
assert.equal(contiguousFarApartVisibleGroups.length, 3, "tools without an explicit batch identity must remain separate timeline rows");
assert(contiguousFarApartVisibleGroups.every((step) => step.toolCalls.length === 1), "missing batch identity must never create an inferred multi-tool batch");

const explicitBatchToolSteps = groupAssistantSteps([
  { type: "tool-call", toolCall: { id: "batch-tool-a", name: "read_file", status: "running", input: { path: "a" }, output: "", startTime: 1000, batchId: "batch-1" } },
  { type: "tool-call", toolCall: { id: "batch-tool-b", name: "read_file", status: "running", input: { path: "b" }, output: "", startTime: 5000, batchId: "batch-1" } },
]);
assert.equal(explicitBatchToolSteps.length, 1, "same explicit batch id should group even when timestamps are far apart");
assert.equal(explicitBatchToolSteps[0].type, "tool-group", "explicit batch should render as one tool group");
assert.equal(explicitBatchToolSteps[0].toolCalls.length, 2, "explicit batch group should contain both tools");
assert(explicitBatchToolSteps[0].toolCalls.every((tool) => tool.batchId === "batch-1"), "explicit batch id should survive grouping");

const explicitToolBatchOnlySteps = groupAssistantSteps([
  { type: "tool-call", toolCall: { id: "tool-batch-only-a", name: "read_file", status: "running", input: { path: "a" }, output: "", startTime: 1000, toolBatchId: "tool-batch-only" } },
  { type: "tool-call", toolCall: { id: "tool-batch-only-b", name: "read_file", status: "running", input: { path: "b" }, output: "", startTime: 5000, toolBatchId: "tool-batch-only" } },
]);
assert.equal(explicitToolBatchOnlySteps.length, 1, "same explicit toolBatchId should group even when batchId is absent");
assert.equal(explicitToolBatchOnlySteps[0].type, "tool-group", "toolBatchId-only tools should render as one group");
assert.equal(explicitToolBatchOnlySteps[0].toolCalls.length, 2, "toolBatchId-only group should contain both tools");

const fallbackToolSteps = groupAssistantSteps([
  {
    type: "action",
    kind: "tool_result",
    content: "fallback preview",
    status: "completed",
    eventId: "tool:legacy-1",
    timestamp: 900,
    metadata: {
      agentId: "agent-research-1",
      agentName: "Researcher",
      iteration: 3,
      toolResult: {
        toolName: "read_file",
        status: "ok",
        durationMs: 8,
        contentSummary: "Read 12 lines from src/App.tsx",
        rawResult: { files: [{ path: "src/App.tsx", lines: 12 }] },
        args: { path: "src/App.tsx" },
      },
    },
  },
]);
assert.equal(fallbackToolSteps.length, 1, "orphan tool result action should become a visible tool group");
assert.equal(fallbackToolSteps[0].type, "tool-group", "orphan tool result should render through ToolCallCard");
assert.equal(fallbackToolSteps[0].toolCalls[0].id, "legacy-1", "synthetic tool card should preserve the tool id");
assert.equal(fallbackToolSteps[0].toolCalls[0].status, "completed", "synthetic tool card should preserve completion status");
assert.equal(fallbackToolSteps[0].toolCalls[0].agentName, "Researcher", "synthetic tool card should preserve agent ownership");
assert.equal(fallbackToolSteps[0].toolCalls[0].iteration, 3, "synthetic tool card should preserve agent iteration");
assert(fallbackToolSteps[0].toolCalls[0].output.includes("src/App.tsx"), "synthetic tool card should preserve result output");

const persistedToolLifecycleSteps = groupAssistantSteps([
  {
    type: "action",
    kind: "tool_call",
    content: "run command",
    status: "running",
    eventId: "tool:build-1",
    timestamp: 1000,
    metadata: {
      agentName: "Builder",
      iteration: 2,
      toolCall: {
        toolName: "run_command",
        status: "running",
        toolCallId: "build-1",
        args: { command: "npm run build" },
      },
    },
  },
  {
    type: "action",
    kind: "tool_result",
    content: "build passed",
    status: "completed",
    eventId: "tool:build-1",
    timestamp: 1400,
    metadata: {
      agentName: "Builder",
      iteration: 2,
      toolResult: {
        toolName: "run_command",
        status: "ok",
        durationMs: 400,
        contentSummary: "Production build completed",
        args: {},
      },
    },
  },
]);
assert.equal(persistedToolLifecycleSteps.length, 1, "persisted tool call/result pair should render as one batch");
assert.equal(persistedToolLifecycleSteps[0].type, "tool-group", "persisted tool lifecycle should render through tool cards");
assert.equal(persistedToolLifecycleSteps[0].toolCalls.length, 1, "same-id tool call/result actions should merge into one card");
assert.equal(persistedToolLifecycleSteps[0].toolCalls[0].status, "completed", "merged persisted tool should use terminal status");
assert.deepEqual(persistedToolLifecycleSteps[0].toolCalls[0].input, { command: "npm run build" }, "merged persisted tool should preserve original input");
assert(persistedToolLifecycleSteps[0].toolCalls[0].output.includes("Production build completed"), "merged persisted tool should preserve result preview");
assert.equal(persistedToolLifecycleSteps[0].toolCalls[0].agentName, "Builder", "merged persisted tool should preserve owner");
assert.equal(persistedToolLifecycleSteps[0].toolCalls[0].completedAt, 1400, "merged persisted tool should preserve completion timestamp");

const mixedLivePersistedToolSteps = groupAssistantSteps([
  {
    type: "tool-call",
    toolCall: {
      id: "mixed-1",
      name: "run_command",
      status: "running",
      input: { command: "npm run build" },
      output: "",
      startTime: 3000,
    },
  },
  {
    type: "action",
    kind: "tool_result",
    content: "Build passed",
    status: "completed",
    eventId: "tool:mixed-1",
    timestamp: 3500,
    metadata: {
      agentName: "Builder",
      toolResult: {
        toolName: "run_command",
        status: "ok",
        durationMs: 500,
        contentSummary: "Build passed",
        rawResult: { stdout: "npm run build completed", exitCode: 0 },
        args: {},
      },
    },
  },
]);
assert.equal(mixedLivePersistedToolSteps.length, 1, "live tool card and persisted result should render as one batch");
assert.equal(mixedLivePersistedToolSteps[0].type, "tool-group", "mixed live/persisted lifecycle should render through tool cards");
assert.equal(mixedLivePersistedToolSteps[0].toolCalls.length, 1, "same-id live tool and persisted result should merge");
assert.equal(mixedLivePersistedToolSteps[0].toolCalls[0].status, "completed", "persisted result should complete the live tool card");
assert.deepEqual(mixedLivePersistedToolSteps[0].toolCalls[0].input, { command: "npm run build" }, "persisted result should not erase live input");
assert.equal(mixedLivePersistedToolSteps[0].toolCalls[0].durationMs, 500, "persisted result should add duration");
assert.equal(mixedLivePersistedToolSteps[0].toolCalls[0].completedAt, 3500, "persisted result should add completion timestamp");
assert(mixedLivePersistedToolSteps[0].toolCalls[0].output.includes("npm run build completed"), "persisted result should add stdout preview");

const snakeCasePersistedToolSteps = groupAssistantSteps([
  {
    type: "action",
    kind: "tool_call",
    content: "read file",
    status: "running",
    eventId: "tool:snake-1",
    timestamp: 2000,
    metadata: {
      agentId: "worker-1",
      agentName: "Frontend worker",
      iteration: 5,
      toolCall: {
        tool_name: "read_file",
        tool_call_id: "snake-1",
        status: "running",
        arguments: { path: "src/atlas/components/chat/AssistantMessage.tsx" },
      },
    },
  },
  {
    type: "action",
    kind: "tool_result",
    content: "read ok",
    status: "completed",
    eventId: "tool:snake-1",
    timestamp: 2200,
    metadata: {
      agentId: "worker-1",
      agentName: "Frontend worker",
      iteration: 5,
      toolResult: {
        tool_name: "read_file",
        tool_call_id: "snake-1",
        status: "ok",
        duration_ms: 200,
        content_summary: "Read AssistantMessage renderer",
        raw_result: {
          files: [{ path: "src/atlas/components/chat/AssistantMessage.tsx", changeType: "modified" }],
        },
        batch_id: "batch-snake",
      },
    },
  },
]);
assert.equal(snakeCasePersistedToolSteps.length, 1, "snake_case persisted tool lifecycle should render as one batch");
assert.equal(snakeCasePersistedToolSteps[0].type, "tool-group", "snake_case persisted tool lifecycle should render through tool cards");
assert.equal(snakeCasePersistedToolSteps[0].toolCalls[0].name, "read_file", "snake_case tool_name should become tool card name");
assert.deepEqual(
  snakeCasePersistedToolSteps[0].toolCalls[0].input,
  { path: "src/atlas/components/chat/AssistantMessage.tsx" },
  "snake_case persisted tool should preserve original arguments",
);
assert.equal(snakeCasePersistedToolSteps[0].toolCalls[0].durationMs, 200, "snake_case duration_ms should normalize");
assert.equal(snakeCasePersistedToolSteps[0].toolCalls[0].agentName, "Frontend worker", "snake_case persisted tool should preserve owner");
assert.equal(snakeCasePersistedToolSteps[0].toolCalls[0].batchId, "batch-snake", "snake_case batch_id should normalize");
assert(snakeCasePersistedToolSteps[0].toolCalls[0].output.includes("AssistantMessage.tsx"), "snake_case raw_result should preserve result preview");

const persistedOutput = toolResultMetaToOutput({
  toolName: "edit_file",
  status: "ok",
  durationMs: 12,
  contentSummary: "Updated execution trace UI",
  files: [{ path: "src/atlas/components/chat/AgentExecutionTrace.tsx", changeType: "modified", linesAdded: 8 }],
  args: { path: "src/atlas/components/chat/AgentExecutionTrace.tsx" },
});
assert(persistedOutput.includes("Updated execution trace UI"), "persisted tool output should retain summary when rawResult is missing");
assert(persistedOutput.includes("AgentExecutionTrace.tsx"), "persisted tool output should retain file preview data when rawResult is missing");

const mergedRawOutput = toolResultMetaToOutput({
  toolName: "run_command",
  status: "ok",
  durationMs: 40,
  contentSummary: "Build passed",
  rawResult: { stdout: "npm run build completed", exitCode: 0 },
  files: [{ path: "package.json", changeType: "modified" }],
});
assert(mergedRawOutput.includes("npm run build completed"), "rawResult stdout should remain visible");
assert(mergedRawOutput.includes("Build passed"), "rawResult output should include summary fallback");
assert(mergedRawOutput.includes("package.json"), "rawResult output should merge file metadata");

const legacyApproval = legacyMessageToActionStep({
  id: "approval-1",
  role: "assistant",
  content: "Need permission",
  kind: "approval_request",
  createdAt: 123,
  metadata: {
    approvalRequest: {
      tool_call_id: "tool-approval-1",
      tool_name: "run_command",
      arguments: { command: "npm test" },
    },
  },
});
assert.equal(legacyApproval.type, "action", "legacy approval messages should render through AgentActionStep");
assert.equal(legacyApproval.kind, "approval_request", "legacy action should keep the message kind");
assert.equal(legacyApproval.eventId, "legacy:approval-1", "legacy action should have a stable event id");
assert.equal(legacyApproval.metadata.approvalRequest.tool_name, "run_command", "legacy action should preserve approval metadata");

const retried = groupToolCalls([
  { id: "tool-a1", name: "run_command", status: "error", input: { command: "npm test" }, output: "failed" },
  { id: "tool-a2", name: "run_command", status: "completed", input: { command: "npm test" }, output: "passed" },
]);
assert.equal(retried.length, 1, "same-name retry should collapse into one tool row");
assert.equal(retried[0].status, "completed", "collapsed retry should use latest status");
assert.equal(retried[0].retries, 1, "retry count should be retained");

const retriedWithOwner = groupToolCalls([
  { id: "tool-b1", name: "run_command", status: "error", input: { command: "npm test" }, output: "failed", agentName: "Runner" },
  { id: "tool-b2", name: "run_command", status: "completed", input: { command: "npm test" }, output: "passed", agentName: "Verifier", iteration: 4 },
]);
assert.equal(retriedWithOwner[0].agentName, "Verifier", "collapsed retry should use latest tool owner");
assert.equal(retriedWithOwner[0].iteration, 4, "collapsed retry should use latest iteration");

console.log("assistant message parts ok");
