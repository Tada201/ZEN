import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const chatApiSource = readFileSync(
  new URL("../src/api/chatApi.ts", import.meta.url),
  "utf8",
);
const queriesSource = readFileSync(
  new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url),
  "utf8",
);
// `commands/chat/send.rs` was split into `send/{history,persist,prompt,research,
// resolve,route,validate}.rs`. Read the parent plus every submodule as one blob
// so shape assertions that predate the split keep anchoring on the same content.
const chatCommandSource = ["history", "persist", "prompt", "research", "resolve", "route", "validate"]
  .map((m) => readFileSync(new URL(`../src-tauri/src/commands/chat/send/${m}.rs`, import.meta.url), "utf8"))
  .concat(readFileSync(new URL("../src-tauri/src/commands/chat/send.rs", import.meta.url), "utf8"))
  .join("\n");

assert(
  chatApiSource.includes("reasoningDetails?: string;"),
  "frontend backend message contract should expose persisted reasoning details",
);

assert(
  queriesSource.includes("JSON.parse(msg.reasoningDetails)") &&
    queriesSource.includes('steps.push({ type: "reasoning", content: reasoning })') &&
    queriesSource.includes("reasoning: reasoning || undefined") &&
    queriesSource.includes("if (a.reasoning !== b.reasoning) return false"),
  "history mapper should replay persisted reasoning into visible message reasoning and semantic updates",
);

assert(
  chatCommandSource.includes(".reasoning_details") &&
    chatCommandSource.includes("serde_json::from_str(rd_str).ok()") &&
    chatCommandSource.includes("reasoning_details,"),
  "backend send history should preserve saved reasoning details when building LLM context",
);

console.log("reasoning persistence replay verifier passed");
