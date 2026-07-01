import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { WorkbenchSlider } from '@/components/settings/ui/WorkbenchSlider';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const InputControls = memo(() => {
    const vadEnabled = useSettingsStore(s => s.vadEnabled ?? false);
    const voiceInputMode = useSettingsStore(s => s.voiceInputMode ?? false);
    const noiseSuppression = useSettingsStore(s => s.noiseSuppression ?? true);
    const echoCancellation = useSettingsStore(s => s.echoCancellation ?? true);
    const autoGainControl = useSettingsStore(s => s.autoGainControl ?? true);
    const vadThreshold = useSettingsStore(s => s.vadThreshold ?? 0.015);
    const updateSetting = useSettingsStore(s => s.updateSetting);
    const speakMode = voiceInputMode ? 'push_to_talk' : 'voice_activity';

    const applySpeakMode = (mode: string) => {
        const pushToTalk = mode === 'push_to_talk';
        updateSetting({
            voiceInputMode: pushToTalk,
            sttHotkeysEnabled: pushToTalk,
            vadEnabled: !pushToTalk,
        });
    };

    const applyCaptureProfile = (profile: 'quiet' | 'noisy' | 'headset') => {
        if (profile === 'quiet') {
            updateSetting({
                noiseSuppression: true,
                echoCancellation: true,
                autoGainControl: true,
                vadThreshold: 0.012,
            });
            return;
        }
        if (profile === 'noisy') {
            updateSetting({
                noiseSuppression: true,
                echoCancellation: true,
                autoGainControl: false,
                vadThreshold: 0.024,
            });
            return;
        }
        updateSetting({
            noiseSuppression: true,
            echoCancellation: false,
            autoGainControl: true,
            vadThreshold: 0.016,
        });
    };

    return (
        <SettingsCard
            title="Speech Detection"
            subtitle="Input Behavior"
            description="Choose how voice capture starts and tune cleanup for your microphone environment."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Speak Activation"
                    description="Use voice activity detection, or hold Spacebar while speaking."
                    control={
                        <WorkbenchSelect
                            value={speakMode}
                            onValueChange={applySpeakMode}
                            options={[
                                { value: 'voice_activity', label: 'Voice Activity' },
                                { value: 'push_to_talk', label: 'Hold Spacebar' },
                            ]}
                            width={170}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Capture Profile"
                    description="Applies practical defaults for user speech and room noise."
                >
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => applyCaptureProfile('quiet')}
                            className="h-8 rounded-md border border-border bg-muted/40 px-3 text-[11px] font-bold text-foreground hover:bg-muted"
                        >
                            Quiet Room
                        </button>
                        <button
                            type="button"
                            onClick={() => applyCaptureProfile('noisy')}
                            className="h-8 rounded-md border border-border bg-muted/40 px-3 text-[11px] font-bold text-foreground hover:bg-muted"
                        >
                            Noisy Room
                        </button>
                        <button
                            type="button"
                            onClick={() => applyCaptureProfile('headset')}
                            className="h-8 rounded-md border border-border bg-muted/40 px-3 text-[11px] font-bold text-foreground hover:bg-muted"
                        >
                            Headset
                        </button>
                    </div>
                </WorkbenchSettingRow>

                <WorkbenchSettingRow
                    label="VAD Sensitivity Threshold"
                    description="Lower = more sensitive (picks up quiet speech); higher = quieter rooms only"
                    control={
                        <div className="flex items-center gap-2 w-[180px]">
                            <WorkbenchSlider
                                value={[vadThreshold * 1000]}
                                onValueChange={([v]) => updateSetting({ vadThreshold: v / 1000 })}
                                min={5}
                                max={50}
                                step={1}
                                className="flex-1"
                            />
                            <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">
                                {vadThreshold.toFixed(3)}
                            </span>
                        </div>
                    }
                />

                <WorkbenchSettingRow
                    label="Voice Activity Detection"
                    description="Automated speech detection is active unless hold-Spacebar mode is selected."
                    control={
                        <WorkbenchSwitch
                            checked={vadEnabled}
                            onCheckedChange={(v) => updateSetting({
                                vadEnabled: v,
                                voiceInputMode: !v,
                                sttHotkeysEnabled: !v,
                            })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Noise Suppression"
                    description="Filter fan, keyboard, and background noise (Discord-like)"
                    control={
                        <WorkbenchSwitch
                            checked={noiseSuppression}
                            onCheckedChange={(v) => updateSetting({ noiseSuppression: v })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Echo Cancellation"
                    description="Suppress audio feedback when speakers are active"
                    control={
                        <WorkbenchSwitch
                            checked={echoCancellation}
                            onCheckedChange={(v) => updateSetting({ echoCancellation: v })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Auto Gain Control"
                    description="Normalize mic level for consistent volume"
                    control={
                        <WorkbenchSwitch
                            checked={autoGainControl}
                            onCheckedChange={(v) => updateSetting({ autoGainControl: v })}
                        />
                    }
                />

                <div className="rounded-xl border border-border bg-card/60 px-4 py-3 text-[11px] text-muted-foreground">
                    Current mode: <span className="font-bold text-foreground">{voiceInputMode ? 'Hold Spacebar to speak' : 'Voice activity detection'}</span>
                </div>
            </div>
        </SettingsCard>
    );
});

InputControls.displayName = 'InputControls';
