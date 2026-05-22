import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSlider } from '@/components/settings/ui/WorkbenchSlider';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const GenerationConfig = memo(() => {
    const temperature = useSettingsStore(s => s.temperature ?? 0.7);
    const maxTokens = useSettingsStore(s => s.maxTokens ?? 4096);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Generation Parameters"
            subtitle="Token Settings"
            description="Fine-tune token generation and randomness."
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 p-4 bg-zinc-900/20 border border-white/[0.03] rounded-lg">
                    <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                                Temperature
                            </span>
                            <p className="text-[10px] text-zinc-500 leading-normal">
                                Randomness coefficient for token selection
                            </p>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-zinc-200 bg-zinc-800/50 px-2 py-0.5 rounded border border-white/[0.05]">
                            {temperature.toFixed(2)}
                        </span>
                    </div>
                    <div className="px-1">
                        <WorkbenchSlider
                            value={[temperature]}
                            max={2}
                            min={0}
                            step={0.05}
                            onValueChange={(vals) => updateSetting({ temperature: vals[0] })}
                        />
                    </div>
                    <div className="flex justify-between">
                        <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter">
                            Deterministic
                        </span>
                        <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter">
                            Creative
                        </span>
                    </div>
                </div>

                <WorkbenchSettingRow
                    label="Max Output Tokens"
                    description="Upper limit for tokens generated in a single response"
                    control={
                        <div className="flex items-center gap-2">
                            <WorkbenchInput
                                className="w-[100px] text-center font-mono text-[11px]"
                                value={String(maxTokens)}
                                type="number"
                                onChangeText={(text) => updateSetting({ maxTokens: parseInt(text) || 0 })}
                            />
                            <span className="text-[10px] text-zinc-600 font-bold font-mono">TK</span>
                        </div>
                    }
                />
            </div>
        </SettingsCard>
    );
});