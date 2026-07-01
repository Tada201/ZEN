import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const OrchestratorConfig = memo(() => {
    const multiAgentEnabled = useSettingsStore(s => s.multiAgentEnabled ?? false);
    const agentTimeout = useSettingsStore(s => s.agentTimeout ?? 120);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Agent Orchestrator"
            subtitle="Multi-Agent Settings"
            description="Configure multi-agent orchestration and coordination behavior."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Multi-Agent Mode"
                    description="Enable coordinated multi-agent task execution"
                    control={
                        <WorkbenchSwitch
                            checked={multiAgentEnabled}
                            onCheckedChange={(checked) => updateSetting({ multiAgentEnabled: checked })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Agent Timeout"
                    description="Maximum time in seconds before agent task is terminated"
                    control={
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold text-success">
                                {agentTimeout}s
                            </span>
                        </div>
                    }
                />
            </div>
        </SettingsCard>
    );
});