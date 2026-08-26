import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const managerSource = readFileSync(
  new URL("../src-tauri/crates/zen-tools/src/manager.rs", import.meta.url),
  "utf8",
);
const pipelineSource = readFileSync(
  new URL("../src-tauri/crates/zen-agent/src/runner/tool_pipeline.rs", import.meta.url),
  "utf8",
);
const serviceSource = ["mod.rs", "agent_exec.rs", "approval.rs", "audit.rs", "authorized.rs", "entry.rs", "mutations.rs"]
  .map((f) => readFileSync(new URL(f === "mod.rs"
    ? "../src-tauri/src/services/tool.rs"
    : `../src-tauri/src/services/tool/${f}`, import.meta.url), "utf8")).join("\n");
const toolsSource = readFileSync(
  new URL("../src-tauri/crates/zen-tools/src/registry.rs", import.meta.url),
  "utf8",
);

assert(
  pipelineSource.includes("enforce_tool_allowlist(&allowlist, &real_id, \"agent\")") &&
    pipelineSource.includes("enforce_tool_allowlist(&allowlist, tool_id, \"agent\")") &&
    !pipelineSource.includes("authorized_tool_ids.iter().any(|id| id == &real_id)"),
  "tool_exec/tool_info must reject resolved tools through the shared allowlist helper",
);
assert(
  managerSource.includes("executable_tool_names.contains(&id)") &&
    toolsSource.includes("pub fn executable_tool_names"),
  "tool_list should only advertise tools known to the executable tool boundary",
);
assert(
  managerSource.includes("pub risk_level: Option<String>") &&
    managerSource.includes("risk_level: Some(id_to_risk_label"),
  "tool_list/tool_info should expose risk metadata for v1 and v2 tools",
);
assert(
  managerSource.match(/"additionalProperties": false/g)?.length >= 3,
  "meta-tool schemas should be strict about unknown properties",
);
assert(
  serviceSource.includes("fn map_tool_operation") &&
    serviceSource.includes("PrivilegedOperation::ShellCommand") &&
    serviceSource.includes("PrivilegedOperation::FileWrite") &&
    serviceSource.includes("PrivilegedOperation::NetworkFetch"),
  "tool audits should map tool names to precise privileged operation classes",
);
assert(
  serviceSource.includes("let v2_exists =") &&
    serviceSource.includes(".execute_v2_authorized(app, chat_id, v2_tool_call, \"agent_tool\")") &&
    serviceSource.includes("already_allowed"),
  "agent runner execution should fall back to v2 tools without bypassing confirmation requirements",
);
assert(
  serviceSource.includes("tool execution started") &&
    serviceSource.includes("tool execution succeeded") &&
    serviceSource.includes("tool execution failed"),
  "v2 tool execution should audit start and terminal outcomes",
);

console.log("tool contract hardening ok");
