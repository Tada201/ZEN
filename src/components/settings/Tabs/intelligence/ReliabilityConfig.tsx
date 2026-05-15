import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const ReliabilityConfig = memo(() => {
    const strictGrounding = useSettingsStore(s => s.strictGrounding ?? false);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Response Reliability"
            subtitle="Safety Controls"
            description="Safety and accuracy controls to ensure responses are strictly derived from verified documents."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Strict Grounding"
                    description="Require the assistant to only answer based on available documentation"
                    control={
                        <WorkbenchSwitch
                            checked={strictGrounding}
                            onCheckedChange={(checked) => updateSetting({ strictGrounding: checked })}
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});