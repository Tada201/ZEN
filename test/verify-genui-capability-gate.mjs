import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sendHandler = read("src/atlas/components/useSendHandler.ts");
const sendMessage = read("src/atlas/hooks/chat/useSendMessage.ts");
const optimistic = read("src/atlas/hooks/chat/optimisticChatMessages.ts");
const localFeedback = read("src/atlas/hooks/chat/localFirstFeedback.ts");
const markdown = read("src/atlas/components/chat/MarkdownContent.tsx");
const assistant = read("src/atlas/components/chat/AssistantMessage.tsx");
const reloadMapper = read("src/atlas/hooks/chat/useChatQueries.ts");
const messageTypes = read("src/atlas/components/chat/types.ts");
// `commands/chat/send.rs` was split into `send/{history,persist,prompt,research,
// resolve,route,validate}.rs`. Read the parent plus every submodule as one blob
// so shape assertions that predate the split keep anchoring on the same content.
const backend = ["history", "persist", "prompt", "research", "resolve", "route", "validate"]
  .map((m) => read(`src-tauri/src/commands/chat/send/${m}.rs`))
  .concat(read("src-tauri/src/commands/chat/send.rs"))
  .join("\n");

assert(
  !sendHandler.includes('promptText.includes("genui")'),
  "a suggested prompt must not force GenUI on",
);
assert(
  sendHandler.includes("generativeUI: ctx.internalGenerativeUI"),
  "send handler must forward only the explicit composer capability state",
);
assert(
  optimistic.includes("generativeUI: generativeUI ? 1 : 0"),
  "optimistic assistant messages must carry the per-turn capability state",
);
assert(
  localFeedback.includes("generativeUI: Boolean(generativeUI)"),
  "the ordered timeline must persist an explicit GenUI capability marker",
);
assert(
  sendMessage.includes("const generativeUIEnabled = data.generativeUI === true") &&
    sendMessage.includes("generativeUi: generativeUIEnabled") &&
    sendMessage.includes("if (generativeUIEnabled)"),
  "the send boundary must canonicalize and forward an explicit boolean capability",
);
assert(
  markdown.includes("allowGenerativeUI = false") &&
    markdown.includes("lang === 'openui' && allowGenerativeUI") &&
    markdown.includes('lang === "openui" && allowGenerativeUI'),
  "Markdown must render OpenUI only when the originating turn explicitly allows it",
);
assert(
  assistant.includes("const allowGenerativeUI = message.generativeUI === 1") &&
    assistant.includes("allowGenerativeUI && message.artifact?.type === \"openui\""),
  "assistant rendering must apply the same capability gate to inline and artifact OpenUI",
);
assert(
  reloadMapper.includes("timelineGenerativeUI") &&
    reloadMapper.includes("generativeUI,"),
  "reload hydration must recover the capability marker from persisted timeline metadata",
);
assert(
  messageTypes.includes("generativeUI?: boolean") &&
    messageTypes.includes("msg.generativeUI === \"boolean\""),
  "the message contract must accept explicit boolean GenUI capability values",
);
assert(
  backend.includes("let generative_ui_enabled = generative_ui.unwrap_or(false);") &&
    backend.includes("let generative_ui_addendum = if generative_ui_enabled") &&
    backend.includes("replacement prompts"),
  "backend prompt construction must apply the capability contract even in replace mode",
);
assert(
  backend.includes("currently DISABLED") &&
    backend.includes("Do NOT generate, suggest, or simulate") &&
    backend.includes("`openui`/`genui`"),
  "disabled GenUI must be an explicit system-prompt prohibition",
);

console.log("GenUI capability gate contract passed");
