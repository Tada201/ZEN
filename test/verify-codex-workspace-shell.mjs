import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workspace = read("src/atlas/sections/WorkspaceSection.tsx");
const contextHeader = read("src/atlas/components/chat/WorkspaceContextHeader.tsx");
const rightPanel = read("src/atlas/components/RightPanel.tsx");
const rail = read("src/components/Zen/SecondaryActivityBar.tsx");
const layout = read("src/atlas/layouts/WorkspaceLayout.tsx");
const tabButton = read("src/components/Zen/WorkbenchTabButton.tsx");
const css = read("src/styles/index.css");
const header = read("src/components/workbench/WorkbenchHeader.tsx");
const titleBar = read("src/components/workbench/ZenTitleBar.tsx");

assert(contextHeader.includes("workspace-context-bar"), "workspace must expose a stable context-bar hook");
assert(contextHeader.includes("<header className=\"workspace-context-bar"), "chat context must render as a semantic header");
assert(!contextHeader.includes("absolute top-0 left-0 w-full h-14"), "chat context must not remain a floating overlay");
assert(!contextHeader.includes("backdrop-blur-md"), "workspace context bar must not use backdrop blur");
assert(contextHeader.includes("SecurityBoundarySummary"), "workspace context bar must retain the security boundary affordance");
assert(!contextHeader.includes("text-card-foreground"), "workspace context must use the defined foreground token");
assert(workspace.includes("bg-background border-t border-border p-4"), "artifact split composer must use a solid surface");

// The chat context lives inside the custom title bar and owns session identity
// and scope only. Per-message controls stay in the composer so no control has
// two owners, and the context must render exactly once.
assert(layout.includes("<ZenTitleBar>{windowHeader}</ZenTitleBar>"), "the custom title bar must host the chat context");
assert(
  titleBar.includes('data-tauri-drag-region="deep"'),
  "the whole custom title bar must be draggable; Tauri's drag script still lets clickable children take their clicks",
);
assert(
  titleBar.includes('import appIconUrl from "../../../src-tauri/icons/128x128.png"'),
  "the title bar mark must come from the packaged app icon, not a hand-synced public copy",
);
assert(
  titleBar.includes("group-hover:opacity-100") && titleBar.includes("group-focus-visible:opacity-100"),
  "the sidebar toggle must reveal on hover and on keyboard focus",
);
assert(
  titleBar.includes("aria-label=\"Minimize window\"") && titleBar.includes("aria-label=\"Close window\""),
  "the custom title bar must keep native window controls",
);
assert(
  titleBar.includes("isMaximized") && titleBar.includes("Restore window") && titleBar.includes("isMaximized ?"),
  "the maximize control must expose truthful maximize and restore state",
);
assert(
  contextHeader.includes("canNavigateBack || canNavigateForward") &&
    contextHeader.includes("data-tauri-drag-region=\"deep\""),
  "navigation chrome must disappear when there is no history and text chrome must remain draggable",
);
assert(
  workspace.split("{windowHeader}").length === 2,
  "the chat context must only be passed to the title bar, not rendered again inside the main area",
);
assert(!contextHeader.includes("ProviderIcon"), "model/provider selection belongs to the composer, not the title bar");
assert(!contextHeader.includes("PermissionModeMenu"), "execution-mode selection belongs to the composer, not the title bar");
assert(!contextHeader.includes("FolderBrowser"), "the session workspace is fixed at creation; the title bar must not offer a picker");
assert(!contextHeader.includes("DropdownMenuItem disabled"), "the chat actions menu must not ship inert placeholder items");
assert(
  contextHeader.includes("onRenameSession") && contextHeader.includes("onArchiveSession") && contextHeader.includes("onExportSession"),
  "chat actions must be wired to real session mutations",
);
assert(contextHeader.includes("hideWhenIdle"), "dense title-bar chrome must omit idle run status");
assert(header.includes("export function WorkbenchHeaderCore"), "shared workbench header alignment primitive must be exported");
assert(header.includes("items-center justify-between"), "shared workbench header must own common alignment");
assert(contextHeader.includes("WorkbenchHeaderCore"), "workspace context must consume the shared header alignment primitive");

assert(rightPanel.includes("workbench-header"), "right workbench must expose a stable header hook");
assert(rightPanel.includes("WorkbenchHeaderCore"), "right workbench must consume the shared header alignment primitive");
assert(rightPanel.includes("activeWorkbenchView?.description"), "right workbench header must expose registry-provided context when available");
assert(rightPanel.includes("workbench-header") && rightPanel.includes("bg-card"), "right workbench header must use a solid card surface");
assert(rightPanel.includes("aria-label=\"Workbench views\""), "right workbench must expose labeled horizontal tabs");
assert(rightPanel.includes("PanelRightClose"), "right workbench must expose an explicit collapse control");
assert(rightPanel.includes("useReducedMotion"), "right workbench must read reduced-motion preference");
assert(rightPanel.includes("reducedMotion ? { duration: 0 }"), "right workbench transitions must disable motion when requested");
assert(!rightPanel.includes("workbench-header h-14 border-b border-border flex items-center justify-between px-4 bg-card/20 backdrop-blur"), "right workbench header must not use translucent glass chrome");

assert(css.includes(".workspace-context-bar") && css.includes(".workbench-header"), "shared shell selectors must be defined");
assert(css.includes("background: var(--execution-surface)"), "shell headers must use shared semantic execution surfaces");
assert(css.includes("@media (prefers-reduced-motion: reduce)"), "shell refinement must include reduced-motion coverage");
assert(!layout.includes("SecondaryActivityBar"), "vertical activity rail must not remain in the main workspace layout");
assert(!rail.includes("pending approval"), "activity rail must not own registry-facing tab copy");
assert(tabButton.includes("aria-expanded={selected}"), "workbench tabs must expose workbench panel visibility");
assert(tabButton.includes("aria-controls=\"zen-workbench-panel\""), "workbench tabs must identify their controlled panel");
assert(tabButton.includes("motion-reduce:transition-none"), "workbench tab transitions must respect reduced motion");
assert(tabButton.includes("motion-safe:animate-in"), "active rail motion must be opt-in for motion-capable users");
assert(tabButton.includes("compact"), "workbench tabs must support the compact labeled panel variant");
assert(rightPanel.includes('id="zen-workbench-panel"'), "right workbench must expose the controlled panel id");

console.log("Codex workspace shell contract passed");
