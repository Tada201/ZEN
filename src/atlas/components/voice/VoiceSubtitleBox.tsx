import { cn } from "@/lib/utils";

type SubtitleSpeaker = 'user' | 'agent' | 'system';

interface VoiceSubtitleBoxProps {
    speaker: SubtitleSpeaker;
    userText: string;
    aiText: string;
}

export function VoiceSubtitleBox({ speaker, userText, aiText }: VoiceSubtitleBoxProps) {
    return (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-full max-w-xl px-6 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-[#0c0d14]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-start gap-3.5 transition-all duration-200">
                {speaker === 'user' && (
                    <span className="shrink-0 text-[9px] font-extrabold tracking-widest px-2.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-400 select-none uppercase">
                        YOU
                    </span>
                )}
                {speaker === 'agent' && (
                    <span className="shrink-0 text-[9px] font-extrabold tracking-widest px-2.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 select-none uppercase">
                        ZEN
                    </span>
                )}
                {speaker === 'system' && (
                    <span className="shrink-0 text-[9px] font-extrabold tracking-widest px-2.5 py-0.5 rounded border border-zinc-500/30 bg-zinc-500/10 text-zinc-400 select-none uppercase">
                        SYS
                    </span>
                )}

                <p className={cn(
                    "text-[13px] font-semibold leading-relaxed flex-1 text-left select-none transition-colors duration-200",
                    speaker === 'user'
                        ? "text-purple-100/90"
                        : speaker === 'agent'
                            ? "text-emerald-100/90"
                            : "text-zinc-500 italic"
                )}>
                    {speaker === 'user'
                        ? (userText || 'Listening for speech...')
                        : speaker === 'agent'
                            ? (aiText || 'Responding...')
                            : 'Voice link established. Monitoring channel...'}
                </p>
            </div>
        </div>
    );
}
