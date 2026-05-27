import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatApi } from '@/api';
import { useSysMetrics } from '@/hooks/useSysMetrics';
import { useUIStore } from '@/lib/stores/useUIStore';
import { useChatStore } from '@/lib/stores/useChatStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

// Widget component imports
import { ClockWidget } from '@/components/widgets/system/ClockWidget';
import { CpuWidget } from '@/components/widgets/system/CpuWidget';
import { MemoryWidget } from '@/components/widgets/system/MemoryWidget';
import { CpuMemWidget } from '@/components/widgets/system/CpuMemWidget';
import { TokenWidget } from '@/components/widgets/system/TokenWidget';
import { StreamingWidget } from '@/components/widgets/system/StreamingWidget';
import { LatencyWidget } from '@/components/widgets/system/LatencyWidget';
import { ModelWidget } from '@/components/widgets/system/ModelWidget';
import { ProviderWidget } from '@/components/widgets/system/ProviderWidget';
import { SessionsWidget } from '@/components/widgets/system/SessionsWidget';
import { UptimeWidget } from '@/components/widgets/system/UptimeWidget';
import { NetworkWidget } from '@/components/widgets/system/NetworkWidget';
import { GpuWidget } from '@/components/widgets/system/GpuWidget';
import { DiskWidget } from '@/components/widgets/system/DiskWidget';

import '@/components/widgets/system/system-widgets.css';
import type { WidgetContext } from '@/components/widgets/system/types';

const WIDGET_GROUPS = [
    {
        id: 'telemetry',
        title: 'CORE STATION METRICS',
        icon: 'solar:widget-3-bold',
        widgets: [
            { id: 'clock', label: 'CLOCK', icon: 'solar:clock-circle-bold', component: ClockWidget, span: 2 },
            { id: 'uptime', label: 'UPTIME', icon: 'solar:history-bold', component: UptimeWidget, span: 1 },
            { id: 'sessions', label: 'SESSIONS', icon: 'solar:chat-round-line-bold', component: SessionsWidget, span: 1 },
        ]
    },
    {
        id: 'llm',
        title: 'LLM COMPUTE ENGINE',
        icon: 'solar:cpu-bolt-bold',
        widgets: [
            { id: 'model', label: 'MODEL', icon: 'solar:globus-bold', component: ModelWidget, span: 2 },
            { id: 'provider', label: 'PROVIDER', icon: 'solar:cloud-bold', component: ProviderWidget, span: 2 },
            { id: 'streaming', label: 'STREAMING', icon: 'solar:transmission-bold', component: StreamingWidget, span: 2 },
            { id: 'latency', label: 'LATENCY', icon: 'solar:playback-speed-bold', component: LatencyWidget, span: 2 },
            { id: 'token', label: 'TOKEN USAGE', icon: 'solar:ticket-bold', component: TokenWidget, span: 4 },
        ]
    },
    {
        id: 'hardware',
        title: 'HARDWARE & TELEMETRY',
        icon: 'solar:server-bold',
        widgets: [
            { id: 'cpu_mem', label: 'CPU & RAM COMPACT', icon: 'solar:server-path-bold', component: CpuMemWidget, span: 4 },
            { id: 'cpu', label: 'CPU LOAD (16 CORES)', icon: 'solar:cpu-bold', component: CpuWidget, span: 4 },
            { id: 'memory', label: 'RAM POINTMAP', icon: 'solar:ssd-bold', component: MemoryWidget, span: 4 },
            { id: 'gpu', label: 'GPU COPROCESSOR', icon: 'solar:gamepad-bold', component: GpuWidget, span: 4 },
            { id: 'network', label: 'NETWORK INTERFACES', icon: 'solar:feed-bold', component: NetworkWidget, span: 4 },
            { id: 'disk', label: 'STORAGE VOLUMES', icon: 'solar:disk-bold', component: DiskWidget, span: 4 },
        ]
    }
];

