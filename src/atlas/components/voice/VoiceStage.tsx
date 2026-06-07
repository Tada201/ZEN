interface VoiceStageProps {
  voiceState: "initializing" | "listening" | "processing" | "speaking" | "idle";
}

const borderStyles: Record<VoiceStageProps["voiceState"], string> = {
  initializing: "border-white/60",
  listening: "border-white/85",
  processing: "border-white/70",
  speaking: "border-white/85",
  idle: "border-white/50",
};

export function VoiceStage({ voiceState }: VoiceStageProps) {
  return (
    <section
      aria-label="Voice display canvas"
      className={`h-full w-full rounded-sm border bg-transparent transition-colors ${borderStyles[voiceState]}`}
    />
  );
}
