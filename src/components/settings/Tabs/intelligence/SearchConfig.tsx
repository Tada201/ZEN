import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const SearchConfig = memo(() => {
    const searchStrategy = useSettingsStore(s => s.searchStrategy ?? 'hybrid');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Search & Indexing"
            subtitle="Algorithm Settings"
            description="Fine-tune the search algorithms used to query your indexed knowledge base."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Search Algorithm"
                    description="Select the indexing strategy for context retrieval"
                    control={
                        <WorkbenchSelect
                            value={searchStrategy}
                            onValueChange={(val) => updateSetting({ searchStrategy: val as typeof searchStrategy })}
                            options={[
                                { label: 'Vector (Fast)', value: 'vector' },
                                { label: 'Hybrid (Balanced)', value: 'hybrid' },
                                { label: 'Keyword (Precise)', value: 'semantic' },
                            ]}
                            width={180}
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});