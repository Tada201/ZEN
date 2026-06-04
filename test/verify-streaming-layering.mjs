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
  messageList.includes("isActiveStreamingRow") &&
    messageList.includes('m.status === "sending"') &&
    messageList.includes("zIndex: isActiveStreamingRow ? 30 : 1"),
  "streaming message rows should have an explicit higher stacking order than completed rows",
);

assert(
  messageList.includes("className=\"absolute top-0 left-0 w-full isolate\""),
  "virtualized message rows should isolate their internal stacking contexts",
);

assert(
  chatSection.includes("absolute bottom-0 left-0 right-0 z-30"),
  "floating input and live status area should stack above the message list",
);

console.log("streaming layering verifier passed");
