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
const promptSource = readFileSync(
  new URL("../src/atlas/components/genui/prompt.ts", import.meta.url),
  "utf8",
);
const chatCommandSource = readFileSync(
  new URL("../src-tauri/src/commands/chat.rs", import.meta.url),
  "utf8",
);
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
  sendSource.includes("if (data.generativeUI)") &&
    sendSource.includes("systemPrompt = await preloadOpenUISystemPrompt();") &&
    sendSource.includes("systemPrompt: systemPrompt"),
  "send path should pass the cached OpenUI prompt only for Gen UI turns",
);
assert(
  inputSource.includes("if (val) void preloadOpenUISystemPrompt();") &&
    inputSource.includes("if (internalGenerativeUI) void preloadOpenUISystemPrompt();"),
  "input controls should warm the Gen UI prompt before send",
);
assert(
  loaderSource.includes("openUISystemPromptPromise") &&
    loaderSource.includes('import("./prompt")'),
  "OpenUI prompt import should be cached behind a lazy loader",
);
assert(
  promptSource.includes("cachedOpenUISystemPrompt") &&
    promptSource.includes("openuiLibrary.prompt(promptOptions)"),
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
