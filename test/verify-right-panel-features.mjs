import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const featuresSource = readFileSync(new URL("../src/lib/features/frontendFeatures.ts", import.meta.url), "utf8");
const rightPanelSource = readFileSync(new URL("../src/atlas/components/RightPanel.tsx", import.meta.url), "utf8");
const railSource = readFileSync(new URL("../src/components/Zen/SecondaryActivityBar.tsx", import.meta.url), "utf8");
const uiStoreSource = readFileSync(new URL("../src/lib/stores/useUIStore.ts", import.meta.url), "utf8");
const graphEventsSource = readFileSync(new URL("../src/atlas/hooks/stream/useGraphSessionEvents.ts", import.meta.url), "utf8");
const globalListenerSource = readFileSync(new URL("../src/atlas/hooks/useGlobalStreamListener.ts", import.meta.url), "utf8");

for (const tab of ["metrics", "analytics", "artifacts", "agents", "workflows", "drawing", "memory", "terminal", "map", "space"]) {
  assert(
    featuresSource.includes(`rightPanelTabId: "${tab}"`) &&
      featuresSource.includes(`rightPanelTabId: "${tab}"`) &&
      featuresSource.slice(
        featuresSource.indexOf(`rightPanelTabId: "${tab}"`) - 180,
        featuresSource.indexOf(`rightPanelTabId: "${tab}"`) + 80,
      ).includes("defaultVisible: true"),
    `${tab} should be visible in the right rail feature registry`,
  );
}

assert(
  featuresSource.includes("getDefaultRightPanelTab") &&
    rightPanelSource.includes("visibleActiveRightTab") &&
    rightPanelSource.includes("setActiveRightTab(visibleActiveRightTab)"),
  "RightPanel should normalize stale persisted hidden tabs to a visible tab",
);

assert(
  railSource.includes("getVisibleRightPanelFeatures()"),
  "SecondaryActivityBar should render tabs from the shared right panel feature registry",
);

for (const snippet of [
  "case 'analytics':",
  "<ChatAnalyticsPanel />",
  "case 'workflows':",
  "<WorkflowPanel />",
  "case 'space':",
  "visibleActiveRightTab === 'map' || visibleActiveRightTab === 'space'",
  "<MemoryStatsWidget />",
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