export function SystemDiagnostics() {
    const metrics = useSysMetrics(2000);
    const { activeModel, activeProvider, appUptimeSecs } = useUIStore();
    const messages = useChatStore((s) => s.messages) || [];
    const isStreaming = useChatStore((s) => s.isStreaming) || false;
    const { data: sessions = [] } = useQuery({
        queryKey: ['sessions'],
        queryFn: async () => (await chatApi.listChatsPage(500, 0)).items,
        staleTime: 30_000,
    });

    // Simulated latency tracker
    const [simulatedLatency, setSimulatedLatency] = useState<number | null>(null);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isStreaming) {
            const updateLatency = () => {
                setSimulatedLatency(Math.round(80 + Math.random() * 120));
                timer = setTimeout(updateLatency, 1000 + Math.random() * 1000);
            };
            updateLatency();
        } else {
            // Settle to null (idle)
            setSimulatedLatency(null);
        }
        return () => clearTimeout(timer);
    }, [isStreaming]);

    // Group collapse state
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    const toggleGroup = (id: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    // Calculate real-time token metrics based on character count of active messages
    const tokenStats = useMemo(() => {
        let promptCharCount = 0;
        let completionCharCount = 0;
        let reasoningCharCount = 0;

        messages.forEach(m => {
            if (m.role === 'user' || m.role === 'system') {
                promptCharCount += (m.content || '').length;
            } else if (m.role === 'assistant') {
                completionCharCount += (m.content || '').length;
                if (m.reasoning) {
                    reasoningCharCount += m.reasoning.length;
                }
            }
        });

        // ~4 characters per token
        const promptTokens = Math.max(0, Math.ceil(promptCharCount / 4));
        const completionTokens = Math.max(0, Math.ceil(completionCharCount / 4));
        const thinkingTokens = reasoningCharCount > 0 ? Math.ceil(reasoningCharCount / 4) : null;
        const tokensUsed = promptTokens + completionTokens + (thinkingTokens || 0);

        return {
            promptTokens,
            completionTokens,
            thinkingTokens,
            tokensUsed,
            tokensLimit: 131072
        };
    }, [messages]);

    // Unified context
    const context: WidgetContext = useMemo(() => ({
        ...metrics,
        activeModel: activeModel || null,
        activeProvider: activeProvider || null,
        isStreaming,
        apiLatencyMs: isStreaming ? simulatedLatency : null,
        tokensUsed: tokenStats.tokensUsed,
        tokensLimit: tokenStats.tokensLimit,
        promptTokens: tokenStats.promptTokens,
        completionTokens: tokenStats.completionTokens,
        thinkingTokens: tokenStats.thinkingTokens,
        sessionCount: sessions.length,
        appUptimeSecs,
        ollamaConnected: activeProvider === 'ollama',
    }), [metrics, activeModel, activeProvider, isStreaming, simulatedLatency, tokenStats, sessions.length, appUptimeSecs]);

    return (
        <div className="flex flex-col gap-4 p-1 text-zinc-300 select-none">
            {/* Global Header */}
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2 px-1">
                <div className="flex items-center gap-2">
                    <WorkbenchIcon name="solar:widget-bold" size={14} className="text-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-emerald-400">TELEMETRY LINK ACTIVE</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-[9px] font-mono font-bold text-emerald-400 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <span>STABLE</span>
                </div>
            </div>

            {/* Widget Groups */}
            {WIDGET_GROUPS.map((group) => {
                const isCollapsed = collapsedGroups[group.id];
                return (
                    <div key={group.id} className="flex flex-col border border-zinc-800/40 rounded bg-zinc-950/20 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => toggleGroup(group.id)}
                            className="flex items-center justify-between px-3 py-2 bg-zinc-900/40 hover:bg-zinc-800/30 transition-colors border-b border-zinc-800/40 cursor-pointer w-full text-left"
                        >
                            <div className="flex items-center gap-2 text-[10px] font-mono font-bold tracking-widest text-zinc-400">
                                <WorkbenchIcon name={group.icon} size={12} className="text-emerald-400/80" />
                                <span>{group.title}</span>
                            </div>
                            <WorkbenchIcon
                                name={isCollapsed ? "solar:alt-arrow-down-bold" : "solar:alt-arrow-up-bold"}
                                size={12}
                                className="text-zinc-500"
                            />
                        </button>

                        {!isCollapsed && (
                            <div className="p-2 grid grid-cols-4 gap-2 transition-all duration-300">
                                {group.widgets.map((widget) => {
                                    const colSpanClass =
                                        widget.span === 1 ? 'col-span-1' :
                                        widget.span === 2 ? 'col-span-2' :
                                        widget.span === 3 ? 'col-span-3' : 'col-span-4';

                                    return (
                                        <div
                                            key={widget.id}
                                            className={`${colSpanClass} bg-zinc-900/10 border border-zinc-800/20 rounded p-2 flex flex-col gap-1.5 hover:border-zinc-700/30 transition-all`}
                                        >
                                            <div className="flex items-center gap-1.5 border-b border-zinc-800/40 pb-1 text-zinc-500 text-[8.5px] font-mono tracking-wider font-bold uppercase">
                                                <WorkbenchIcon name={widget.icon} size={10} className="text-emerald-400/60" />
                                                <span>{widget.label}</span>
                                            </div>
                                            <div className="pt-0.5 flex-1 flex flex-col justify-center">
                                                <widget.component context={context} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
