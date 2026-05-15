import React from 'react';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { useAgentActivityStore, ActiveAgentTask } from '@/lib/stores/agentActivityStore';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { cn } from '@/lib/utils/style';

// -- Agent color palette --
const AGENT_COLORS: Record<string, string> = {
    'zen':          '#8b5cf6',  // violet
    'generalist':   '#8b5cf6',
    'zen-tac':      '#f59e0b',  // amber
    'tactical_expert': '#f59e0b',
    'zen-docs':     '#06b6d4',  // cyan
    'researcher':   '#06b6d4',
    'zen-cosmos':   '#ec4899',  // pink
    'space_observer':'#ec4899',
};

function agentColor(agentId: string, agentName: string): string {
    const key = agentId.toLowerCase();
    const nameKey = agentName.toLowerCase().replace(/\s/g, '-');
    return AGENT_COLORS[key] ?? AGENT_COLORS[nameKey] ?? '#8b5cf6';
}

function formatDuration(startedAt: number, completedAt?: number): string {
    const ms = (completedAt ?? Date.now()) - startedAt;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

// -- Subcomponents --

function TaskCard({ task }: { task: ActiveAgentTask }) {
    const color = agentColor(task.agentId, task.agentName);
    const isRunning = task.status === 'in_progress' || task.status === 'pending';

    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3 border-l-2 bg-white/[0.02] border-white/5 rounded-r-lg space-y-2"
            style={{ borderLeftColor: color }}
        >
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>
                    {task.agentName}
                </span>
                <div className="flex items-center gap-2">
                    {isRunning && <WorkbenchIcon name="lucide:refresh-cw" size={10} className="animate-spin" style={{ color }} />}
                    {task.status === 'completed' && <WorkbenchIcon name="lucide:check" size={10} className="text-emerald-500" />}
                    {task.status === 'failed' && <WorkbenchIcon name="lucide:alert-circle" size={10} className="text-red-500" />}
                    <span className="text-[9px] font-mono text-zinc-500" style={{ color: isRunning ? color : undefined }}>
                        {formatDuration(task.startedAt, task.completedAt)}
                    </span>
                </div>
            </div>
            <div className="text-xs text-zinc-400 leading-snug">
                {task.task}
            </div>
            {task.parentAgentId && (
                <div className="flex items-center gap-1.5 opacity-40 text-[9px] font-mono text-zinc-500">
                    <WorkbenchIcon name="lucide:corner-down-right" size={9} />
                    <span>delegated by {task.parentAgentId}</span>
                </div>
            )}
        </motion.div>
    );
}

