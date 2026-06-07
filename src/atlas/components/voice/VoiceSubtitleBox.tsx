import { cn } from "@/lib/utils";

type SubtitleSpeaker = "user" | "agent" | "system";

interface VoiceSubtitleBoxProps {
  speaker: SubtitleSpeaker;
  userText: string;
  aiText: string;
}

const speakerConfig = {
  user: {
    label: "YOU",
    badgeClass: "border-purple-400/30 bg-purple-400/10 text-purple-300",
    textClass: "text-zinc-200",
    fallback: "Listening...",
  },
  agent: {
    label: "ZEN",
    badgeClass: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
    textClass: "text-zinc-100",
    fallback: "Preparing response...",
  },
  system: {
    label: "SYS",
    badgeClass: "border-zinc-500/30 bg-zinc-500/10 text-zinc-500",
    textClass: "text-zinc-500 italic",
    fallback: "Voice link established. Monitoring channel...",
  },
} as const;

export function VoiceSubtitleBox({ speaker, userText, aiText }: VoiceSubtitleBoxProps) {
  const config = speakerConfig[speaker];
  const text = speaker === "user" ? userText : speaker === "agent" ? aiText : "";

  return (
    <div className="flex w-full items-center gap-3">
      <span className={cn(
        "shrink-0 select-none rounded border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em]",
        config.badgeClass,
      )}>
        {config.label}
      </span>
      <p className={cn(
        "min-w-0 flex-1 line-clamp-2 select-none text-sm leading-relaxed tracking-wide transition-colors duration-300",
        config.textClass,
      )}>
        {text || config.fallback}
      </p>
    </div>
  );
}
