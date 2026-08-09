import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const sendSource = readFileSync(new URL("../src/atlas/hooks/chat/useSendMessage.ts", import.meta.url), "utf8");
const inputSource = readFileSync(new URL("../src/atlas/components/PremiumChatInput.tsx", import.meta.url), "utf8");
const syncSource = readFileSync(new URL("../src/atlas/components/useGenUISync.ts", import.meta.url), "utf8");
const loaderSource = readFileSync(new URL("../src/atlas/components/genui/promptLoader.ts", import.meta.url), "utf8");

assert(
  sendSource.includes('import { preloadOpenUISystemPrompt } from "../../components/genui/promptLoader";'),
  "send path should use the lightweight Gen UI prompt loader",
);
assert(
  !sendSource.includes('await import("../../components/genui/prompt")'),
  "send path should not perform a direct Gen UI prompt chunk import",
);
assert(
  sendSource.includes("systemPrompt = await preloadOpenUISystemPrompt();"),
  "send path should reuse the cached/warmed Gen UI prompt promise",
);
assert(
  syncSource.includes("if (internal) void preloadOpenUISystemPrompt();"),
  "Gen UI toggle should warm the prompt chunk before send",
);
assert(
  inputSource.includes("useGenUISync") &&
    /useGenUISync\(\s*generativeUI\s*,\s*onGenerativeUIChange\s*,?\s*\)/.test(inputSource),
  "PremiumChatInput should pass its controlled generativeUI value and change handler to useGenUISync",
);
assert(
  loaderSource.includes("let openUISystemPromptPromise: Promise<string> | null = null"),
  "prompt loader should cache the prompt import promise",
);
assert(
  loaderSource.includes('import("./prompt")'),
  "prompt loader should keep the heavy OpenUI prompt in a lazy chunk",
);

console.log("genui prompt preload ok");
