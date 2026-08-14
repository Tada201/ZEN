import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/atlas/components/chat/tool/ExecutionRow.tsx", "utf8");

assert(
  source.includes("export function normalizeExecutionRowStatus"),
  "ExecutionRow must normalize runtime statuses before rendering",
);
assert(
  source.includes("STATUS_ICONS[resolvedStatus] ?? Circle"),
  "ExecutionRow must provide a defined icon fallback for unknown statuses",
);
assert(
  source.includes('case "cancelled":') && source.includes('return "interrupted"'),
  "cancelled backend statuses must render as interrupted instead of crashing",
);
assert(
  source.includes('case "failed":') && source.includes('return "error"'),
  "failed backend statuses must render as an error row",
);
assert(
  source.includes("Unknown or missing backend phases are treated as active"),
  "unknown backend phases must have a documented safe fallback",
);

console.log("execution row runtime safety contract passed");
