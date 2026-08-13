import { existsSync, readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const input = read("src/atlas/components/PremiumChatInput.tsx");
const types = read("src/atlas/components/chat/input/PremiumChatInputTypes.ts");
const taskDrawer = read("src/atlas/components/chat/input/TaskDrawer.tsx");
const suggested = read("src/atlas/components/chat/input/SuggestedPromptStrip.tsx");
const providerIcon = read("src/atlas/components/chat/input/ProviderIcon.tsx");
const menuItem = read("src/atlas/components/chat/input/MenuItem.tsx");
const styles = read("src/styles/index.css");

assert(input.includes('import { TaskDrawer }'), "PremiumChatInput should use the canonical task disclosure");
assert(!existsSync(new URL("../src/atlas/components/chat/input/TaskChecklistPanel.tsx", import.meta.url)), "the duplicate task checklist implementation must be retired");
assert(taskDrawer.includes("composer-popover") && taskDrawer.includes("aria-controls"), "the canonical task disclosure must retain the accessible composer surface");
assert(suggested.includes("import.meta.env.DEV"), "prototype prompt controls must be development-gated");
assert(!types.includes("suppressLayoutAnimation") && !types.includes("onOpenSettings"), "the public composer API must not retain dead compatibility props");
assert(!input.includes("suppressLayoutAnimation") && !input.includes("onOpenSettings"), "PremiumChatInput must not carry removed compatibility props");
assert(providerIcon.includes("normalizedProvider") && providerIcon.includes("aria-hidden=\"true\"") && providerIcon.includes("inline-block shrink-0"), "provider icons need normalized aliases, decorative semantics, and stable sizing");
assert(menuItem.includes("data-composer-action=\"true\"") && menuItem.includes("type=\"button\""), "the canonical action/menu item contract must remain keyboard-addressable");
assert(!styles.includes("bg-neutral-950") && !styles.includes("bg-[#1c1c1c]"), "obsolete active composer palettes must not remain in the shared style contract");

console.log("premium chat input consolidation contract passed");