function OrchestratorPlanCard() {
    const { pendingPlan, setPendingPlan } = useAgentActivityStore();
    if (!pendingPlan?.battlePlan) return null;

    const { battlePlan } = pendingPlan;

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-4"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <WorkbenchIcon name="lucide:git-branch" size={14} className="text-amber-500" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">Orchestrator Plan</span>
                </div>
                <WorkbenchButton
                    variant="ghost"
                    size="xs"
                    onClick={() => setPendingPlan(null)}
                    className="h-6 w-6 p-0 text-zinc-500 hover:text-red-500"
                >
                    <WorkbenchIcon name="lucide:x" size={12} />
                </WorkbenchButton>
            </div>

            <div className="flex flex-wrap gap-2">
                {battlePlan.agentsNeeded.map((ag, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider"
                        style={{ borderColor: agentColor(ag.toLowerCase(), ag), color: agentColor(ag.toLowerCase(), ag), backgroundColor: `${agentColor(ag.toLowerCase(), ag)}10` }}>
                        {ag}
                    </span>
                ))}
            </div>

            <ol className="space-y-2">
                {battlePlan.steps.map((step, i) => (
                    <li key={i} className="text-xs text-zinc-400 flex gap-2">
                        <span className="text-amber-500/50 font-mono">{i + 1}.</span>
                        {step}
                    </li>
                ))}
            </ol>

            <div className="flex items-center justify-between pt-2 border-t border-amber-500/10">
                <div className="flex items-center gap-3 text-[9px] font-mono text-zinc-500">
                    <div className="flex items-center gap-1">
                        <WorkbenchIcon name="lucide:cpu" size={10} />
                        <span>~{battlePlan.estimatedTokens.toLocaleString()} tokens</span>
                    </div>
                    <div className={cn("font-bold", 
                        battlePlan.riskLevel === 'high' ? 'text-red-400' : 
                        battlePlan.riskLevel === 'medium' ? 'text-amber-400' : 'text-emerald-400'
                    )}>
                        {battlePlan.riskLevel.toUpperCase()} RISK
                    </div>
                </div>

                {pendingPlan.mode === 'manual' && (
                    <div className="flex items-center gap-2">
                        <WorkbenchButton
                            size="xs"
                            variant="primary"
                            onClick={async () => {
                                try {
                                    await invoke('approve_orchestrator_plan', { chatId: pendingPlan.chatId });
                                    setPendingPlan(null);
                                } catch (e) {
                                    console.error('Failed to approve:', e);
                                }
                            }}
                            className="text-[10px] h-7 bg-emerald-600 hover:bg-emerald-500"
                        >
                            APPROVE
                        </WorkbenchButton>
                        <WorkbenchButton
                            size="xs"
                            variant="destructive"
                            onClick={async () => {
                                try {
                                    await invoke('reject_orchestrator_plan', { chatId: pendingPlan.chatId });
                                    setPendingPlan(null);
                                } catch (e) {
                                    console.error('Failed to reject:', e);
                                }
                            }}
                            className="text-[10px] h-7"
                        >
                            REJECT
                        </WorkbenchButton>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// -- Main Panel --

export const AgentActivityPanel: React.FC<{
    isOpen: boolean;
    onClose: () => void;
}> = ({ isOpen, onClose }) => {
    const activities = useAgentActivityStore(s => s.activities);
    const activeTasks = useAgentActivityStore(s => s.activeTasks);
    const clearActivities = useAgentActivityStore(s => s.clearActivities);
    const clearTasks = useAgentActivityStore(s => s.clearTasks);
    
    const [tab, setTab] = React.useState<'live' | 'history'>('live');
    const [collapsedAgents, setCollapsedAgents] = React.useState<Set<string>>(new Set());

    const stats = React.useMemo(() => {
        const running = activeTasks.filter(t => t.status === 'in_progress').length;
        const completed = activeTasks.filter(t => t.status === 'completed').length;
        return { running, completed };
    }, [activeTasks]);

    const toggleAgent = (agentId: string) => {
        setCollapsedAgents(prev => {
            const next = new Set(prev);
            if (next.has(agentId)) next.delete(agentId); else next.add(agentId);
            return next;
        });
    };

    const grouped = React.useMemo(() => {
        const map = new Map<string, typeof activities>();
        activities.forEach(a => {
            const existing = map.get(a.agentId) ?? [];
            existing.push(a);
            map.set(a.agentId, existing);
        });
        return map;
    }, [activities]);

    const sortedTasks = React.useMemo(() => {
        return [...activeTasks].sort((a, b) => {
            if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
            if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
            return b.startedAt - a.startedAt;
        });
    }, [activeTasks]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex justify-end">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />

                <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="relative w-full max-w-md h-full bg-[#050506] border-l border-white/10 flex flex-col shadow-2xl"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <WorkbenchIcon name="lucide:activity" size={18} className="text-primary" />
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-zinc-200">Agent Operations</h3>
                                {stats.running > 0 && (
                                    <div className="text-[9px] font-bold text-primary animate-pulse uppercase tracking-wider mt-0.5">
                                        {stats.running} Active Processes
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <WorkbenchButton
                                variant="ghost"
                                onClick={() => { clearActivities(); clearTasks(); }}
                                className="text-[10px] text-zinc-500 hover:text-red-400"
                            >
                                CLEAR ALL
                            </WorkbenchButton>
                            <WorkbenchButton onClick={onClose} variant="ghost" className="h-8 w-8 p-0 text-zinc-500 hover:text-white">
                                <WorkbenchIcon name="lucide:x" size={18} />
                            </WorkbenchButton>
                        </div>
                    </div>

                    {/* Tab switcher */}
                    <div className="flex border-b border-white/5">
                        <button
                            className={cn(
                                "flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative",
                                tab === 'live' ? "text-primary" : "text-zinc-600 hover:text-zinc-400"
                            )}
                            onClick={() => setTab('live')}
                        >
                            Live Tasks
                            {tab === 'live' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                        </button>
                        <button
                            className={cn(
                                "flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative",
                                tab === 'history' ? "text-primary" : "text-zinc-600 hover:text-zinc-400"
                            )}
                            onClick={() => setTab('history')}
                        >
                            Operation Log
                            {tab === 'history' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                        {tab === 'live' && (
                            <div className="space-y-6">
                                <OrchestratorPlanCard />

                                {activeTasks.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
                                        <WorkbenchIcon name="lucide:pulse" size={40} className="mb-4" />
                                        <p className="text-sm font-bold uppercase tracking-widest">Idle State</p>
                                        <p className="text-xs mt-2 max-w-[240px]">No active sub-agent tasks in the current execution pipeline.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {sortedTasks.map(task => (
                                            <TaskCard key={task.id} task={task} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {tab === 'history' && (
                            grouped.size === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
                                    <WorkbenchIcon name="lucide:history" size={40} className="mb-4" />
                                    <p className="text-sm font-bold uppercase tracking-widest">No History</p>
                                    <p className="text-xs mt-2">Agent activities will be logged here during execution.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {Array.from(grouped.entries()).map(([agentId, agentActivities]) => {
                                        const isExpanded = !collapsedAgents.has(agentId);
                                        const name = agentActivities[0]?.agentName ?? agentId;
                                        const color = agentColor(agentId, name);
                                        return (
                                            <div key={agentId} className="space-y-2">
                                                <button
                                                    onClick={() => toggleAgent(agentId)}
                                                    className="w-full flex items-center gap-2 group"
                                                >
                                                    <WorkbenchIcon 
                                                        name={isExpanded ? "lucide:chevron-down" : "lucide:chevron-right"} 
                                                        size={12} 
                                                        style={{ color }} 
                                                    />
                                                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{name}</span>
                                                    <div className="flex-1 h-px bg-white/5 group-hover:bg-white/10 transition-colors" />
                                                    <span className="text-[9px] font-mono text-zinc-600">{agentActivities.length} OPS</span>
                                                </button>

                                                {isExpanded && (
                                                    <div className="pl-4 space-y-2 border-l border-white/5 ml-1.5 pt-1">
                                                        {agentActivities.slice().reverse().map((activity) => (
                                                            <div key={activity.id} className="flex gap-3 py-1 group">
                                                                <div className="mt-1">
                                                                    {activity.status === 'error'
                                                                        ? <WorkbenchIcon name="lucide:alert-circle" size={10} className="text-red-500" />
                                                                        : activity.status === 'success'
                                                                            ? <WorkbenchIcon name="lucide:check-circle" size={10} className="text-emerald-500" />
                                                                            : <WorkbenchIcon name="lucide:activity" size={10} style={{ color }} />
                                                                    }
                                                                </div>
                                                                <div className="space-y-1 min-w-0 flex-1">
                                                                    <div className="text-[11px] text-zinc-400 truncate group-hover:text-zinc-200 transition-colors">
                                                                        {activity.message ?? activity.type}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-[9px] font-mono text-zinc-600">
                                                                        <span>{new Date(activity.timestamp).toLocaleTimeString()}</span>
                                                                        {activity.duration && (
                                                                            <>
                                                                                <span>•</span>
                                                                                <span>{formatDuration(0, activity.duration)}</span>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
