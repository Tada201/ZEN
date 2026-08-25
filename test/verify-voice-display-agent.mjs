import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const resource = JSON.parse(readFileSync(new URL("../src-tauri/resources/agents/voice_display.json", import.meta.url), "utf8"));
const loopSource =
  readFileSync(new URL("../src-tauri/crates/zen-agent/src/runner/turn_loop.rs", import.meta.url), "utf8") +
  readFileSync(new URL("../src-tauri/crates/zen-agent/src/runner/step_exec.rs", import.meta.url), "utf8");
const runnerSource = readFileSync(new URL("../src-tauri/crates/zen-agent/src/runner/voice_display.rs", import.meta.url), "utf8");
// Phase 11: the raw `app.listen("board:update")` wiring moved to the app-side
// BoardPort adapter; the runner now watches the board through the port seam.
const boardAdapterSource = readFileSync(new URL("../src-tauri/src/services/agent_context.rs", import.meta.url), "utf8");
const chatSource = readFileSync(new URL("../src-tauri/src/commands/chat/send.rs", import.meta.url), "utf8");
const boardToolSource = readFileSync(new URL("../src-tauri/src/agent/tools/manage_board.rs", import.meta.url), "utf8");
const boardListenerSource = readFileSync(new URL("../src/atlas/components/voice/useBoardEventListener.ts", import.meta.url), "utf8");
const sendMessageSource = readFileSync(new URL("../src/atlas/hooks/chat/useSendMessage.ts", import.meta.url), "utf8");
const stageStoreSource = readFileSync(new URL("../src/atlas/components/voice/voiceStageStore.ts", import.meta.url), "utf8");
const overlaySource = readFileSync(new URL("../src/atlas/components/voice/VoiceModeOverlay.tsx", import.meta.url), "utf8");
const middlewareSource = readFileSync(new URL("../src-tauri/crates/zen-agent/src/middleware/system_prompt.rs", import.meta.url), "utf8");
const spawnToolSource = [
  "child.rs", "completion.rs", "deps.rs", "failure.rs", "messaging.rs",
  "model_select.rs", "outcome.rs", "params.rs", "tool.rs",
].map((f) => readFileSync(new URL(`../src-tauri/src/agent/tools/spawn_tools/${f}`, import.meta.url), "utf8")).join("");
const toolPipelineSource = readFileSync(new URL("../src-tauri/crates/zen-agent/src/runner/tool_pipeline.rs", import.meta.url), "utf8");
const toolDispatchSource = ["mod.rs", "router.rs", "executors.rs", "completion.rs"]
  .map((f) => readFileSync(new URL(`../src-tauri/crates/zen-agent/src/runner/dispatch/${f}`, import.meta.url), "utf8")).join("");
const displayContextSource = readFileSync(new URL("../src/atlas/components/voice/voiceDisplayContext.ts", import.meta.url), "utf8");
const boardEventSource = readFileSync(new URL("../src/atlas/components/voice/useBoardEventListener.ts", import.meta.url), "utf8");

