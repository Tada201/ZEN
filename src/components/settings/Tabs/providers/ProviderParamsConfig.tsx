import { useMemo, memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

interface ParamConfig {
    id: string;
    label: string;
    description: string;
    min: number;
    max: number;
    step: number;
    default: number;
}

const COMMON_PARAMS: Record<string, ParamConfig> = {
    temperature: {
        id: 'temperature',
        label: 'Creativity (Temp)',
        description: 'Higher values make output more random.',
        min: 0,
        max: 2,
        step: 0.1,
        default: 0.7
    },
    topP: {
        id: 'topP',
        label: 'Top P',
        description: 'Nucleus sampling threshold.',
        min: 0,
        max: 1,
        step: 0.05,
        default: 1
    },
    maxTokens: {
        id: 'maxTokens',
        label: 'Response Length',
        description: 'Maximum tokens to generate.',
        min: 256,
        max: 32768,
        step: 256,
        default: 4096
    },
    frequencyPenalty: {
        id: 'frequencyPenalty',
        label: 'Freq. Penalty',
        description: 'Reduces repetitive word usage.',
        min: -2,
        max: 2,
        step: 0.1,
        default: 0
    },
    presencePenalty: {
        id: 'presencePenalty',
        label: 'Pres. Penalty',
        description: 'Encourages new topics.',
        min: -2,
        max: 2,
        step: 0.1,
        default: 0
    },
    topK: {
        id: 'topK',
        label: 'Top K',
        description: 'Sample from top K tokens.',
        min: 1,
        max: 100,
        step: 1,
        default: 40
    },
    repeatPenalty: {
        id: 'repeatPenalty',
        label: 'Repeat Penalty',
        description: 'Prevents repetitive output.',
        min: 1,
        max: 2,
        step: 0.05,
        default: 1.1
    },
    stop: {
        id: 'stop',
        label: 'Stop Sequences',
        description: 'Sequences where the model will stop generating. Comma-separated.',
        min: 0,
        max: 0,
        step: 0,
        default: 0 // Not used for stop
    }
};

const PROVIDER_SUPPORTED_PARAMS: Record<string, string[]> = {
    openai: ['temperature', 'topP', 'maxTokens', 'presencePenalty', 'frequencyPenalty', 'stop'],
    anthropic: ['temperature', 'topP', 'topK', 'maxTokens', 'stop'],
    google: ['temperature', 'topP', 'topK', 'maxTokens', 'stop'],
    gemini: ['temperature', 'topP', 'topK', 'maxTokens', 'stop'],
    mistral: ['temperature', 'topP', 'maxTokens', 'stop'],
    groq: ['temperature', 'topP', 'maxTokens', 'stop'],
    deepseek: ['temperature', 'topP', 'maxTokens', 'stop'],
    ollama: ['temperature', 'topP', 'topK', 'maxTokens', 'repeatPenalty', 'stop'],
    lmstudio: ['temperature', 'topP', 'maxTokens', 'stop'],
    xai: ['temperature', 'topP', 'maxTokens', 'stop'],
    openrouter: ['temperature', 'topP', 'maxTokens', 'stop'],
    opencode: ['temperature', 'topP', 'maxTokens', 'stop'],
    together: ['temperature', 'topP', 'maxTokens', 'stop'],
    perplexity: ['temperature', 'topP', 'maxTokens', 'stop'],
    nine_router: ['temperature', 'topP', 'topK', 'maxTokens', 'repeatPenalty', 'presencePenalty', 'frequencyPenalty', 'stop'],
    aihubmix: ['temperature', 'topP', 'maxTokens', 'presencePenalty', 'frequencyPenalty', 'stop'],
};

const EMPTY_PARAMS = {};

export const ProviderParamsConfig = memo(({ providerKey }: { providerKey: string }) => {
    const providerParams = useSettingsStore(s => s.providerParams[providerKey] || EMPTY_PARAMS);
    const updateProviderParams = useSettingsStore(s => s.updateProviderParams);

    const supportedParams = useMemo(() => {
        const keys = PROVIDER_SUPPORTED_PARAMS[providerKey] || ['temperature', 'topP', 'maxTokens'];
        return keys.map(k => COMMON_PARAMS[k]).filter(Boolean);
    }, [providerKey]);

    const handleParamChange = (id: string, value: number) => {
        updateProviderParams(providerKey, { [id]: value });
    };

    const resetParam = (id: string, defaultValue: number) => {
        updateProviderParams(providerKey, { [id]: defaultValue });
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-4">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <WorkbenchIcon name="lucide:settings-2" size={14} className="text-white/40" />
                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-white/40">Model Parameters</h4>
                </div>
            </div>

            <div className="space-y-4">
                {/* Main Settings Group */}
                <div className="space-y-5 px-1">
                    {supportedParams.filter(p => !['topK', 'repeatPenalty', 'presencePenalty', 'topP'].includes(p.id)).map(param => (
                        <div key={param.id} className="group space-y-2">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <label className="text-[11px] font-medium text-white/70 truncate">
                                        {param.label}
                                    </label>
                                    {(providerParams[param.id] !== undefined && providerParams[param.id] !== param.default) && (
                                        <div className="h-1 w-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {param.id !== 'stop' && (
                                        <>
                                            <button 
                                                onClick={() => resetParam(param.id, param.default)}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/5 rounded transition-all text-white/30 hover:text-white/60"
                                                title="Reset to default"
                                            >
                                                <WorkbenchIcon name="lucide:rotate-ccw" size={10} />
                                            </button>
                                            <input 
                                                type="number"
                                                value={providerParams[param.id] ?? param.default}
                                                onChange={(e) => handleParamChange(param.id, parseFloat(e.target.value))}
                                                step={param.step}
                                                className="w-14 h-6 px-1.5 text-[10px] font-mono font-bold bg-white/[0.03] border border-white/[0.08] rounded focus:outline-none focus:border-blue-500/50 text-blue-400 text-right"
                                            />
                                        </>
                                    )}
                                </div>
                            </div>

                            {param.id === 'stop' ? (
                                <input
                                    type="text"
                                    value={(providerParams.stop || []).join(', ')}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const array = val.split(',').map(s => s.trim()).filter(Boolean);
                                        updateProviderParams(providerKey, { stop: array });
                                    }}
                                    placeholder="Enter strings and press ↵"
                                    className="w-full h-8 px-3 text-[10px] font-mono bg-white/[0.03] border border-white/[0.08] rounded text-blue-400 placeholder:text-white/10 focus:outline-none focus:border-blue-500/50 transition-colors"
                                />
                            ) : (
                                <div className="relative flex items-center h-2 px-0.5">
                                    <input
                                        type="range"
                                        min={param.min}
                                        max={param.max}
                                        step={param.step}
                                        value={providerParams[param.id] ?? param.default}
                                        onChange={(e) => handleParamChange(param.id, parseFloat(e.target.value))}
                                        className="w-full h-0.5 bg-white/[0.1] rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Sampling Group */}
                <div className="mt-6 border-t border-white/[0.04] pt-4">
                    <div className="flex items-center gap-2 mb-4 px-1">
                        <WorkbenchIcon name="lucide:git-branch" size={12} className="text-white/20 rotate-90" />
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Sampling</span>
                    </div>
                    
                    <div className="space-y-4 px-1">
                        {supportedParams.filter(p => ['topK', 'repeatPenalty', 'presencePenalty', 'topP'].includes(p.id)).map(param => (
                            <div key={param.id} className="group space-y-2">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <label className="text-[11px] font-medium text-white/50 truncate">
                                            {param.label}
                                        </label>
                                        {(providerParams[param.id] !== undefined && providerParams[param.id] !== param.default) && (
                                            <div className="h-1 w-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button 
                                            onClick={() => resetParam(param.id, param.default)}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/5 rounded transition-all text-white/30 hover:text-white/60"
                                            title="Reset to default"
                                        >
                                            <WorkbenchIcon name="lucide:rotate-ccw" size={10} />
                                        </button>
                                        <input 
                                            type="number"
                                            value={providerParams[param.id] ?? param.default}
                                            onChange={(e) => handleParamChange(param.id, parseFloat(e.target.value))}
                                            step={param.step}
                                            className="w-14 h-6 px-1.5 text-[10px] font-mono font-bold bg-white/[0.03] border border-white/[0.08] rounded focus:outline-none focus:border-blue-500/50 text-blue-400 text-right"
                                        />
                                    </div>
                                </div>
                                <div className="relative flex items-center h-2 px-0.5">
                                    <input
                                        type="range"
                                        min={param.min}
                                        max={param.max}
                                        step={param.step}
                                        value={providerParams[param.id] ?? param.default}
                                        onChange={(e) => handleParamChange(param.id, parseFloat(e.target.value))}
                                        className="w-full h-0.5 bg-white/[0.05] rounded-full appearance-none cursor-pointer accent-blue-500/50 hover:accent-blue-400 transition-all"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mx-1 p-2.5 rounded-lg bg-blue-500/[0.02] border border-blue-500/10 flex gap-2.5">
                <WorkbenchIcon name="lucide:info" size={12} className="text-blue-400/40 shrink-0 mt-0.5" />
                <p className="text-[9px] text-blue-400/40 font-medium leading-relaxed">
                    Adjusting <span className="text-blue-400/60 font-bold uppercase">{providerKey}</span> runtime. 
                    Changes are applied to the next inference request.
                </p>
            </div>
        </div>
    );
});
