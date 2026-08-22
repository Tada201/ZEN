import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workspaceSection = read("src/atlas/sections/WorkspaceSection.tsx");
const messageList = read("src/atlas/components/chat/MessageList.tsx");
const scrubber = read("src/atlas/components/chat/ChatTimelineScrubber.tsx");
const input = read("src/atlas/components/PremiumChatInput.tsx");
const footer = read("src/atlas/components/ChatInputFooter.tsx");
const resizeHook = read("src/atlas/components/useAutoResizeTextarea.ts");

assert(workspaceSection.includes('className="w-full shrink-0"'), "the chat composer must reserve normal-flow space");
assert(!workspaceSection.includes('className="absolute bottom-0 left-0 right-0'), "the chat composer must not cover transcript rows with an absolute overlay");
assert(!workspaceSection.includes("suppressLayoutAnimation"), "the main chat composer should use the intrinsic instant-geometry contract");
assert(!workspaceSection.includes("<motion.main"), "the main chat column must not animate width changes through a layout transform");

assert(messageList.includes("new ResizeObserver"), "the message viewport must observe composer-driven size changes");
assert(messageList.includes("scheduleScrollToBottom"), "scroll pinning must be coalesced through one scheduler");
assert(messageList.includes("[overflow-anchor:auto]"), "transcript rows must preserve browser scroll anchoring when unpinned");
assert(scrubber.includes("absolute inset-y-0 left-0"), "the scrubber must overlay the message rail instead of changing transcript width");
assert(scrubber.includes("onMissingTarget"), "the scrubber must report windowed targets instead of silently doing nothing");
assert(messageList.includes("revealScrubTarget"), "windowed scrubber targets must reveal the hidden transcript before jumping");
assert(!scrubber.includes("self-center py-2 sm:mx-3 sm:flex"), "the scrubber must not participate as a width-consuming flex sibling");

assert(input.includes("composer-shell"), "composer must use the centralized shell transition contract");
assert(!input.includes("overflow-visible transition-all duration-200"), "composer must not use a blanket transition-all layout animation");
assert(resizeHook.includes('textarea.style.height = \"auto\"'), "textarea resizing must measure from a reset height");
assert(resizeHook.includes("Math.min(textarea.scrollHeight, maxHeight)"), "textarea growth must remain bounded");
assert(footer.includes("grid-cols-[minmax(0,1fr)_auto]"), "footer controls must keep send actions in a stable column");
assert(footer.includes("shrink-0 items-center gap-1.5"), "footer actions must not wrap around the send controls");

console.log("chat scrubber/input stability contract passed");
