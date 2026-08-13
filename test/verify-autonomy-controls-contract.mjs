import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const check = (name, condition) => checks.push({ name, condition });

const modes = read("src/lib/constants/permissionModes.ts");
const menu = read("src/atlas/components/PermissionModeMenu.tsx");
const controls = read("src/atlas/components/ChatInputFooter.tsx");
const assistant = read("src/atlas/components/chat/AssistantMessage.tsx");
const messageList = read("src/atlas/components/chat/MessageList.tsx");
const messageItem = read("src/atlas/components/chat/MessageItem.tsx");
const input = read("src/atlas/components/PremiumChatInput.tsx");
const chatSection = read("src/atlas/sections/ChatSection.tsx");
const workspaceSection = read("src/atlas/sections/WorkspaceSection.tsx");
const toolCard = read("src/atlas/components/chat/ToolCallCard.tsx");
const toolsApi = read("src/api/toolsApi.ts");
const abortCommand = read("src-tauri/src/commands/chat/lifecycle.rs");
const checkpointService = read("src-tauri/src/services/checkpoint.rs");

check("three autonomy modes share the typed registry", /id: "ask"/.test(modes) && /id: "auto_edit"/.test(modes) && /id: "yolo"/.test(modes));
check("mode selection persists the complete backend projection", /getSafetyModeSettings\(mode\)/.test(menu) && /await store\.applyChanges\(\)/.test(menu));
check("active runs expose pause and stop controls in the composer", /Pause/.test(controls) && /Stop response/.test(controls) && /onPause/.test(controls) && /onAbort/.test(input));
check("paused runs expose resume in the composer", /isPaused/.test(controls) && /Resume response/.test(controls));
check("pause and stop share the composer without duplicate timeline controls", /onPause/.test(controls) && /Stop response/.test(controls) && !/<RunControlBar/.test(assistant));
check("run lifecycle controls are threaded through the canonical composer", /onPause/.test(input) && /onResume/.test(input) && /isPaused/.test(input));
check("research continuation remains available as a separate workflow", /handleContinueResearch/.test(chatSection) && /handleContinueResearch/.test(workspaceSection));
check("failed tool retry remains available", /toolsApi\.undoToolCall|toolsApi\.getToolCheckpoint/.test(toolCard) && /Retry/.test(toolCard));
check("file checkpoints are typed and fail closed", /getToolCheckpoint/.test(toolsApi) && /undo_tool_call/.test(toolsApi) && /refuses_restore_after_external_change/.test(checkpointService));
check("backend stop cancels the active chat token", /abort_chat/.test(abortCommand) && /token\.cancel\(\)/.test(abortCommand));

const failures = checks.filter(({ condition }) => !condition);
for (const { name, condition } of checks) {
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
}
if (failures.length > 0) process.exit(1);
console.log(`Autonomy controls contract passed (${checks.length} checks).`);
