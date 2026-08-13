import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const premiumSource = read("src/atlas/components/PremiumChatInput.tsx");
const footerSource = read("src/atlas/components/ChatInputFooter.tsx");
const pinnedSource = read("src/atlas/components/chat/input/PinnedActionBar.tsx");
const plusSource = read("src/atlas/components/chat/input/PlusActionMenu.tsx");
const modelSource = read("src/atlas/components/chat/input/ModelSearchDropdown.tsx");
const slashSource = read("src/atlas/components/chat/input/SlashCommandPopover.tsx");
const taskSource = read("src/atlas/components/chat/input/TaskDrawer.tsx");
const attachmentsSource = read("src/atlas/components/chat/input/ActionPills.tsx");
const stylesSource = read("src/styles/index.css");

assert(!premiumSource.includes('from "framer-motion"'), "composer shell should not import Motion only to animate geometry");
assert(premiumSource.includes("projection is intentionally disabled"), "instant composer geometry should document its motion exception");
assert(!premiumSource.includes("layout={!suppressLayoutAnimation}"), "composer shell must not project textarea and optional-row layout changes");
assert(!premiumSource.includes("animate-shimmer-slide"), "composer loading state must not use decorative shimmer motion");

assert(!footerSource.includes("animate-ping"), "send/loading controls must not use decorative pulse motion");
assert(!footerSource.includes("hover:scale") && !footerSource.includes("active:scale"), "primary send control must not scale on hover or press");
assert(footerSource.includes("motionDurations.fast") && footerSource.includes("useReducedMotion"), "meaningful send-state icon changes must use shared motion policy");

for (const [name, source] of [
  ["pinned actions", pinnedSource],
  ["add menu", plusSource],
  ["slash commands", slashSource],
  ["attachments", attachmentsSource],
]) {
  assert(!source.includes("layoutId="), `${name} must not create shared layout projection inside the composer`);
  assert(!source.includes("scale:"), `${name} should use calm opacity/position transitions instead of scale motion`);
}

assert(modelSource.includes("motionDurations.fast") && modelSource.includes("useReducedMotion"), "model popup must retain a shared, reduced-motion-aware transition");
assert(taskSource.includes("height: 0") && taskSource.includes("height: 'auto'") && taskSource.includes("useReducedMotion"), "task disclosure must retain one coordinated height/opacity transition");
assert(stylesSource.includes("html[data-motion=\"off\"] #root *"), "composer CSS must remain governed by the central motion policy");
assert(stylesSource.includes("transition: background-color 140ms ease, color 140ms ease;"), "submit control transitions must exclude transform geometry");

console.log("premium chat input motion verifier passed");
