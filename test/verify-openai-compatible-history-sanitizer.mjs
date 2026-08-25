import { readFileSync } from "node:fs";

const stream = readFileSync(
  new URL("../src-tauri/crates/zen-llm/src/openai_compat/stream.rs", import.meta.url),
  "utf8",
);
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");

function assertIncludes(needle, message) {
  if (!stream.includes(needle)) {
    throw new Error(message);
  }
}

assertIncludes(
  "fn sanitize_outbound_messages(&self, messages: Vec<ChatMessage>) -> Vec<ChatMessage>",
  "OpenAI-compatible provider must sanitize outbound history.",
);
assertIncludes(
  "message.reasoning_details = None;",
  "Historical reasoning_details must not be replayed to OpenAI-compatible providers.",
);
assertIncludes(
  "required_ids.is_subset(&following_tool_ids)",
  "Assistant tool_calls must only be preserved when matching tool messages exist.",
);
assertIncludes(
  "message.tool_calls = None;",
  "Broken assistant tool_call turns with text must be downgraded instead of resent.",
);
assertIncludes(
  "if pending_tool_call_ids.remove(&tool_call_id)",
  "Historical tool messages must be skipped unless they answer a preserved tool_call.",
);
assertIncludes(
  ".sanitize_outbound_messages(messages)",
  "Chat stream must use sanitized history before serializing provider request.",
);

if (!packageJson.includes('"test:openai-compatible-history-sanitizer"')) {
  throw new Error("History sanitizer verifier must be registered in package.json.");
}

console.log("OpenAI-compatible history sanitizer verified.");
