import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const ExecutionSafetyConfig = memo(() => {
    const sandboxEnabled = useSettingsStore(s => s.sandboxEnabled ?? true);
    const maxExecutionTime = useSettingsStore(s => s.maxExecutionTime ?? 30);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Execution Safety"
            subtitle="Runtime Controls"
            description="Configure sandbox and execution constraints for code blocks."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Sandbox Mode"
                    description="Isolate code execution in a secure sandbox environment"
                    control={
                        <WorkbenchSwitch
                            checked={sandboxEnabled}
                            onCheckedChange={(checked) => updateSetting({ sandboxEnabled: checked })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Max Execution Time"
                    description="Maximum time in seconds before terminating runaway code"
                    control={
                        <div className="flex items-center gap-2">
                            <WorkbenchInput
                                value={String(maxExecutionTime)}
                                type="number"
                                onChangeText={(text) => updateSetting({ maxExecutionTime: parseInt(text) || 30 })}
                                className="w-[80px] text-center font-mono text-[11px]"
                            />
                            <span className="text-[10px] text-zinc-500 font-bold">seconds</span>
                        </div>
                    }
                />
            </div>
        </SettingsCard>
    );
});