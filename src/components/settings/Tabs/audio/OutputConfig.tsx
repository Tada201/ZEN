import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Speaker, Volume2 } from 'lucide-react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { WorkbenchSlider } from '@/components/settings/ui/WorkbenchSlider';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { audioApi, type AudioDevice } from '@/api/audioApi';
import { cn } from '@/lib/utils';

type SinkAudioContext = AudioContext & {
    setSinkId?: (sinkId: string) => Promise<void>;
};

export const OutputConfig = memo(() => {
    const masterVolume = useSettingsStore(s => s.masterVolume ?? 1.0);
    const speakerVolume = useSettingsStore(s => s.speakerVolume ?? 0.8);
    const isMuted = useSettingsStore(s => s.isMuted ?? false);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    const [devices, setDevices] = useState<AudioDevice[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);

    const ctxRef = useRef<AudioContext | null>(null);
    const oscRef = useRef<OscillatorNode | null>(null);
    const gainRef = useRef<GainNode | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await audioApi.listOutputDevices();
            setDevices(list);
            const persisted = useSettingsStore.getState().speakerDeviceId ?? '';
            if (persisted) {
                try {
                    await audioApi.setActiveOutputDevice(persisted);
                } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                }
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const stopTone = useCallback(() => {
        if (oscRef.current) {
            try { oscRef.current.stop(); } catch { /* already stopped */ }
            oscRef.current.disconnect();
            oscRef.current = null;
        }
        if (gainRef.current) {
            gainRef.current.disconnect();
            gainRef.current = null;
        }
        if (ctxRef.current && ctxRef.current.state !== 'closed') {
            ctxRef.current.close().catch(() => undefined);
        }
        ctxRef.current = null;
        setTesting(false);
    }, []);

    useEffect(() => () => stopTone(), [stopTone]);

    const playTone = useCallback(async () => {
        setError(null);
        try {
            const persisted = useSettingsStore.getState().speakerDeviceId ?? '';
            const sinkId = persisted && persisted !== 'default' ? persisted : '';
            const AudioCtor = window.AudioContext;
            const ctx = new AudioCtor() as SinkAudioContext;
            if (sinkId && typeof ctx.setSinkId === 'function') {
                await ctx.setSinkId(sinkId);
            }
            ctxRef.current = ctx;
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 440;
            const gain = ctx.createGain();
            gain.gain.value = isMuted ? 0 : masterVolume * speakerVolume * 0.2;
            osc.connect(gain);
            gain.connect(ctx.destination);
            oscRef.current = osc;
            gainRef.current = gain;
            osc.start();
            setTesting(true);
            window.setTimeout(stopTone, 1000);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            stopTone();
        }
    }, [masterVolume, speakerVolume, isMuted, stopTone]);

    const handleSelect = useCallback(
        async (val: string) => {
            updateSetting({ speakerDeviceId: val });
            setError(null);
            try {
                await audioApi.setActiveOutputDevice(val === 'default' ? null : val);
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            }
        },
        [updateSetting],
    );

    const persistedDevice = useSettingsStore(s => s.speakerDeviceId ?? '');
    const options = [
        { value: 'default', label: 'System Default' },
        ...devices.map((d) => ({ value: d.id, label: d.is_default ? `${d.name} (default)` : d.name })),
    ];

    return (
        <SettingsCard
            title="Output Configuration"
            subtitle="Audio Routing"
            description="Select the output device, adjust volume, and verify with a test tone."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Active Output Device"
                    description="Hardware device for voice synthesis playback"
                    control={
                        <div className="flex items-center gap-2">
                            <WorkbenchSelect
                                value={persistedDevice || 'default'}
                                onValueChange={handleSelect}
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
                                {loading ? <Loader2 size={12} className="animate-spin" /> : <Speaker size={12} />}
                            </WorkbenchButton>
                        </div>
                    }
                />

                <WorkbenchSettingRow
                    label="Master Volume"
                    description="System-wide audio output level"
                    control={
                        <div className="flex items-center gap-2 w-[180px]">
                            <Volume2 size={12} className={cn(isMuted ? 'text-zinc-600' : 'text-zinc-400')} />
                            <WorkbenchSlider
                                value={[masterVolume * 100]}
                                onValueChange={([v]) => updateSetting({ masterVolume: v / 100 })}
                                max={100}
                                step={1}
                                className="flex-1"
                            />
                            <span className="text-[10px] font-mono text-zinc-500 w-8 text-right">
                                {Math.round(masterVolume * 100)}%
                            </span>
                        </div>
                    }
                />

                <WorkbenchSettingRow
                    label="Speaker Level"
                    description="Playback level for the selected output device"
                    control={
                        <div className="flex items-center gap-2 w-[180px]">
                            <Volume2 size={12} className="text-zinc-400" />
                            <WorkbenchSlider
                                value={[speakerVolume * 100]}
                                onValueChange={([v]) => updateSetting({ speakerVolume: v / 100 })}
                                max={100}
                                step={1}
                                className="flex-1"
                            />
                            <span className="text-[10px] font-mono text-zinc-500 w-8 text-right">
                                {Math.round(speakerVolume * 100)}%
                            </span>
                        </div>
                    }
                />

                <WorkbenchSettingRow
                    label="Mute All Audio"
                    description="Suppress all audio output including notifications"
                    control={
                        <WorkbenchSwitch
                            checked={isMuted}
                            onCheckedChange={(v) => updateSetting({ isMuted: v })}
                        />
                    }
                />

                <div className="rounded-xl border border-white/[0.04] bg-zinc-900/15 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-[12px] font-bold text-white">
                                <Volume2 size={12} className="text-brand-purple" />
                                <span className="uppercase tracking-wider">Speaker Test</span>
                            </div>
                            <span className="text-[11px] text-zinc-500">
                                Plays a 440Hz tone for 1 second on the selected device.
                            </span>
                        </div>
                        <WorkbenchButton
                            size="sm"
                            variant="primary"
                            onClick={playTone}
                            disabled={testing}
                        >
                            <Volume2 size={12} />
                            <span className="ml-1.5 text-[11px]">Test Tone</span>
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

OutputConfig.displayName = 'OutputConfig';
