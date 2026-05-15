import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
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
                        <input
                            type="text"
                            value={shellArgs}
                            onChange={(e) => updateSetting({ shellArgs: e.target.value })}
                            placeholder="-NoLogo"
                            className="w-[200px] h-9 px-3 bg-slate-950/50 border border-white/5 rounded-lg font-mono text-[11px] text-zinc-300 focus:border-emerald-500/30 transition-colors"
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});