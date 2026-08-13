import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const resizeHookSource = readFileSync(new URL("../src/atlas/components/useAutoResizeTextarea.ts", import.meta.url), "utf8");
const dropdownSource = readFileSync(new URL("../src/atlas/components/chat/input/ModelSearchDropdown.tsx", import.meta.url), "utf8");
const inputSource = readFileSync(new URL("../src/atlas/components/PremiumChatInput.tsx", import.meta.url), "utf8");
const plusMenuSource = readFileSync(new URL("../src/atlas/components/chat/input/PlusActionMenu.tsx", import.meta.url), "utf8");
const taskHookSource = readFileSync(new URL("../src/atlas/components/useChatTaskDrawer.ts", import.meta.url), "utf8");

assert(
  resizeHookSource.includes("const resizeFrameRef = useRef<number | null>(null);"),
  "chat input should keep textarea resize work cancellable",
);
assert(
  resizeHookSource.includes("window.requestAnimationFrame"),
  "chat input should schedule textarea resize work outside the immediate input event",
);
assert(
  resizeHookSource.includes("window.cancelAnimationFrame"),
  "chat input should cancel stale textarea resize frames during rapid typing",
);
assert(
  dropdownSource.includes("useDeferredValue"),
  "model dropdown should defer filtering while search input is changing",
);
assert(
  !dropdownSource.includes("MAX_VISIBLE_MODELS"),
  "model dropdown should not hide available models behind a fixed visible cap",
);
assert(
  dropdownSource.includes("filteredModels.reduce") &&
    dropdownSource.includes('role="listbox"') &&
    dropdownSource.includes('role="option"'),
  "model dropdown should render the full filtered model list as accessible options",
);
assert(
  dropdownSource.includes('key={`${provider}:${model.id}`}'),
  "model dropdown should use provider-qualified keys so same-id models from different providers remain visible",
);
assert(
  !dropdownSource.includes("models.find(m => m.id === selectedModelId)"),
  "model display must not silently fall back to a different provider's model",
);
assert(
  inputSource.includes("setPlusMenuOpen") && inputSource.includes("setModelMenuOpen") && inputSource.includes("!isPlusMenuOpen && !selectedModelOpen"),
  "composer popovers should share one mutual-exclusion policy",
);
assert(
  inputSource.includes("supportsImageGen") && plusMenuSource.includes("{supportsImageGen &&") && !plusMenuSource.includes('label="Screenshot"'),
  "unsupported or unwired add-menu actions must not appear enabled",
);
assert(
  taskHookSource.includes("user-controlled task-plan drawer") && !taskHookSource.includes("setIsOpen(true)"),
  "task progress must not auto-open over the active composer",
);

console.log("input responsiveness verifier passed");
