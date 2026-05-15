import { useEffect, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAgentActivityStore, ActiveAgentTask } from '@/lib/stores/agentActivityStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { cn } from '@/lib/utils/style';
import { motion, AnimatePresence } from 'framer-motion';

// --- Helpers ---

function formatAgentName(agentId: string): string {
    const names: Record<string, string> = {
        generalist: 'ZEN',
        tactical_expert: 'ZEN-TAC',
        researcher: 'ZEN-DOCS',
        space_observer: 'ZEN-COSMOS',
    };
    return names[agentId.toLowerCase()] || agentId;
}

const AGENT_ICONS: Record<string, string> = {
    generalist: 'lucide:cpu',
    tactical_expert: 'lucide:target',
    researcher: 'lucide:search',
    space_observer: 'lucide:telescope',
};

function AgentIcon({ agentId, size = 16, className }: { agentId: string; size?: number; className?: string }) {
    const iconName = AGENT_ICONS[agentId.toLowerCase()] || 'lucide:circuit-board';
    return <WorkbenchIcon name={iconName} size={size} className={className} />;
}

// --- Status Badge ---

function StatusBadge({ status, progress }: { status: ActiveAgentTask['status']; progress?: number }) {
    const statusConfig = {
        pending: { icon: 'lucide:clock', color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Pending' },
        in_progress: { icon: 'lucide:refresh-cw', color: 'text-primary', bg: 'bg-primary/10', label: 'Running' },
        completed: { icon: 'lucide:check-circle', color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Done' },
        failed: { icon: 'lucide:alert-circle', color: 'text-red-500', bg: 'bg-red-500/10', label: 'Failed' },
    };

    const config = statusConfig[status];
    return (
        <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", config.bg, config.color)}>
            <WorkbenchIcon name={config.icon} size={10} className={cn(status === 'in_progress' && "animate-spin")} />
            <span>
                {status === 'in_progress' && progress ? `${Math.round(progress)}%` : config.label}
            </span>
        </div>
    );
}

// --- Task Card ---

function TaskCard({ task, onExpand, isExpanded }: { task: ActiveAgentTask; onExpand: (id: string) => void; isExpanded: boolean }) {
    const duration = task.completedAt && task.startedAt 
        ? task.completedAt - task.startedAt 
        : task.durationMs;

    return (
        <div className={cn(
            "group border rounded-lg overflow-hidden transition-all duration-200",
            task.status === 'in_progress' ? "border-primary/30 bg-primary/5 shadow-[0_0_15px_rgba(139,92,246,0.1)]" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
        )}>
            <div className="p-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <AgentIcon agentId={task.agentId} size={14} className="text-zinc-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-300 truncate">
                            {task.agentName}
                        </span>
                        <div className="h-2 w-px bg-white/10" />
                        <span className="text-[9px] font-mono text-zinc-500">
                            {new Date(task.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                    </div>
                    <div className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {task.task}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={task.status} progress={task.progress} />
                    <WorkbenchButton 
                        variant="ghost" 
                        size="xs" 
                        onClick={() => onExpand(task.id)}
                        className="h-6 w-6 p-0"
                    >
                        <WorkbenchIcon 
                            name={isExpanded ? "lucide:chevron-up" : "lucide:chevron-down"} 
                            size={14} 
                            className="text-zinc-500" 
                        />
                    </WorkbenchButton>
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-white/5 bg-black/20"
                    >
                        <div className="p-3 space-y-3">
                            <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 uppercase tracking-tight">
                                <span>ID: {task.id.slice(0, 8)}...</span>
                                {duration && <span>DUR: {(duration / 1000).toFixed(2)}s</span>}
                            </div>
                            
                            {task.result && (
                                <div className="space-y-1">
                                    <div className="text-[9px] font-bold text-emerald-500/70 uppercase tracking-widest">Output</div>
                                    <pre className="text-[10px] font-mono bg-black/40 p-2 rounded border border-white/5 overflow-x-auto text-zinc-400">
                                        {typeof task.result === 'string' ? task.result : JSON.stringify(task.result, null, 2)}
                                    </pre>
                                </div>
                            )}
                            
                            {task.error && (
                                <div className="space-y-1">
                                    <div className="text-[9px] font-bold text-red-500/70 uppercase tracking-widest">Error</div>
                                    <div className="text-[10px] font-mono bg-red-500/5 p-2 rounded border border-red-500/10 text-red-400/80">
                                        {task.error}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {task.status === 'in_progress' && (
                <div className="h-0.5 w-full bg-zinc-900 overflow-hidden">
                    <motion.div 
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${task.progress}%` }}
                        transition={{ duration: 0.5 }}
                    />
                </div>
            )}
        </div>
    );
}

// --- Main Component ---

export function AgentTaskBoard() {
    const { activeTasks, addTask, updateTask, completeTask, clearTasks } = useAgentActivityStore();
    const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        const unlistenSpawn = listen('agent:spawn', (e: any) => {
            const { parent_agent, child_agent, task, chat_id, spawn_id } = e.payload;
            addTask({
                id: spawn_id || `spawn_${Date.now()}`,
                agentId: child_agent,
                agentName: formatAgentName(child_agent),
                task: task,
                status: 'in_progress',
                parentAgentId: parent_agent,
                chatId: chat_id,
            });
        });

        const unlistenProgress = listen('orchestrator:progress', (e: any) => {
            const { spawn_id, progress, message } = e.payload;
            if (spawn_id) {
                updateTask(spawn_id, { 
                    progress: progress,
                    task: message || undefined 
                });
            }
        });

        const unlistenComplete = listen('agent:complete', (e: any) => {
            const { spawn_id, status, result, error } = e.payload;
            if (spawn_id) {
                completeTask(
                    spawn_id, 
                    status === 'completed' ? 'completed' : 'failed',
                    result,
                    error,
                    Date.now()
                );
            }
        });

        return () => {
            unlistenSpawn.then(f => f());
            unlistenProgress.then(f => f());
            unlistenComplete.then(f => f());
        };
    }, [addTask, updateTask, completeTask]);

    const toggleExpand = useCallback((id: string) => {
        setExpandedTasks(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const inProgressTasks = activeTasks.filter(t => t.status === 'in_progress' || t.status === 'pending');
    const completedTasks = activeTasks.filter(t => t.status === 'completed' || t.status === 'failed');

    return (
        <div className="flex flex-col gap-4 h-full">
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <WorkbenchIcon name="lucide:git-branch" size={14} className="text-primary" />
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300">Agent Operations</h3>
                    {inProgressTasks.length > 0 && (
                        <div className="flex items-center justify-center h-4 px-1.5 rounded-full bg-primary/20 text-primary text-[9px] font-bold">
                            {inProgressTasks.length}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <WorkbenchButton 
                        variant="ghost" 
                        size="xs" 
                        onClick={() => setIsVisible(!isVisible)}
                        className="text-[9px] h-6"
                    >
                        {isVisible ? 'HIDE' : 'SHOW'}
                    </WorkbenchButton>
                    <WorkbenchButton 
                        variant="ghost" 
                        size="xs" 
                        onClick={clearTasks}
                        className="text-[9px] h-6 text-zinc-500 hover:text-red-400"
                    >
                        CLEAR
                    </WorkbenchButton>
                </div>
            </header>

            {isVisible && (
                <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-1">
                    {activeTasks.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                            <WorkbenchIcon name="lucide:cpu" size={32} className="mb-4" />
                            <p className="text-xs font-medium">No active operations</p>
                            <p className="text-[10px] mt-1 max-w-[200px]">Sub-agents will appear here when spawned during an investigation.</p>
                        </div>
                    )}

                    {inProgressTasks.length > 0 && (
                        <section className="space-y-3">
                            <h4 className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Active</h4>
                            <div className="space-y-2">
                                {inProgressTasks.map(task => (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        onExpand={toggleExpand}
                                        isExpanded={expandedTasks.has(task.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {completedTasks.length > 0 && (
                        <section className="space-y-3">
                            <h4 className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest pl-1">History</h4>
                            <div className="space-y-2">
                                {completedTasks.map(task => (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        onExpand={toggleExpand}
                                        isExpanded={expandedTasks.has(task.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}
