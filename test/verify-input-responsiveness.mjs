import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const resizeHookSource = readFileSync(new URL("../src/atlas/components/useAutoResizeTextarea.ts", import.meta.url), "utf8");
const dropdownSource = readFileSync(new URL("../src/atlas/components/chat/input/ModelSearchDropdown.tsx", import.meta.url), "utf8");

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
  dropdownSource.includes("return filteredModels.reduce"),
  "model dropdown should render the full filtered model list",
);
assert(
  dropdownSource.includes('key={`${provider}:${model.id}`}'),
  "model dropdown should use provider-qualified keys so same-id models from different providers remain visible",
);

console.log("input responsiveness verifier passed");
