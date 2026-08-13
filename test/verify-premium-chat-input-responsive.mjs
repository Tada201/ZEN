import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const stylesSource = readFileSync(new URL("../src/styles/index.css", import.meta.url), "utf8");
const resizeSource = readFileSync(new URL("../src/atlas/components/useAutoResizeTextarea.ts", import.meta.url), "utf8");
const composerSource = readFileSync(new URL("../src/atlas/components/PremiumChatInput.tsx", import.meta.url), "utf8");
const footerSource = readFileSync(new URL("../src/atlas/components/ChatInputFooter.tsx", import.meta.url), "utf8");
const pinnedSource = readFileSync(new URL("../src/atlas/components/chat/input/PinnedActionBar.tsx", import.meta.url), "utf8");
const attachmentsSource = readFileSync(new URL("../src/atlas/components/chat/input/ActionPills.tsx", import.meta.url), "utf8");
const presetsSource = readFileSync(new URL("../src/atlas/components/chat/input/ImagePresetStrip.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("../src/atlas/components/chat/input/ModelSearchDropdown.tsx", import.meta.url), "utf8");
const plusSource = readFileSync(new URL("../src/atlas/components/chat/input/PlusActionMenu.tsx", import.meta.url), "utf8");

assert(stylesSource.includes("container: composer / inline-size"), "composer shell should expose a named inline-size container");
assert(stylesSource.includes("@container composer (max-width: 30rem)"), "composer controls should respond to their actual container width");
assert(stylesSource.includes("@supports not (container-type: inline-size)"), "responsive behavior should have a non-container-query fallback");
assert(stylesSource.includes("100cqw"), "bounded popovers should use container-relative sizing");
assert(stylesSource.includes("max-height: 12.5rem") && stylesSource.includes("overflow-y: auto"), "the editor should cap growth and scroll internally");
assert(resizeSource.includes("const nextWidth = Math.round(entry.contentRect.width)"), "resize measurements should be normalized before state updates");
assert(resizeSource.includes("previousWidth === nextWidth"), "resize observation should avoid redundant state updates");
assert(resizeSource.includes("[message, maxHeight, minHeight, containerWidth]"), "width changes should re-run textarea height measurement for wrapped drafts");
assert(composerSource.includes('data-layout-mode={layoutMode}'), "the fixture and browser tools should be able to inspect the derived layout mode");
assert(footerSource.includes("composer-action-rail") && footerSource.includes("composer-fixed-actions"), "footer should separate shrinkable actions from stable controls");
assert(footerSource.includes("composer-footer-action-label"), "pause and stop labels should collapse by container width, not only viewport width");
assert(pinnedSource.includes("min-w-0 flex-1") && pinnedSource.includes("overflow-x-auto"), "pinned actions should scroll internally instead of forcing toolbar overflow");
assert(attachmentsSource.includes("flex-nowrap") && attachmentsSource.includes("overflow-x-auto"), "attachments should remain a bounded horizontal rail");
assert(presetsSource.includes("min-w-0 w-full") && presetsSource.includes("min-w-max"), "image presets should use one bounded horizontal scroller");
assert(modelSource.includes("composer-popover--bounded") && plusSource.includes("composer-popover--bounded"), "composer popovers should be bounded by the composer container");

console.log("premium chat input responsive verifier passed");
