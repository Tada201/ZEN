import { memo, useEffect, useRef } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { SettingsSection } from '../../SettingsSection';
import { SettingsRow } from '../../SettingsRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { WorkbenchSlider } from '@/components/settings/ui/WorkbenchSlider';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { CustomVoiceSelector } from '@/atlas/components/voice/CustomVoiceSelector';
import { voiceApi } from '@/api/voiceApi';

export const TTSConfig = memo(() => {
    const ttsEngine = useSettingsStore(s => s.ttsEngine ?? 'piper');
    const webTtsVoiceURI = useSettingsStore(s => s.webTtsVoiceURI ?? '');
    const webTtsRate = useSettingsStore(s => s.webTtsRate ?? 1.0);
    const webTtsPitch = useSettingsStore(s => s.webTtsPitch ?? 1.0);
    const ttsPiperVoiceId = useSettingsStore(s => s.ttsPiperVoiceId ?? 'default');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    const syncedVoiceRef = useRef<string | null>(null);
    useEffect(() => {
        if (ttsEngine !== 'piper') return;
        if (syncedVoiceRef.current === ttsPiperVoiceId) return;
        syncedVoiceRef.current = ttsPiperVoiceId;
        voiceApi
            .setActiveVoiceModel(ttsPiperVoiceId)
            .catch(() => {
                syncedVoiceRef.current = null;
            });
    }, [ttsEngine, ttsPiperVoiceId]);

    const isWeb = ttsEngine === 'web';
    const isPiper = ttsEngine === 'piper';

    return (
        <SettingsSection
            title="Text-to-Speech"
            subtitle="Voice Synthesis"
            description="Configure the voice engine, rate, and pitch used for synthesized speech output."
        >
            <div className="flex flex-col gap-4">
                <SettingsRow
                    label="Voice Engine"
                    description="Local Piper (ONNX), browser Web Speech, or system fallback"
                    control={
                        <WorkbenchSelect
                            value={ttsEngine}
                            onValueChange={(val) => updateSetting({ ttsEngine: val as 'piper' | 'web' | 'system' })}
                            options={[
                                { label: 'Piper (Local)', value: 'piper' },
                                { label: 'Web Speech API', value: 'web' },
                                { label: 'System Fallback', value: 'system' },
                            ]}
                            width={160}
                        />
                    }
                />

                {isPiper && <CustomVoiceSelector />}

                {isWeb && (
                    <>
                        <SettingsRow
                            label="Browser Voice"
                            description="Voice profile exposed by the OS/browser"
                            control={
                                <WorkbenchInput
                                    value={webTtsVoiceURI}
                                    onChangeText={(val) => updateSetting({ webTtsVoiceURI: val })}
                                    placeholder="e.g. Google US English"
                                    className="w-[220px]"
                               />
                            }
                        />
                        <SettingsRow
                            label="Speaking Rate"
                            description="Speed multiplier for the browser TTS engine"
                            control={
                                <div className="flex items-center gap-2 w-[160px]">
                                    <WorkbenchSlider
                                        value={[webTtsRate]}
                                        onValueChange={([v]) => updateSetting({ webTtsRate: v })}
                                        min={0.5}
                                        max={2}
                                        step={0.1}
                                        className="flex-1"
                                    />
                                    <span className="text-[11px] font-mono text-muted-foreground w-10 text-right">
                                        {webTtsRate.toFixed(1)}x
                                    </span>
                                </div>
                            }
                        />
                        <SettingsRow
                            label="Pitch"
                            description="Voice pitch multiplier for the browser TTS engine"
                            control={
                                <div className="flex items-center gap-2 w-[160px]">
                                    <WorkbenchSlider
                                        value={[webTtsPitch]}
                                        onValueChange={([v]) => updateSetting({ webTtsPitch: v })}
                                        min={0.5}
                                        max={2}
                                        step={0.1}
                                        className="flex-1"
                                    />
                                    <span className="text-[11px] font-mono text-muted-foreground w-10 text-right">
                                        {webTtsPitch.toFixed(1)}x
                                    </span>
                                </div>
                            }
                        />
                    </>
                )}
            </div>
        </SettingsSection>
    );
});

TTSConfig.displayName = 'TTSConfig';
