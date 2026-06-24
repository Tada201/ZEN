import { readFileSync } from "node:fs";

const files = {
  overlay: "src/atlas/components/voice/VoiceModeOverlay.tsx",
  sttConfig: "src/components/settings/Tabs/audio/STTConfig.tsx",
  ttsConfig: "src/components/settings/Tabs/audio/TTSConfig.tsx",
  panel: "src/atlas/components/voice/VoiceModePanel.tsx",
  oscilloscope: "src/atlas/components/voice/VoiceOscilloscope.tsx",
  stage: "src/atlas/components/voice/VoiceStage.tsx",
  generatedContent: "src/lib/security/generatedContent.ts",
  stageStore: "src/atlas/components/voice/voiceStageStore.ts",
  events: "src/api/events.ts",
  voiceCommand: "src-tauri/src/commands/voice.rs",
  runtimeResource: "src-tauri/src/services/runtime_resource.rs",
  chatCommand: "src-tauri/src/commands/chat.rs",
  ttsService: "src-tauri/src/services/tts_service/mod.rs",
  dependencyCommand: "src-tauri/src/commands/dependency.rs",
  speechService: "src-tauri/src/services/speech_service/mod.rs",
  settingsSchema: "src/lib/stores/settings/schema.ts",
  audioSlice: "src/lib/stores/settings/createAudioSlice.ts",
  ttft: "src/lib/ttft.ts",
  chatSection: "src/atlas/sections/ChatSection.tsx",
  workspaceSection: "src/atlas/sections/WorkspaceSection.tsx",
  voicePrompt: "src/atlas/components/voice/voiceModePrompt.ts",
  voiceTextUtils: "src/atlas/components/voice/voiceTextUtils.ts",
  sendMessage: "src/atlas/hooks/chat/useSendMessage.ts",
  useChat: "src/atlas/hooks/useChat.ts",
  chatApi: "src/api/chatApi.ts",
  voiceApi: "src/api/voiceApi.ts",
  webSpeechStt: "src/atlas/components/voice/useWebSpeechStt.ts",
  moonshineStt: "src/atlas/components/voice/useMoonshineStt.ts",
  whisperStt: "src/atlas/components/voice/useWhisperStt.ts",
  whisperPcm: "src/atlas/components/voice/whisperPcm.ts",
  voiceChatEvents: "src/atlas/components/voice/useVoiceChatEvents.ts",
  pushToTalk: "src/atlas/components/voice/usePushToTalk.ts",
  voiceAudioGraph: "src/atlas/components/voice/useVoiceAudioGraph.ts",
  voiceInputStream: "src/atlas/components/voice/voiceInputStream.ts",
  webSpeechRecognition: "src/lib/voice/webSpeechRecognition.ts",
  sttCapabilities: "src/components/settings/Tabs/audio/STTCapabilityTable.tsx",
  moonshineRecognition: "src/lib/voice/moonshineRecognition.ts",
};

const src = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")]),
);

