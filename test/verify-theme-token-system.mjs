import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const files = {
  index: "index.html",
  provider: "src/atlas/providers/ZenThemeProvider.tsx",
  customizer: "src/atlas/ThemeCustomizer.tsx",
  chatInput: "src/atlas/components/PremiumChatInput.tsx",
};

const read = (path) => readFileSync(path, "utf8");
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
};
const assertIncludes = (path, needle, message) => {
  if (!read(path).includes(needle)) fail(`${path}: ${message}`);
};
const assertNotMatches = (path, pattern, message) => {
  const text = read(path);
  if (pattern.test(text)) fail(`${path}: ${message}`);
};
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (name === "node_modules" || name === "dist" || name === ".git") return [];
  return statSync(path).isDirectory() ? walk(path) : [path];
});

// -- Structural assertions --
assertIncludes(files.index, "s.state.themeId || s.state.theme_id", "bootstrap must read camelCase and snake_case persisted theme ids");
assertIncludes(files.customizer, "updateSetting({ themeId: p.id })", "ThemeCustomizer preset selection must persist themeId");
assertIncludes(files.provider, "root.dataset.style = nextStyleMode", "provider must always write data-style");
assertIncludes(files.provider, "localStorage.setItem(DENSITY_STORAGE_KEY", "provider must persist density changes through central density setter");
assertNotMatches(files.chatInput, /\bbg-white\b|\bborder-zinc-200\b|\bhover:bg-zinc-100\b|\bdark:hover:bg-zinc-800\b|\bbg-zinc-100\b|\bdark:bg-white\b/, "chat input chrome must use semantic tokens, not fixed white/zinc palette");
assertNotMatches(files.chatInput, /dark:bg-white\s+text-foreground/, "dark active button must not use white background with foreground text");

// -- Full-tree semantic token compliance scan --
const allowedColorLiteralFiles = new Set([
  // Canonical theme definition
  "src/styles/index.css",
  // Domain: canvas / rendering / simulation
  "src/lib/celestial_sim.ts",
  "src/lib/security/generatedContent.ts",
  "src/lib/stores/drawingStore.ts",
  "src/lib/ttft.ts",
  "src/lib/hooks/useTheme.ts", // meta theme color
  "src/services/globe/CesiumViewerFactory.ts",
  "src/components/Zen/XTermSessionView.tsx", // terminal theme
  "src/components/Zen/modals/DesmosCanvas.tsx", // embedded calc canvas
  "src/components/Zen/modals/GraphCanvas.tsx", // canvas grid rendering
  "src/components/Zen/widgets/GlobeWidget.tsx", // globe render
  "src/components/Zen/LayerManager.tsx", // map layer colors
  // Domain: map/GTSM data layers
  "src/components/GTSM/favorites/FavoritesPanel.tsx",
  "src/components/GTSM/geojson/GeoJsonLayerPanel.tsx",
  "src/components/GTSM/geojson/GeoJsonImportModal.tsx",
  "src/components/GTSM/geojson/geojson-layers.css",
  "src/components/GTSM/search/SearchBar.tsx",
  "src/components/GTSM/search/searchEntities.ts",
  "src/components/GTSM/Minimap.tsx",
  "src/components/GTSM/NavigationPanel.tsx",
  "src/components/GTSM/TargetInspector.tsx",
  "src/components/GTSM/timeline/Timeline.tsx",
  "src/components/GTSM/HlsCameraPlayer.tsx",
  "src/components/GTSM/MapSettingsPanel.tsx",
  "src/components/GTSM/TargetInspector.tsx",
  "src/components/GTSM/ViewportHUD.tsx",
  "src/components/workbench/cesium/useCesiumEntityLayers.ts",
  "src/components/workbench/cesium/useCesiumVisualLayers.ts",
  "src/components/workbench/MapLibreMapRenderer.tsx",
  // Domain: widget canvas/CSS
  "src/components/widgets/system/TokenWidget.tsx",
  "src/components/widgets/system/MemoryWidget.tsx",
  "src/components/widgets/system/LatencyWidget.tsx",
  "src/components/widgets/system/system-widgets.css",
  "src/components/widgets/orchestrator/agent-orchestrator.css",
  "src/components/widgets/workbench/InteractiveDrawingCanvas.tsx",
  "src/components/widgets/workbench/drawingCanvasUtils.ts",
  "src/components/widgets/workbench/MathPlotExpressionItem.tsx",
  "src/components/widgets/workbench/math-plot.css",
  "src/components/widgets/workbench/operational-map.css",
  "src/components/widgets/workbench/MathPlotAnnotations.tsx",
  "src/components/widgets/workbench/MathPlotInterface.tsx",
  "src/components/widgets/workbench/DesmosCanvas.tsx",
  // Domain: chart/card data colors
  "src/lib/chart.ts", // canonical chart data palette
  "src/components/ui/chart.tsx",
  // Domain: voice/audio canvas rendering
  "src/components/atlas/components/voice/VoiceOscilloscope.tsx",
  "src/atlas/components/voice/VoiceOscilloscope.tsx",
  "src/atlas/components/voice/VoiceDiagnosticsPanel.tsx",
  "src/atlas/components/voice/board/BoardMediaWidgets.tsx",
  "src/atlas/components/voice/board/BoardVisualizations.tsx",
  "src/atlas/components/voice/board/BoardQr.tsx",
  "src/components/settings/Tabs/audio/TTSConfig.tsx",
  // Domain: sandboxed iframe / code rendering
  "src/atlas/components/SandboxedIframe.tsx",
  "src/atlas/components/chat/ChartBlock.tsx",
  "src/atlas/components/chat/CodeBlock.tsx",
  "src/atlas/components/workspace/BrowserPreview.tsx",
  "src/atlas/components/workspace/CodeEditor.tsx",
  "src/atlas/components/workspace/TabSystem.tsx",
  "src/atlas/components/genui/premium/ChartCard.tsx",
  "src/atlas/components/genui/index.tsx",
  // Domain: demo/showcase data (Atlas design-system gallery)
  "src/atlas/sections/ButtonsSection.tsx",
  "src/atlas/sections/CardsSection.tsx",
  "src/atlas/sections/InputsColorPicker.tsx",
  "src/atlas/sections/Lab3DSection.tsx",
  "src/atlas/sections/SurfacesSection.tsx",
  "src/atlas/sections/combosData.ts",
  "src/atlas/sections/DataDisplayAvatarGroup.tsx",
  "src/atlas/sections/DataDisplayComments.tsx",
  "src/atlas/sections/DataDisplaySection.tsx",
  "src/atlas/sections/ThemeGallerySection.tsx",
  "src/atlas/sections/TypographySection.tsx",
  "src/atlas/sections/FoundationsSection.tsx",
  "src/atlas/sections/NavigationSection.tsx",
  "src/atlas/sections/InputsSection.tsx",
  "src/atlas/sections/CombosSection.tsx",
  "src/atlas/sections/CombosInbox.tsx",
  // Domain: mock/test data
  "src/api/mockClient.ts",
  // Domain: resizable UI lib
  "src/components/ui/resizable.tsx",
  // Domain: shared sparkline canvas
  "src/components/shared/Sparkline.tsx",
  "src/components/shared/SystemDiagnostics.tsx",
  // Domain: voice stage palette
  "src/atlas/components/voice/VoiceStage.tsx",
  // Domain: cesium/map engine rendering
  "src/components/workbench/cesium/cesiumMapHelpers.ts",
  "src/components/workbench/cesium/useCameraCatalogLayer.ts",
  "src/components/workbench/cesium/useCesiumMapControls.ts",
  // Domain: dev-only console logging
  "src/hooks/useRenderLogger.ts",
  // Domain: atlas chat artifact rendering (iframe content)
  "src/atlas/components/chat/ArtifactPanel.tsx",
  // Domain: workspace layout overlay
  "src/atlas/layouts/WorkspaceLayout.tsx",
  // Domain: agent orchestrator state visualization
  "src/components/widgets/orchestrator/AgentOrchestratorPanel.tsx",
  "src/components/widgets/orchestrator/AgentOrchestratorLiveSession.tsx",
  // Domain: system metric widgets (colored indicators)
  "src/components/widgets/system/CpuWidget.tsx",
  "src/components/widgets/system/GpuWidget.tsx",
  "src/components/widgets/system/NetworkWidget.tsx",
  "src/components/widgets/memory/MemoryStatsWidget.tsx",
  // Domain: main area backdrop
  "src/components/workbench/MainArea.tsx",
  // Domain: 3D demo section
  "src/atlas/sections/Lab3DSection.tsx",
  // Domain: image preset strip (themed border override)
  "src/atlas/components/chat/input/ImagePresetStrip.tsx",
  // Domain: system diagnostics (hardware metric colors)
  "src/components/shared/SystemDiagnostics.tsx",
  // Domain: GPU metric widget
  "src/components/widgets/system/GpuWidget.tsx",
  // Domain: settings MCP (HTML entity false positive)
  "src/components/settings/Tabs/plugins/MCPSettings.tsx",
]);

