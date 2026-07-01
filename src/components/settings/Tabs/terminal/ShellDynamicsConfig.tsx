import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const ShellDynamicsConfig = memo(() => {
    const defaultShell = useSettingsStore(s => s.defaultShell ?? 'powershell');
    const shellArgs = useSettingsStore(s => s.shellArgs ?? '');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Shell Dynamics"
            subtitle="Terminal Configuration"
            description="Configure the default shell and its arguments."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Default Shell"
                    description="The shell application to use for terminal execution"
                    control={
                        <WorkbenchSelect
                            value={defaultShell}
                            onValueChange={(val) => updateSetting({ defaultShell: val })}
                            options={[
                                { label: 'PowerShell', value: 'powershell' },
                                { label: 'CMD', value: 'cmd' },
                                { label: 'Bash (WSL)', value: 'bash' },
                                { label: 'Zsh', value: 'zsh' },
                             ]}
                            width={160}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Shell Arguments"
                    description="Additional arguments passed to the shell on startup"
                    control={
                        <WorkbenchInput
                            value={shellArgs}
                            onChangeText={(val) => updateSetting({ shellArgs: val })}
                            placeholder="-NoLogo"
                            className="w-[200px] h-8 bg-card/70 border border-border rounded-lg font-mono text-[11px] text-foreground focus:border-emerald-500/30 transition-colors"
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});