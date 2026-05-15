import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

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
                {devices.map((device) => (
                    <WorkbenchSettingRow
                        key={device.value}
                        label={device.label}
                        description={`Use ${device.label} for voice input`}
                        control={
                            <div className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="mic"
                                    checked={selectedMic === device.value || (!selectedMic && device.value === 'default')}
                                    onChange={() => updateSetting({ selectedMic: device.value })}
                                    className="accent-primary"
                                />
                                {selectedMic === device.value && (
                                    <WorkbenchIcon name="lucide:mic" size={12} className="text-emerald-500" />
                                )}
                            </div>
                        }
                    />
                ))}
            </div>
        </SettingsCard>
    );
});