const bannedUtility = /\b(?:bg|text|border|ring|from|to|via)-(?:white|black|zinc|slate|neutral|stone|gray)(?:\b|[-/])/;
// Only flag hex color literals and rgba() outside of shadow/gradient class strings
const literalColor = /(?<![&])#[0-9A-Fa-f]{3,8}(?![0-9A-Fa-f&;])/;
// For rgba: skip when inside shadow-[... or bg-[radial-gradient... — those are decorative glows
const isGlowShadow = (line) => /shadow-\[|bg-\[radial-gradient/.test(line);
const hasRgba = (line) => /rgba\(/.test(line) && !isGlowShadow(line);

let totalFails = 0;
for (const path of walk("src")) {
  if (!/\.(ts|tsx)$/.test(path)) continue;
  const normalized = relative(process.cwd(), path).replaceAll("\\", "/");
  const text = read(path);
  const allowLiteral = allowedColorLiteralFiles.has(normalized);
  text.split(/\r?\n/).forEach((line, index) => {
    if (bannedUtility.test(line)) {
      console.error(`FAIL: ${normalized}:${index + 1}: fixed neutral Tailwind color utility; use semantic token utility`);
      totalFails++;
    }
    if (!allowLiteral) {
      if (literalColor.test(line)) {
        console.error(`FAIL: ${normalized}:${index + 1}: hardcoded hex color; use hsl(var(--token)) or document domain exception`);
        totalFails++;
      }
      if (hasRgba(line)) {
        console.error(`FAIL: ${normalized}:${index + 1}: hardcoded rgba color; use hsl(var(--token)) or document domain exception`);
        totalFails++;
      }
    }
  });
}

if (totalFails > 0) {
  console.error(`\n${totalFails} violations found`);
  process.exitCode = 1;
} else {
  console.log("theme token system checks passed");
}
