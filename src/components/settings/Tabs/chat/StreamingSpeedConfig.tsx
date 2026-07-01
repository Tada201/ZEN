import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const StreamingSpeedConfig = memo(() => {
    const streamingSpeed = useSettingsStore((s) => s.streamingSpeed ?? 'instant');
    const updateSetting = useSettingsStore((s) => s.updateSetting);

    return (
        <SettingsCard
            title="Display & Rendering"
            subtitle="Token Reveal Speed"
            description="Controls how quickly streamed tokens are revealed on screen."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Streaming Speed"
                    description="Controls how quickly streamed tokens are revealed on screen"
                    control={
                        <WorkbenchSelect
                            value={streamingSpeed}
                            onValueChange={(val) => updateSetting({ streamingSpeed: val as 'instant' | 'typewriter' })}
                            options={[
                                { label: 'Instant', value: 'instant' },
                                { label: 'Typewriter', value: 'typewriter' },
                            ]}
                            width={140}
                        />
                    }
                />

                <div className="ml-2 mt-1 px-4 py-3 bg-muted/40 border-l-2 border-border/40 rounded-r-lg">
                    {streamingSpeed === 'instant' ? (
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                            <span className="text-foreground font-semibold">Instant</span> — tokens appear as they
                            arrive from the model. Best for fast hardware and keyboard-focused workflows.
                        </p>
                    ) : (
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                            <span className="text-foreground font-semibold">Typewriter</span> — characters are
                            smoothed into a constant reveal rate (~80 chars/sec). Easier on the eyes during long
                            responses; auto-accelerates to keep up with large token bursts.
                        </p>
                    )}
                </div>
            </div>
        </SettingsCard>
    );
});