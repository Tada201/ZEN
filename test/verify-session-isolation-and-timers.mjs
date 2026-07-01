import { readFileSync, existsSync } from "node:fs";

const check = (label, ok, detail = "") => {
  if (ok) {
    console.log(`OK  ${label}`);
  } else {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  }
};

const chatCommands = readFileSync("src-tauri/src/commands/chat.rs", "utf8");
check(
  "delete_chat cleans up recall_cache",
  /state\.recall_cache\.lock\(\)\.await;\s*cache\.remove\(&chat_id\)/.test(chatCommands),
);
check(
  "delete_chat cleans up session_permissions",
  /state\.session_permissions\.lock\(\)\.await;\s*perms\.remove\(&chat_id\)/.test(chatCommands),
);
check(
  "delete_chat cleans up graph_sessions",
  /state\.graph_sessions\.lock\(\)\.await;\s*graphs\.remove\(&chat_id\)/.test(chatCommands),
);

const queries = readFileSync("src/atlas/hooks/chat/useChatQueries.ts", "utf8");
check(
  "parseBackendDate exists and handles timezone offsets",
  /export function parseBackendDate/.test(queries),
);

const sidebar = readFileSync("src/atlas/components/chat/SessionSidebar.tsx", "utf8");
check(
  "SessionSidebar registers interval timer tick for relative time updates",
  /setInterval\(\(\) => setTick\(t => t \+ 1\),\s*60000\)/.test(sidebar),
);

if (process.exitCode) {
  console.error("\nOne or more verifier checks failed.");
} else {
  console.log("\nAll verifier checks passed.");
}
