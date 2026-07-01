import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSlider } from '@/components/settings/ui/WorkbenchSlider';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const FeedbackIntensityConfig = memo(() => {
    const hapticFeedbackEnabled = useSettingsStore(s => s.hapticFeedbackEnabled ?? false);
    const masterVolume = useSettingsStore(s => s.masterVolume ?? 1.0);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Feedback Intensity"
            subtitle="Volume & Haptics"
            description="Adjust the volume and tactile feedback levels."
        >
            <div className="flex flex-col">
                <WorkbenchSettingRow
                    label="Auditory Level"
                    description="Global volume for interface cues"
                    control={
                        <div className="flex items-center gap-4 w-[180px]">
                            <span className="text-[10px] font-mono text-foreground w-[30px] text-right">
                                {Math.round(masterVolume * 100)}%
                            </span>
                            <div className="flex-1">
                                <WorkbenchSlider
                                    value={[masterVolume * 100]}
                                    onValueChange={(v) => updateSetting({ masterVolume: v[0] / 100 })}
                                    max={100}
                                    step={1}
                                />
                            </div>
                        </div>
                    }
                />
                <WorkbenchSettingRow
                    label="Haptic Feedback"
                    description="Enable tactile cues (Hardware Dependent)"
                    control={
                        <WorkbenchSwitch
                            checked={hapticFeedbackEnabled}
                            onCheckedChange={(v) => updateSetting({ hapticFeedbackEnabled: v })}
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});