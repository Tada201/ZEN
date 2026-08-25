import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const sendSource = readFileSync(
  new URL("../src/atlas/hooks/chat/useSendMessage.ts", import.meta.url),
  "utf8",
);
const inputSource = readFileSync(
  new URL("../src/atlas/components/PremiumChatInput.tsx", import.meta.url),
  "utf8",
);
const loaderSource = readFileSync(
  new URL("../src/atlas/components/genui/promptLoader.ts", import.meta.url),
  "utf8",
);
const genUISyncSource = readFileSync(
  new URL("../src/atlas/components/useGenUISync.ts", import.meta.url),
  "utf8",
);
const promptSource = readFileSync(
  new URL("../src/atlas/components/genui/prompt.ts", import.meta.url),
  "utf8",
);
// `commands/chat/send.rs` was split into `send/{history,persist,prompt,research,
// resolve,route,validate}.rs`. Read the parent plus every submodule as one blob
// so shape assertions that predate the split keep anchoring on the same content.
const chatCommandSource = ["history", "persist", "prompt", "research", "resolve", "route", "validate"]
  .map((m) => readFileSync(new URL(`../src-tauri/src/commands/chat/send/${m}.rs`, import.meta.url), "utf8"))
  .concat(readFileSync(new URL("../src-tauri/src/commands/chat/send.rs", import.meta.url), "utf8"))
  .join("\n");
const settingsMapperSource = readFileSync(
  new URL("../src/lib/stores/settingsMapper.ts", import.meta.url),
  "utf8",
);

assert(
  sendSource.includes("setSessionMessages(targetSessionId") &&
    sendSource.indexOf("setSessionMessages(targetSessionId") < sendSource.indexOf("systemPrompt = await preloadOpenUISystemPrompt()"),
  "assistant placeholder should render before waiting on Gen UI system prompt load",
);
assert(
  sendSource.includes("const generativeUIEnabled = data.generativeUI === true") &&
    sendSource.includes("if (generativeUIEnabled)") &&
    sendSource.includes("systemPrompt = await preloadOpenUISystemPrompt();") &&
    sendSource.includes("systemPrompt: systemPrompt"),
  "send path should pass the cached OpenUI prompt only for explicitly enabled Gen UI turns",
);
// Gen UI prompt warming was moved out of PremiumChatInput.tsx into
// useGenUISync.ts (single idempotent effect on the internal toggle).
assert(
  genUISyncSource.includes("if (internal) void preloadOpenUISystemPrompt();") &&
    inputSource.includes("useGenUISync("),
  "input controls should warm the Gen UI prompt before send",
);
assert(
  loaderSource.includes("openUISystemPromptPromise") &&
    loaderSource.includes('import("./prompt")'),
  "OpenUI prompt import should be cached behind a lazy loader",
);
// Caching moved out of prompt.ts into promptLoader.ts via a memoized promise.
assert(
  promptSource.includes("buildOpenUISystemPrompt") &&
    promptSource.includes("openuiLibrary.prompt(promptOptions)") &&
    loaderSource.includes("if (!openUISystemPromptPromise)"),
  "OpenUI prompt builder should cache the generated prompt string",
);
assert(
  chatCommandSource.includes('queries::get_setting(&db, "system_prompt")') &&
    chatCommandSource.includes("let base_instructions = match custom_prompt_setting") &&
    chatCommandSource.includes('format!("{}\\n\\n{}", base_instructions, p)') &&
    chatCommandSource.includes("SYSTEM STATE WARNING"),
  "backend should load saved system instructions, layer feature prompts on top, and append per-turn Gen UI state",
);
assert(
  settingsMapperSource.includes("const camelToSnake") &&
    settingsMapperSource.includes("MAPPING_RULES[key]") &&
    settingsMapperSource.includes("sqlite[rule.sqliteKey]"),
  "settings mapper should persist systemPrompt as the backend system_prompt key through camel-to-snake mapping",
);

console.log("system prompt loading verifier passed");
