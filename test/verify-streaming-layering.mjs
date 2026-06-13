import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const messageList = readFileSync(
  new URL("../src/atlas/components/chat/MessageList.tsx", import.meta.url),
  "utf8",
);
const chatSection = readFileSync(
  new URL("../src/atlas/sections/ChatSection.tsx", import.meta.url),
  "utf8",
);

assert(
  messageList.includes("key={message.id}") &&
    !messageList.includes("useVirtualizer") &&
    !messageList.includes("translateY("),
  "message rows should use stable ids in normal document flow so width changes cannot create stale virtual positions",
);

assert(
  !messageList.includes("absolute top-0 left-0") &&
    !messageList.includes("zIndex: isActiveStreamingRow ? 30 : 1"),
  "streaming rows should remain in document flow and never stack over completed messages",
);

assert(
  chatSection.includes("absolute bottom-0 left-0 right-0 z-30"),
  "floating input and live status area should stack above the message list",
);

console.log("streaming layering verifier passed");
