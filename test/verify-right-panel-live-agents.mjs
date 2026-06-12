import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const panelPath = path.join(root, 'src/components/widgets/orchestrator/AgentOrchestratorPanel.tsx');
const modelPath = path.join(root, 'src/components/widgets/orchestrator/agentOrchestratorModel.ts');
const liveSessionPath = path.join(root, 'src/components/widgets/orchestrator/AgentOrchestratorLiveSession.tsx');
const cssPath = path.join(root, 'src/components/widgets/orchestrator/agent-orchestrator.css');

const panel = fs.readFileSync(panelPath, 'utf8');
const model = fs.readFileSync(modelPath, 'utf8');
const liveSession = fs.readFileSync(liveSessionPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

const requiredPanelSnippets = [
  'EMPTY_MESSAGES',
  'useChatStore(s => activeSessionId ? s.sessionMessages[activeSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES)',
  'useChatStore(s => activeSessionId ? s.streamingChats[activeSessionId] ?? false : false)',
  'useAgentActivityStore(s => s.activeTasks)',
  'useAgentActivityStore(s => s.activities)',
  '<LiveSessionExecution model={liveModel} isStreaming={isSessionStreaming} />',
];

const requiredModelSnippets = [
  'export const EMPTY_MESSAGES: Message[] = []',
  'buildAgentExecutionTraceModel(toolCalls, actionSteps)',
  'buildAgentDelegationLaneModel',
  "step.kind === 'agent_chunk'",
  'stepToolCalls',
  'fallbackToolStatus',
  'tool.status || fallbackToolStatus',
];

const requiredLiveSessionSnippets = [
  '<AgentDelegationLane',
  'Recent tools',
  'const status = tool.status',
  "status.replace('_', ' ')",
];

for (const snippet of requiredPanelSnippets) {
  if (!panel.includes(snippet)) {
    throw new Error(`Right panel live agent verifier failed: missing ${snippet}`);
  }
}
for (const snippet of requiredModelSnippets) {
  if (!model.includes(snippet)) {
    throw new Error(`Right panel live agent model verifier failed: missing ${snippet}`);
  }
}
for (const snippet of requiredLiveSessionSnippets) {
  if (!liveSession.includes(snippet)) {
    throw new Error(`Right panel live session verifier failed: missing ${snippet}`);
  }
}

if (panel.includes("invoke(") || panel.includes('invoke<')) {
  throw new Error('Right panel must not fetch orchestration state through raw invoke; it should use the live chat store.');
}

if (liveSession.includes("tool.status || 'running'")) {
  throw new Error('Right panel must not label replayed tools as running merely because their persisted status is absent.');
}

const requiredCssSnippets = [
  '.live-agent-panel__metrics',
  '.live-agent-panel__state--running',
  '.live-agent-panel__tool-row',
  '.live-agent-panel__tool-status--awaiting_approval',
];

for (const snippet of requiredCssSnippets) {
  if (!css.includes(snippet)) {
    throw new Error(`Right panel live agent CSS verifier failed: missing ${snippet}`);
  }
}

console.log('right-panel-live-agents verifier passed');
