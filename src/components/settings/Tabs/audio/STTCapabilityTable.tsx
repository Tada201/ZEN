import { CheckCircle2, CircleAlert, CircleX } from 'lucide-react';
import type { WebSpeechCapability } from '@/lib/voice/webSpeechCapability';

const ENGINES = [
    {
        name: 'Moonshine Tiny', availability: 'Available', performance: 'Excellent',
        quality: 'Good', languages: 'English-first', privacy: 'Local', bestFor: 'Short commands, low-power CPUs',
    },
    {
        name: 'Whisper Local', availability: 'Available', performance: 'Fair to excellent',
        quality: 'Very good', languages: 'Multilingual', privacy: 'Local', bestFor: 'Reliable dictation and varied speech',
    },
    {
        name: 'Web Speech', availability: 'Device-dependent', performance: 'Excellent',
        quality: 'Device-dependent', languages: 'Platform-dependent', privacy: 'May use cloud', bestFor: 'Zero-install voice commands',
    },
    {
        name: 'OS Native', availability: 'Planned', performance: 'Good',
        quality: 'Platform-dependent', languages: 'Installed OS packs', privacy: 'Platform-dependent', bestFor: 'System-integrated fallback',
    },
] as const;

function DetectionCell({ ok, label }: { ok: boolean; label: string }) {
    const Icon = ok ? CheckCircle2 : CircleX;
    return (
        <div className="flex items-center justify-between gap-3 py-1.5 text-[11px]">
            <span className="text-zinc-400">{label}</span>
            <span className={ok ? 'flex items-center gap-1.5 text-emerald-400' : 'flex items-center gap-1.5 text-red-400'}>
                <Icon size={12} /> {ok ? 'Supported' : 'Unavailable'}
            </span>
        </div>
    );
}

export function WebSpeechDetectionTable({ capability }: { capability: WebSpeechCapability }) {
    return (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-zinc-950/40">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                <span className="text-[11px] font-semibold text-zinc-200">Current device compatibility</span>
                <span className={capability.supported ? 'text-[10px] font-bold text-emerald-400' : 'text-[10px] font-bold text-amber-300'}>
                    {capability.supported ? 'READY' : 'NOT AVAILABLE'}
                </span>
            </div>
            <div className="divide-y divide-white/[0.06] px-3">
                <DetectionCell ok={capability.recognitionApi} label="SpeechRecognition API" />
                <DetectionCell ok={capability.microphoneApi} label="Microphone capture" />
                <DetectionCell ok={capability.secureContext} label="Secure application context" />
            </div>
            <div className="flex gap-2 border-t border-white/10 px-3 py-2 text-[10px] leading-relaxed text-amber-200/80">
                <CircleAlert size={12} className="mt-0.5 shrink-0" />
                Recognition may send audio to the browser or OS provider and can require internet access.
            </div>
        </div>
    );
}

export function STTCapabilityTable() {
    return (
        <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[760px] border-collapse text-left text-[11px]">
                <thead className="bg-zinc-950/60 text-zinc-400">
                    <tr>{['Engine', 'Status', 'Speed', 'Quality', 'Languages', 'Privacy', 'Best for'].map((label) => (
                        <th key={label} className="border-b border-white/10 px-3 py-2 font-semibold">{label}</th>
                    ))}</tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                    {ENGINES.map((engine) => (
                        <tr key={engine.name} className="text-zinc-300">
                            <td className="px-3 py-2 font-semibold text-white">{engine.name}</td>
                            <td className="px-3 py-2">{engine.availability}</td>
                            <td className="px-3 py-2">{engine.performance}</td>
                            <td className="px-3 py-2">{engine.quality}</td>
                            <td className="px-3 py-2">{engine.languages}</td>
                            <td className="px-3 py-2">{engine.privacy}</td>
                            <td className="px-3 py-2 text-zinc-400">{engine.bestFor}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
