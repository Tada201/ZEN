import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message);
  }
}

function assertAbsent(source, needle, message) {
  if (source.includes(needle)) {
    throw new Error(message);
  }
}

const featureRegistry = read("src/lib/features/frontendFeatures.ts");
const settingsNavigation = read("src/atlas/components/settingsNavigation.ts");
const settingsModal = read("src/atlas/components/SettingsModal.tsx");
const tabExports = read("src/components/settings/Tabs/index.ts");
const voiceSettings = read("src/components/settings/Tabs/VoiceSettings.tsx");
const agentsSettings = read("src/components/settings/Tabs/AgentsSettings.tsx");
const agentEditor = read("src/components/settings/Tabs/AgentEditor.tsx");
const agentsApi = read("src/api/agentsApi.ts");
const childRunner = read("src-tauri/src/agent/tools/child_runner.rs");
const spawnTools = [
  "child.rs", "completion.rs", "deps.rs", "failure.rs", "messaging.rs",
  "model_select.rs", "outcome.rs", "params.rs", "tool.rs",
].map((f) => read(`src-tauri/src/agent/tools/spawn_tools/${f}`)).join("");
const settingsSchema = read("src/lib/stores/settings/schema.ts");
const audioSlice = read("src/lib/stores/settings/createAudioSlice.ts");
const audioTypes = read("src/lib/stores/settings/types.ts");
const voiceDefaults = read("src/lib/stores/settings/voiceDefaults.ts");
const packageJson = read("package.json");

assertIncludes(featureRegistry, '| "voice"', "SettingsTabId must include the voice tab.");
assertIncludes(featureRegistry, 'id: "settings.voice"', "Voice settings feature metadata is missing.");
assertIncludes(featureRegistry, 'settingsTabId: "voice"', "Voice feature must map to the voice settings tab.");
assertIncludes(settingsNavigation, 'id: "voice"', "Voice tab is missing from settings navigation.");
assertIncludes(settingsModal, "const VoiceSettings = React.lazy", "Voice settings must be lazy-loaded.");
assertIncludes(settingsModal, 'activeTab === "voice"', "Settings modal must render the voice tab.");
assertIncludes(tabExports, 'export { VoiceSettings } from "./VoiceSettings";', "Voice settings export is missing.");

for (const required of ["<STTConfig />", "<TTSConfig />", "testProviderConnection"]) {
  assertIncludes(voiceSettings, required, `Voice settings page missing ${required}.`);
}
assertIncludes(agentsSettings, 'agent.config_mode === "model_only"', "Agents page must expose the voice display profile.");
assertIncludes(agentEditor, "ModelSearchDropdown", "Voice display must reuse the existing searchable model picker.");
assertIncludes(agentEditor, "onSaveModel", "Voice display editor must save its selected model independently.");
assertIncludes(agentEditor, "ModelSelectionField", "Custom subagents must use the shared searchable model picker.");
assertIncludes(agentEditor, "model_provider", "Subagent model selections must retain their provider identity.");
assertIncludes(agentsApi, "model_provider", "The typed subagent API must carry provider-aware model selections.");
assertIncludes(childRunner, "model_provider", "Child execution must resolve the configured model provider.");
assertIncludes(spawnTools, "provider_by_name", "Child execution must instantiate the configured provider instead of always using the parent provider.");
assertIncludes(agentsSettings, "agent.user_editable && <button", "Built-in voice display must not expose a delete action.");

const sttConfig = read("src/components/settings/Tabs/audio/STTConfig.tsx");
const voiceApi = read("src/api/voiceApi.ts");
assertIncludes(voiceApi, "getWhisperModelStatus", "Voice API must expose status-only Whisper detection.");
assertIncludes(sttConfig, "voiceApi.getWhisperModelStatus(sttWhisperModel)", "Opening Voice settings must check Whisper status without downloading.");
assertIncludes(sttConfig, "voiceApi.downloadWhisperModel(sttWhisperModel)", "Whisper download button must still download the selected model.");

for (const source of [settingsSchema, audioSlice, audioTypes]) {
  assertIncludes(source, "voiceDisplayAgentModel", "The selected voice display model must remain persisted.");
  for (const removed of [
    "voiceDisplayAgentPrompt",
    "voiceDisplayAgentContextTokens",
    "voiceDisplayAgentMaxTurns",
    "voiceDisplayAgentAutoCompactEnabled",
    "voiceDisplayAgentCompactThreshold",
    "voiceDisplayAgentEnabled",
  ]) {
    assertAbsent(source, removed, `${removed} must not remain user-configurable.`);
  }
}
assertAbsent(voiceSettings, "voiceDisplayAgentPrompt", "Voice display prompt must not be editable on the Voice page.");
assertAbsent(voiceSettings, "Reset Default", "Voice display prompt reset must be removed from the Voice page.");
assertIncludes(voiceDefaults, "VOICE_DISPLAY_AGENT_BOARD_SNAPSHOT_LIMIT = 3", "Voice board memory default must be 3.");
assertIncludes(packageJson, '"test:voice-settings-page"', "Voice settings verifier must be registered in package.json.");

console.log("Voice settings page wiring verified.");
