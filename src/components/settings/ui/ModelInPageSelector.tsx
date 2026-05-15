import { memo } from 'react';
import { cn } from '@/lib/utils';

interface ModelInPageSelectorProps {
    models: string[];
    selectedModel: string;
    onSelect: (model: string) => void;
    disabled?: boolean;
}

export const ModelInPageSelector = memo(({ models, selectedModel, onSelect, disabled }: ModelInPageSelectorProps) => {
    if (models.length === 0) {
        return (
            <div className="w-full max-w-lg px-4 py-8 bg-slate-900/30 border border-white/5 rounded-xl text-center">
                <span className="text-[11px] text-slate-500 uppercase tracking-widest font-bold">No Models Available</span>
            </div>
        );
    }

    return (
        <div className="w-full max-w-lg">
            <div className="grid grid-cols-2 gap-2">
                {models.map(model => {
                    const isSelected = model === selectedModel;
                    return (
                        <button
                            key={model}
                            onClick={() => !disabled && onSelect(model)}
                            disabled={disabled}
                            className={cn(
                                "flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition-all duration-200",
                                isSelected
                                    ? "bg-brand-purple/10 border-brand-purple/30 text-brand-purple-bright shadow-[0_0_12px_rgba(147,51,234,0.1)]"
                                    : "bg-slate-900/30 border-white/5 text-slate-300 hover:border-white/10 hover:bg-slate-900/50",
                                disabled && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                isSelected ? "bg-brand-purple shadow-[0_0_6px_rgba(147,51,234,0.5)]" : "bg-slate-600"
                            )} />
                            <span className="text-[11px] font-bold font-mono truncate">{model}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
});