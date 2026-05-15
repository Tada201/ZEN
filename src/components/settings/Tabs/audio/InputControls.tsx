import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const InputControls = memo(() => {
    const vadEnabled = useSettingsStore(s => s.vadEnabled ?? false);
    const sttHotkeysEnabled = useSettingsStore(s => s.sttHotkeysEnabled ?? false);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Input Controls"
            subtitle="Capture Settings"
            description="Configure how the application listens for voice commands."
        >
            <div className="flex flex-col">
                <WorkbenchSettingRow
                    label="Voice Activity Detection"
                    description="Automated capture on detected speech"
                    control={
                        <WorkbenchSwitch
                            checked={vadEnabled}
                            onCheckedChange={(v) => updateSetting({ vadEnabled: v })}
                        />
                    }
                />
                <WorkbenchSettingRow
                    label="Physical Keybindings"
                    description="Enable push-to-talk (Default: Option+Space)"
                    control={
                        <WorkbenchSwitch
                            checked={sttHotkeysEnabled}
                            onCheckedChange={(v) => updateSetting({ sttHotkeysEnabled: v })}
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});