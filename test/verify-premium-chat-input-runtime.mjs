import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const textarea = read("src/atlas/components/ChatInputTextAreaBlock.tsx");
const input = read("src/atlas/components/PremiumChatInput.tsx");
const plus = read("src/atlas/components/chat/input/PlusActionMenu.tsx");
const model = read("src/atlas/components/chat/input/ModelSearchDropdown.tsx");
const pinned = read("src/atlas/components/chat/input/PinnedActionBar.tsx");
const permission = read("src/atlas/components/PermissionModeMenu.tsx");
const footer = read("src/atlas/components/ChatInputFooter.tsx");

assert(textarea.includes('e.key === "Enter"') && textarea.includes("!e.shiftKey"), "Enter must send while Shift+Enter remains available for newlines");
assert((textarea.match(/nativeEvent\.isComposing/g) ?? []).length >= 2, "send and slash selection must both guard IME composition");
assert(textarea.includes('e.key === "ArrowDown"') && textarea.includes('e.key === "ArrowUp"') && textarea.includes('e.key === "Escape"'), "slash command navigation must cover arrows and Escape");
assert(textarea.includes("aria-controls={slashIsPopoverOpen ? slashListboxId") && textarea.includes("aria-autocomplete={slashIsPopoverOpen ? \"list\""), "textarea must announce the active slash interaction");
assert(input.includes("supportsImageGen") && input.includes("useReconcileThinking"), "capability-gated controls must derive from the selected model");
assert(plus.includes("supportsImageGen &&") && plus.includes("setIsImageGenEnabled?."), "image generation must not appear or toggle when unsupported");
assert(model.includes("onSelectModel(model.id, model.provider)") && model.includes("setIsOpen(false)"), "model selection must preserve provider routing and close the picker");
assert(pinned.includes("setIsWebSearch(!isWebSearch)") && pinned.includes("setIsDeepResearch(!isDeepResearch)"), "pinned capability toggles must remain wired to their state owners");
assert(permission.includes("window.confirm") && permission.includes("batchUpdate") && permission.includes("syncFailed"), "permission mode must retain explicit confirmation, persistence, and rollback paths");
assert(footer.includes("props.isLoading") && footer.includes("props.isPaused") && footer.includes("props.onAbort"), "pause/resume/stop controls must remain represented in the footer");
assert(textarea.includes("disabled={readOnly}") && textarea.includes("aria-readonly={readOnly"), "read-only archive mode must disable editing and expose its state");

console.log("premium chat input runtime interaction contract passed");
