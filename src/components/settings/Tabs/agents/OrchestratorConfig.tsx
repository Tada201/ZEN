import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { WorkbenchInput } from '@/components/ui/WorkbenchInput';

export const OrchestratorConfig = memo(() => {
    const multiAgentEnabled = useSettingsStore(s => s.multiAgentEnabled ?? false);
    const agentTimeout = useSettingsStore(s => s.agentTimeout ?? 120);
    const agentTokenBudget = useSettingsStore(s => s.agentTokenBudget ?? 0);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    const handleTokenBudgetChange = (value: string) => {
        const parsed = parseInt(value, 10);
        updateSetting({ agentTokenBudget: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) });
    };

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

                <WorkbenchSettingRow
                    label="Token Budget"
                    description="Maximum total tokens (input + output) per agent run. 0 disables the limit."
                    control={
                        <WorkbenchInput
                            type="number"
                            min={0}
                            max={10000000}
                            value={String(agentTokenBudget)}
                            onChange={(e) => handleTokenBudgetChange(e.target.value)}
                            className="w-32 h-8 text-xs"
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});