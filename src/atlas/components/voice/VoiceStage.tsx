interface VoiceStageProps {
  activeModel: string;
  aiText: string;
  subtitleSpeaker: "user" | "agent" | "system";
  toolAction: string | null;
  userText: string;
  voiceState: "initializing" | "listening" | "processing" | "speaking" | "idle";
}

export function VoiceStage(_props: VoiceStageProps) {
  return (
    <section
      aria-label="Voice display canvas"
      className="h-full w-full rounded-sm border border-white/85 bg-transparent"
    />
  );
}
