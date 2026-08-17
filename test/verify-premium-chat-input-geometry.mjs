import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const css = read("src/styles/index.css");
const premium = read("src/atlas/components/PremiumChatInput.tsx");
const textarea = read("src/atlas/components/ChatInputTextAreaBlock.tsx");
const footer = read("src/atlas/components/ChatInputFooter.tsx");
const pinned = read("src/atlas/components/chat/input/PinnedActionBar.tsx");
const queue = read("src/atlas/components/chat/input/QueuedPromptsStrip.tsx");
const goal = read("src/atlas/components/chat/input/GoalBanner.tsx");
const plus = read("src/atlas/components/chat/input/PlusActionMenu.tsx");
const menuItem = read("src/atlas/components/chat/input/MenuItem.tsx");
const model = read("src/atlas/components/chat/input/ModelSearchDropdown.tsx");
const permission = read("src/atlas/components/PermissionModeMenu.tsx");
const attachments = read("src/atlas/components/chat/input/ActionPills.tsx");
const suggestions = read("src/atlas/components/chat/input/SuggestedPromptStrip.tsx");
const presets = read("src/atlas/components/chat/input/ImagePresetStrip.tsx");
const slash = read("src/atlas/components/chat/input/SlashCommandPopover.tsx");
const thinking = read("src/atlas/components/chat/input/ThinkingConfig.tsx");
const context = read("src/atlas/components/context/ContextViewerBadge.tsx");

const checks = [
  ["shell uses compact radius", /\.composer-shell[\s\S]*border-radius:\s*0\.5rem/, css],
  ["popover and controls avoid oversized radius", /\.composer-control[\s\S]*border-radius:\s*0\.375rem[\s\S]*\.composer-popover[\s\S]*border-radius:\s*0\.5rem/, css],
  ["interactive controls retain a 30px minimum", /--zen-control-size:\s*1\.875rem[\s\S]*\.composer-control[\s\S]*min-height:\s*var\(--zen-control-size\)/, css],
  ["premium root keeps a compact outer gap", /flex flex-col gap-1\.5 w-full relative/, premium],
  ["sidebar and image rows share 8px horizontal padding", /composer-toolbar px-2 pt-1[\s\S]*px-2 pt-1/, premium],
  ["textarea has bounded 30/34px layout modes", /min-h-\[30px\][\s\S]*min-h-\[34px\]/, textarea],
  ["footer preserves a stable fixed action column", /grid-cols-\[minmax\(0,1fr\)_auto\][\s\S]*composer-fixed-actions flex shrink-0 items-center gap-1\.5/, footer],
  ["pinned rail does not add duplicate vertical padding", /composer-pinned-rail min-w-0 flex-1 overflow-hidden bg-transparent px-0 py-0/, pinned],
  ["thinking popover uses 12px content padding", /composer-popover--bounded w-80 p-3/, pinned],
  ["queued prompt pills use compact chip padding", /composer-chip[\s\S]*py-1\.5 pl-2 pr-1\.5/, queue],
  ["goal banner uses compact row rhythm", /rounded-lg border border-border bg-card px-2\.5 py-1\.5/, goal],
  ["plus menu uses 4px outer gap and compact padding", /bottom-full left-0 z-30 mb-1 p-1[\s\S]*composer-popover-header px-2 py-1/, plus],
  ["menu items use 8px icon-label gap", /composer-menu-item text-\[13px\][\s\S]*items-center gap-2/, menuItem],
  ["model menu avoids oversized empty and footer spacing", /mb-1 space-y-1\.5[\s\S]*pb-1\.5[\s\S]*py-8[\s\S]*py-1\.5 text-xs/, model],
  ["permission trigger stays compact", /min-h-\[30px\][\s\S]*px-2 py-0\.5 text-\[11px\]/, permission],
  ["attachment row uses 8px inset", /flex min-w-0 flex-nowrap gap-1\.5[\s\S]*px-2 pt-2/, attachments],
  ["suggestions use compact chip geometry", /flex flex-wrap gap-1\.5 px-1 pb-0\.5[\s\S]*px-2 py-1 text-\[11px\]/, suggestions],
  ["image presets use compact chips", /gap-1\.5 overflow-x-auto[\s\S]*px-2 py-1 text-\[11px\]/, presets],
  ["slash popover aligns with the shell inset", /bottom-full mb-1 z-40 mx-2[\s\S]*border-b px-2 py-1/, slash],
  ["thinking configuration uses compact section rhythm", /space-y-3[\s\S]*space-y-3 transition-opacity[\s\S]*rounded-md border border-border bg-muted p-0\.5/, thinking],
  ["context badge popover uses compact content rhythm", /w-64 p-2\.5 space-y-2[\s\S]*gap-x-2 gap-y-1\.5/, context],
];

for (const [label, pattern, source] of checks) {
  if (!pattern.test(source)) throw new Error(`Premium input geometry contract failed: ${label}`);
}

console.log(`Premium input geometry contract passed (${checks.length} component checks).`);
