import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const model = read("src/atlas/agentRuntime/runInspectorModel.ts");
const inspector = read("src/atlas/components/right-panel/RunInspector.tsx");
const panel = read("src/atlas/components/RightPanel.tsx");
const features = read("src/lib/features/frontendFeatures.ts");
const uiStore = read("src/lib/stores/useUIStore.ts");
const subagent = read("src/atlas/components/chat/SubagentExecutionCard.tsx");
const status = read("src/atlas/components/chat/RunStatusPopover.tsx");
const workspaceStatus = read("src/atlas/components/chat/workspaceExecutionStatus.ts");

assert(model.includes("export function buildRunInspectorModel"), "inspector must consume one shared trace projection");
assert(model.includes("export function filterInspectorNodes"), "inspector nodes must support search and status filtering");
assert(model.includes("safeSummary"), "inspector summaries must be bounded and redacted");
assert(model.includes("fileCount") && model.includes("resultCount"), "inspector summaries must expose useful tool outcomes");
assert(model.includes("parentId"), "inspector nodes must preserve execution hierarchy");
assert(model.includes('message.status === "sending" ? "streaming"'), "active assistant runs must be represented as streaming");

for (const view of ["summary", "timeline", "tree", "agents", "diagnostics"]) {
  assert(inspector.includes(`\"${view}\"`), `inspector must expose the ${view} view`);
}
assert(inspector.includes("Export redacted trace"), "inspector must provide safe trace export");
assert(inspector.includes("Search trace"), "inspector must provide trace search");
assert(inspector.includes("Execution tree"), "tree view must be labeled for assistive technology");
assert(inspector.includes("safeDetails"), "diagnostics must show safe node details rather than raw event payloads");
assert(inspector.includes("No execution trace"), "inspector must have an honest empty state");
assert(inspector.includes("Restoring execution trace") && inspector.includes("Retry trace load"), "inspector must disclose loading and retryable trace failures");
assert(inspector.includes("MAX_INSPECTOR_RENDER_NODES") && inspector.includes("Showing the first"), "inspector must bound large trace rendering");
assert(inspector.includes("selectLatestTrace") && inspector.includes("traceVersion"), "inspector must select normalized traces deterministically");
assert(inspector.includes("Filter trace phases") && inspector.includes("Filter trace agents") && inspector.includes("Filter trace tools"), "inspector must expose phase, agent, and tool filters");

assert(features.includes('right.inspector') && features.includes('rightPanelTabId: "inspector"'), "Run Inspector must be registered as a visible workbench feature");
assert(panel.includes('case \'inspector\''), "right panel must render the inspector tab");
assert(panel.includes("const RunInspector = React.lazy"), "inspector should be lazy-loaded");

assert(uiStore.includes("focusedRun"), "run focus should live in the UI store");
assert(uiStore.includes("openRunInspector"), "UI store must expose a typed inspector navigation action");
assert(subagent.includes("Open Run Inspector"), "subagent cards must link to the inspector");
assert(status.includes("Open Inspector") || status.includes("Open inspector"), "run status must link to the inspector");
assert(status.includes("Parent run"), "run status must summarize the parent local execution");
assert(status.includes("Active subagents") && status.includes("Recent subagents"), "run status must separate live and recent delegated work");
assert(status.includes("Needs review") && status.includes("Interrupted"), "run status must present non-successful local subagent states honestly");
assert(status.includes("Loading delegated work…") && status.includes("Restoring delegated work…"), "run status must disclose local history loading and reconciliation");
assert(status.includes("Couldn’t restore delegated work") && status.includes("refetchQueries"), "run status must provide a truthful history retry state");
assert(status.includes("Review pending tool actions"), "run status must link approval work to the canonical Approval Center");
assert(status.includes("Inspect run with local changes"), "run status must describe local-change inspection honestly");
assert(status.includes("const running = subagent.status === \"running\""), "queued subagents must not display execution elapsed time");
assert(!status.includes("onClick={statusAction} className=\"mx-2.5 flex w-[calc(100%-1.25rem)]"), "parent status must not duplicate the header navigation action");
assert(workspaceStatus.includes('"paused"') && workspaceStatus.includes('"review"'), "parent status must represent paused and review states");
assert(workspaceStatus.includes("failedSubagentCount") && workspaceStatus.includes("reviewSubagentCount"), "parent status must account for delegated failure and review states");
assert(!status.includes("TODO list") && !status.includes("Background processes") && !status.includes("Sources"), "run status must not advertise placeholder duplicate surfaces");
assert(panel.includes("Navigation from compact surfaces"), "reordered workbench layouts must reconcile navigation targets");
assert(panel.includes('baseViewId === "terminal"'), "layout reconciliation must preserve unique terminal tab identity");
assert(panel.includes("orderedTabIds.some((tabId) => getBaseViewId(tabId) === baseViewId)"), "layout reconciliation must avoid duplicate workbench tabs");

console.log("run inspector contract ok");
