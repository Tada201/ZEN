import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const MicrophoneConfig = memo(() => {
    const selectedMic = useSettingsStore(s => s.selectedMic ?? '');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    const devices = [
        { label: 'System Default', value: 'default' },
        { label: 'Voice Input (Primary)', value: 'primary' },
    ];

    return (
        <SettingsCard
            title="Microphone Configuration"
            subtitle="Input Routing"
            description="Select and configure the active audio input device."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Active Microphone"
                    description="Select the hardware device for voice recognition"
                    control={
                        <WorkbenchSelect
                            value={selectedMic || 'default'}
                            onValueChange={(val) => updateSetting({ selectedMic: val })}
                            options={devices}
                            width={180}
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});