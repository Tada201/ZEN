import { useState, memo, useCallback } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

interface ApiKeyConfigProps {
    providerKey: string;
    displayName: string;
}

export const ApiKeyConfig = memo(({ providerKey, displayName }: ApiKeyConfigProps) => {
    const [showKey, setShowKey] = useState(false);

    const apiKeyMap: Record<string, string> = {
        openai: 'openaiApiKey',
        anthropic: 'anthropicApiKey',
        openrouter: 'openrouterApiKey',
        deepseek: 'deepseekApiKey',
        groq: 'groqApiKey',
        google: 'geminiApiKey',
        gemini: 'geminiApiKey',
        qwen: 'qwenApiKey',
        mistral: 'mistralApiKey',
        xai: 'xaiApiKey',
        kilocode: 'kilocodeApiKey',
    };

    const apiKeyTarget = apiKeyMap[providerKey] || 'openaiApiKey';
    const apiKey = useSettingsStore(s => (s as unknown as Record<string, unknown>)[apiKeyTarget] as string ?? '');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    const handleUpdate = useCallback((text: string) => {
        if (apiKeyTarget) {
            updateSetting({ [apiKeyTarget]: text } as any);
        }
    }, [apiKeyTarget, updateSetting]);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-col">
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-1">API Key</label>
                <span className="text-[10px] text-white/30 mb-2">Required for authentication to {displayName} services.</span>
            </div>
            <div className="relative max-w-md group">
                <WorkbenchInput
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    placeholder="Enter your secure API key..."
                    onChangeText={handleUpdate}
                    className="w-full h-11 pr-12 font-mono text-xs bg-white/[0.02] border-white/[0.08] focus:border-blue-500/40 transition-all rounded-xl"
                />
                <WorkbenchButton
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-white/20 hover:text-white/60"
                >
                    <WorkbenchIcon name={showKey ? "lucide:eye-off" : "lucide:eye"} size={14} />
                </WorkbenchButton>
            </div>
        </div>
    );
});