import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message);
  }
}

const featureRegistry = read("src/lib/features/frontendFeatures.ts");
const settingsNavigation = read("src/atlas/components/settingsNavigation.ts");
const settingsModal = read("src/atlas/components/SettingsModal.tsx");
const tabExports = read("src/components/settings/Tabs/index.ts");
const voiceSettings = read("src/components/settings/Tabs/VoiceSettings.tsx");
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

for (const required of ["<STTConfig />", "<TTSConfig />", "testProviderConnection", "Reset Default"]) {
  assertIncludes(voiceSettings, required, `Voice settings page missing ${required}.`);
}

const sttConfig = read("src/components/settings/Tabs/audio/STTConfig.tsx");
const voiceApi = read("src/api/voiceApi.ts");
assertIncludes(voiceApi, "getWhisperModelStatus", "Voice API must expose status-only Whisper detection.");
assertIncludes(sttConfig, "voiceApi.getWhisperModelStatus(sttWhisperModel)", "Opening Voice settings must check Whisper status without downloading.");
assertIncludes(sttConfig, "voiceApi.downloadWhisperModel(sttWhisperModel)", "Whisper download button must still download the selected model.");

for (const field of [
  "voiceDisplayAgentEnabled",
  "voiceDisplayAgentContextTokens",
  "voiceDisplayAgentMaxTurns",
  "voiceDisplayAgentAutoCompactEnabled",
  "voiceDisplayAgentCompactThreshold",
  "voiceDisplayAgentPrompt",
  "voiceDisplayAgentBoardMemoryLimit",
]) {
  assertIncludes(settingsSchema, field, `Settings schema missing ${field}.`);
  assertIncludes(audioSlice, field, `Audio slice missing ${field}.`);
  assertIncludes(audioTypes, field, `Settings types missing ${field}.`);
}

assertIncludes(voiceDefaults, "VOICE_DISPLAY_AGENT_DEFAULT_CONTEXT_TOKENS = 131072", "Voice context default must be 128k.");
assertIncludes(voiceDefaults, "VOICE_DISPLAY_AGENT_DEFAULT_COMPACT_THRESHOLD = 75", "Voice compaction threshold default must be 75%.");
assertIncludes(voiceDefaults, "VOICE_DISPLAY_AGENT_DEFAULT_BOARD_MEMORY_LIMIT = 3", "Voice board memory default must be 3.");
assertIncludes(voiceSettings, "max={50}", "Voice max-turns control must cap at 50.");
assertIncludes(voiceSettings, "max={3}", "Voice board-memory control must cap at 3.");
assertIncludes(voiceDefaults, "Do not browse, call tools, fetch data", "Default prompt must keep the render agent tool-free.");

assertIncludes(packageJson, '"test:voice-settings-page"', "Voice settings verifier must be registered in package.json.");

console.log("Voice settings page wiring verified.");
