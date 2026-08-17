import { existsSync, readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const input = read("src/atlas/components/PremiumChatInput.tsx");
const types = read("src/atlas/components/chat/input/PremiumChatInputTypes.ts");
const runStatus = read("src/atlas/components/chat/RunStatusPopover.tsx");
const suggested = read("src/atlas/components/chat/input/SuggestedPromptStrip.tsx");
const providerIcon = read("src/atlas/components/chat/input/ProviderIcon.tsx");
const menuItem = read("src/atlas/components/chat/input/MenuItem.tsx");
const styles = read("src/styles/index.css");

// The task checklist moved from the composer drawer to the Run status
// popover; the drawer (TaskDrawer/useChatTaskDrawer) is retired. The
// composer space above the input is now owned by the prompt queue and the
// goal banner.
assert(!existsSync(new URL("../src/atlas/components/chat/input/TaskDrawer.tsx", import.meta.url)), "the composer task drawer must stay retired (checklist lives in the Run status popover)");
assert(!existsSync(new URL("../src/atlas/components/useChatTaskDrawer.ts", import.meta.url)), "the composer task drawer hook must stay retired");
assert(!existsSync(new URL("../src/atlas/components/chat/input/TaskChecklistPanel.tsx", import.meta.url)), "the duplicate task checklist implementation must be retired");
assert(runStatus.includes("ChecklistRow") && read("src/lib/stores/taskStore.ts").includes("task:list_updated"), "the canonical task checklist must render from the Run status popover via the sticky task store");
assert(input.includes("QueuedPromptsStrip") && input.includes("GoalBanner"), "the composer must own the prompt queue and goal banner surfaces");
assert(suggested.includes("import.meta.env.DEV"), "prototype prompt controls must be development-gated");
assert(!types.includes("suppressLayoutAnimation") && !types.includes("onOpenSettings"), "the public composer API must not retain dead compatibility props");
assert(!input.includes("suppressLayoutAnimation") && !input.includes("onOpenSettings"), "PremiumChatInput must not carry removed compatibility props");
assert(providerIcon.includes("normalizedProvider") && providerIcon.includes("aria-hidden=\"true\"") && providerIcon.includes("inline-block shrink-0"), "provider icons need normalized aliases, decorative semantics, and stable sizing");
assert(menuItem.includes("data-composer-action=\"true\"") && menuItem.includes("type=\"button\""), "the canonical action/menu item contract must remain keyboard-addressable");
assert(!styles.includes("bg-neutral-950") && !styles.includes("bg-[#1c1c1c]"), "obsolete active composer palettes must not remain in the shared style contract");

console.log("premium chat input consolidation contract passed");
