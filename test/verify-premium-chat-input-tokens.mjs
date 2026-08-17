import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const styles = read("src/styles/index.css");

const sources = [
  "src/atlas/components/PremiumChatInput.tsx",
  "src/atlas/components/ChatInputTextAreaBlock.tsx",
  "src/atlas/components/ChatInputFooter.tsx",
  "src/atlas/components/chat/input/PlusActionMenu.tsx",
  "src/atlas/components/chat/input/MenuItem.tsx",
  "src/atlas/components/chat/input/ModelSearchDropdown.tsx",
  "src/atlas/components/chat/input/PinnedActionBar.tsx",
  "src/atlas/components/chat/input/ActionPills.tsx",
  "src/atlas/components/chat/input/ImagePresetStrip.tsx",
  "src/atlas/components/chat/input/SuggestedPromptStrip.tsx",
  "src/atlas/components/chat/input/SlashCommandPopover.tsx",
  "src/atlas/components/chat/input/QueuedPromptsStrip.tsx",
  "src/atlas/components/chat/input/GoalBanner.tsx",
  "src/atlas/components/chat/input/ThinkingConfig.tsx",
  "src/atlas/components/PermissionModeMenu.tsx",
].map(read);

for (const token of [
  ".composer-shell",
  ".composer-editor",
  ".composer-toolbar",
  ".composer-control",
  ".composer-popover",
  ".composer-menu-item",
  ".composer-chip",
  ".composer-label",
  ".composer-meta",
  ".composer-focus",
  ".composer-submit",
]) {
  assert(styles.includes(token), `styles must define ${token}`);
}

assert(styles.includes(".composer-shell--welcome"), "welcome shell needs an intentional variant");
assert(styles.includes(".composer-shell--loading"), "loading shell needs a semantic state");
assert(styles.includes(".composer-field"), "popup search fields need a shared field token");
assert(styles.includes('html[data-motion="off"] #root *'), "composer transitions need the central reduced-motion policy");

for (const [index, source] of sources.entries()) {
  assert(!source.includes("bg-[#"), `composer source ${index} must not hardcode hex surfaces`);
  assert(!source.includes("bg-neutral-950"), `composer source ${index} must not use the old neutral shell`);
}

for (const token of [
  "composer-shell",
  "composer-editor",
  "composer-toolbar",
  "composer-control",
  "composer-popover",
  "composer-menu-item",
  "composer-chip",
]) {
  assert(sources.some((source) => source.includes(token)), `migrated sources must use ${token}`);
}

console.log("premium chat input token contract passed");
