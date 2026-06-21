import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, Volume2 } from 'lucide-react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { SettingsSection } from '../../SettingsSection';
import { SettingsRow } from '../../SettingsRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { WorkbenchSlider } from '@/components/settings/ui/WorkbenchSlider';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { CustomVoiceSelector } from '@/atlas/components/voice/CustomVoiceSelector';
import { dependenciesApi } from '@/api/dependenciesApi';
import { voiceApi, type PiperDownloadStatus } from '@/api/voiceApi';

interface PiperVariant {
    value: string;
    label: string;
    description: string;
    approxMb: number;
}

const PIPER_VOICES: PiperVariant[] = [
    { value: 'en_US-lessac-medium', label: 'Lessac (US Female)', description: 'Clear standard American voice', approxMb: 40 },
    { value: 'en_US-lessac-low', label: 'Lessac Low (US Female)', description: 'Smaller, faster variant', approxMb: 20 },
    { value: 'en_US-ryan-medium', label: 'Ryan (US Male)', description: 'Natural American male voice', approxMb: 40 },
    { value: 'en_US-ryan-high', label: 'Ryan High (US Male)', description: 'Higher quality, larger file', approxMb: 120 },
    { value: 'en_US-glados-medium', label: 'GLaDOS (US Sci-Fi)', description: 'Synthesized Portal-inspired voice', approxMb: 61 },
    { value: 'en_US-amy-medium', label: 'Amy (US Female)', description: 'Warm American female voice', approxMb: 40 },
    { value: 'en_US-kathleen-medium', label: 'Kathleen (US Female)', description: 'Clear American female voice', approxMb: 40 },
    { value: 'en_US-arctic-medium', label: 'Arctic (US Female)', description: 'CMU Arctic project voice', approxMb: 40 },
    { value: 'en_GB-alan-medium', label: 'Alan (UK Male)', description: 'British English male voice', approxMb: 40 },
    { value: 'en_GB-southern_english_female-medium', label: 'S. English Fem. (UK)', description: 'Southern British female voice', approxMb: 40 },
];