assert.deepEqual(resource.tool_ids, ["manage_board"], "voice display agent must remain render-only");
assert(loopSource.includes("spawn_voice_display_agent"), "completed voice runs must launch the display agent");
assert(runnerSource.includes('format!("voice-display:{}"'), "display events must use an isolated synthetic chat id");
assert(/HashSet::from\(\[\s*"manage_board"\.to_string\(\)\s*,?\s*\]\)/s.test(runnerSource), "runtime allowlist must enforce board-only tools");
assert(runnerSource.includes("tokio::spawn"), "display rendering must not block main response completion");
assert(runnerSource.includes("ORIGINAL USER REQUEST") && runnerSource.includes("user_request: &str"), "display agent must receive the complete original user request as its authoritative instruction");
assert(boardAdapterSource.includes('app.listen("board:update"') && runnerSource.includes("watch_board_updates") && runnerSource.includes("Voice display agent completed without executing manage_board"), "display success must require an actual scoped board update");
assert(runnerSource.includes("extract_board_operation") && runnerSource.includes(".run_board_operation(") && boardAdapterSource.includes("ManageBoardTool::new()") && runnerSource.includes("with_tools_enabled(false)"), "display runner must fall back to validated structured board JSON when native tool calls are unavailable");
assert(resource.instructions.includes("MUST execute manage_board at least once"), "display agent prompt must reject prose-only completion");
assert(resource.instructions.includes("set requires blocks (plural array)") && resource.instructions.includes("Never use {action:set, block:...}"), "display agent must receive explicit action-specific board shapes");
assert(boardToolSource.includes('schema["allOf"]') && boardToolSource.includes('"then": { "required": ["blocks"] }'), "manage_board schema must require blocks for set operations without over-nesting the main json macro");
assert(runnerSource.includes("normalize_board_operation") && runnerSource.includes('object.insert("blocks".to_string()'), "structured fallback must repair set plus singular block output");
assert(runnerSource.includes("extract_root_block") && runnerSource.includes("normalize_block_aliases") && runnerSource.includes('object.remove("svg")'), "structured fallback must normalize root-level media fields and common SVG aliases");
// assert(runnerSource.includes('object.remove("type")') && runnerSource.includes("simple_shape_svg") && runnerSource.includes('Some("chart")'), "structured fallback must infer missing block kinds and support simple shape payloads");
assert(toolDispatchSource.includes('current_agent.id == "voice_display"') && toolDispatchSource.includes("v1_tools_info"), "voice display must receive manage_board directly instead of progressive meta-tools");
assert(middlewareSource.includes("direct_board_agent") && middlewareSource.includes("Call `manage_board` directly"), "display middleware must teach the direct board-tool contract");
assert(!runnerSource.includes("voiceDisplayAgentPrompt") && !runnerSource.includes("voiceDisplayAgentContextTokens"), "voice display prompt and advanced runtime controls must not be user-editable");
assert(chatSource.includes('get("voiceDisplayAgentModel")') && chatSource.includes("display_agent_enabled = is_voice_mode"), "voice display must always run automatically and read only its selected model");
assert(resource.config_mode === "model_only" && resource.user_invocable === false && resource.tool_ids.length === 1 && resource.tool_ids[0] === "manage_board", "voice display must be an automatic model-only built-in profile");
assert(boardToolSource.includes('object.insert("chat_id".to_string()'), "board events must carry their originating chat id");
assert(boardListenerSource.includes("useBoardEventListener(chatId?: string)") && boardListenerSource.includes("voice-display:${chatId}"), "voice board listener must reject unrelated chat events while accepting its display-agent run");
assert(sendMessageSource.includes("A dedicated render-only display agent automatically receives the user's complete original request") && sendMessageSource.includes("Do not call \\`manage_board\\`") && sendMessageSource.includes("do not spawn \\`voice_display\\`"), "main voice prompt must preserve one rendering owner");
assert(stageStoreSource.includes("resetCurrent: () =>") && overlaySource.includes("saveCurrentBoard()") && overlaySource.includes("resetCurrentStage()"), "opening voice mode must retain prior boards while resetting only the visible board");
assert(middlewareSource.includes('agent.id == "generalist" || agent.id == "voice_display"'), "internal voice display agent must not be advertised as a delegatable role");
assert(spawnToolSource.includes('if agent_id == "voice_display"'), "manual voice display spawns must be rejected before child execution");
assert(toolPipelineSource.includes("normalize_direct_tool_args") && toolPipelineSource.includes('object.remove("role")'), "provider tool-envelope and legacy role arguments must be normalized before validation");
assert(toolPipelineSource.includes('tool_name == "manage_board"') && toolPipelineSource.includes("voice_display::normalize_board_operation"), "native manage_board calls must use the same compatibility normalization as fallback JSON");
assert(runnerSource.includes('starts_with("<svg")') && runnerSource.includes('Some("html")') && runnerSource.includes('Some("gen_ui")'), "board normalization must infer media kinds from content when providers omit kind");
assert(runnerSource.includes("content_is_empty") && runnerSource.includes("Example content generated for the requested board"), "empty Gen UI and HTML blocks must receive safe displayable fallback content");
assert(runnerSource.includes("RECENT TOOL EVIDENCE") && runnerSource.includes("first_youtube_url") && runnerSource.includes("deterministic_block_operation"), "display agent must receive searched URLs and deterministically handle video and replacement requests");
assert(runnerSource.includes("CURRENT BOARD MANIFEST") && runnerSource.includes("Always update, remove, or focus using the exact existing widget ID") && runnerSource.includes("voice_display_context"), "display agent must receive stable widget IDs and explicit non-destructive edit rules");
assert(runnerSource.includes("if !board_updated.load") && runnerSource.includes("Voice display native tool call failed"), "structured recovery must run after malformed native tool calls, not only successful prose completion");
assert(runnerSource.includes("execute_deterministic_board_fallback") && runnerSource.includes('"circle", "square", "rectangle", "triangle", "line"'), "simple drawings must survive providers that fail both native and structured tool output");
assert(displayContextSource.includes("estimatedPixelCost") && displayContextSource.includes("estimatedOccupiedPercent") && displayContextSource.includes("getBoundingClientRect"), "voice display context must include viewport-aware pixel budgeting");
assert(displayContextSource.includes("contentHint") && displayContextSource.includes("block.id"), "board manifest must identify existing objects well enough for targeted edits");
assert(stageStoreSource.includes("filter((item) => item.id !== normalized.id)") && stageStoreSource.includes("remove: (id) =>"), "duplicate adds must replace the same ID and removals must have a targeted store mutation");
assert(stageStoreSource.includes("const merged = { ...widgets[index], ...normalized }") && stageStoreSource.includes("placeInFirstFreeSlot(merged, widgets)") && boardEventSource.includes("hasPayloadForKind"), "partial updates must merge with existing widgets without accidentally changing their media kind");
assert(boardEventSource.includes("store.remove(op.id)") && boardEventSource.includes("store.resetCurrent()"), "remove must target one widget and clear must preserve retained board memory");

console.log("voice display agent wiring verified");
