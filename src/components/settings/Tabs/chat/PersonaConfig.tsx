import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { WorkbenchTextArea } from '@/components/settings/ui/WorkbenchTextArea';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const PersonaConfig = memo(() => {
    const personalityPreset = useSettingsStore(s => s.personalityPreset ?? 'neutral');
    const systemPrompt = useSettingsStore(s => s.systemPrompt ?? '');
    const voiceInstructions = useSettingsStore(s => s.voiceInstructions ?? '');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Assistant Persona"
            subtitle="Behavior Configuration"
            description="Configure assistant behavior and response directives."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Response Style"
                    description="Select a behavioral archetype for interactions"
                    control={
                        <WorkbenchSelect
                            value={personalityPreset}
                            onValueChange={(val) => updateSetting({ personalityPreset: val })}
                            options={[
                                { label: 'Default', value: 'neutral' },
                                { label: 'Conversational', value: 'friendly' },
                                { label: 'Technical', value: 'technical' },
                                { label: 'Creative', value: 'creative' },
                                { label: 'Concise', value: 'concise' },
                                { label: 'Custom', value: 'custom' },
                            ]}
                            width={160}
                        />
                    }
                />

                <div className="flex flex-col gap-2 p-4 bg-zinc-900/20 border border-white/[0.03] rounded-lg">
                    <div className="flex items-center gap-2">
                        <WorkbenchIcon name="codicon:terminal" size={14} className="text-zinc-400" />
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                            System Instructions
                        </span>
                    </div>
                    <WorkbenchTextArea
                        className="min-h-[120px] font-mono text-[12px] leading-relaxed bg-black/20 border-white/[0.05]"
                        placeholder="Enter core system instructions..."
                        value={systemPrompt}
                        onChangeText={(text) => updateSetting({ systemPrompt: text })}
                    />
                    <p className="text-[10px] text-zinc-500 leading-normal italic">
                        Directives provided during initialization to define interaction constraints and behavior.
                    </p>
                </div>

                <div className="flex flex-col gap-2 p-4 bg-zinc-900/20 border border-white/[0.03] rounded-lg">
                    <div className="flex items-center gap-2">
                        <WorkbenchIcon name="codicon:pulse" size={14} className="text-zinc-400" />
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                            Voice & Audio Instructions
                        </span>
                    </div>
                    <WorkbenchTextArea
                        className="min-h-[96px] font-mono text-[12px] leading-relaxed bg-black/20 border-white/[0.05]"
                        placeholder="Enter auditory interface instructions..."
                        value={voiceInstructions}
                        onChangeText={(text) => updateSetting({ voiceInstructions: text })}
                    />
                    <p className="text-[10px] text-zinc-500 leading-normal italic">
                        Specific constraints and guidelines for Voice and STT modalities.
                    </p>
                </div>
            </div>
        </SettingsCard>
    );
});