const checks = [
  [
    "push-to-talk captions leave recording state on release",
    src.pushToTalk.includes("Processing speech...") &&
      src.whisperStt.includes("setUserSpeechText('No audio captured.')") &&
      src.whisperStt.includes("setUserSpeechText('Audio was too short.')") &&
      src.whisperStt.includes("setUserSpeechText('No speech detected.')") &&
      src.whisperStt.includes("setUserSpeechText('No transcript returned.')") &&
      src.whisperStt.includes("setUserSpeechText('Whisper transcription failed.')") &&
      src.pushToTalk.includes("finishPttTurn") &&
      src.pushToTalk.includes("PTT: Released by") &&
      src.pushToTalk.includes("PTT_LIMIT_MS = 20_000") &&
      src.pushToTalk.includes("VOICE_PTT_TOGGLE_EVENT") &&
      src.pushToTalk.includes("window.addEventListener('blur'") &&
      src.pushToTalk.includes("document.addEventListener('visibilitychange'"),
  ],
  [
    "voice diagnostics are visible in browser console",
    src.overlay.includes("[Voice]") &&
      src.overlay.includes("console.info(line)") &&
      src.overlay.includes("console.warn(line)") &&
      src.pushToTalk.includes("microphone pipeline is not ready yet"),
  ],
  [
    "voice transcripts can create a missing chat session before send",
    src.useChat.includes("useSendMessage(currentSessionId, () => mutations.handleCreateSession") &&
      src.sendMessage.includes("ensureSession?: () => Promise<string>") &&
      src.sendMessage.includes("targetSessionId = await ensureSession()") &&
      src.sendMessage.includes("sessionId: targetSessionId") &&
      src.sendMessage.includes("chatId: targetSessionId"),
  ],
  [
    "voice push-to-talk captures unmuted audio and rejects silence",
      src.whisperPcm.includes("minRms: 0.00005") &&
      src.whisperPcm.includes("minPeak: 0.0003") &&
      src.voiceAudioGraph.includes("gain.gain.value = 1") &&
      src.voiceAudioGraph.includes("moonshineGate.gain.value = voiceInputMode && sttEngine === 'moonshine' ? 0 : 1") &&
      src.pushToTalk.includes("moonshineGateRef.current?.gain.setValueAtTime(1") &&
      src.whisperStt.includes("captured silence") &&
      src.whisperStt.includes("pcm.rms") &&
      src.whisperStt.includes("pcm.peak") &&
      src.overlay.includes("voiceInputModeRef.current") &&
      !src.overlay.includes("gain.gain.setTargetAtTime(0"),
  ],
  [
    "backend transcription validates audio and Whisper model readiness",
    src.voiceCommand.includes("pcm_audio_stats") &&
      src.voiceCommand.includes("force_transcribe: Option<bool>") &&
      src.voiceCommand.includes("bypass_vad") &&
      src.voiceCommand.includes("PCM audio is effectively silent") &&
      src.voiceCommand.includes("speech.check_model_file(&requested_model)") &&
      src.voiceCommand.includes("Whisper model") &&
      src.voiceCommand.includes("is not ready"),
  ],
  [
    "push-to-talk spacebar does not activate focused voice buttons",
    src.pushToTalk.includes("consumeVoiceSpaceEvent") &&
      src.pushToTalk.includes("e.stopImmediatePropagation()") &&
      src.pushToTalk.includes("document.activeElement.blur()") &&
      src.pushToTalk.includes("recordingChunksRef.current = []") &&
      src.pushToTalk.includes("pttActiveRef.current = true") &&
      src.panel.includes('type="button"') &&
      src.whisperPcm.includes("minPttAudioBytes: 3200"),
  ],
  [
    "voice microphone selection falls back to system default",
    src.voiceInputStream.includes("getVoiceInputStream") &&
      src.voiceInputStream.includes("Selected microphone unavailable, using system default") &&
      src.voiceInputStream.includes("navigator.mediaDevices.getUserMedia({ audio: baseConstraints })"),
  ],
  [
    "voice turns replace the normal chat prompt with a TTS-safe prompt",
    src.voicePrompt.includes("VOICE_MODE_SYSTEM_PROMPT") &&
      src.voicePrompt.includes("read aloud by text-to-speech") &&
      src.chatSection.includes("VOICE_MODE_SYSTEM_PROMPT") &&
      src.chatSection.includes('systemPromptMode: "replace"') &&
      src.workspaceSection.includes("VOICE_MODE_SYSTEM_PROMPT") &&
      src.workspaceSection.includes('systemPromptMode: "replace"') &&
      src.sendMessage.includes("systemPromptMode") &&
      src.chatApi.includes('systemPromptMode?: "append" | "replace" | null') &&
      src.chatCommand.includes("system_prompt_mode: Option<String>") &&
      src.chatCommand.includes("replace_system_prompt") &&
      src.chatCommand.includes("Those prompts own their output contract"),
  ],
  [
    "voice mode reads back completed assistant responses through TTS",
    src.overlay.includes("stopSpeech") &&
      src.overlay.includes("useVoiceChatEvents") &&
      src.voiceChatEvents.includes("speakText") &&
      src.voiceChatEvents.includes("speakAssistantResponse") &&
      src.overlay.includes("lastSpokenResponseRef") &&
      src.overlay.includes("speakingBackRef") &&
      src.voiceChatEvents.includes("void speakAssistantResponse()") &&
      src.voiceChatEvents.includes("fullAiResponseRef.current = stripped") &&
      src.voiceChatEvents.includes("TTS readback failed"),
  ],
  [
    "voice agent knows camera widgets require explicit user permission",
    src.voicePrompt.includes("live camera widget") &&
      src.voicePrompt.includes('click "Enable camera"') &&
      src.sendMessage.includes("camera panel is ready") &&
      src.sendMessage.includes("never claim the camera was activated automatically"),
  ],
  [
    "voice TTS rejects SVG, tool envelopes, and code-like streamed content",
    src.voiceTextUtils.includes("isSpeakableVoiceText") &&
      src.voiceTextUtils.includes("tool_call_id") &&
      src.voiceTextUtils.includes("<svg") &&
      src.voiceChatEvents.includes(".filter(isSpeakableVoiceText)") &&
      src.voicePrompt.includes("automatic display agent receives the user's original request directly") &&
      src.voicePrompt.includes("Never output SVG, code, JSON, tool names, tool arguments"),
  ],
  [
    "voice mode uses selected STT and TTS models",
    src.overlay.includes("sttWhisperModel") &&
      src.overlay.includes("useWhisperStt") &&
      src.whisperStt.includes("voiceApi.transcribeAudio(") &&
      src.whisperStt.includes("Number.isFinite(gpuDevice) ? gpuDevice : null") &&
      src.overlay.includes("sttComputeDevice") &&
      src.whisperStt.includes("voiceApi.getWhisperModelStatus(sttWhisperModel)") &&
      src.whisperStt.includes("Whisper: request sent to local transcription service.") &&
      src.whisperStt.includes("Whisper: local transcription returned in") &&
      src.whisperStt.includes("Chat: sending transcript to active session.") &&
      src.overlay.includes("ttsPiperVoiceId") &&
      src.overlay.includes("ttsModel={ttsModelLabel}") &&
      src.panel.includes("sttModel") &&
      src.panel.includes("ttsModel ||") &&
      src.voiceCommand.includes("model_name: Option<String>") &&
      src.voiceCommand.includes("get_whisper_model_status"),
  ],
  [
    "voice UI displays whether Whisper uses CPU or CUDA",
    src.voiceApi.includes("WhisperRuntimeStatus") &&
      src.voiceApi.includes("getWhisperRuntimeStatus") &&
      src.voiceCommand.includes("get_whisper_runtime_status") &&
      src.overlay.includes("Whisper backend:") &&
      src.overlay.includes("whisperBackend={whisperBackend}") &&
      src.panel.includes("STT Service") &&
      src.panel.includes("Runtime") &&
      src.panel.includes("whisperBackendDetail") &&
      src.sttConfig.includes("Backend: {backendLabel}") &&
      src.sttConfig.includes("voiceApi.getWhisperRuntimeStatus()"),
  ],
  [
    "voice UI displays live STT service lifecycle",
    src.overlay.includes("SttServiceStatus") &&
      src.overlay.includes("sttStatus={sttStatus}") &&
      src.panel.includes("sttStatusColors") &&
      src.panel.includes("Speech-to-text service is") &&
      src.pushToTalk.includes("setSttStatus('recording')") &&
      src.pushToTalk.includes("setSttStatus('transcribing')") &&
      src.whisperStt.includes("setSttStatus('failed')") &&
      src.whisperStt.includes("setSttStatus('ready')") &&
      src.voiceAudioGraph.includes("setSttStatus('starting')") &&
      src.voiceAudioGraph.includes("setSttStatus('ready')"),
  ],
  [
    "voice UI displays live TTS service lifecycle",
    src.overlay.includes("TtsServiceStatus") &&
      src.overlay.includes("ttsStatus={ttsStatus}") &&
      src.panel.includes("ttsStatusColors") &&
      src.panel.includes("Text-to-speech service is") &&
      src.voiceChatEvents.includes('setTtsStatus("starting")') &&
      src.voiceChatEvents.includes('setTtsStatus("speaking")') &&
      src.voiceChatEvents.includes('setTtsStatus("ready")') &&
      src.voiceChatEvents.includes('setTtsStatus("failed")'),
  ],
  [
    "voice captions require Web Speech STT",
    src.overlay.includes("captionsAvailable={activeSttEngine === 'web'}") &&
      src.panel.includes("disabled={!captionsAvailable}") &&
      src.panel.includes("Captions require Web Speech STT") &&
      src.panel.includes("captionsAvailable && captionsVisible"),
  ],
  [
    "voice Whisper defaults and backend are configured for low latency",
    src.settingsSchema.includes('default("ggml-tiny.en.bin")') &&
      src.audioSlice.includes('sttWhisperModel: "ggml-tiny.en.bin"') &&
      src.overlay.includes("?? 'ggml-tiny.en.bin'") &&
      src.sttConfig.includes("Fastest, recommended for voice commands") &&
      src.voiceCommand.includes('unwrap_or_else(|| "ggml-tiny.en.bin".to_string())') &&
      src.voiceCommand.includes("Whisper transcription request finished") &&
      !src.voiceCommand.includes("rms < 0.0025") &&
      src.speechService.includes('let model_name = "ggml-tiny.en.bin".to_string()') &&
      src.speechService.includes("whisper-server inference response received"),
  ],
  [
    "Whisper CUDA server can be selected when available",
    src.runtimeResource.includes("whisper-cublas") &&
      src.runtimeResource.includes("whisper_app_data_cuda_server_path") &&
      src.runtimeResource.includes("whisper-vulkan") &&
      src.speechService.includes("cuda_backend") &&
      src.speechService.includes("cuda_driver") &&
      src.speechService.includes("recommended_backend") &&
      src.speechService.includes("detected_gpu_vendors") &&
      src.speechService.includes('vendor == "AMD" || vendor == "Intel"'),
  ],
  [
    "voice overlay cancels stale mic init",
    src.overlay.includes("micInitSeqRef") &&
      src.voiceAudioGraph.includes("initSeq !== micInitSeqRef.current") &&
      src.voiceAudioGraph.includes("stream.getTracks().forEach((track) => track.stop())"),
  ],
  [
    "voice overlay listener setup is stable",
    src.overlay.includes("messagesRef.current = messages") &&
      src.voiceChatEvents.includes("let disposed = false") &&
      !src.overlay.includes("[messages, voiceModeOpen, setAiSpeaking]"),
  ],
  [
    "web STT is capability-gated and wired to voice mode",
    !src.overlay.includes("userSttEngine === 'web' ? 'whisper'") &&
      !src.overlay.includes("Whisper failed, attempting Web Speech API fallback") &&
      src.sttConfig.includes("detectWebSpeechCapability") &&
      src.sttConfig.includes("value: 'web'") &&
      src.overlay.includes("useWebSpeechStt") &&
      src.webSpeechStt.includes("createWebSpeechRecognition") &&
      src.webSpeechStt.includes("readWebSpeechResult") &&
      src.webSpeechRecognition.includes("readWebSpeechResult") &&
      src.sttCapabilities.includes("Current device compatibility"),
  ],
  [
    "web STT accumulates phrase-final segments until push-to-talk release",
    src.webSpeechStt.includes("finalTranscriptRef") &&
      src.webSpeechStt.includes("commitTranscript") &&
      src.webSpeechStt.includes("recognition.continuous = true") &&
      src.webSpeechStt.includes("if (shouldRunRef.current)") &&
      !src.webSpeechStt.includes("onTranscript(result.final)"),
  ],
  [
    "Moonshine Tiny is selectable and wired to committed voice transcripts",
    src.sttConfig.includes("Moonshine Tiny (Local)") &&
      src.sttConfig.includes("value: 'moonshine'") &&
      src.overlay.includes("useMoonshineStt") &&
      src.overlay.includes("startMoonshineRecognition") &&
      src.overlay.includes("moonshineGateRef") &&
      src.voiceAudioGraph.includes("createMediaStreamDestination") &&
      src.pushToTalk.includes("Finalizing Moonshine transcript") &&
      !src.overlay.includes("stopMoonshineRecognition(1500)") &&
      src.moonshineStt.includes("createMoonshineRecognition") &&
      src.moonshineStt.includes("moonshineReadyRef") &&
      src.moonshineRecognition.includes("onTranscriptionCommitted") &&
      src.moonshineRecognition.includes("'model/tiny'"),
  ],
  [
    "Whisper STT has bounded inference and complete typed stream API",
    src.speechService.includes(".timeout(std::time::Duration::from_secs(90))") &&
      src.voiceApi.includes("transcribeStream: (audio: number[], modelName?: string, gpuDevice?: number | null)") &&
      src.voiceApi.includes("{ audio, modelName, gpuDevice }"),
  ],
  [
    "Piper voice sync reruns when the selected voice changes",
    src.ttsConfig.includes("syncedVoiceRef") &&
      src.ttsConfig.includes("syncedVoiceRef.current === ttsPiperVoiceId"),
  ],
  [
    "Piper resolves eSpeak data for both legacy and canonical runtime layouts",
    src.ttsService.includes("resolve_espeak_data_dir") &&
      src.ttsService.includes("--espeak_data") &&
      src.ttsService.includes("espeak-ng-data") &&
      src.dependencyCommand.includes("Piper resolves this directory at runtime"),
  ],
  [
    "tts:start event payload is typed as an object",
    src.events.includes("interface TtsStartEventPayload") &&
      src.events.includes('"tts:start": TtsStartEventPayload') &&
      src.ttsService.includes('"text": text_owned') &&
      src.ttsService.includes('"duration_ms": duration_ms'),
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
      src.stage.includes("rounded-sm border bg-transparent") &&
      src.stage.includes('listening: "border-white/85"') &&
      !src.stage.includes("Voice Stage") &&
      !src.stage.includes("Current Focus") &&
      !src.stage.includes("Blackboard Blocks"),
  ],
  [
    "voice stage has a structured blackboard protocol",
      src.stageStore.includes("BoardDocumentV1") &&
      src.stageStore.includes("BoardWidgetKind") &&
      src.stageStore.includes('layout: "grid"') &&
      src.stageStore.includes("clear: () => void") &&
      src.stageStore.includes("replace: (blocks: VoiceStageInput[], options?: VoiceStageReplaceOptions) => void") &&
      src.stageStore.includes("append: (block: VoiceStageInput) => void") &&
      src.stageStore.includes("upsert: (block: VoiceStageInput) => void") &&
      src.stageStore.includes("focus: (id: string | null) => void") &&
      !src.stage.includes("content bounds") &&
      !src.overlay.includes("voice-stage-contract"),
  ],
  [
    "voice stage decodes escaped SVG before sanitizing and rendering",
    src.generatedContent.includes("normalizeGeneratedSvg") &&
      src.generatedContent.includes('document.createElement("textarea")') &&
      src.generatedContent.includes('if (!/^\\s*<svg\\b/i.test(normalized)) return ""') &&
      src.stage.includes("[&_svg]:max-h-full"),
  ],
  [
    "voice panel displays live TTFT metric",
    src.ttft.includes("subscribeTtftMetric") &&
      src.ttft.includes("getTtftMetric") &&
      src.overlay.includes("subscribeTtftMetric") &&
      src.overlay.includes("ttftMetric={ttftMetric}") &&
      src.panel.includes("TtftMetricSnapshot") &&
      src.panel.includes("TTFT") &&
      src.chatSection.includes("chatId={currentSessionId ?? undefined}") &&
      src.workspaceSection.includes("chatId={currentSessionId ?? undefined}"),
  ],
  [
    "voice panel has expanding waveform pill and no visible runtime stats",
    src.panel.includes("VoiceOscilloscope") &&
      src.panel.includes("amplitude={amplitude}") &&
      src.panel.includes("isCapturing={!voiceInputMode || pttHeld}") &&
      src.oscilloscope.includes("w-[70px] rounded-[22px]") &&
      src.oscilloscope.includes("w-[280px] rounded-[35px]") &&
      src.oscilloscope.includes("getFloatTimeDomainData") &&
      src.oscilloscope.includes("conic-gradient") &&
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
      src.stageStore.includes("rememberBoard(state.retainedBoards, state.document.widgets"),
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
