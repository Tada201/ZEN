import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const STTConfig = memo(() => {
    const sttModel = useSettingsStore(s => s.sttModel ?? 'base');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Speech-to-Text"
            subtitle="Voice Recognition"
            description="Configure speech recognition model and language settings."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Recognition Model"
                    description="Select the STT model for accuracy vs speed"
                    control={
                        <WorkbenchSelect
                            value={sttModel}
                            onValueChange={(val) => updateSetting({ sttModel: val })}
                            options={[
                                { label: 'Base (Fast)', value: 'base' },
                                { label: 'Medium', value: 'medium' },
                                { label: 'Large (Accurate)', value: 'large' },
                            ]}
                            width={160}
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});