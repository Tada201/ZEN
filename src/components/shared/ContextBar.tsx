import { useMemo } from 'react';
import { useChatStore } from '@/lib/stores/useChatStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

export function ContextBar() {
    const sessions = useChatStore(s => s.sessions);
    const activeSessionId = useChatStore(s => s.activeSessionId);
    const activeSession = sessions.find(s => s.id === activeSessionId);

    const estimatedTokens = useMemo(() => {
        if (!activeSession) return 0;
        const base = activeSession.title.length + activeSession.systemPrompt.length + (activeSession.tokenCount ?? 0) * 4;
        return Math.max(activeSession.tokenCount ?? 0, Math.ceil(base / 4));
    }, [activeSession]);

    const maxTokens = 32768;
    const percentage = Math.min(100, (estimatedTokens / maxTokens) * 100);
    const energyKj = (estimatedTokens * 0.1) / 1000;
    const barColor = percentage > 90 ? '#fb7185' : percentage > 70 ? '#f59e0b' : '#22d3ee';

    return (
        <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3" title={`Context usage: ${estimatedTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens`}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <WorkbenchIcon name="solar:cpu-bold" size={11} />
                    <span>Context Load & Energy Cost</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] text-slate-500">
                    <span>ENERGY <b className="text-slate-300">{energyKj.toFixed(2)} KJ</b></span>
                    <span>LOAD <b className="text-slate-300">{percentage.toFixed(1)}%</b></span>
                </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full transition-all" style={{ width: `${percentage}%`, backgroundColor: barColor, boxShadow: `0 0 12px ${barColor}66` }} />
            </div>
        </div>
    );
}
