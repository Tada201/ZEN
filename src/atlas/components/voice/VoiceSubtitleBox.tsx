import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

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
  const displayText = text || config.fallback;

  return (
    <div className="flex w-full items-start gap-3 h-[48px] overflow-hidden">
      <span className={cn(
        "shrink-0 select-none rounded border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em] mt-0.5 transition-colors duration-300",
        config.badgeClass,
      )}>
        {config.label}
      </span>
      <div className="relative flex-1 min-w-0 h-full">
        <AnimatePresence>
          <motion.p
            key={displayText}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "absolute left-0 top-0 w-full line-clamp-2 select-none text-[15px] font-medium leading-normal tracking-wide transition-colors duration-300",
              config.textClass,
            )}
          >
            {displayText}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
