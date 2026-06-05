import { cn } from "@/lib/utils";

type SubtitleSpeaker = 'user' | 'agent' | 'system';

interface VoiceSubtitleBoxProps {
    speaker: SubtitleSpeaker;
    userText: string;
    aiText: string;
}

const speakerConfig = {
    user: {
        label: "YOU",
        badgeClass: "border-purple-500/30 bg-purple-500/10 text-purple-400",
        textClass: "text-purple-300/90",
        fallback: "Listening...",
    },
    agent: {
        label: "ZEN",
        badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        textClass: "text-emerald-300/90",
        fallback: "Responding...",
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
    const text = speaker === 'user'
        ? (userText || config.fallback)
        : speaker === 'agent'
            ? (aiText || config.fallback)
            : config.fallback;

    return (
        <div className="flex w-full items-center gap-3">
            <span className={cn(
                "shrink-0 text-[10px] font-extrabold tracking-[0.2em] px-2 py-0.5 rounded border select-none uppercase",
                config.badgeClass,
            )}>
                {config.label}
            </span>
            <p className={cn(
                "min-w-0 flex-1 truncate text-sm font-medium leading-relaxed tracking-wide select-none transition-colors duration-200",
                config.textClass,
            )}>
                {text}
            </p>
        </div>
    );
}
