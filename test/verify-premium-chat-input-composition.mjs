import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const types = read("src/atlas/components/chat/input/PremiumChatInputTypes.ts");
const input = read("src/atlas/components/PremiumChatInput.tsx");
const textarea = read("src/atlas/components/ChatInputTextAreaBlock.tsx");
const footer = read("src/atlas/components/ChatInputFooter.tsx");
const pills = read("src/atlas/components/chat/input/ActionPills.tsx");
const sendHandler = read("src/atlas/components/useSendHandler.ts");

assert(
  types.includes('export type ComposerLayoutMode = "default" | "welcome" | "sidebar" | "narrow"'),
  "the composer must have one documented layout-mode union",
);
assert(
  input.includes("const layoutMode: ComposerLayoutMode") &&
    input.includes("<ChatInputTextAreaBlock {...textAreaProps}") &&
    input.includes("<ChatInputFooter {...footerProps}") &&
    (input.match(/layoutMode/g) ?? []).length >= 4,
  "PremiumChatInput must derive and pass one layout mode to its composition blocks",
);
assert(
  textarea.includes("layoutMode: ComposerLayoutMode") &&
    !textarea.includes('variant?: "default" | "welcome"'),
  "the editor block must consume layoutMode instead of a separate variant flag",
);
assert(
  footer.includes("layoutMode: ComposerLayoutMode") &&
    !footer.includes("isCompact: boolean") &&
    !footer.includes("isSidebar?: boolean"),
  "the footer must derive compact/sidebar behavior from layoutMode",
);
assert(
  !pills.includes("generativeUI?:") &&
    !pills.includes("isThinking?:") &&
    !pills.includes("isDeepResearch?:") &&
    !pills.includes("isWebSearch?:"),
  "attachment pills must not expose unused capability-mode props",
);
assert(
  !sendHandler.includes("selectedPrompt") &&
    !sendHandler.includes("PromptDefinition") &&
    sendHandler.includes("handleSuggestedClick"),
  "send handling must not retain an unused prompt state slot",
);
const sendSurface = `${input}\n${sendHandler}`;
for (const field of ["message", "model", "provider", "attachments", "thinking"]) {
  assert(sendSurface.includes(field), `send composition must preserve the ${field} field`);
}

console.log("premium chat input composition contract passed");
