import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSlider } from '@/components/settings/ui/WorkbenchSlider';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const VoiceModulation = memo(() => {
    const webTtsRate = useSettingsStore(s => s.webTtsRate ?? 1.0);
    const webTtsPitch = useSettingsStore(s => s.webTtsPitch ?? 1.0);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Voice Modulation"
            subtitle="Speech Dynamics"
            description="Adjust the speed and pitch of the synthesized voice."
        >
            <div className="flex flex-col">
                <WorkbenchSettingRow
                    label="Speaking Rate"
                    description="Adjust the speed of the spoken response"
                    control={
                        <div className="flex items-center gap-4 w-[180px]">
                            <span className="text-[10px] font-mono text-foreground w-[30px] text-right">
                                {webTtsRate.toFixed(1)}x
                            </span>
                            <div className="flex-1">
                                <WorkbenchSlider
                                    value={[webTtsRate * 50]}
                                    onValueChange={(v) => updateSetting({ webTtsRate: v[0] / 50 })}
                                    min={25}
                                    max={100}
                                    step={1}
                                />
                            </div>
                        </div>
                    }
                />
                <WorkbenchSettingRow
                    label="Harmonic Pitch"
                    description="Acoustic frequency modulation of the vocal stream"
                    control={
                        <div className="flex items-center gap-4 w-[180px]">
                            <span className="text-[10px] font-mono text-foreground w-[30px] text-right">
                                {webTtsPitch.toFixed(1)}
                            </span>
                            <div className="flex-1">
                                <WorkbenchSlider
                                    value={[webTtsPitch * 50]}
                                    onValueChange={(v) => updateSetting({ webTtsPitch: v[0] / 50 })}
                                    min={0}
                                    max={100}
                                    step={1}
                                />
                            </div>
                        </div>
                    }
                />
            </div>
        </SettingsCard>
    );
});