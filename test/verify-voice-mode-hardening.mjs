import { readFileSync } from "node:fs";

const files = {
  overlay: "src/atlas/components/voice/VoiceModeOverlay.tsx",
  sttConfig: "src/components/settings/Tabs/audio/STTConfig.tsx",
  ttsConfig: "src/components/settings/Tabs/audio/TTSConfig.tsx",
  panel: "src/atlas/components/voice/VoiceModePanel.tsx",
  stage: "src/atlas/components/voice/VoiceStage.tsx",
  stageStore: "src/atlas/components/voice/voiceStageStore.ts",
  events: "src/api/events.ts",
  voiceCommand: "src-tauri/src/commands/voice.rs",
  ttsService: "src-tauri/src/services/tts_service/mod.rs",
};

const src = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")]),
);

const checks = [
  [
    "voice overlay cancels stale mic init",
    src.overlay.includes("micInitSeqRef") &&
      src.overlay.includes("initSeq !== micInitSeqRef.current") &&
      src.overlay.includes("stream.getTracks().forEach(t => t.stop())"),
  ],
  [
    "voice overlay listener setup is stable",
    src.overlay.includes("messagesRef.current = messages") &&
      src.overlay.includes("let disposed = false") &&
      !src.overlay.includes("[messages, voiceModeOpen, setAiSpeaking]"),
  ],
  [
    "unsupported web STT cannot be selected at runtime",
    src.overlay.includes("userSttEngine === 'web' ? 'whisper'") &&
      src.sttConfig.includes("Browser Web Speech is disabled") &&
      !src.sttConfig.includes("value: 'web'"),
  ],
  [
    "Piper voice sync reruns when the selected voice changes",
    src.ttsConfig.includes("syncedVoiceRef") &&
      src.ttsConfig.includes("syncedVoiceRef.current === ttsPiperVoiceId"),
  ],
  [
    "tts:start event payload is typed as an object",
    src.events.includes("interface TtsStartEventPayload") &&
      src.events.includes('"tts:start": TtsStartEventPayload') &&
      src.ttsService.includes('serde_json::json!({ "duration_ms": duration_ms })'),
  ],
  [
    "custom voice imports validate file type and size",
    src.voiceCommand.includes("MAX_VOICE_MODEL_BYTES") &&
      src.voiceCommand.includes("MAX_VOICE_CONFIG_BYTES") &&
      src.voiceCommand.includes("canonicalize") &&
      src.voiceCommand.includes('eq_ignore_ascii_case("onnx")') &&
      src.voiceCommand.includes("serde_json::from_str"),
  ],
  [
    "voice mode uses an empty display canvas with toggleable captions",
    src.panel.includes("VoiceStage") &&
      src.panel.includes("captionsVisible") &&
      src.panel.includes("CaptionsOff") &&
      src.stage.includes('aria-label="Voice display canvas"') &&
      src.stage.includes("border border-white/85") &&
      !src.stage.includes("Voice Stage") &&
      !src.stage.includes("Current Focus") &&
      !src.stage.includes("Blackboard Blocks"),
  ],
  [
    "voice stage has a structured blackboard protocol",
      src.stageStore.includes('VoiceStageBlockKind = "note" | "metric" | "table" | "chart" | "equation" | "code" | "map-placeholder"') &&
      src.stageStore.includes("clear: () => void") &&
      src.stageStore.includes("replace: (blocks: VoiceStageInput[], options?: VoiceStageReplaceOptions) => void") &&
      src.stageStore.includes("append: (block: VoiceStageInput) => void") &&
      src.stageStore.includes("upsert: (block: VoiceStageInput) => void") &&
      src.stageStore.includes("focus: (id: string | null) => void") &&
      !src.stage.includes("content bounds") &&
      src.overlay.includes("voice-stage-contract"),
  ],
  [
    "voice panel has compact wave and no visible runtime stats",
    src.panel.includes("Compact voice wave") &&
      src.panel.includes("h-20 w-20") &&
      !src.panel.includes("<span>MEM</span>") &&
      !src.panel.includes("<span>TOK/S</span>"),
  ],
  [
    "voice exit confirmation separates leave from stop all",
    src.panel.includes("exitConfirmationOpen") &&
      src.panel.includes("Leave Voice Mode") &&
      src.panel.includes("Stop Everything") &&
      src.panel.includes("Stay") &&
      src.overlay.includes("confirmLeaveVoiceMode") &&
      src.overlay.includes("confirmStopEverything") &&
      src.overlay.includes("onAbort?.()"),
  ],
  [
    "voice stage lifecycle guards stale render updates",
    src.stageStore.includes('VoiceStageLifecycle = "active" | "paused" | "cancelled" | "closed"') &&
      src.stageStore.includes("generation: number") &&
      src.stageStore.includes("pause: () => void") &&
      src.stageStore.includes("cancel: (reason?: string) => void") &&
      src.overlay.includes("stageGenerationRef") &&
      src.overlay.includes("state.lifecycle !== 'active'") &&
      src.overlay.includes("state.generation !== generation"),
  ],
  [
    "voice stage retains bounded board context",
    src.stageStore.includes("retainedBoards: VoiceStageBoardSnapshot[]") &&
      src.stageStore.includes("saveCurrentBoard: (title?: string) => void") &&
      src.stageStore.includes("forgetBoards: () => void") &&
      src.stageStore.includes("voiceDisplayAgentBoardMemoryLimit") &&
      src.stageStore.includes("MAX_BOARD_MEMORY_LIMIT = 3") &&
      src.stageStore.includes("requestType === \"new\"") &&
      src.stageStore.includes("rememberBoard(state.retainedBoards, state.blocks"),
  ],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
