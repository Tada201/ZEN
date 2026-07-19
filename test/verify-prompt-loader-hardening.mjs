import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const loader = readFileSync(
  new URL("../src-tauri/src/utils/prompt_loader/mod.rs", import.meta.url),
  "utf8",
);
const plan = readFileSync(
  new URL("../src-tauri/src/agent/orchestrator/plan.rs", import.meta.url),
  "utf8",
);
const prompt = readFileSync(
  new URL("../resources/prompts/orchestrator_planning.txt", import.meta.url),
  "utf8",
);

assert(loader.includes("CARGO_MANIFEST_DIR"), "prompt loader should resolve from a stable manifest/workspace root");
assert(loader.includes("prompt_search_roots()"), "prompt loader should use explicit search roots, not a single cwd-relative path");
assert(loader.includes("is_ascii_alphanumeric") && loader.includes("anyhow::bail!(\"Invalid prompt name"), "prompt loader should reject path traversal and unsafe prompt names");
assert(!loader.includes('PathBuf::from("resources/prompts").join'), "prompt loader should not depend only on process cwd");

assert(plan.includes('prompt_loader::load_prompt("orchestrator_planning")'), "orchestrator planning should load the externalized prompt");
assert(!plan.includes("You are an expert task planner"), "orchestrator planning prompt should not be duplicated in Rust source");

assert(prompt.includes("You are an expert task planner"), "orchestrator prompt file should contain the task planner role");
assert(prompt.includes("ONLY output valid JSON"), "orchestrator prompt should preserve strict JSON output guidance");
assert(prompt.includes('"tasks"') && prompt.includes('"complexity"'), "orchestrator prompt should document required JSON fields");

console.log("prompt loader hardening ok");
