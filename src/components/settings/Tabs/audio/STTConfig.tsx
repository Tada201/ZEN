import { memo, useCallback, useState, useEffect } from 'react';
import { CheckCircle2, Download, Loader2, Mic, Settings2 } from 'lucide-react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { SettingsSection } from '../../SettingsSection';
import { SettingsRow } from '../../SettingsRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { dependenciesApi } from '@/api/dependenciesApi';
import { voiceApi, type WhisperModelStatus, type WhisperRuntimeStatus } from '@/api/voiceApi';
import { systemApi, type HardwareInfo } from '@/api/systemApi';
import { detectWebSpeechCapability } from '@/lib/voice/webSpeechCapability';
import { STTCapabilityTable, WebSpeechDetectionTable } from './STTCapabilityTable';

interface WhisperVariant {
    value: string;
    label: string;
    description: string;
    approxMb: number;
}

const WHISPER_VARIANTS: WhisperVariant[] = [
    { value: 'ggml-tiny.en.bin', label: 'Tiny (English)', description: 'Fastest, recommended for voice commands', approxMb: 75 },
    { value: 'ggml-base.en.bin', label: 'Base (English)', description: 'Balanced accuracy, slower on CPU', approxMb: 141 },
    { value: 'ggml-small.en.bin', label: 'Small (English)', description: 'Higher accuracy, slower', approxMb: 465 },
    { value: 'ggml-medium.en.bin', label: 'Medium (English)', description: 'Highest accuracy, slowest', approxMb: 1460 },
];

