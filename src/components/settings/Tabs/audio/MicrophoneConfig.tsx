import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square, TestTube2, Volume2 } from 'lucide-react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { WorkbenchSlider } from '@/components/settings/ui/WorkbenchSlider';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { audioApi, type AudioDevice } from '@/api/audioApi';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'recording' | 'playing' | 'error';

export const MicrophoneConfig = memo(() => {
    const selectedMic = useSettingsStore(s => s.selectedMic ?? '');
    const micVolume = useSettingsStore(s => s.micVolume ?? 0.8);
    const noiseSuppression = useSettingsStore(s => s.noiseSuppression ?? true);
    const echoCancellation = useSettingsStore(s => s.echoCancellation ?? true);
    const autoGainControl = useSettingsStore(s => s.autoGainControl ?? true);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    const [devices, setDevices] = useState<AudioDevice[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<Status>('idle');
    const [amplitude, setAmplitude] = useState(0);

    const streamRef = useRef<MediaStream | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafRef = useRef<number | null>(null);
    const recordedRef = useRef<Float32Array[]>([]);
    const sampleRateRef = useRef<number>(48000);
    const isRecordingRef = useRef(false);
    const playbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await audioApi.listInputDevices();
            setDevices(list);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const stopMeter = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close().catch(() => undefined);
        }
        audioCtxRef.current = null;
        analyserRef.current = null;
        setAmplitude(0);
    }, []);

    useEffect(() => () => {
        if (playbackTimeoutRef.current) {
            clearTimeout(playbackTimeoutRef.current);
            playbackTimeoutRef.current = null;
        }
        stopMeter();
    }, [stopMeter]);

    const startRecording = useCallback(async () => {
        setError(null);
        recordedRef.current = [];
        isRecordingRef.current = true;
        setStatus('recording');
        try {
            const baseConstraints: MediaTrackConstraints = {
                noiseSuppression,
                echoCancellation,
                autoGainControl,
            };
            let stream: MediaStream;
            if (selectedMic && selectedMic !== 'default') {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            ...baseConstraints,
                            deviceId: { exact: selectedMic },
                        },
                    });
                } catch (e) {
                    setError(`Selected microphone unavailable; testing system default instead. ${e instanceof Error ? e.message : String(e)}`);
                    stream = await navigator.mediaDevices.getUserMedia({ audio: baseConstraints });
                }
            } else {
                stream = await navigator.mediaDevices.getUserMedia({ audio: baseConstraints });
            }
            streamRef.current = stream;
            const ctx = new AudioContext();
            sampleRateRef.current = ctx.sampleRate;
            audioCtxRef.current = ctx;
            const src = ctx.createMediaStreamSource(stream);
            const gain = ctx.createGain();
            gain.gain.value = micVolume;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            analyserRef.current = analyser;
            src.connect(gain);
            gain.connect(analyser);

            const buf = new Float32Array(analyser.fftSize);
            const tick = () => {
                if (!analyserRef.current) return;
                analyserRef.current.getFloatTimeDomainData(buf);
                let sumSq = 0;
                for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
                const rms = Math.min(1, Math.sqrt(sumSq / buf.length) * 4);
                setAmplitude(rms);
                if (isRecordingRef.current) {
                    recordedRef.current.push(new Float32Array(buf));
                }
                rafRef.current = requestAnimationFrame(tick);
            };
            tick();
        } catch (e) {
            isRecordingRef.current = false;
            setStatus('error');
            setError(e instanceof Error ? e.message : String(e));
            stopMeter();
        }
    }, [selectedMic, noiseSuppression, echoCancellation, autoGainControl, micVolume, stopMeter]);

    const stopRecording = useCallback(() => {
        isRecordingRef.current = false;
        setStatus('playing');
        stopMeter();
    }, [stopMeter]);

    const playRecording = useCallback(async () => {
        const chunks = recordedRef.current;
        recordedRef.current = [];
        if (chunks.length === 0) {
            setStatus('idle');
            return;
        }
        const total = chunks.reduce((sum, c) => sum + c.length, 0);
        const merged = new Float32Array(total);
        let off = 0;
        for (const c of chunks) { merged.set(c, off); off += c.length; }
        try {
            const ctx = new AudioContext();
            const buf = ctx.createBuffer(1, merged.length, sampleRateRef.current);
            buf.copyToChannel(merged, 0);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.onended = () => {
                ctx.close().catch(() => undefined);
                setStatus('idle');
            };
            src.start();
        } catch (e) {
            setStatus('error');
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    const handleTestPress = useCallback(() => {
        if (status === 'recording') {
            stopRecording();
            if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
            playbackTimeoutRef.current = setTimeout(() => {
                playbackTimeoutRef.current = null;
                void playRecording();
            }, 50);
        } else if (status === 'idle' || status === 'error') {
            startRecording();
        }
    }, [status, startRecording, stopRecording, playRecording]);

    const options = [
        { value: 'default', label: 'System Default' },
        ...devices.map((d) => ({ value: d.id, label: d.is_default ? `${d.name} (default)` : d.name })),
    ];

    return (
        <SettingsCard
            title="Microphone Configuration"
            subtitle="Input Routing"
            description="Select the active input device and verify it works."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Active Microphone"
                    description="Hardware device for voice recognition"
                    control={
                        <div className="flex items-center gap-2">
                            <WorkbenchSelect
                                value={selectedMic || 'default'}
                                onValueChange={(val) => updateSetting({ selectedMic: val })}
                                options={options}
                                width={220}
                            />
                            <WorkbenchButton
                                size="sm"
                                variant="ghost"
                                onClick={refresh}
                                disabled={loading}
                                title="Refresh device list"
                            >
                                {loading ? <Loader2 size={12} className="animate-spin" /> : <Mic size={12} />}
                            </WorkbenchButton>
                        </div>
                    }
                />

                <WorkbenchSettingRow
                    label="Input Gain"
                    description="Playback and live meter gain for the selected microphone"
                    control={
                        <div className="flex items-center gap-2 w-[180px]">
                            <WorkbenchSlider
                                value={[micVolume * 100]}
                                onValueChange={([v]) => updateSetting({ micVolume: v / 100 })}
                                min={0}
                                max={150}
                                step={1}
                                className="flex-1"
                            />
                            <span className="text-[10px] font-mono text-zinc-500 w-9 text-right">
                                {Math.round(micVolume * 100)}%
                            </span>
                        </div>
                    }
                />

                <div className="rounded-xl border border-white/[0.04] bg-zinc-900/15 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-1">
                            <div className="flex items-center gap-2 text-[12px] font-bold text-white">
                                {status === 'recording' ? (
                                    <Volume2 size={12} className="text-emerald-400" />
                                ) : (
                                    <Mic size={12} className="text-brand-purple" />
                                )}
                                <span className="uppercase tracking-wider">
                                    {status === 'recording' ? 'Recording' : status === 'playing' ? 'Playing back' : 'Mic Test'}
                                </span>
                            </div>
                            <span className="text-[11px] text-zinc-500">
                                Speak to record, release to hear your voice played back.
                            </span>
                            <div className="mt-1 flex items-center gap-2">
                                <div className="relative h-1.5 w-32 overflow-hidden rounded-full bg-zinc-800">
                                    <div
                                        className={cn(
                                            'h-full transition-all duration-50',
                                            amplitude > 0.05 ? 'bg-emerald-400' : 'bg-zinc-600',
                                        )}
                                        style={{ width: `${Math.min(100, amplitude * 100 * 2)}%` }}
                                    />
                                </div>
                                <span className="font-mono text-[10px] text-zinc-500">
                                    {Math.round(amplitude * 100)}%
                                </span>
                            </div>
                        </div>
                        <WorkbenchButton
                            size="sm"
                            variant={status === 'recording' ? 'danger' : 'primary'}
                            onClick={handleTestPress}
                            disabled={status === 'playing'}
                        >
                            {status === 'recording' ? (
                                <Square size={12} fill="currentColor" />
                            ) : (
                                <TestTube2 size={12} />
                            )}
                            <span className="ml-1.5 text-[11px]">
                                {status === 'recording' ? 'Stop & Play' : status === 'playing' ? 'Playing…' : 'Test Mic'}
                            </span>
                        </WorkbenchButton>
                    </div>
                    {error && (
                        <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-400">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </SettingsCard>
    );
});

MicrophoneConfig.displayName = 'MicrophoneConfig';
