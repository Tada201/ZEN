import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSlider } from '@/components/settings/ui/WorkbenchSlider';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const OutputConfig = memo(() => {
    const masterVolume = useSettingsStore(s => s.masterVolume ?? 1.0);
    const isMuted = useSettingsStore(s => s.isMuted ?? false);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Output Configuration"
            subtitle="Audio Routing"
            description="Configure system output volume and mute state."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Master Volume"
                    description="System-wide audio output level"
                    control={
                        <div className="flex items-center gap-4 w-[180px]">
                            <span className="text-[10px] font-mono text-zinc-300 w-[30px] text-right">
                                {Math.round(masterVolume * 100)}%
                            </span>
                            <div className="flex-1">
                                <WorkbenchSlider
                                    value={[masterVolume * 100]}
                                    onValueChange={(v) => updateSetting({ masterVolume: v[0] / 100 })}
                                    min={0}
                                    max={100}
                                    step={1}
                                />
                            </div>
                        </div>
                    }
                />
                <WorkbenchSettingRow
                    label="Mute All Audio"
                    description="Suppress all audio output including notifications"
                    control={
                        <input
                            type="checkbox"
                            checked={isMuted}
                            onChange={(e) => updateSetting({ isMuted: e.target.checked })}
                            className="accent-primary"
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});