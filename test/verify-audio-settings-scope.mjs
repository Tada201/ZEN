import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertNotIncludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

const audioSettings = read("src/components/settings/Tabs/AudioSettings.tsx");
const inputControls = read("src/components/settings/Tabs/audio/InputControls.tsx");
const microphoneConfig = read("src/components/settings/Tabs/audio/MicrophoneConfig.tsx");
const outputConfig = read("src/components/settings/Tabs/audio/OutputConfig.tsx");
const voiceOverlay = read("src/atlas/components/voice/VoiceModeOverlay.tsx");
const packageJson = read("package.json");

for (const removed of ["STTConfig", "TTSConfig", "VoiceModulation", "SystemSoundsConfig", "FeedbackIntensityConfig"]) {
  assertNotIncludes(audioSettings, removed, `Audio tab must not render ${removed}.`);
}

for (const required of ["<MicrophoneConfig />", "<OutputConfig />", "<InputControls />"]) {
  assertIncludes(audioSettings, required, `Audio tab must render ${required}.`);
}

for (const required of [
  "Speak Activation",
  "Voice Activity",
  "Hold Spacebar",
  "Capture Profile",
  "Quiet Room",
  "Noisy Room",
  "Headset",
  "noiseSuppression",
  "echoCancellation",
  "autoGainControl",
  "vadThreshold",
]) {
  assertIncludes(inputControls, required, `Input controls missing ${required}.`);
}

assertIncludes(microphoneConfig, "audioApi.listInputDevices", "Microphone config must detect system input devices.");
assertIncludes(microphoneConfig, "Test Mic", "Microphone config must keep mic test.");
assertIncludes(microphoneConfig, "Input Gain", "Microphone config must expose input gain.");
assertIncludes(microphoneConfig, "noiseSuppression", "Mic test must use noise suppression constraints.");
assertIncludes(microphoneConfig, "gain.gain.value = micVolume", "Mic test must apply mic gain.");

assertIncludes(outputConfig, "audioApi.listOutputDevices", "Output config must detect system output devices.");
assertIncludes(outputConfig, "Test Tone", "Output config must keep speaker test.");
assertIncludes(outputConfig, "Speaker Level", "Output config must expose speaker level.");
assertIncludes(outputConfig, "masterVolume * speakerVolume", "Speaker test must apply speaker level.");

assertIncludes(voiceOverlay, "const micVolume = useSettingsStore", "Voice overlay must read mic gain.");
assertIncludes(voiceOverlay, "voiceInputMode ? 0 : micVolume", "Voice overlay must apply mic gain during VAD capture.");
assertIncludes(voiceOverlay, "setTargetAtTime(micVolume", "Voice overlay must apply mic gain during hold-Spacebar capture.");

assertIncludes(packageJson, '"test:audio-settings-scope"', "Audio settings verifier must be registered in package.json.");

console.log("Audio settings scope verified.");
