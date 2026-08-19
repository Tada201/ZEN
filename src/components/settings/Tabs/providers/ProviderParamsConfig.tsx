import { useMemo, memo, useState } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { DEFAULT_PROVIDER_CAPABILITY_PROFILE, PROVIDER_CAPABILITY_PROFILES } from '@/lib/types/provider';

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
    seed: {
        id: 'seed',
        label: 'Seed',
        description: 'Use a fixed seed for repeatable sampling when supported.',
        min: 0,
        max: 2147483647,
        step: 1,
        default: 0
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

const EMPTY_PARAMS = {};

export const ProviderParamsConfig = memo(({ providerKey }: { providerKey: string }) => {
    const providerParams = useSettingsStore(s => s.providerParams[providerKey] || EMPTY_PARAMS);
    const updateProviderParams = useSettingsStore(s => s.updateProviderParams);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const supportedParams = useMemo(() => {
        let profile = PROVIDER_CAPABILITY_PROFILES[providerKey];
        if (!profile) {
            // Custom providers key by `custom-*` id; derive from their wire protocol.
            const custom = useSettingsStore.getState().customProviders.find(p => p.id === providerKey);
            profile = custom?.apiFormat === 'anthropic_messages'
                ? PROVIDER_CAPABILITY_PROFILES.anthropic
                : DEFAULT_PROVIDER_CAPABILITY_PROFILE;
        }
        return profile.parameters.map(k => COMMON_PARAMS[k]).filter(Boolean);
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
                    <WorkbenchIcon name="lucide:settings-2" size={14} className="text-muted-foreground" />
                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Model Parameters</h4>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAdvanced(value => !value)}
                    className="rounded px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    {showAdvanced ? 'Hide advanced' : 'Advanced'}
                </button>
            </div>

            <div className="space-y-4">
                {/* Main Settings Group */}
                <div className="space-y-5 px-1">
                    {supportedParams.filter(p => ['temperature', 'maxTokens'].includes(p.id)).map(param => (
                        <div key={param.id} className="group space-y-2">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <label className="text-[11px] font-medium text-foreground truncate">
                                        {param.label}
                                    </label>
                                    {(providerParams[param.id] !== undefined && providerParams[param.id] !== param.default) && (
                                        <div className="h-1 w-1 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary) / 0.5)]" />
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {param.id !== 'stop' && (
                                        <>
                                            <button 
                                                onClick={() => resetParam(param.id, param.default)}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted/50 rounded transition-colors text-muted-foreground/70 hover:text-muted-foreground"
                                                title="Reset to default"
                                            >
                                                <WorkbenchIcon name="lucide:rotate-ccw" size={10} />
                                            </button>
                                            <input 
                                                type="number"
                                                value={providerParams[param.id] ?? param.default}
                                                onChange={(e) => handleParamChange(param.id, parseFloat(e.target.value))}
                                                step={param.step}
                                                className="w-14 h-6 px-1.5 text-[10px] font-mono font-bold bg-background border border-border rounded focus:outline-none focus:border-primary/50 text-primary text-right"
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
                                    className="w-full h-8 px-3 text-[10px] font-mono bg-background border border-border rounded text-primary placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
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
                                        className="w-full h-0.5 bg-muted rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-colors"
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Sampling Group */}
                {showAdvanced && <div className="mt-6 border-t border-border pt-4">
                    <div className="flex items-center gap-2 mb-4 px-1">
                        <WorkbenchIcon name="lucide:git-branch" size={12} className="text-muted-foreground/50 rotate-90" />
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sampling</span>
                    </div>
                    
                    <div className="space-y-4 px-1">
                        {supportedParams.filter(p => !['temperature', 'maxTokens', 'stop'].includes(p.id)).map(param => (
                            <div key={param.id} className="group space-y-2">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <label className="text-[11px] font-medium text-muted-foreground truncate">
                                            {param.label}
                                        </label>
                                        {(providerParams[param.id] !== undefined && providerParams[param.id] !== param.default) && (
                                            <div className="h-1 w-1 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary) / 0.5)]" />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button 
                                            onClick={() => resetParam(param.id, param.default)}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted/50 rounded transition-colors text-muted-foreground/70 hover:text-muted-foreground"
                                            title="Reset to default"
                                        >
                                            <WorkbenchIcon name="lucide:rotate-ccw" size={10} />
                                        </button>
                                        <input 
                                            type="number"
                                            value={providerParams[param.id] ?? param.default}
                                            onChange={(e) => handleParamChange(param.id, parseFloat(e.target.value))}
                                            step={param.step}
                                            className="w-14 h-6 px-1.5 text-[10px] font-mono font-bold bg-background border border-border rounded focus:outline-none focus:border-primary/50 text-primary text-right"
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
                                        className="w-full h-0.5 bg-muted rounded-full appearance-none cursor-pointer accent-blue-500/50 hover:accent-blue-400 transition-colors"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>}
            </div>

            <div className="mx-1 p-2.5 rounded-lg bg-primary/[0.02] border border-primary/10 flex gap-2.5">
                <WorkbenchIcon name="lucide:info" size={12} className="text-primary/40 shrink-0 mt-0.5" />
                <p className="text-[9px] text-primary/40 font-medium leading-relaxed">
                    Changes for <span className="text-primary font-bold uppercase">{providerKey}</span> apply to the next request.
                </p>
            </div>
        </div>
    );
});
