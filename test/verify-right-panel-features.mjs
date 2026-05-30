import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const featuresSource = readFileSync(new URL("../src/lib/features/frontendFeatures.ts", import.meta.url), "utf8");
const rightPanelSource = readFileSync(new URL("../src/atlas/components/RightPanel.tsx", import.meta.url), "utf8");
const railSource = readFileSync(new URL("../src/components/Zen/SecondaryActivityBar.tsx", import.meta.url), "utf8");

for (const tab of ["metrics", "artifacts", "agents", "terminal"]) {
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

for (const tab of ["drawing", "memory", "map"]) {
  const excerpt = featuresSource.slice(
    featuresSource.indexOf(`rightPanelTabId: "${tab}"`) - 220,
    featuresSource.indexOf(`rightPanelTabId: "${tab}"`) + 100,
  );
  assert(
    excerpt.includes("maturity: \"prototype\"") && excerpt.includes("defaultVisible: false"),
    `${tab} should remain gated until it is no longer prototype maturity`,
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

console.log("right panel feature checks passed");
