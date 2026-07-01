import React, { useMemo, useState, useEffect } from 'react';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { useChatStore } from '@/lib/stores/useChatStore';
import { useAgentActivityStore, type ActiveAgentTask, type AgentActivity } from '@/lib/stores/agentActivityStore';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownContent } from '@/atlas/components/chat/MarkdownContent';
import './agent-orchestrator.css';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { LiveSessionExecution } from './AgentOrchestratorLiveSession';
import { EMPTY_MESSAGES, buildLiveAgentPanelModel } from './agentOrchestratorModel';

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
    const sessionMessages = useChatStore(s => activeSessionId ? s.sessionMessages[activeSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES);
    const isSessionStreaming = useChatStore(s => activeSessionId ? s.streamingChats[activeSessionId] ?? false : false);
    const activeTasks = useAgentActivityStore(s => s.activeTasks);
    const selectedTaskId = useAgentActivityStore(s => s.selectedTaskId);
    const setSelectedTaskId = useAgentActivityStore(s => s.setSelectedTaskId);
    const clearTasks = useAgentActivityStore(s => s.clearTasks);
    const removeTask = useAgentActivityStore(s => s.removeTask);
    const activities = useAgentActivityStore(s => s.activities);

    const liveModel = useMemo(() => buildLiveAgentPanelModel(sessionMessages), [sessionMessages]);

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

    const sessionTasks = useMemo(() => activeTasks.filter(t => t.chatId === activeSessionId), [activeSessionId, activeTasks]);
    const crossSessionTasks = useMemo(() => activeTasks.filter(t => t.chatId !== activeSessionId), [activeSessionId, activeTasks]);

    const runningTasks = useMemo(() => sessionTasks.filter(t => t.status === 'in_progress'), [sessionTasks]);
    const pendingTasks = useMemo(() => sessionTasks.filter(t => t.status === 'pending'), [sessionTasks]);
    const historyTasks = useMemo(() => sessionTasks.filter(t => t.status === 'completed' || t.status === 'failed'), [sessionTasks]);

    // Bird's Eye View Renderer
    const renderBirdsEye = () => (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="agent-birds-eye h-full flex flex-col custom-scrollbar"
        >
            <div className="agent-birds-eye__header">
                <div className="flex items-center gap-2">
                    <WorkbenchIcon name="codicon:dashboard" size={14} className="text-primary" />
                    <span className="agent-birds-eye__title font-mono tracking-wider">ORCHESTRATOR_DASHBOARD</span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
                        <span className="text-[11px] font-mono text-primary uppercase">{runningTasks.length} ACTIVE</span>
                    </div>
                    {activeTasks.length > 0 && (
                        <WorkbenchButton 
                            onClick={clearTasks}
                            className="p-1 hover:bg-destructive/10 rounded-sm text-muted-foreground hover:text-destructive transition-colors"
                            title="Purge Global Logs"
                        >
                            <WorkbenchIcon name="codicon:trash" size={13} />
                        </WorkbenchButton>
                    )}
                </div>
            </div>

            {!liveModel.message && activeTasks.length === 0 ? (
                <div className="flex-grow flex flex-col items-center justify-center opacity-25 pointer-events-none p-6 text-center">
                    <WorkbenchIcon name="codicon:git-branch" size={48} className="text-muted-foreground" />
                    <div className="mt-4 text-[11px] uppercase tracking-widest font-mono text-muted-foreground">NO_ACTIVE_NODES</div>
                </div>
            ) : (
                <div className="agent-birds-eye__grid pb-10">
                    {liveModel.message && (
                        <LiveSessionExecution model={liveModel} isStreaming={isSessionStreaming} />
                    )}

                    {/* Active Cluster */}
                    {runningTasks.length > 0 && (
                        <div className="border-b border-border">
                            <div className="text-[11px] text-primary bg-card font-bold uppercase tracking-wider px-3.5 py-1.5 border-b border-border flex items-center gap-1.5">
                                <WorkbenchIcon name="codicon:zap" size={12} className="text-primary" />
                                ACTIVE_NODES
                            </div>
                            <div className="flex flex-col divide-y divide-white/5">
                                {runningTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} onCancel={() => removeTask(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pending Queue */}
                    {pendingTasks.length > 0 && (
                        <div className="border-b border-border">
                            <div className="text-[11px] text-warning bg-card font-bold uppercase tracking-wider px-3.5 py-1.5 border-b border-border flex items-center gap-1.5">
                                <WorkbenchIcon name="codicon:clock" size={12} className="text-warning" />
                                PENDING_QUEUE
                            </div>
                            <div className="flex flex-col divide-y divide-white/5 opacity-80">
                                {pendingTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} onCancel={() => removeTask(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Session History */}
                    {historyTasks.length > 0 && (
                        <div className="border-b border-border">
                            <div className="text-[11px] text-muted-foreground bg-card font-bold uppercase tracking-wider px-3.5 py-1.5 border-b border-border flex items-center gap-1.5">
                                <WorkbenchIcon name="codicon:archive" size={12} className="text-muted-foreground" />
                                SESSION_ARCHIVE
                            </div>
                            <div className="flex flex-col divide-y divide-white/5">
                                {historyTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Cross-Session History */}
                    {crossSessionTasks.length > 0 && (
                        <div>
                            <div className="text-[11px] text-muted-foreground bg-card font-bold uppercase tracking-wider px-3.5 py-1.5 border-b border-border flex items-center gap-1.5">
                                <WorkbenchIcon name="codicon:history" size={12} className="text-muted-foreground" />
                                CROSS_SESSION_REGISTRY
                            </div>
                            <div className="flex flex-col divide-y divide-white/5 opacity-70">
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="agent-workspace"
            >
                <div className="agent-workspace__header">
                    <WorkbenchButton 
                        onClick={() => setSelectedTaskId(null)}
                        className="back-button"
                        title="Return to Dashboard"
                    >
                        <WorkbenchIcon name="codicon:chevron-left" size={18} />
                    </WorkbenchButton>
                    
                    <div className="flex items-center gap-2 flex-grow">
                        <div className="task-item__icon w-7 h-7 bg-primary/10 border border-primary/20 flex items-center justify-center text-primary rounded-sm">
                            <WorkbenchIcon name={AGENT_ICONS[selectedTask.agentId] || 'codicon:circuit-board'} size={15} />
                        </div>

                        <div className="flex flex-col">
                            <div className="text-[12px] font-bold text-foreground uppercase tracking-wider">{selectedTask.agentName}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                                NODE_ID: {selectedTask.id.includes('__') ? selectedTask.id.split('__')[1] : selectedTask.agentId || 'ORCH-01'}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <StatusBadge task={selectedTask} />
                        <WorkbenchButton 
                            onClick={() => { removeTask(selectedTask.id); setSelectedTaskId(null); }}
                            className="p-1.5 hover:bg-destructive/10 rounded-sm text-muted-foreground hover:text-destructive transition-colors"
                            title="Remove log entry"
                        >
                            <WorkbenchIcon name="codicon:trash" size={14} />
                        </WorkbenchButton>
                    </div>
                </div>

                <div className="agent-workspace__content">
                    <div className="agent-workspace__task-info p-3 px-4 border-b border-border bg-card">
                        <div className="flex items-center gap-1.5 text-[11px] text-primary uppercase tracking-wider mb-2 font-bold font-mono">
                            <WorkbenchIcon name="codicon:target" size={12} className="opacity-70" /> MISSION_OBJECTIVE
                        </div>

                        <div className="text-[12px] text-foreground leading-relaxed font-mono p-3 bg-muted border border-border rounded-md">
                            {selectedTask.task}
                        </div>
                    </div>

                    <div className="agent-workspace__telemetry custom-scrollbar h-full">
                        <div className="telemetry-header sticky top-0 bg-card z-20 px-4 py-1.5 border-b border-border flex justify-between items-center">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground tracking-wider uppercase font-mono">
                                <WorkbenchIcon name="codicon:zap" size={12} className="text-primary" /> TASK_CHRONICLE
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="text-[11px] font-mono text-primary">
                                    LOGS: {taskLogs.length}
                                </div>
                                <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5">
                                    <WorkbenchIcon name="codicon:clock" size={10} />
                                    <ElapsedTime start={selectedTask.startedAt} end={selectedTask.completedAt} />
                                </div>
                            </div>
                        </div>

                        <div className="agent-workspace__logs px-4">
                            {taskLogs.length === 0 ? (
                                <div className="py-20 flex flex-col items-center justify-center text-muted-foreground text-[11px] uppercase font-mono italic gap-4 tracking-widest">
                                    <WorkbenchIcon name="codicon:pulse" size={32} className="motion-safe:animate-pulse opacity-60" />
                                    SYNCING_DATA_LINK...
                                </div>
                            ) : (
                                <div className="space-y-0 py-2">
                                    {taskLogs.map((log, idx) => (
                                        <MemoizedLogEntry key={log.id} log={log} isLast={idx === taskLogs.length - 1} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {!!selectedTask.result && (
                    <div className="agent-workspace__footer p-3 px-4 bg-card border-t border-border">
                        <div className="text-[11px] text-success uppercase tracking-wider mb-2 font-bold font-mono flex items-center gap-1.5">
                            <WorkbenchIcon name="codicon:check" size={12} /> RESOLUTION_PAYLOAD
                        </div>

                        <div className="text-[12px] text-success bg-muted p-3 border border-success/20 rounded-md overflow-auto max-h-[200px] custom-scrollbar font-mono leading-relaxed">
                            {typeof selectedTask.result === 'string' ? (selectedTask.result as string) : JSON.stringify(selectedTask.result, null, 2)}
                        </div>
                    </div>
                )}

                {selectedTask.error && (
                    <div className="agent-workspace__footer p-3 px-4 bg-card border-t border-border">
                        <div className="text-[11px] text-destructive uppercase tracking-wider mb-2 font-bold font-mono flex items-center gap-1.5">
                            <WorkbenchIcon name="codicon:error" size={12} /> SYSTEM_FAULT_DETECTED
                        </div>

                        <div className="text-[12px] text-destructive bg-destructive/10 p-3 border border-destructive/20 rounded-md font-mono leading-relaxed">
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
        <div 
            className={`agent-card ${isRunning ? 'agent-card--active' : ''}`} 
            onClick={onClick}
        >
            <div className="agent-card__header flex items-center justify-between gap-2">
                <div className="agent-card__identity flex items-center gap-2">
                    <div className={`agent-card__icon w-7 h-7 flex items-center justify-center rounded-sm ${isRunning ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'}`}>
                        <WorkbenchIcon name={iconName} size={14} />
                    </div>

                    <div>
                        <div className={`agent-card__name text-[11px] font-bold uppercase tracking-wider ${isRunning ? 'text-primary' : 'text-foreground'}`}>
                            {task.agentName}
                        </div>
                        <div className="agent-card__id text-[11px] font-mono text-muted-foreground">
                            ID: {task.id.split('__')[0].substring(0, 6)}
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                    <StatusIcon status={task.status} />
                </div>
            </div>

            <div className="agent-card__task">
                {task.task}
            </div>

            {onCancel && (isRunning || isPending) && (
                <WorkbenchButton 
                    onClick={(e) => { e.stopPropagation(); onCancel(); }}
                    className="w-full py-0.5 text-[11px] font-bold tracking-wider border border-destructive/20 hover:bg-destructive/10 text-destructive hover:text-destructive rounded-md transition-all uppercase mb-1"
                >
                    DISMISS_TASK
                </WorkbenchButton>
            )}

            <div className="agent-card__stats pt-1.5 mt-0.5 border-t border-border">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground uppercase">
                    <WorkbenchIcon name="codicon:clock" size={10} /> 
                    {(isRunning || isPending) ? <ElapsedTime start={task.startedAt} /> : 'FINISHED'}
                </div>

                <div className="flex items-center gap-0.5 group">
                    <span className="text-[11px] font-bold text-muted-foreground group-hover:text-primary transition-colors uppercase tracking-wider">Inspect</span>
                    <WorkbenchIcon name="codicon:chevron-right" size={10} className="text-muted-foreground group-hover:text-primary transition-all" />
                </div>
            </div>

            {isRunning && (
                <div className="agent-card__progress-bar absolute bottom-0 left-0 h-[1px] bg-primary motion-safe:animate-pulse" style={{ width: '100%' }} />
            )}
        </div>
    );
}

function StatusIcon({ status }: { status: ActiveAgentTask['status'] }) {
    switch (status) {
        case 'completed': return <WorkbenchIcon name="codicon:check" size={14} className="text-green-500" />;
        case 'failed': return <WorkbenchIcon name="codicon:error" size={14} className="text-destructive" />;
        case 'in_progress': return <WorkbenchIcon name="codicon:pulse" size={14} className="text-primary motion-safe:animate-pulse" />;
        default: return <WorkbenchIcon name="codicon:clock" size={14} className="text-warning opacity-50" />;
    }
}

function StatusBadge({ task }: { task: ActiveAgentTask }) {
    const config = {
        pending: { icon: 'codicon:clock', color: 'text-warning', label: 'PENDING' },
        in_progress: { icon: 'codicon:pulse', color: 'text-primary', label: 'ACTIVE' },
        completed: { icon: 'codicon:check', color: 'text-success', label: 'SUCCESS' },
        failed: { icon: 'codicon:error', color: 'text-destructive', label: 'FAULT' },
    }[task.status];

    return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted border border-border">
            <WorkbenchIcon name={config.icon} size={11} className={config.color} />
            <span className={`text-[11px] font-bold tracking-wider font-mono ${config.color}`}>
                {task.status === 'in_progress' ? (
                    <>RUNNING_<ElapsedTime start={task.startedAt} /></>
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
        <div className={`log-entry log-entry--${log.type} ${isLast ? 'log-entry--latest' : ''} ${isChatType ? 'log-entry--bubble' : ''} group py-1.5`}>
            {!isChatType && <span className="log-entry__time text-[11px] font-mono text-muted-foreground group-hover:text-muted-foreground transition-colors">[{time}]</span>}
            {!isChatType && <span className="log-entry__type text-[11px] font-bold tracking-wider uppercase text-muted-foreground w-[92px] shrink-0">{log.type.toUpperCase().replace('_', ' ')}</span>}
            
            <div className={`flex flex-col gap-1.5 flex-grow min-w-0 ${isChatType ? 'chat-bubble-style' : ''}`}>
                <div className="log-entry__content text-[12px] text-foreground leading-relaxed group-hover:text-foreground transition-colors">
                    <MarkdownContent content={log.message || log.type} />
                </div>
                
                {log.type === 'tool_call' && log.metadata && (
                    <div className="log-entry__meta bg-muted p-2.5 rounded-md border-l border-primary/40 overflow-hidden font-mono transition-all">
                        <div className="flex items-center gap-1.5 mb-1">
                            <WorkbenchIcon name="codicon:zap" size={10} className="text-primary" />
                            <span className="text-[11px] text-primary uppercase font-bold tracking-wider">[TOOL_DATA]</span>
                        </div>

                        <div className="text-[12px] text-success leading-tight overflow-x-auto">
                            <pre className="whitespace-pre-wrap break-all opacity-90">{JSON.stringify(log.metadata, null, 2)}</pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
