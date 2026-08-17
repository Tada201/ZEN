import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const plus = read("src/atlas/components/chat/input/PlusActionMenu.tsx");
const menuItem = read("src/atlas/components/chat/input/MenuItem.tsx");
const model = read("src/atlas/components/chat/input/ModelSearchDropdown.tsx");
const slash = read("src/atlas/components/chat/input/SlashCommandPopover.tsx");
const queue = read("src/atlas/components/chat/input/QueuedPromptsStrip.tsx");
const goal = read("src/atlas/components/chat/input/GoalBanner.tsx");
const pinned = read("src/atlas/components/chat/input/PinnedActionBar.tsx");
const thinking = read("src/atlas/components/chat/input/ThinkingConfig.tsx");
const textarea = read("src/atlas/components/ChatInputTextAreaBlock.tsx");
const input = read("src/atlas/components/PremiumChatInput.tsx");

assert(plus.includes('aria-haspopup="dialog"'), "add capability surface must identify its dialog popup");
assert(plus.includes("aria-expanded={isOpen}") && plus.includes("aria-controls={menuId}"), "add trigger must expose popup state and relationship");
assert(plus.includes('role="dialog"') && plus.includes("data-composer-action"), "add surface must use dialog semantics and stable action targets");
assert(plus.includes("requestAnimationFrame") && plus.includes("triggerRef.current?.focus()"), "add dialog must focus its first action and restore trigger focus");
assert(plus.includes("event.key === 'ArrowDown'") && plus.includes("event.key === 'Home'") && plus.includes("event.key === 'Escape'"), "add dialog must support predictable keyboard navigation and dismissal");

assert(menuItem.includes('type="button"') && menuItem.includes("data-composer-action"), "menu actions must be real buttons");
assert(menuItem.includes("aria-label={isPinned ? `Unpin ${label}` : `Pin ${label}`}"), "pin actions need explicit accessible names");
assert(!menuItem.includes('role="button"'), "menu items must not emulate buttons with ARIA");
assert(!pinned.includes('role="button"') && !pinned.includes("<div onClick"), "pinned actions must not nest interactive pin controls");
assert(pinned.includes('aria-label="Unpin Thinking"') && pinned.includes('aria-label="Unpin Search"'), "pinned actions must expose unpin controls");

assert(model.includes('role="combobox"') && model.includes('aria-autocomplete="list"'), "model search must expose editable combobox semantics");
assert(model.includes('role="listbox"') && model.includes('role="option"') && model.includes("aria-selected={isSelected}"), "model results must expose listbox option state");
assert(model.includes("aria-activedescendant") && model.includes("event.key === 'Home'") && model.includes("event.key === 'End'"), "model picker must expose active option and boundary navigation");
assert(model.includes("searchInputRef.current?.focus()") && model.includes("triggerRef.current?.focus()"), "model picker must preserve focus across open and close");

assert(slash.includes('role="listbox"') && slash.includes('role="option"') && slash.includes("aria-selected={isSelected}"), "slash suggestions must be a selectable listbox");
assert(textarea.includes("aria-activedescendant") && textarea.includes("aria-controls={slashIsPopoverOpen ? slashListboxId"), "textarea must own the slash listbox relationship");
assert(input.includes("slashListboxId") && input.includes("listboxId={slashListboxId}"), "slash listbox IDs must be shared by the trigger and popup");

assert(queue.includes('aria-label="Remove queued prompt"') && queue.includes("title=\"Send this prompt now\""), "queued prompt pills must expose remove and send-now affordances");
assert(goal.includes('role="status"') && goal.includes('aria-label="Pause goal"') && goal.includes('aria-label="Clear goal"'), "the goal banner must announce status and expose its controls accessibly");
assert(thinking.includes("aria-pressed={isThinking}") && thinking.includes("type=\"button\""), "reasoning enablement must be a real toggle button");

console.log("premium chat input accessibility contract passed");
