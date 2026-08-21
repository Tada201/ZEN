import fs from 'node:fs';
import path from 'node:path';

// The legacy `src/components/widgets/orchestrator/` live-session widget was
// retired; `OrchestratorPanel` (the Agents panel) is now the only live
// delegation surface, and it derives its model from the canonical delegation
// tree instead of a parallel panel model + hand-written CSS file.
const root = process.cwd();
const panel = fs.readFileSync(path.join(root, 'src/atlas/components/right-panel/OrchestratorPanel.tsx'), 'utf8');
const tree = fs.readFileSync(path.join(root, 'src/atlas/agentRuntime/delegationTree.ts'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'src/atlas/agentRuntime/subagentRuntime.ts'), 'utf8');

const requiredPanelSnippets = [
  'EMPTY_MESSAGES',
  'const messages = useChatStore((state) =>',
  'buildDelegationTree',
  'selectDelegationChildTools',
  'Running ·',
  'Ended ·',
];

const requiredTreeSnippets = [
  'export function buildDelegationTree',
  'failedChildToolCount',
  'runningChildToolCount',
];

const requiredRuntimeSnippets = [
  'export function normalizeScopedSubagentStatus',
  'export function mergeScopedSubagentRecords',
];

for (const snippet of requiredPanelSnippets) {
  if (!panel.includes(snippet)) {
    throw new Error(`Right panel live agent verifier failed: missing ${snippet}`);
  }
}
for (const snippet of requiredTreeSnippets) {
  if (!tree.includes(snippet)) {
    throw new Error(`Delegation tree verifier failed: missing ${snippet}`);
  }
}
for (const snippet of requiredRuntimeSnippets) {
  if (!runtime.includes(snippet)) {
    throw new Error(`Subagent runtime verifier failed: missing ${snippet}`);
  }
}

if (panel.includes('invoke(') || panel.includes('invoke<')) {
  throw new Error('Right panel must not fetch orchestration state through raw invoke; it should use the live chat store.');
}

if (runtime.includes('status || "running"') || runtime.includes("status || 'running'")) {
  throw new Error('Right panel must not label replayed tools as running merely because their persisted status is absent.');
}

if (!runtime.includes('return "uncertain"')) {
  throw new Error('An unknown persisted subagent status must resolve to uncertain rather than a success state.');
}

console.log('right-panel-live-agents verifier passed');
