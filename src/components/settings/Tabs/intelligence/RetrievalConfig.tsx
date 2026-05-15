import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { WorkbenchSlider } from '@/components/settings/ui/WorkbenchSlider';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const RetrievalConfig = memo(() => {
    const ragEnabled = useSettingsStore(s => s.ragEnabled ?? true);
    const citationsEnabled = useSettingsStore(s => s.citationsEnabled ?? false);
    const topK = useSettingsStore(s => s.topK ?? 5);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Document Retrieval"
            subtitle="Knowledge Base"
            description="Configure how the system retrieves context from your local knowledge base."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Enable Knowledge Retrieval"
                    description="Allow the assistant to search and reference your local documents"
                    control={
                        <WorkbenchSwitch
                            checked={ragEnabled}
                            onCheckedChange={(checked) => updateSetting({ ragEnabled: checked })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Response Citations"
                    description="Show sources and grounded evidence for assistant responses"
                    control={
                        <WorkbenchSwitch
                            checked={citationsEnabled}
                            onCheckedChange={(checked) => updateSetting({ citationsEnabled: checked })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Retrieval Context (Top-K)"
                    description="Number of document segments to retrieve for each query"
                    control={
                        <div className="flex items-center gap-4">
                            <span className="text-[11px] font-bold font-mono text-emerald-400 w-10 text-right">
                                k={topK}
                            </span>
                            <div className="w-[120px]">
                                <WorkbenchSlider
                                    value={[topK]}
                                    onValueChange={([val]) => updateSetting({ topK: val })}
                                    min={1}
                                    max={20}
                                    step={1}
                                />
                            </div>
                        </div>
                    }
                />
            </div>
        </SettingsCard>
    );
});