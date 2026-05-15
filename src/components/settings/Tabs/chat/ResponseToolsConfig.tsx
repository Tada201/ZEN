import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const ResponseToolsConfig = memo(() => {
    const structuredResponseEnabled = useSettingsStore(s => s.structuredResponseEnabled ?? false);
    const selectedSchemaId = useSettingsStore(s => s.selectedSchemaId ?? 'standard');
    const toolsEnabled = useSettingsStore(s => s.toolsEnabled ?? true);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Response & Tools"
            subtitle="Structured Output"
            description="Configure structured output and tool usage for responses."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Structured Response"
                    description="Enforce schema compliance for model output (JSON/Markdown)"
                    control={
                        <WorkbenchSwitch
                            checked={structuredResponseEnabled}
                            onCheckedChange={(checked) => updateSetting({ structuredResponseEnabled: checked })}
                        />
                    }
                />

                <AnimatePresence>
                    {structuredResponseEnabled && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="ml-6 p-4 bg-slate-900/30 border-l-2 border-emerald-500/30 rounded-r-lg">
                                <WorkbenchSettingRow
                                    label="Output Format"
                                    description="Primary data structure for response verification"
                                    control={
                                        <WorkbenchSelect
                                            value={selectedSchemaId}
                                            onValueChange={(val) => updateSetting({ selectedSchemaId: val })}
                                            options={[
                                                { label: 'Standard Buffer', value: 'standard' },
                                                { label: 'JSON Schema', value: 'json' },
                                                { label: 'Document (MD)', value: 'markdown' },
                                                { label: 'Executable', value: 'code' },
                                            ]}
                                            width={160}
                                        />
                                    }
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <WorkbenchSettingRow
                    label="External Tools"
                    description="Allow models to interact with filesystem and terminal"
                    control={
                        <WorkbenchSwitch
                            checked={toolsEnabled}
                            onCheckedChange={(checked) => updateSetting({ toolsEnabled: checked })}
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});