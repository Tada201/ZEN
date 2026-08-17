import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const packageJson = JSON.parse(read("package.json"));
const input = read("src/atlas/components/PremiumChatInput.tsx");
const footer = read("src/atlas/components/ChatInputFooter.tsx");
const textArea = read("src/atlas/components/ChatInputTextAreaBlock.tsx");
const runStatus = read("src/atlas/components/chat/RunStatusPopover.tsx");
const taskStatus = read("src/lib/tasks/taskStatus.ts");
const taskStore = read("src/lib/stores/taskStore.ts");
const pinnedHook = read("src/atlas/components/usePinnedActions.ts");
const taskPreview = read("src/atlas/components/chat/taskPlanPreviewModel.ts");
const pinned = read("src/atlas/components/chat/input/PinnedActionBar.tsx");
const modelMenu = read("src/atlas/components/chat/input/ModelSearchDropdown.tsx");
const styles = read("src/styles/index.css");

assert.equal(packageJson.scripts["test:phase-14-composer-hardening"], "node test/verify-phase-14-composer-hardening.mjs");
assert(packageJson.scripts["test:agentic-workbench"].includes("npm run test:phase-14-composer-hardening"));

assert(input.includes("visiblePinnedActions"), "capability pins must be filtered at the composer boundary");
assert(input.includes("actionId === \"thinking\" && supportsReasoning"), "unsupported reasoning pins must not render as blank controls");
assert(!input.includes("pinnedActions: visiblePinnedActions, togglePin"), "memo dependency arrays must contain values, not object-property syntax");
assert(pinned.includes("if (pinnedActions.length === 0) return null"), "an empty pinned rail must not reserve layout space");
assert(pinned.includes("composer-pinned-rail"), "the pinned rail must not masquerade as the outer action rail");

assert(taskStatus.includes("normalizeTaskDisplayStatus") && taskStatus.includes("normalizeTaskText") && taskStatus.includes("taskStatusLabel"), "task status and text vocabulary must have one shared normalizer");
assert(taskStore.includes("normalizeTaskDisplayStatus") && taskStore.includes("normalizeTaskText") && taskStore.includes("Number.isFinite"), "malformed task events must be normalized before entering the store");
// The checklist disclosure moved to the Run status popover; the sticky store
// keeps lists scoped per chat so switching chats cannot leak a stale plan.
assert(taskStore.includes("task.chatId === chat_id"), "task lists must stay scoped per chat");
assert(pinnedHook.includes("try {") && pinnedHook.includes("localStorage.setItem") && pinnedHook.includes("catch"), "storage failures must not break the composer");
assert(taskPreview.includes("normalizeTaskDisplayStatus"), "detailed task previews must use the shared status normalizer");
assert(runStatus.includes("ChecklistRow") && runStatus.includes("normalizeTaskDisplayStatus"), "the status-popover checklist must use the same status vocabulary");
assert(runStatus.includes("max-h-[min(74vh,36rem)]"), "long checklists must be bounded instead of pushing the status popover off screen");

assert(footer.includes('className="composer-footer-action-label">Pause</span>') && footer.includes('className="composer-footer-action-label">Stop</span>'), "control labels must use container-aware visibility");
assert(!footer.includes("composer-footer-action-label hidden sm:inline"), "footer labels must not be governed by viewport breakpoints");
assert(styles.includes("@container composer (min-width: 30rem)") && styles.includes("composer-footer-action-label"), "footer geometry must use the composer container");
assert(textArea.includes("aria-activedescendant") && textArea.includes("aria-controls"), "slash suggestions must retain combobox relationships");
assert(modelMenu.includes('role="combobox"') && modelMenu.includes("aria-activedescendant") && modelMenu.includes("triggerRef.current?.focus()"), "model search must preserve WAI-ARIA focus restoration");

console.log("phase 14 composer hardening verified");
