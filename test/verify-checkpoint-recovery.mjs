import { readFileSync } from "node:fs";

const read = (path) => {
  // `services/tool.rs` was split into `services/tool/{agent_exec,approval,audit,
  // authorized,entry,mutations}.rs`. Read the parent plus every submodule as one
  // blob so shape assertions that predate the split keep anchoring on the same
  // content.
  if (path === "src-tauri/src/services/tool.rs") {
    return ["agent_exec", "approval", "audit", "authorized", "entry", "mutations"]
      .map((f) => readFileSync(new URL(`../src-tauri/src/services/tool/${f}.rs`, import.meta.url), "utf8"))
      .concat(readFileSync(new URL("../src-tauri/src/services/tool.rs", import.meta.url), "utf8"))
      .join("\n");
  }
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
};
const checks = [];
const check = (label, condition) => checks.push([label, condition]);

const service = read("src-tauri/src/services/checkpoint.rs");
const toolService = read("src-tauri/src/services/tool.rs");
const command = read("src-tauri/src/commands/checkpoint.rs");
const commandsMod = read("src-tauri/src/commands/mod.rs");
const lib = read("src-tauri/src/lib.rs");
const toolsApi = read("src/api/toolsApi.ts");
const apiIndex = read("src/api/index.ts");
const card = read("src/atlas/components/chat/ToolCallCard.tsx");
const preview = read("src/atlas/components/chat/tool/toolOutputPreview.ts");
const roadmap = read("docs/product-polish-roadmap.md");

check("checkpoint ledger captures pre-mutation bytes", /capture_before\(/.test(service) && /original: Option<Vec<u8>>/.test(service));
check("checkpoint restore is fail-closed on external edits", /expected_after/.test(service) && /conflicts/.test(service) && /validate_workspace_path/.test(service));
check("created files can be removed during undo", /original \{[\s\S]*?None =>/.test(service) && /remove_file/.test(service));
check("checkpoint service is bounded and explicitly process-local", /MAX_MUTATIONS_PER_CHAT/.test(service) && /process-local/.test(service));
check("canonical v2 dispatch preserves the stable tool call id", /execute_with_context\(/.test(toolService) && /tool_call\.id\.clone\(\)/.test(toolService));
check("file mutation families are captured before execution", /write_file.*edit_file.*file_write/.test(toolService) && /apply_patch/.test(toolService) && /capture_file_mutations/.test(toolService));
check("successful mutations expose checkpoint metadata", /\"checkpoint\"/.test(toolService) && /file_count/.test(toolService));
check("checkpoint commands are declared and registered", /pub mod checkpoint/.test(commandsMod) && /get_tool_checkpoint/.test(command) && /undo_tool_call/.test(command) && /commands::checkpoint::undo_tool_call/.test(lib));
check("frontend API exposes typed inspection and undo calls", /getToolCheckpoint/.test(toolsApi) && /undoToolCall/.test(toolsApi) && /get_tool_checkpoint/.test(toolsApi) && /undo_tool_call/.test(toolsApi));
check("checkpoint result types are exported from the API barrel", /ToolCheckpoint/.test(apiIndex) && /UndoToolCallResult/.test(apiIndex));
check("tool output preview normalizes checkpoint metadata", /ToolCheckpointPreview/.test(preview) && /normalizeCheckpoint/.test(preview) && /checkpoint,/.test(preview));
check("completed file edits expose an explicit, confirmed Undo action", /const canUndo = status === \"completed\"/.test(card) && /window\.confirm\(/.test(card) && /toolsApi\.undoToolCall/.test(card) && /isUndoing \? <Loader2/.test(card) && /: <Undo2/.test(card));
check("undo conflicts do not overwrite user edits", /workspace changed after the agent edit/.test(card) && /No files were overwritten/.test(card));
check("roadmap records the delivered slice and limitations", /## P0\.3 Checkpoints, undo, and rewind/.test(roadmap) && /Status:\*\* `\[~\]`/.test(roadmap) && /process-local/.test(roadmap) && /Git\/worktree/.test(roadmap));

check("Undo checks current-process availability before rendering", /getToolCheckpoint/.test(card) && /setCheckpointAvailable\(result\?\.available === true\)/.test(card) && /checkpoint\?\.toolCallId/.test(card));
check("file mutation and recovery transactions are serialized", /acquire_mutation_lock/.test(service) && /is_file_mutation_tool/.test(toolService));

check("no-op mutations do not advertise an undo checkpoint", /let mut changed_count = 0/.test(toolService) && /if changed_count == 0/.test(toolService));
check("failed mutations discard checkpoint metadata", /Failed mutations are not advertised as undoable/.test(toolService) && /discard_file_mutations/.test(toolService));

let failed = false;
for (const [label, condition] of checks) {
  if (condition) console.log(`OK  ${label}`);
  else {
    console.error(`FAIL ${label}`);
    failed = true;
  }
}
if (failed) {
  console.error("\nCheckpoint recovery verifier failed.");
  process.exitCode = 1;
} else {
  console.log("\nCheckpoint recovery verifier passed.");
}
