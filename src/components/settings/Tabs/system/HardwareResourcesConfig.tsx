import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const HardwareResourcesConfig = memo(() => {
    const gpuAcceleration = useSettingsStore(s => s.gpuAcceleration ?? false);
    const maxMemoryAllocation = useSettingsStore(s => s.maxMemoryAllocation ?? 8192);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Hardware Resources"
            subtitle="System Allocation"
            description="Configure system resource utilization and hardware acceleration settings."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="GPU Acceleration"
                    description="Enable hardware acceleration for inference when available"
                    control={
                        <WorkbenchSwitch
                            checked={gpuAcceleration}
                            onCheckedChange={(checked) => updateSetting({ gpuAcceleration: checked })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Max Memory Allocation"
                    description="Maximum RAM allocated for model operations (MB)"
                    control={
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold text-emerald-400">
                                {maxMemoryAllocation} MB
                            </span>
                        </div>
                    }
                />
            </div>
        </SettingsCard>
    );
});