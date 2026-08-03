import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const featuresSource = readFileSync(new URL("../src/lib/features/frontendFeatures.ts", import.meta.url), "utf8");
const rightPanelSource = readFileSync(new URL("../src/atlas/components/RightPanel.tsx", import.meta.url), "utf8");
const railSource = readFileSync(new URL("../src/components/Zen/SecondaryActivityBar.tsx", import.meta.url), "utf8");
const tabButtonSource = readFileSync(new URL("../src/components/Zen/WorkbenchTabButton.tsx", import.meta.url), "utf8");
const uiStoreSource = readFileSync(new URL("../src/lib/stores/useUIStore.ts", import.meta.url), "utf8");
const graphEventsSource = readFileSync(new URL("../src/atlas/hooks/stream/useGraphSessionEvents.ts", import.meta.url), "utf8");
const globalListenerSource = readFileSync(new URL("../src/atlas/hooks/useGlobalStreamListener.ts", import.meta.url), "utf8");

// Only tabs with real panel implementations in RightPanel should be
// visible in the right-rail feature registry.  analytics, workflows,
// memory, and space were removed because they had no render branches.
const IMPLEMENTED_TABS = ["metrics", "approvals", "artifacts", "agents", "drawing", "terminal", "map"];

for (const tab of IMPLEMENTED_TABS) {
  assert(
    featuresSource.includes(`rightPanelTabId: "${tab}"`) &&
      featuresSource.slice(
        featuresSource.indexOf(`rightPanelTabId: "${tab}"`) - 180,
        featuresSource.indexOf(`rightPanelTabId: "${tab}"`) + 80,
      ).includes("defaultVisible: true"),
    `${tab} should be visible in the right rail feature registry`,
  );
}

// Unimplemented tabs must NOT appear as visible right-rail features.
const HIDDEN_TABS = ["analytics", "workflows", "memory", "space"];
for (const tab of HIDDEN_TABS) {
  const idx = featuresSource.indexOf(`rightPanelTabId: "${tab}"`);
  if (idx !== -1) {
    // If the entry still exists, it must not be visible (defaultVisible: false or prototype/labsOnly)
    const snippet = featuresSource.slice(idx - 200, idx + 80);
    const isPrototype = snippet.includes('maturity: "prototype"');
    const isHidden = snippet.includes("defaultVisible: false") || snippet.includes("labsOnly: true") || isPrototype;
    assert(isHidden, `${tab} should be hidden (prototype/labsOnly/defaultVisible:false) in the right rail feature registry`);
  }
}

assert(
  featuresSource.includes("getDefaultRightPanelTab") &&
    rightPanelSource.includes("visibleActiveRightTab") &&
    rightPanelSource.includes("setActiveRightTab(visibleActiveRightTab)"),
  "RightPanel should normalize stale persisted hidden tabs to a visible tab",
);

assert(
  railSource.includes("getVisibleWorkbenchViews()") &&
    railSource.includes("WorkbenchTabButton") &&
    railSource.includes("countPendingApprovals") &&
    railSource.includes('view.id === "approvals"') &&
    railSource.includes("badge={view.id === \"approvals\" ? pendingApprovalCount : 0}"),
  "SecondaryActivityBar should render registry-driven tabs and pass the pending-approval badge to the shared primitive",
);
assert(
  tabButtonSource.includes("aria-expanded={selected}") &&
    tabButtonSource.includes("pending approval") &&
    tabButtonSource.includes("data-workbench-tab={view.id}"),
  "WorkbenchTabButton should own tab selection semantics, attention copy, and stable tab identity",
);

assert(
  rightPanelSource.includes('case \'approvals\':') &&
    rightPanelSource.includes("ApprovalCenter") &&
    rightPanelSource.includes("visibleActiveRightTab === 'approvals'"),
  "RightPanel should mount the unified Approval Center tab",
);

assert(
  rightPanelSource.includes("workbenchApi.listTabs(activeChatId)") &&
    rightPanelSource.includes("workbenchApi.upsertTab") &&
    rightPanelSource.includes("workbenchApi.deleteTab(activeChatId, tabId)") &&
    rightPanelSource.includes("crypto.randomUUID()"),
  "right-panel tabs must restore per chat, persist order, delete closed tabs, and create unique terminal sessions",
);

assert(
  uiStoreSource.includes("rightTabBySession") &&
    uiStoreSource.includes("restoreRightTabForSession") &&
    uiStoreSource.includes("if (_lastSessionId)"),
  "right-panel active-tab memory must remain scoped to the current chat session",
);

for (const snippet of [
  "<InteractiveDrawingCanvas />",
]) {
  assert(rightPanelSource.includes(snippet), `RightPanel should render ${snippet}`);
}

assert(
  uiStoreSource.includes("rightPanelCanvasMode: 'draw'") &&
    rightPanelSource.includes("rightPanelCanvasMode === 'draw'") &&
    rightPanelSource.includes("visibleActiveRightTab === 'drawing'") &&
    rightPanelSource.includes("setRightPanelCanvasMode('draw')") &&
    rightPanelSource.includes("setRightPanelCanvasMode('mathplot')"),
  "Drawing panel should default to Free Draw so opening the right panel does not auto-load Desmos",
);

assert(
  rightPanelSource.includes("<MathGraphPlaceholder />") &&
    rightPanelSource.includes("Math Graph TODO") &&
    !rightPanelSource.includes("MathPlotInterface"),
  "Graph mode should render a TODO placeholder instead of loading the Desmos-backed MathPlotInterface",
);

assert(
  globalListenerSource.includes("useGraphSessionEvents()") &&
    graphEventsSource.includes('"graph:session:feedback"') &&
    graphEventsSource.includes('setActiveRightTab("drawing")') &&
    graphEventsSource.includes('setRightPanelCanvasMode("mathplot")') &&
    graphEventsSource.includes("applyFeedback(event.payload)"),
  "Graph session tool feedback should update the graph state and autofocus the math plot panel",
);

console.log("right panel feature checks passed");