export const TTSConfig = memo(() => {
    const ttsEngine = useSettingsStore(s => s.ttsEngine ?? 'piper');
    const webTtsVoiceURI = useSettingsStore(s => s.webTtsVoiceURI ?? '');
    const webTtsRate = useSettingsStore(s => s.webTtsRate ?? 1.0);
    const webTtsPitch = useSettingsStore(s => s.webTtsPitch ?? 1.0);
    const ttsPiperVoiceId = useSettingsStore(s => s.ttsPiperVoiceId ?? 'default');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    const [selectedVoice, setSelectedVoice] = useState('en_US-lessac-medium');
    const [downloading, setDownloading] = useState(false);
    const [downloadStatus, setDownloadStatus] = useState<PiperDownloadStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [voiceListVersion, setVoiceListVersion] = useState(0);

    const syncedVoiceRef = useRef<string | null>(null);
    useEffect(() => {
        if (ttsEngine !== 'piper') return;
        if (syncedVoiceRef.current === ttsPiperVoiceId) return;
        syncedVoiceRef.current = ttsPiperVoiceId;
        voiceApi
            .setActiveVoiceModel(ttsPiperVoiceId)
            .catch(() => {
                syncedVoiceRef.current = null;
            });
    }, [ttsEngine, ttsPiperVoiceId]);

    const handleDownload = useCallback(async () => {
        setDownloading(true);
        setError(null);
        setDownloadStatus(null);
        try {
            await dependenciesApi.installManaged('piper');
            const result = await voiceApi.downloadPiperModel(selectedVoice);
            setDownloadStatus(result);
            if (result.success) {
                // Auto-select the downloaded voice
                const voiceId = selectedVoice;
                try {
                    await voiceApi.setActiveVoiceModel(voiceId);
                    updateSetting({ ttsPiperVoiceId: voiceId });
                } catch {
                    // voice may already be set
                }
                // Bump version to force CustomVoiceSelector to re-fetch
                setVoiceListVersion((v) => v + 1);
            } else {
                setError(result.error ?? 'Download failed');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setDownloading(false);
        }
    }, [selectedVoice, updateSetting]);

    const isWeb = ttsEngine === 'web';
    const isPiper = ttsEngine === 'piper';
    const isDownloaded = downloadStatus?.success;

    const statusBadge = (() => {
        if (downloading) {
            return (
                <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <Loader2 size={10} className="animate-spin" />
                    Downloading…
                </span>
            );
        }
        if (isDownloaded) {
            return (
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
                    <CheckCircle2 size={10} />
                    Ready ({Math.round((downloadStatus!.sizeBytes / (1024 * 1024)) * 10) / 10} MB)
                </span>
            );
        }
        return (
            <span className="text-[10px] font-bold text-zinc-500">Not downloaded</span>
        );
    })();

    return (
        <SettingsSection
            title="Text-to-Speech"
            subtitle="Voice Synthesis"
            description="Configure the voice engine, rate, and pitch used for synthesized speech output."
        >
            <div className="flex flex-col gap-4">
                <SettingsRow
                    label="Voice Engine"
                    description="Local Piper (ONNX), browser Web Speech, or system fallback"
                    control={
                        <WorkbenchSelect
                            value={ttsEngine}
                            onValueChange={(val) => updateSetting({ ttsEngine: val as 'piper' | 'web' | 'system' })}
                            options={[
                                { label: 'Piper (Local)', value: 'piper' },
                                { label: 'Web Speech API', value: 'web' },
                                { label: 'System Fallback', value: 'system' },
                            ]}
                            width={160}
                        />
                    }
                />

                {isPiper && (
                    <>
                        {/* Inline Piper voice downloader */}
                        <div className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-zinc-900/15 px-4 py-3">
                            <div className="flex items-center gap-2 text-[11px] font-bold text-white">
                                <Volume2 size={12} className="text-[#a855f7]" />
                                <span className="uppercase tracking-wider">Download Piper Voice</span>
                            </div>
                            <p className="text-[11px] text-zinc-500 leading-relaxed">
                                Download a Piper voice model from Hugging Face. After download, the voice
                                appears in the list below and is ready to use immediately.
                            </p>
                            <div className="flex items-end gap-3">
                                <div className="flex-1">
                                    <div className="text-[10px] font-medium text-zinc-400 mb-1">Voice</div>
                                    <WorkbenchSelect
                                        value={selectedVoice}
                                        onValueChange={(val) => {
                                            setSelectedVoice(val);
                                            setDownloadStatus(null);
                                            setError(null);
                                        }}
                                        options={PIPER_VOICES.map((v) => ({
                                            value: v.value,
                                            label: `${v.label} — ~${v.approxMb} MB`,
                                        }))}
                                        width={280}
                                    />
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
                                        {isDownloaded ? 'Re-download' : 'Download'}
                                    </span>
                                </WorkbenchButton>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                {statusBadge}
                                <span className="text-[10px] text-zinc-600">
                                    {PIPER_VOICES.find((v) => v.value === selectedVoice)?.description}
                                </span>
                            </div>
                            {error && (
                                <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-400">
                                    {error}
                                </div>
                            )}
                        </div>

                        <CustomVoiceSelector key={voiceListVersion} />
                    </>
                )}

                {isWeb && (
                    <>
                        <SettingsRow
                            label="Browser Voice"
                            description="Voice profile exposed by the OS/browser"
                            control={
                                <WorkbenchInput
                                    value={webTtsVoiceURI}
                                    onChangeText={(val) => updateSetting({ webTtsVoiceURI: val })}
                                    placeholder="e.g. Google US English"
                                    className="w-[220px]"
                               />
                            }
                        />
                        <SettingsRow
                            label="Speaking Rate"
                            description="Speed multiplier for the browser TTS engine"
                            control={
                                <div className="flex items-center gap-2 w-[160px]">
                                    <WorkbenchSlider
                                        value={[webTtsRate]}
                                        onValueChange={([v]) => updateSetting({ webTtsRate: v })}
                                        min={0.5}
                                        max={2}
                                        step={0.1}
                                        className="flex-1"
                                    />
                                    <span className="text-[11px] font-mono text-muted-foreground w-10 text-right">
                                        {webTtsRate.toFixed(1)}x
                                    </span>
                                </div>
                            }
                        />
                        <SettingsRow
                            label="Pitch"
                            description="Voice pitch multiplier for the browser TTS engine"
                            control={
                                <div className="flex items-center gap-2 w-[160px]">
                                    <WorkbenchSlider
                                        value={[webTtsPitch]}
                                        onValueChange={([v]) => updateSetting({ webTtsPitch: v })}
                                        min={0.5}
                                        max={2}
                                        step={0.1}
                                        className="flex-1"
                                    />
                                    <span className="text-[11px] font-mono text-muted-foreground w-10 text-right">
                                        {webTtsPitch.toFixed(1)}x
                                    </span>
                                </div>
                            }
                        />
                    </>
                )}
            </div>
        </SettingsSection>
    );
});

TTSConfig.displayName = 'TTSConfig';