export const STTConfig = memo(() => {
    const sttEngine = useSettingsStore(s => s.sttEngine ?? 'whisper');
    const sttWhisperModel = useSettingsStore(s => s.sttWhisperModel ?? 'ggml-base.en.bin');
    const sttComputeDevice = useSettingsStore(s => s.sttComputeDevice ?? 'auto');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    const [status, setStatus] = useState<WhisperModelStatus | null>(null);
    const [runtimeStatus, setRuntimeStatus] = useState<WhisperRuntimeStatus | null>(null);
    const [hardware, setHardware] = useState<HardwareInfo | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const webSpeechCapability = detectWebSpeechCapability();

    useEffect(() => {
        let active = true;
        const checkStatus = async () => {
            try {
                const [result, runtime, hardwareInfo] = await Promise.all([
                    voiceApi.getWhisperModelStatus(sttWhisperModel),
                    voiceApi.getWhisperRuntimeStatus(),
                    systemApi.getHardwareInfo(),
                ]);
                if (active) {
                    setStatus(result);
                    setRuntimeStatus(runtime);
                    setHardware(hardwareInfo);
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
            await dependenciesApi.installManaged('whisper');
            const result = await voiceApi.downloadWhisperModel(sttWhisperModel);
            setStatus(result);
            setRuntimeStatus(await voiceApi.getWhisperRuntimeStatus());
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
    const backendLabel = runtimeStatus?.backend === 'cuda'
        ? 'CUDA GPU'
        : runtimeStatus?.backend === 'vulkan'
            ? 'Vulkan GPU'
            : runtimeStatus?.backend === 'cpu'
                ? 'CPU'
                : 'Checking';
    const backendDetail = runtimeStatus
        ? runtimeStatus.backend === 'cuda' || runtimeStatus.backend === 'vulkan'
            ? `Using ${runtimeStatus.backend.toUpperCase()} whisper-server from ${runtimeStatus.binary_source}.`
            : runtimeStatus.recommended_backend !== 'cpu'
                ? `CPU mode. ${runtimeStatus.recommended_backend.toUpperCase()} is recommended for ${runtimeStatus.detected_gpu_vendors.join('/')}, but its runtime is not installed.`
                : 'CPU mode. No supported GPU runtime detected.'
        : 'Checking Whisper runtime backend.';
    const compatibleGpus = (hardware?.gpus ?? []).filter((gpu) => {
        if (runtimeStatus?.backend === 'cuda') return gpu.vendor === 'NVIDIA';
        if (runtimeStatus?.backend === 'vulkan') return gpu.vendor === 'AMD' || gpu.vendor === 'Intel';
        return false;
    });
    const computeDeviceOptions = [
        { value: 'auto', label: 'Auto select' },
        ...compatibleGpus.map((gpu) => ({
            value: String(gpu.backend_device_index),
            label: `${gpu.name}${gpu.vram_mb ? ` (${(gpu.vram_mb / 1024).toFixed(1)} GB)` : ''}`,
        })),
    ];
    const statusBadge = (() => {
        if (downloading) {
            return (
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Loader2 size={10} className="animate-spin" />
                    Downloading…
                </span>
            );
        }
        if (status?.valid) {
            return (
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-success">
                    <CheckCircle2 size={10} />
                    Ready ({Math.round((status.size_bytes / (1024 * 1024)) * 10) / 10} MB)
                </span>
            );
        }
        if (status?.exists && !status.valid) {
            return (
                <span className="text-[10px] font-bold text-warning">Truncated — re-download</span>
            );
        }
        return (
            <span className="text-[10px] font-bold text-muted-foreground">Not installed</span>
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
                            onValueChange={(val) => updateSetting({ sttEngine: val as 'whisper' | 'web' | 'moonshine' | 'system' })}
                            options={[
                                { label: 'Whisper (Local)', value: 'whisper' },
                                {
                                    label: webSpeechCapability.supported ? 'Web Speech (Available)' : 'Web Speech (Unsupported)',
                                    value: 'web',
                                    disabled: !webSpeechCapability.supported,
                                },
                                { label: 'Moonshine Tiny (Local)', value: 'moonshine' },
                                { label: 'OS Native (Planned)', value: 'system', disabled: true },
                            ]}
                            width={220}
                        />
                    }
                />

                {isWhisper && (
                    <>
                        <SettingsRow
                            label="Whisper Model"
                            description="Tiny is best for low-latency push-to-talk; larger models are more accurate but slower."
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

                        <SettingsRow
                            label="STT Compute Device"
                            description="Choose which compatible GPU Whisper uses. Changing it restarts the local STT server."
                            control={
                                <WorkbenchSelect
                                    value={computeDeviceOptions.some((option) => option.value === sttComputeDevice) ? sttComputeDevice : 'auto'}
                                    onValueChange={(value) => updateSetting({ sttComputeDevice: value })}
                                    options={computeDeviceOptions}
                                    width={260}
                                />
                            }
                        />

                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 flex-col gap-1">
                                    <div className="flex items-center gap-2 text-[12px] font-bold text-foreground">
                                        <Settings2 size={12} className="text-primary" />
                                        <span className="uppercase tracking-wider">
                                            {WHISPER_VARIANTS.find((v) => v.value === sttWhisperModel)?.label ?? sttWhisperModel}
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground">
                                        {WHISPER_VARIANTS.find((v) => v.value === sttWhisperModel)?.description}
                                    </span>
                                    <div className="mt-0.5">{statusBadge}</div>
                                    <div className="mt-1 flex items-center gap-2 text-[10px]">
                                        <span className={runtimeStatus?.backend === 'cuda' || runtimeStatus?.backend === 'vulkan' ? 'font-bold text-success' : 'font-bold text-warning'}>
                                            Backend: {backendLabel}
                                        </span>
                                        <span className="truncate text-muted-foreground/70">{backendDetail}</span>
                                    </div>
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
                                <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                                    {error}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {sttEngine === 'web' && (
                    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-2 text-foreground">
                            <Mic size={12} className="text-primary" />
                            <span className="font-bold">Browser Web Speech</span>
                        </div>
                        <p className="mt-1 leading-relaxed">
                            Uses the Web Speech API built into the browser. No local download required,
                            but accuracy and language support depend on the host browser/OS.
                        </p>
                        <WebSpeechDetectionTable capability={webSpeechCapability} />
                    </div>
                )}

                {sttEngine === 'moonshine' && (
                    <div className="rounded-lg border border-emerald-400/15 bg-success/[0.04] px-4 py-3">
                        <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
                            <Mic size={13} className="text-success" />
                            Moonshine Tiny
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            Local English speech recognition optimized for short commands and low-power CPUs. The approximately 28 MB model and WebAssembly runtime download on first use and are then browser-cached.
                        </p>
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    <div>
                        <h4 className="text-[12px] font-semibold text-foreground">Engine capabilities</h4>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Relative guidance for short voice commands. Actual speed and accuracy depend on hardware, language, microphone, and noise.
                        </p>
                    </div>
                    <STTCapabilityTable />
                </div>
            </div>
        </SettingsSection>
    );
});

STTConfig.displayName = 'STTConfig';
