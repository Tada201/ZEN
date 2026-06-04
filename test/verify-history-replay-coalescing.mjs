import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const querySource = readFileSync(
  new URL('../src/atlas/hooks/chat/useChatQueries.ts', import.meta.url),
  'utf8',
);
const source = readFileSync(
  new URL('../src/atlas/hooks/chat/chatTimelineReplay.ts', import.meta.url),
  'utf8',
);

assert(querySource.includes('coalesceTimelineMessages'), 'chat query hook should use replay coalescing for loaded history');

assert(source.includes('"agent_chunk"'), 'history replay should recognize persisted agent_chunk events');
assert(source.includes('"task_created"') && source.includes('"task_updated"') && source.includes('"task_list_updated"') && source.includes('"task_complexity_analyzed"'), 'history replay should recognize the full task planning lifecycle');
assert(source.includes('agentStream: metadata.agentStream || metadata.agent_stream'), 'history replay should normalize persisted agent stream metadata');
assert(source.includes('toolCallPreview: metadata.toolCallPreview || metadata.tool_call_preview'), 'history replay should normalize persisted tool preview metadata');
assert(!source.includes('meta.tool_call') && !source.includes('meta.tool_result') && !source.includes('meta.approval_request'), 'history replay event ids should use normalized metadata fields');
assert(!source.includes('metadata?.tool_call') && !source.includes('metadata?.tool_result'), 'history replay tool conversion should not duplicate snake/camel metadata reads after normalization');
assert(source.includes('message.kind === "agent_chunk"') && source.includes('agent-chunk:${message.sessionId || "history"}'), 'history replay should use stable agent chunk event ids');
assert(source.includes('function mergeReplayToolCall') && source.includes('keepTerminalStatus') && source.includes('isEmptyToolInput(incoming.input) ? previous.input : incoming.input'), 'history replay should preserve terminal tool state and original input when late events arrive');
assert(source.includes('function mergeReplayActionStep') && source.includes('previous.metadata?.agentStream') && source.includes('previousContent + incomingContent'), 'history replay should merge agent stream chunks instead of replacing transcript content');
assert(source.includes('pendingSteps[existingIdx] = mergeReplayActionStep') && source.includes('const merged = mergeReplayToolCall(previous, toolCall)'), 'timeline coalescing should use replay-safe merge helpers');

console.log('history replay coalescing verifier passed');
