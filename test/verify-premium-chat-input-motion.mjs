import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const premiumSource = read("src/atlas/components/PremiumChatInput.tsx");
const footerSource = read("src/atlas/components/ChatInputFooter.tsx");
const pinnedSource = read("src/atlas/components/chat/input/PinnedActionBar.tsx");
const plusSource = read("src/atlas/components/chat/input/PlusActionMenu.tsx");
const modelSource = read("src/atlas/components/chat/input/ModelSearchDropdown.tsx");
const slashSource = read("src/atlas/components/chat/input/SlashCommandPopover.tsx");
const queueSource = read("src/atlas/components/chat/input/QueuedPromptsStrip.tsx");
const goalSource = read("src/atlas/components/chat/input/GoalBanner.tsx");
const attachmentsSource = read("src/atlas/components/chat/input/ActionPills.tsx");
const stylesSource = read("src/styles/index.css");

assert(!premiumSource.includes('from "framer-motion"'), "composer shell should not import Motion only to animate geometry");
assert(premiumSource.includes("projection is intentionally disabled"), "instant composer geometry should document its motion exception");
assert(!premiumSource.includes("layout={!suppressLayoutAnimation}"), "composer shell must not project textarea and optional-row layout changes");
assert(!premiumSource.includes("animate-shimmer-slide"), "composer loading state must not use decorative shimmer motion");

assert(!footerSource.includes("animate-ping"), "send/loading controls must not use decorative pulse motion");
assert(!footerSource.includes("hover:scale") && !footerSource.includes("active:scale"), "primary send control must not scale on hover or press");

for (const [name, source] of [
  ["pinned actions", pinnedSource],
  ["add menu", plusSource],
  ["slash commands", slashSource],
  ["attachments", attachmentsSource],
  ["prompt queue", queueSource],
  ["goal banner", goalSource],
]) {
  assert(!source.includes("layoutId="), `${name} must not create shared layout projection inside the composer`);
  assert(!source.includes("scale:"), `${name} should use calm opacity/position transitions instead of scale motion`);
}

assert(modelSource.includes("motionDurations.fast") && modelSource.includes("useReducedMotion"), "model popup must retain a shared, reduced-motion-aware transition");
assert(queueSource.includes("motionDurations.fast") && queueSource.includes("useReducedMotion"), "queued prompt pills must use the shared, reduced-motion-aware enter/exit policy");
assert(goalSource.includes("motionDurations.fast") && goalSource.includes("useReducedMotion"), "the goal banner must use the shared, reduced-motion-aware enter/exit policy");
assert(stylesSource.includes("html[data-motion=\"off\"] #root *"), "composer CSS must remain governed by the central motion policy");
assert(stylesSource.includes("transition: background-color 140ms ease, color 140ms ease;"), "submit control transitions must exclude transform geometry");

console.log("premium chat input motion verifier passed");
