import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const AgentConfigRow = memo(() => {
    const agentLoggingEnabled = useSettingsStore(s => s.agentLoggingEnabled ?? true);
    const agentMemoryLimit = useSettingsStore(s => s.agentMemoryLimit ?? 512);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Agent Configuration"
            subtitle="Runtime Settings"
            description="Configure agent-specific runtime behavior and logging."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Agent execution logging"
                    description="Log agent decisions and reasoning traces"
                    control={
                        <WorkbenchSwitch
                            checked={agentLoggingEnabled}
                            onCheckedChange={(checked) => updateSetting({ agentLoggingEnabled: checked })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Memory Limit"
                    description="Maximum memory allocated per agent (MB)"
                    control={
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold text-success">
                                {agentMemoryLimit} MB
                            </span>
                        </div>
                    }
                />
            </div>
        </SettingsCard>
    );
});