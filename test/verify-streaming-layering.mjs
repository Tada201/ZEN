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
  messageList.includes("getItemKey: (index) => filteredMessages[index]?.id ?? index") &&
    messageList.includes("scheduleFullMeasure") &&
    messageList.includes("followupMeasureFrame") &&
    messageList.includes('contain: "style"'),
  "virtualized message rows should use stable ids and remeasure after width changes without relying on high stacking order or layout containment",
);

assert(
  messageList.includes("zIndex: 0") &&
    !messageList.includes("zIndex: isActiveStreamingRow ? 30 : 1") &&
    !messageList.includes("absolute top-0 left-0 w-full isolate"),
  "streaming rows should not stack above completed rows because stale virtual heights can otherwise overlap content",
);

assert(
  chatSection.includes("absolute bottom-0 left-0 right-0 z-30"),
  "floating input and live status area should stack above the message list",
);

console.log("streaming layering verifier passed");
