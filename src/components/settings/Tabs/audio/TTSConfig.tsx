import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';

export const TTSConfig = memo(() => {
    const webTtsVoice = useSettingsStore(s => s.webTtsVoice ?? '');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Text-to-Speech"
            subtitle="Voice Synthesis"
            description="Configure the voice used for synthesized speech output."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Voice Engine"
                    description="Select the TTS voice profile"
                    control={
                        <WorkbenchSelect
                            value={webTtsVoice || 'default'}
                            onValueChange={(val) => updateSetting({ webTtsVoice: val })}
                            options={[
                                { label: 'System Default', value: 'default' },
                                { label: 'Enhanced Clarity', value: 'enhanced' },
                                { label: 'Neural HD', value: 'neural-hd' },
                            ]}
                            width={160}
                        />
                    }
                />
            </div>
        </SettingsCard>
    );
});