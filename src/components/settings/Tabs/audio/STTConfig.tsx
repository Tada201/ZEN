import { memo, useCallback, useState, useEffect } from 'react';
import { CheckCircle2, Download, Loader2, Mic, Settings2 } from 'lucide-react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { SettingsSection } from '../../SettingsSection';
import { SettingsRow } from '../../SettingsRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { voiceApi, type WhisperModelStatus } from '@/api/voiceApi';

interface WhisperVariant {
    value: string;
    label: string;
    description: string;
    approxMb: number;
}

const WHISPER_VARIANTS: WhisperVariant[] = [
    { value: 'ggml-tiny.en.bin', label: 'Tiny (English)', description: 'Fastest, lowest accuracy', approxMb: 75 },
    { value: 'ggml-base.en.bin', label: 'Base (English)', description: 'Balanced — recommended', approxMb: 141 },
    { value: 'ggml-small.en.bin', label: 'Small (English)', description: 'Higher accuracy, slower', approxMb: 465 },
    { value: 'ggml-medium.en.bin', label: 'Medium (English)', description: 'Highest accuracy, slowest', approxMb: 1460 },
];

export const STTConfig = memo(() => {
    const sttEngine = useSettingsStore(s => s.sttEngine ?? 'whisper');
    const sttWhisperModel = useSettingsStore(s => s.sttWhisperModel ?? 'ggml-base.en.bin');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    const [status, setStatus] = useState<WhisperModelStatus | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const checkStatus = async () => {
            try {
                const result = await voiceApi.downloadWhisperModel(sttWhisperModel);
                if (active) {
                    setStatus(result);
                }
            } catch (e) {
                console.error("Failed to fetch Whisper model status:", e);
            }
        };
        void checkStatus();
        return () => {
            active = false;
        };
    }, [sttWhisperModel]);

    const handleDownload = useCallback(async () => {
        setDownloading(true);
        setError(null);
        try {
            const result = await voiceApi.downloadWhisperModel(sttWhisperModel);
            setStatus(result);
            if (!result.valid) {
                setError(result.error ?? 'Model file is not valid after download');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setDownloading(false);
        }
    }, [sttWhisperModel]);

    const isWhisper = sttEngine === 'whisper';
    const statusBadge = (() => {
        if (downloading) {
            return (
                <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <Loader2 size={10} className="animate-spin" />
                    Downloading…
                </span>
            );
        }
        if (status?.valid) {
            return (
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
                    <CheckCircle2 size={10} />
                    Ready ({Math.round((status.size_bytes / (1024 * 1024)) * 10) / 10} MB)
                </span>
            );
        }
        if (status?.exists && !status.valid) {
            return (
                <span className="text-[10px] font-bold text-amber-400">Truncated — re-download</span>
            );
        }
        return (
            <span className="text-[10px] font-bold text-zinc-500">Not installed</span>
        );
    })();

    return (
        <SettingsSection
            title="Speech-to-Text"
            subtitle="Voice Recognition"
            description="Configure the speech recognition engine and Whisper model used for local STT."
        >
            <div className="flex flex-col gap-4">
                <SettingsRow
                    label="Recognition Engine"
                    description="Local Whisper recognition. Browser Web Speech is disabled until the voice overlay supports it."
                    control={
                        <WorkbenchSelect
                            value={sttEngine}
                            onValueChange={(val) => updateSetting({ sttEngine: val as 'whisper' })}
                            options={[
                                { label: 'Whisper (Local)', value: 'whisper' },
                            ]}
                            width={160}
                        />
                    }
                />

                {isWhisper && (
                    <>
                        <SettingsRow
                            label="Whisper Model"
                            description="Larger models are more accurate but slower"
                            control={
                                <WorkbenchSelect
                                    value={sttWhisperModel}
                                    onValueChange={(val) => updateSetting({ sttWhisperModel: val })}
                                    options={WHISPER_VARIANTS.map((v) => ({
                                        value: v.value,
                                        label: `${v.label} — ~${v.approxMb} MB`,
                                    }))}
                                    width={220}
                                />
                            }
                        />

                        <div className="rounded-xl border border-white/[0.04] bg-zinc-900/15 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 flex-col gap-1">
                                    <div className="flex items-center gap-2 text-[12px] font-bold text-white">
                                        <Settings2 size={12} className="text-primary" />
                                        <span className="uppercase tracking-wider">
                                            {WHISPER_VARIANTS.find((v) => v.value === sttWhisperModel)?.label ?? sttWhisperModel}
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-zinc-500">
                                        {WHISPER_VARIANTS.find((v) => v.value === sttWhisperModel)?.description}
                                    </span>
                                    <div className="mt-0.5">{statusBadge}</div>
                                </div>
                                <WorkbenchButton
                                    size="sm"
                                    variant="primary"
                                    onClick={handleDownload}
                                    disabled={downloading}
                                    loading={downloading}
                                >
                                    {!downloading && <Download size={12} />}
                                    <span className="ml-1.5 text-[11px]">
                                        {status?.valid ? 'Re-download' : 'Download'}
                                    </span>
                                </WorkbenchButton>
                            </div>
                            {error && (
                                <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-400">
                                    {error}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {!isWhisper && (
                    <div className="rounded-xl border border-white/[0.04] bg-zinc-900/15 px-4 py-3 text-[11px] text-zinc-500">
                        <div className="flex items-center gap-2 text-white">
                            <Mic size={12} className="text-primary" />
                            <span className="font-bold">Browser Web Speech</span>
                        </div>
                        <p className="mt-1 leading-relaxed">
                            Uses the Web Speech API built into the browser. No local download required,
                            but accuracy and language support depend on the host browser/OS.
                        </p>
                    </div>
                )}
            </div>
        </SettingsSection>
    );
});

STTConfig.displayName = 'STTConfig';
