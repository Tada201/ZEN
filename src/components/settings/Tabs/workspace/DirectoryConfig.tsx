import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const DirectoryConfig = memo(() => {
    const dataDirectory = useSettingsStore(s => s.dataDirectory ?? '');
    const autoBackup = useSettingsStore(s => s.autoBackup ?? false);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Directory Configuration"
            subtitle="File System"
            description="Configure workspace directories and file system behavior."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Data Directory"
                    description="Root directory for workspace data and configurations"
                    control={
                        <WorkbenchInput
                            value={dataDirectory}
                            onChangeText={(text) => updateSetting({ dataDirectory: text })}
                            placeholder="/path/to/data"
                            className="w-[300px] font-mono text-[11px]"
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Auto Backup"
                    description="Automatically backup workspace data on exit"
                    control={
                        <WorkbenchSwitch
                            checked={autoBackup}
                            onCheckedChange={(checked) => updateSetting({ autoBackup: checked })}
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});