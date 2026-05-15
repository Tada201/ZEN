import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const SystemSoundsConfig = memo(() => {
    const systemSoundsEnabled = useSettingsStore(s => s.systemSoundsEnabled ?? true);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="System Sounds"
            subtitle="Audio Feedback"
            description="Enable or disable system sound notifications."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Enable System Sounds"
                    description="Play audio cues for system events"
                    control={
                        <WorkbenchSwitch
                            checked={systemSoundsEnabled}
                            onCheckedChange={(checked) => updateSetting({ systemSoundsEnabled: checked })}
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});