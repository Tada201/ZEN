import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';

export const StartupConfig = memo(() => {
    const bootEnabled = useSettingsStore(s => s.bootEnabled ?? true);
    const bootDurationMs = useSettingsStore(s => s.bootDurationMs ?? 3200);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <section className="flex flex-col gap-6">
            <div>
                <h2 className="text-[11px] font-bold text-foreground uppercase tracking-widest mb-1">Application Startup</h2>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Configure startup behaviors and initialization sequence.
                </p>
            </div>

            <div className="flex flex-col gap-1">
                <WorkbenchSettingRow
                    label="Enable Boot Sequence"
                    description="Show startup progress while settings and chat history initialize"
                    control={
                        <WorkbenchSwitch
                            checked={bootEnabled}
                            onCheckedChange={(checked) => updateSetting({ bootEnabled: checked })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Sequence Duration"
                    description="Time allocated for the boot sequence in milliseconds"
                    control={
                        <div className="relative group">
                            <WorkbenchInput
                                placeholder="2500"
                                type="number"
                                min={500}
                                max={5000}
                                step={100}
                                value={bootDurationMs.toString()}
                                onChangeText={(text) => updateSetting({
                                    bootDurationMs: Math.min(5000, Math.max(500, Number.parseInt(text, 10) || 500)),
                                })}
                                className="w-[120px] text-center bg-card/70 rounded-lg border border-border font-mono text-success focus:border-emerald-500/30"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground/50 group-focus-within:text-emerald-500/40 transition-colors uppercase">ms</div>
                        </div>
                    }
                />
            </div>
        </section>
    );
});
