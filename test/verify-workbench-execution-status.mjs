import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const registry = read("src/lib/features/workbenchRegistry.ts");
const features = read("src/lib/features/frontendFeatures.ts");
const status = read("src/atlas/components/chat/workspaceExecutionStatus.ts");
const collector = read("src/atlas/components/chat/messageToolCallModel.ts");
const approvals = read("src/atlas/components/chat/right-panel/approvalCenterModel.ts");
const indicator = read("src/atlas/components/chat/WorkspaceExecutionIndicator.tsx");
const workspace = read("src/atlas/sections/WorkspaceSection.tsx");
const contextHeader = read("src/atlas/components/chat/WorkspaceContextHeader.tsx");
const rightPanel = read("src/atlas/components/RightPanel.tsx");
const rail = read("src/components/Zen/SecondaryActivityBar.tsx");

assert(registry.includes("export interface WorkbenchView"), "workbench views must have a typed registry shape");
assert(registry.includes("getVisibleRightPanelFeatures"), "the workbench registry must derive from the feature maturity registry");
assert(registry.includes("getVisibleWorkbenchViews"), "the workbench registry must expose visible views");
assert(registry.includes("getDefaultWorkbenchView"), "the workbench registry must own default view resolution");
assert(rail.includes("getVisibleWorkbenchViews"), "the activity rail must consume the workbench registry");
assert(rightPanel.includes("getWorkbenchView") && rightPanel.includes("isWorkbenchViewVisible"), "the right panel must consume the workbench registry");
assert(features.includes("rightPanelTabId: \"approvals\""), "approval center must remain a feature-gated workbench view");

assert(collector.includes("export function collectMessageToolCalls"), "message tool-call projection must have one shared owner");
assert(status.includes("collectMessageToolCalls"), "workspace status must include step-only persisted tool calls");
assert(approvals.includes("collectMessageToolCalls"), "approval center must share the same tool-call projection");
assert(!status.includes("flatMap((message) => message.toolCalls ?? [])"), "status must not bypass the shared tool-call projection");

for (const label of ["Needs approval", "Failed", "Running", "Complete", "Ready"]) {
  assert(status.includes(`label: \"${label}\"`), `status projection must expose ${label}`);
}
assert(status.includes('tool.status === "awaiting_approval"'), "approval must outrank running in the status projection");
assert(status.includes('tool.status === "running"'), "running tool count must come from canonical tool calls");
assert(status.includes('lastAssistant?.status === "failed"'), "assistant failures must be visible in the workspace status");

assert(contextHeader.includes("<WorkspaceExecutionIndicator"), "the workspace header must expose live execution status");
assert(indicator.includes('role="status"'), "passive execution status must be a status region");
assert(indicator.includes('aria-live="polite"'), "execution status changes must be announced politely");
assert(indicator.includes("aria-busy={status.kind === \"running\"}"), "running status must expose busy state");
assert(indicator.includes("Open related workbench panel"), "actionable status must explain its navigation affordance");
assert(rightPanel.includes('aria-label="Close workbench panel"'), "workbench close control must be accessible");

console.log("workbench execution status contract passed");
