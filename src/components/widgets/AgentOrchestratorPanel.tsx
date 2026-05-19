import React, { useMemo, useState, useEffect } from 'react';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { useChatStore } from '../../lib/stores/useChatStore';
import { useAgentActivityStore, type ActiveAgentTask, type AgentActivity } from '../../lib/stores/agentActivityStore';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownContent } from '../../atlas/components/chat/MarkdownContent';
import './agent-orchestrator.css';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';

/** Formats duration into a readable string */
function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

const AGENT_ICONS: Record<string, string> = {
    generalist: 'codicon:circuit-board',
    tactical_expert: 'codicon:target',
    researcher: 'codicon:search',
    space_observer: 'codicon:telescope',
};

export function AgentOrchestratorPanel() {
    const activeSessionId = useChatStore(s => s.activeSessionId);
    const { activeTasks, selectedTaskId, setSelectedTaskId, clearTasks, removeTask, cancelTask, activities } = useAgentActivityStore();

    const selectedTask = useMemo(() => 
        activeTasks.find(t => t.id === selectedTaskId), 
    [activeTasks, selectedTaskId]);

    const taskLogs = useMemo(() => {
        if (!selectedTask) return [];
        return activities.filter(a => 
            a.chatId === selectedTask.chatId && 
            (a.agentId === selectedTask.agentId || a.agentName === selectedTask.agentName)
        );
    }, [activities, selectedTask]);

    const sessionTasks = activeTasks.filter(t => t.chatId === activeSessionId);
    const crossSessionTasks = activeTasks.filter(t => t.chatId !== activeSessionId);

    const runningTasks = sessionTasks.filter(t => t.status === 'in_progress');
    const pendingTasks = sessionTasks.filter(t => t.status === 'pending');
    const historyTasks = sessionTasks.filter(t => t.status === 'completed' || t.status === 'failed');

    // Bird's Eye View Renderer
    const renderBirdsEye = () => (
        <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            className="agent-birds-eye h-full flex flex-col custom-scrollbar"
        >
            <div className="agent-birds-eye__header">
                <div className="flex items-center gap-3">
                    <WorkbenchIcon name="codicon:dashboard" size={16} className="text-[#00ff9f]" />
                    <span className="agent-birds-eye__title font-mono tracking-[0.4em]">ORCHESTRATOR_DASHBOARD</span>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#00ff9f] animate-pulse shadow-[0_0_8px_rgba(0,255,159,0.8)]" />
                        <span className="text-[10px] font-mono text-[#00ff9f] uppercase">{runningTasks.length} ACTIVE</span>
                    </div>
                    {activeTasks.length > 0 && (
                        <WorkbenchButton 
                            onClick={clearTasks}
                            className="p-1.5 hover:bg-red-500/10 rounded-md text-white/20 hover:text-red-500 transition-colors"
                            title="Purge Global Logs"
                        >
                            <WorkbenchIcon name="codicon:trash" size={14} />
                        </WorkbenchButton>
                    )}
                </div>
            </div>

            {activeTasks.length === 0 ? (
                <div className="flex-grow flex flex-col items-center justify-center opacity-10 pointer-events-none scale-110">
                    <WorkbenchIcon name="codicon:git-branch" size={80} />
                    <div className="mt-6 text-[12px] uppercase tracking-[0.8em] font-bold text-white">NO_ACTIVE_NODES</div>
                </div>
            ) : (
                <div className="agent-birds-eye__grid pb-20">
                    {/* Active Cluster */}
                    {runningTasks.length > 0 && (
                        <div className="col-span-full mb-2">
                            <div className="text-[10px] text-[#00ff9f]/40 font-bold uppercase tracking-[0.3em] px-4 py-2 border-b border-[#00ff9f]/10">ACTIVE_NODES</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                                {runningTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} onCancel={() => cancelTask(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pending Queue */}
                    {pendingTasks.length > 0 && (
                        <div className="col-span-full mb-2">
                            <div className="text-[10px] text-yellow-500/40 font-bold uppercase tracking-[0.3em] px-4 py-2 border-b border-yellow-500/10">PENDING_QUEUE</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 opacity-60">
                                {pendingTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} onCancel={() => cancelTask(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Session History */}
                    {historyTasks.length > 0 && (
                        <div className="col-span-full mb-2">
                            <div className="text-[10px] text-white/20 font-bold uppercase tracking-[0.3em] px-4 py-2 border-b border-white/5">SESSION_ARCHIVE</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                                {historyTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Cross-Session History */}
                    {crossSessionTasks.length > 0 && (
                        <div className="col-span-full mt-10">
                            <div className="text-[10px] text-white/10 font-bold uppercase tracking-[0.3em] px-4 py-2 border-b border-white/5 flex items-center gap-2">
                                <WorkbenchIcon name="codicon:history" size={12} /> CROSS_SESSION_REGISTRY
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 opacity-30 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-500">
                                {crossSessionTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );

    // Workspace View Renderer
    const renderWorkspace = () => {
        if (!selectedTask) return null;
        
        return (
            <motion.div 
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="agent-workspace"
            >
                <div className="agent-workspace__header">
                    <WorkbenchButton 
                        onClick={() => setSelectedTaskId(null)}
                        className="back-button"
                        title="Return to Dashboard"
                    >
                        <WorkbenchIcon name="codicon:chevron-left" size={20} />
                    </WorkbenchButton>
                    
                    <div className="flex items-center gap-4 flex-grow">
                        <div className="task-item__icon w-10 h-10 rounded-lg bg-[#00ff9f]/10 border border-[#00ff9f]/20 flex items-center justify-center text-[#00ff9f] shadow-[inset_0_0_15px_rgba(0,255,159,0.1)]">
                            <WorkbenchIcon name={AGENT_ICONS[selectedTask.agentId] || 'codicon:circuit-board'} size={22} />
                        </div>

                        <div className="flex flex-col">
                            <div className="text-[14px] font-bold text-white uppercase tracking-wider mb-0.5">{selectedTask.agentName}</div>
                            <div className="text-[10px] text-white/30 font-mono flex items-center gap-2">
                                <span className="text-[#00ff9f]/50">NODE_ID:</span> {selectedTask.id.includes('__') ? selectedTask.id.split('__')[1] : selectedTask.agentId || 'ORCH-01'}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <StatusBadge task={selectedTask} />
                        <WorkbenchButton 
                            onClick={() => { removeTask(selectedTask.id); setSelectedTaskId(null); }}
                            className="p-2 hover:bg-red-500/10 rounded-md text-white/20 hover:text-red-500 transition-colors"
                        >
                            <WorkbenchIcon name="codicon:trash" size={18} />
                        </WorkbenchButton>
                    </div>
                </div>

                <div className="agent-workspace__content">
                    <div className="agent-workspace__task-info p-6 border-b border-white/5 bg-white/[0.01] relative overflow-hidden">
                        <div className="flex items-center gap-2 text-[10px] text-[#00ff9f]/40 uppercase tracking-[0.3em] mb-3 font-bold">
                            <WorkbenchIcon name="codicon:target" size={14} className="opacity-50" /> MISSION_OBJECTIVE
                        </div>

                        <div className="text-[12px] text-white/90 leading-relaxed font-mono relative z-10 p-5 bg-black/40 border border-white/5 rounded-sm backdrop-blur-sm">
                            {selectedTask.task}
                        </div>
                        <div className="absolute top-[-20px] right-[-20px] opacity-[0.02] pointer-events-none">
                            <WorkbenchIcon name={AGENT_ICONS[selectedTask.agentId] || 'codicon:circuit-board'} size={120} />
                        </div>
                    </div>

                    <div className="agent-workspace__telemetry custom-scrollbar h-full">
                        <div className="telemetry-header sticky top-0 bg-black/80 backdrop-blur-md z-20 px-6 py-3 border-b border-white/5 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-white/50 tracking-[0.2em] uppercase">
                                <WorkbenchIcon name="codicon:zap" size={14} className="text-[#00ff9f]" /> TASK_CHRONICLE
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="text-[10px] font-mono text-[#00ff9f]/40">
                                    LOGPACKETS: {taskLogs.length}
                                </div>
                                <div className="text-[10px] font-mono text-white/20 flex items-center gap-2">
                                    <WorkbenchIcon name="codicon:clock" size={10} />
                                    <ElapsedTime start={selectedTask.startedAt} end={selectedTask.completedAt} />
                                </div>
                            </div>
                        </div>

                        <div className="agent-workspace__logs px-6">
                            {taskLogs.length === 0 ? (
                                <div className="py-40 flex flex-col items-center justify-center text-white/5 text-[11px] uppercase font-mono italic gap-6 tracking-[0.4em]">
                                    <WorkbenchIcon name="codicon:pulse" size={48} className="animate-pulse opacity-10" />
                                    SYNCING_DATA_LINK...
                                </div>
                            ) : (
                                <div className="space-y-0 py-4">
                                    {taskLogs.map((log, idx) => (
                                        <MemoizedLogEntry key={log.id} log={log} isLast={idx === taskLogs.length - 1} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {!!selectedTask.result && (
                    <div className="agent-workspace__footer p-6 bg-[#080B08] border-t border-[#00ff9f]/10">
                        <div className="text-[11px] text-green-500/60 uppercase tracking-[0.4em] mb-3 font-bold flex items-center gap-3">
                            <WorkbenchIcon name="codicon:check" size={16} /> RESOLUTION_PAYLOAD
                        </div>

                        <div className="text-[12px] text-green-500/80 bg-green-500/[0.03] p-5 border border-green-500/20 rounded-md overflow-auto max-h-[250px] custom-scrollbar font-mono leading-loose shadow-[0_0_30px_rgba(34,197,94,0.05)]">
                            {typeof selectedTask.result === 'string' ? (selectedTask.result as string) : JSON.stringify(selectedTask.result, null, 2)}
                        </div>
                    </div>
                )}

                {selectedTask.error && (
                    <div className="agent-workspace__footer p-6 bg-red-950/10 border-t border-red-500/20">
                        <div className="text-[11px] text-red-500/80 uppercase tracking-widest mb-3 font-bold flex items-center gap-2">
                            <WorkbenchIcon name="codicon:error" size={16} /> SYSTEM_FAULT_DETECTED
                        </div>

                        <div className="text-[12px] text-red-500/90 bg-red-500/5 p-5 border border-red-500/20 rounded-md font-mono leading-relaxed">
                            {selectedTask.error}
                        </div>
                    </div>
                )}
            </motion.div>
        );
    };

    return (
        <div className="agent-orchestrator animate-fade-in">
            <AnimatePresence mode="wait">
                {selectedTaskId ? renderWorkspace() : renderBirdsEye()}
            </AnimatePresence>
        </div>
    );
}

function TaskCard({ task, onClick, onCancel }: { task: ActiveAgentTask; onClick: () => void; onCancel?: () => void }) {
    const iconName = AGENT_ICONS[task.agentId] || 'codicon:circuit-board';
    const isRunning = task.status === 'in_progress';
    const isPending = task.status === 'pending';

    return (
        <motion.div 
            whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
            whileTap={{ scale: 0.98 }}
            className={`agent-card ${isRunning ? 'agent-card--active' : ''}`} 
            onClick={onClick}
        >
            <div className="agent-card__header flex items-center justify-between gap-4">
                <div className="agent-card__identity flex items-center gap-4">
                    <div className={`agent-card__icon w-10 h-10 size-10 flex items-center justify-center rounded-lg ${isRunning ? 'bg-[#00ff9f]/10 text-[#00ff9f] shadow-[0_0_15px_rgba(0,255,159,0.2)]' : 'bg-white/5 text-white opacity-40'}`}>
                        <WorkbenchIcon name={iconName} size={20} />
                    </div>

                    <div>
                        <div className={`agent-card__name text-[11px] font-bold uppercase tracking-widest ${isRunning ? 'text-[#00ff9f]' : 'text-white/60'}`}>
                            {task.agentName}
                        </div>
                        <div className="agent-card__id text-[8px] font-mono opacity-20">
                            {task.id.split('__')[0].substring(0, 8)} | STMR_{task.id.substring(task.id.length - 4)}
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <StatusIcon status={task.status} />
                    {(isRunning || isPending) && <ElapsedTime start={task.startedAt} />}
                </div>
            </div>

            <div className="agent-card__task text-[10px] leading-relaxed text-white/50 italic h-12 overflow-hidden line-clamp-2 px-1 mb-2">
                {task.task}
            </div>

            {onCancel && (isRunning || isPending) && (
                <WorkbenchButton 
                    onClick={(e) => { e.stopPropagation(); onCancel(); }}
                    className="w-full py-1 text-[8px] font-bold tracking-[0.2em] border border-red-500/20 hover:bg-red-500/10 text-red-500/50 hover:text-red-500 rounded transition-all uppercase mb-2"
                >
                    ABORT_TASK
                </WorkbenchButton>
            )}

            <div className="agent-card__stats flex items-center justify-between border-t border-white/5 pt-3 mt-1">
                <div className="flex items-center gap-2 text-[8px] font-mono text-white/20 uppercase tracking-tighter">
                    <WorkbenchIcon name="codicon:clock" size={10} /> 
                    TS_{new Date(task.startedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>

                <div className="flex items-center gap-1 group">
                    <span className="text-[9px] font-bold text-white/30 group-hover:text-[#00ff9f] transition-colors uppercase tracking-widest">Workspace</span>
                    <WorkbenchIcon name="codicon:link-external" size={10} className="text-white/20 group-hover:text-[#00ff9f] transition-all" />
                </div>
            </div>

            {isRunning && (
                <div className="agent-card__progress-bar absolute bottom-0 left-0 h-[2px] bg-[#00ff9f] shadow-[0_0_10px_rgba(0,255,159,0.8)] animate-pulse" style={{ width: '100%' }} />
            )}
        </motion.div>
    );
}

function StatusIcon({ status }: { status: ActiveAgentTask['status'] }) {
    switch (status) {
        case 'completed': return <WorkbenchIcon name="codicon:check" size={16} className="text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.4)]" />;
        case 'failed': return <WorkbenchIcon name="codicon:error" size={16} className="text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]" />;
        case 'in_progress': return <WorkbenchIcon name="codicon:pulse" size={16} className="text-[#00ff9f] animate-pulse" />;
        default: return <WorkbenchIcon name="codicon:clock" size={16} className="text-yellow-500 opacity-50" />;
    }
}

function StatusBadge({ task }: { task: ActiveAgentTask }) {
    const config = {
        pending: { icon: 'codicon:clock', color: 'text-yellow-500', label: 'NODE_PENDING' },
        in_progress: { icon: 'codicon:pulse', color: 'text-neon', label: 'MISSION_ACTIVE' },
        completed: { icon: 'codicon:check', color: 'text-green-500', label: 'MISSION_SUCCESS' },
        failed: { icon: 'codicon:error', color: 'text-red-500', label: 'CRITICAL_FAULT' },
    }[task.status];

    return (
        <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded bg-black border border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]`}>
            <WorkbenchIcon name={config.icon} size={12} className={config.color === 'text-neon' ? 'text-[#00ff9f]' : config.color} />
            <span className={`text-[10px] font-bold tracking-[0.2em] font-mono ${config.color === 'text-neon' ? 'text-[#00ff9f]' : config.color}`}>
                {task.status === 'in_progress' ? (
                    <>ELAPSED_<ElapsedTime start={task.startedAt} /></>
                ) : config.label}
            </span>
        </div>
    );
}

function ElapsedTime({ start, end }: { start: number; end?: number | null }) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (end) return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [end]);

    const effectiveEnd = end || now;
    return <>{formatDuration(effectiveEnd - start)}</>;
}

const MemoizedLogEntry = React.memo(LogEntry);

function LogEntry({ log, isLast }: { log: AgentActivity; isLast: boolean }) {
    const time = new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Determine if this should look like a chat bubble
    const isChatType = log.type === 'commentary' || log.type === 'status';

    return (
        <div className={`log-entry log-entry--${log.type} ${isLast ? 'log-entry--latest' : ''} ${isChatType ? 'log-entry--bubble' : ''} group py-2`}>
            {!isChatType && <span className="log-entry__time text-[9px] font-mono opacity-20 group-hover:opacity-40 transition-opacity">[{time}]</span>}
            {!isChatType && <span className="log-entry__type text-[9px] font-bold tracking-widest uppercase opacity-60 w-[100px] shrink-0">{log.type.toUpperCase().replace('_', ' ')}</span>}
            
            <div className={`flex flex-col gap-2 flex-grow min-w-0 ${isChatType ? 'chat-bubble-style' : ''}`}>
                <div className="log-entry__content text-[11px] text-white/70 leading-relaxed group-hover:text-white transition-colors">
                    <MarkdownContent content={log.message || log.type} />
                </div>
                
                {log.type === 'tool_call' && log.metadata && (
                    <div className="log-entry__meta bg-white/[0.02] p-4 rounded-md border-l-2 border-[#00ff9f]/30 overflow-hidden font-mono shadow-inner group-hover:bg-white/[0.04] transition-all">
                        <div className="flex items-center gap-2 mb-2">
                            <WorkbenchIcon name="codicon:zap" size={10} className="text-[#00ff9f]/60" />
                            <span className="text-[9px] text-[#00ff9f]/40 uppercase font-black tracking-widest">[DATA_PACKET_INSPECT]</span>
                        </div>

                        <div className="text-[10px] text-green-400 leading-tight overflow-x-auto">
                            <pre className="whitespace-pre-wrap break-all opacity-80">{JSON.stringify(log.metadata, null, 2)}</pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
