import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { WorkbenchSlider } from '@/components/settings/ui/WorkbenchSlider';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const ProcessingConfig = memo(() => {
    const thinkingMode = useSettingsStore(s => s.thinkingMode ?? false);
    const thinkingBudget = useSettingsStore(s => s.thinkingBudget ?? 4096);
    const reasoningEffort = useSettingsStore(s => s.reasoningEffort ?? 'medium');
    const streamResponses = useSettingsStore(s => s.streamResponses ?? true);
    const gpuAcceleration = useSettingsStore(s => s.gpuAcceleration ?? false);
    const enablePromptCaching = useSettingsStore(s => s.enablePromptCaching ?? false);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Processing & Memory"
            subtitle="Optimization Settings"
            description="Configure processing optimizations and hardware utilization."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Chain-of-Thought"
                    description="Enable multi-step deductive reasoning for complex queries"
                    control={
                        <WorkbenchSwitch
                            checked={thinkingMode}
                            onCheckedChange={(checked) => updateSetting({ thinkingMode: checked })}
                        />
                    }
                />

                <AnimatePresence>
                    {thinkingMode && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="ml-6 p-5 bg-slate-900/30 border-l-2 border-emerald-500/30 rounded-r-lg flex flex-col gap-4">
                                <WorkbenchSettingRow
                                    label="Reasoning Token Budget"
                                    description="Maximum tokens allocated for internal processing"
                                    control={
                                        <div className="flex items-center gap-4">
                                            <span className="text-[10px] font-mono font-bold text-zinc-300 bg-slate-800/50 px-2 py-0.5 rounded border border-white/[0.05] min-w-[70px] text-center">
                                                {thinkingBudget} TK
                                            </span>
                                            <WorkbenchSlider
                                                width={120}
                                                value={[thinkingBudget]}
                                                min={1024}
                                                max={64000}
                                                step={1024}
                                                onValueChange={(vals) => updateSetting({ thinkingBudget: vals[0] })}
                                            />
                                        </div>
                                    }
                                />

                                <WorkbenchSettingRow
                                    label="Reasoning Effort"
                                    description="Computational intensity for reasoning cycles"
                                    control={
                                        <WorkbenchSelect
                                            value={reasoningEffort}
                                            onValueChange={(val) => updateSetting({ reasoningEffort: val as typeof reasoningEffort })}
                                            options={[
                                                { label: 'Efficient', value: 'low' },
                                                { label: 'Optimal', value: 'medium' },
                                                { label: 'Maximum', value: 'high' },
                                            ]}
                                            width={140}
                                        />
                                    }
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <WorkbenchSettingRow
                    label="Response Streaming"
                    description="Stream characters as they are generated by the model"
                    control={
                        <WorkbenchSwitch
                            checked={streamResponses}
                            onCheckedChange={(checked) => updateSetting({ streamResponses: checked })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Hardware Acceleration"
                    description="Enable GPU utilization for inference when available"
                    control={
                        <WorkbenchSwitch
                            checked={gpuAcceleration}
                            onCheckedChange={(checked) => updateSetting({ gpuAcceleration: checked })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Prompt Caching"
                    description="Store common context in memory for faster subsequent responses"
                    control={
                        <WorkbenchSwitch
                            checked={enablePromptCaching}
                            onCheckedChange={(checked) => updateSetting({ enablePromptCaching: checked })}
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});