import React, { useMemo, useState, useEffect } from 'react';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { useChatStore } from '@/lib/stores/useChatStore';
import { useAgentActivityStore, type ActiveAgentTask, type AgentActivity } from '@/lib/stores/agentActivityStore';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownContent } from '@/atlas/components/chat/MarkdownContent';
import { AgentDelegationLane } from '@/atlas/components/chat/AgentDelegationLane';
import { buildAgentDelegationLaneModel, type AgentDelegationLaneModel } from '@/atlas/components/chat/agentDelegationLaneModel';
import { buildAgentExecutionTraceModel } from '@/atlas/components/chat/agentExecutionTraceModel';
import { groupToolCalls } from '@/atlas/components/chat/assistantMessageParts';
import type { Message, Step, ToolCall } from '@/atlas/components/chat/types';
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

const EMPTY_MESSAGES: Message[] = [];

type LiveAgentPanelModel = {
    message?: Message;
    actionSteps: Step[];
    toolCalls: ToolCall[];
    lanes: AgentDelegationLaneModel[];
    runningAgents: number;
    runningTools: number;
    approvals: number;
    completedAgents: number;
    activeSummary: string;
};

function isLiveAssistantMessage(message: Message) {
    if (message.role !== 'assistant') return false;
    if (message.status === 'sending') return true;
    return Boolean(message.steps?.length || message.toolCalls?.length);
}

function agentLaneKey(step: Step) {
    const spawn = step.metadata?.spawn;
    return [
        spawn?.parentAgent || step.metadata?.parentAgentId || 'main',
        spawn?.childAgent || step.metadata?.agentName || step.metadata?.agentId || 'agent',
        step.metadata?.iteration ?? '',
    ].join('::');
}

function buildLiveAgentPanelModel(messages: Message[]): LiveAgentPanelModel {
    const assistantMessages = messages.filter(isLiveAssistantMessage);
    const message = [...assistantMessages].reverse().find((candidate: Message) => candidate.status === 'sending')
        || assistantMessages[assistantMessages.length - 1];
    const actionSteps = (message?.steps || []).filter((step: Step) => step?.type === 'action');
    const toolCalls = groupToolCalls(message?.toolCalls || []);
    const trace = buildAgentExecutionTraceModel(toolCalls, actionSteps);
    const laneSteps = actionSteps.filter((step: Step) => (
        step.kind === 'agent_spawn' ||
        step.kind === 'agent_chunk' ||
        step.kind === 'agent_complete'
    ));
    const latestLaneSteps = new Map<string, Step>();

    laneSteps.forEach((step: Step) => {
        latestLaneSteps.set(agentLaneKey(step), step);
    });

    const lanes = Array.from(latestLaneSteps.values())
        .map(buildAgentDelegationLaneModel)
        .filter((lane): lane is AgentDelegationLaneModel => Boolean(lane));

    return {
        message,
        actionSteps,
        toolCalls,
        lanes,
        runningAgents: lanes.filter((lane) => lane.status === 'running').length,
        runningTools: toolCalls.filter((tool) => tool.status === 'running').length,
        approvals: toolCalls.filter((tool) => tool.status === 'awaiting_approval').length,
        completedAgents: lanes.filter((lane) => lane.status === 'completed').length,
        activeSummary: trace.activeLaneSummary || (message?.status === 'sending' ? 'Assistant is streaming' : 'No active run'),
    };
}

export function AgentOrchestratorPanel() {
    const activeSessionId = useChatStore(s => s.activeSessionId);
    const sessionMessages = useChatStore(s => activeSessionId ? s.sessionMessages[activeSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES);
    const isSessionStreaming = useChatStore(s => activeSessionId ? s.streamingChats[activeSessionId] ?? false : false);
    const { activeTasks, selectedTaskId, setSelectedTaskId, clearTasks, removeTask, cancelTask, activities } = useAgentActivityStore();

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

    const sessionTasks = activeTasks.filter(t => t.chatId === activeSessionId);
    const crossSessionTasks = activeTasks.filter(t => t.chatId !== activeSessionId);

    const runningTasks = sessionTasks.filter(t => t.status === 'in_progress');
    const pendingTasks = sessionTasks.filter(t => t.status === 'pending');
    const historyTasks = sessionTasks.filter(t => t.status === 'completed' || t.status === 'failed');

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
                    <WorkbenchIcon name="codicon:dashboard" size={14} className="text-[#00ff9f]" />
                    <span className="agent-birds-eye__title font-mono tracking-wider">ORCHESTRATOR_DASHBOARD</span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#00ff9f] animate-pulse" />
                        <span className="text-[9px] font-mono text-[#00ff9f] uppercase">{runningTasks.length} ACTIVE</span>
                    </div>
                    {activeTasks.length > 0 && (
                        <WorkbenchButton 
                            onClick={clearTasks}
                            className="p-1 hover:bg-red-500/10 rounded-sm text-white/40 hover:text-red-500 transition-colors"
                            title="Purge Global Logs"
                        >
                            <WorkbenchIcon name="codicon:trash" size={13} />
                        </WorkbenchButton>
                    )}
                </div>
            </div>

            {!liveModel.message && activeTasks.length === 0 ? (
                <div className="flex-grow flex flex-col items-center justify-center opacity-25 pointer-events-none p-6 text-center">
                    <WorkbenchIcon name="codicon:git-branch" size={48} className="text-zinc-500" />
                    <div className="mt-4 text-[10px] uppercase tracking-widest font-mono text-zinc-400">NO_ACTIVE_NODES</div>
                </div>
            ) : (
                <div className="agent-birds-eye__grid pb-10">
                    {liveModel.message && (
                        <LiveSessionExecution model={liveModel} isStreaming={isSessionStreaming} />
                    )}

                    {/* Active Cluster */}
                    {runningTasks.length > 0 && (
                        <div className="border-b border-white/5">
                            <div className="text-[9px] text-[#00ff9f]/60 bg-[#18181c] font-bold uppercase tracking-wider px-3.5 py-1.5 border-b border-white/5 flex items-center gap-1.5">
                                <WorkbenchIcon name="codicon:zap" size={12} className="text-[#00ff9f]" />
                                ACTIVE_NODES
                            </div>
                            <div className="flex flex-col divide-y divide-white/5">
                                {runningTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} onCancel={() => cancelTask(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pending Queue */}
                    {pendingTasks.length > 0 && (
                        <div className="border-b border-white/5">
                            <div className="text-[9px] text-yellow-500/60 bg-[#18181c] font-bold uppercase tracking-wider px-3.5 py-1.5 border-b border-white/5 flex items-center gap-1.5">
                                <WorkbenchIcon name="codicon:clock" size={12} className="text-yellow-500" />
                                PENDING_QUEUE
                            </div>
                            <div className="flex flex-col divide-y divide-white/5 opacity-80">
                                {pendingTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} onCancel={() => cancelTask(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Session History */}
                    {historyTasks.length > 0 && (
                        <div className="border-b border-white/5">
                            <div className="text-[9px] text-white/40 bg-[#18181c] font-bold uppercase tracking-wider px-3.5 py-1.5 border-b border-white/5 flex items-center gap-1.5">
                                <WorkbenchIcon name="codicon:archive" size={12} className="text-white/30" />
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
                            <div className="text-[9px] text-white/30 bg-[#18181c] font-bold uppercase tracking-wider px-3.5 py-1.5 border-b border-white/5 flex items-center gap-1.5">
                                <WorkbenchIcon name="codicon:history" size={12} className="text-white/20" />
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
                        <div className="task-item__icon w-7 h-7 bg-[#00ff9f]/10 border border-[#00ff9f]/20 flex items-center justify-center text-[#00ff9f] rounded-sm">
                            <WorkbenchIcon name={AGENT_ICONS[selectedTask.agentId] || 'codicon:circuit-board'} size={15} />
                        </div>

                        <div className="flex flex-col">
                            <div className="text-[11px] font-bold text-white uppercase tracking-wider">{selectedTask.agentName}</div>
                            <div className="text-[9px] text-white/30 font-mono">
                                NODE_ID: {selectedTask.id.includes('__') ? selectedTask.id.split('__')[1] : selectedTask.agentId || 'ORCH-01'}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <StatusBadge task={selectedTask} />
                        <WorkbenchButton 
                            onClick={() => { removeTask(selectedTask.id); setSelectedTaskId(null); }}
                            className="p-1.5 hover:bg-red-500/10 rounded-sm text-white/40 hover:text-red-500 transition-colors"
                            title="Remove log entry"
                        >
                            <WorkbenchIcon name="codicon:trash" size={14} />
                        </WorkbenchButton>
                    </div>
                </div>

                <div className="agent-workspace__content">
                    <div className="agent-workspace__task-info p-3 px-4 border-b border-white/5 bg-[#18181c]">
                        <div className="flex items-center gap-1.5 text-[9px] text-[#00ff9f]/60 uppercase tracking-wider mb-2 font-bold font-mono">
                            <WorkbenchIcon name="codicon:target" size={12} className="opacity-70" /> MISSION_OBJECTIVE
                        </div>

                        <div className="text-[11px] text-zinc-300 leading-relaxed font-mono p-3 bg-black/20 border border-white/5 rounded-none">
                            {selectedTask.task}
                        </div>
                    </div>

                    <div className="agent-workspace__telemetry custom-scrollbar h-full">
                        <div className="telemetry-header sticky top-0 bg-[#18181c] z-20 px-4 py-1.5 border-b border-white/5 flex justify-between items-center">
                            <div className="flex items-center gap-1.5 text-[9px] font-bold text-white/50 tracking-wider uppercase font-mono">
                                <WorkbenchIcon name="codicon:zap" size={12} className="text-[#00ff9f]" /> TASK_CHRONICLE
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="text-[9px] font-mono text-[#00ff9f]/50">
                                    LOGS: {taskLogs.length}
                                </div>
                                <div className="text-[9px] font-mono text-white/30 flex items-center gap-1.5">
                                    <WorkbenchIcon name="codicon:clock" size={10} />
                                    <ElapsedTime start={selectedTask.startedAt} end={selectedTask.completedAt} />
                                </div>
                            </div>
                        </div>

                        <div className="agent-workspace__logs px-4">
                            {taskLogs.length === 0 ? (
                                <div className="py-20 flex flex-col items-center justify-center text-white/10 text-[10px] uppercase font-mono italic gap-4 tracking-widest">
                                    <WorkbenchIcon name="codicon:pulse" size={32} className="animate-pulse opacity-20" />
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
                    <div className="agent-workspace__footer p-3 px-4 bg-[#18181c] border-t border-white/5">
                        <div className="text-[9px] text-green-500/60 uppercase tracking-wider mb-2 font-bold font-mono flex items-center gap-1.5">
                            <WorkbenchIcon name="codicon:check" size={12} /> RESOLUTION_PAYLOAD
                        </div>

                        <div className="text-[11px] text-green-400 bg-black/40 p-3 border border-green-500/20 rounded-none overflow-auto max-h-[200px] custom-scrollbar font-mono leading-relaxed">
                            {typeof selectedTask.result === 'string' ? (selectedTask.result as string) : JSON.stringify(selectedTask.result, null, 2)}
                        </div>
                    </div>
                )}

                {selectedTask.error && (
                    <div className="agent-workspace__footer p-3 px-4 bg-[#18181c] border-t border-white/5">
                        <div className="text-[9px] text-red-500/80 uppercase tracking-wider mb-2 font-bold font-mono flex items-center gap-1.5">
                            <WorkbenchIcon name="codicon:error" size={12} /> SYSTEM_FAULT_DETECTED
                        </div>

                        <div className="text-[11px] text-red-400 bg-red-950/20 p-3 border border-red-500/20 rounded-none font-mono leading-relaxed">
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

function LiveSessionExecution({ model, isStreaming }: { model: LiveAgentPanelModel; isStreaming: boolean }) {
    const recentTools = model.toolCalls.slice(-6).reverse();

    return (
        <div className="live-agent-panel border-b border-white/5">
            <div className="live-agent-panel__header">
                <div className="flex min-w-0 items-center gap-2">
                    <WorkbenchIcon name="codicon:run-all" size={13} className={isStreaming ? "text-[#00ff9f]" : "text-white/40"} />
                    <div className="min-w-0">
                        <div className="live-agent-panel__title">Live session execution</div>
                        <div className="live-agent-panel__summary truncate">{model.activeSummary}</div>
                    </div>
                </div>
                <div className={`live-agent-panel__state ${isStreaming ? 'live-agent-panel__state--running' : ''}`}>
                    {isStreaming ? 'streaming' : 'idle'}
                </div>
            </div>

            <div className="live-agent-panel__metrics">
                <MetricCell label="agents" value={model.runningAgents} tone={model.runningAgents > 0 ? 'active' : undefined} />
                <MetricCell label="tools" value={model.runningTools} tone={model.runningTools > 0 ? 'active' : undefined} />
                <MetricCell label="approval" value={model.approvals} tone={model.approvals > 0 ? 'warn' : undefined} />
                <MetricCell label="done" value={model.completedAgents} />
            </div>

            {model.lanes.length > 0 && (
                <div className="live-agent-panel__section">
                    <div className="live-agent-panel__section-title">Agent lanes</div>
                    <div className="space-y-2">
                        {model.lanes.map((lane) => (
                            <AgentDelegationLane
                                key={`${lane.parentName}:${lane.agentName}:${lane.iteration ?? 'root'}`}
                                lane={lane}
                            />
                        ))}
                    </div>
                </div>
            )}

            {recentTools.length > 0 && (
                <div className="live-agent-panel__section">
                    <div className="live-agent-panel__section-title">Recent tools</div>
                    <div className="live-agent-panel__tools">
                        {recentTools.map((tool) => {
                            const status = tool.status || 'running';
                            return (
                                <div key={tool.id || `${tool.name || 'tool'}-${status}`} className="live-agent-panel__tool-row">
                                    <span className={`live-agent-panel__tool-status live-agent-panel__tool-status--${status}`} />
                                    <span className="min-w-0 flex-1 truncate text-zinc-300">{tool.name || 'Tool'}</span>
                                    {tool.agentName && <span className="max-w-[96px] truncate text-white/30">{tool.agentName}</span>}
                                    <span className="uppercase text-white/35">{status.replace('_', ' ')}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function MetricCell({ label, value, tone }: { label: string; value: number; tone?: 'active' | 'warn' }) {
    return (
        <div className={`live-agent-panel__metric ${tone ? `live-agent-panel__metric--${tone}` : ''}`}>
            <span>{value}</span>
            <span>{label}</span>
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
                    <div className={`agent-card__icon w-7 h-7 flex items-center justify-center rounded-sm ${isRunning ? 'bg-[#00ff9f]/10 text-[#00ff9f]' : 'bg-white/5 text-white/40'}`}>
                        <WorkbenchIcon name={iconName} size={14} />
                    </div>

                    <div>
                        <div className={`agent-card__name text-[10px] font-bold uppercase tracking-wider ${isRunning ? 'text-[#00ff9f]' : 'text-zinc-300'}`}>
                            {task.agentName}
                        </div>
                        <div className="agent-card__id text-[8px] font-mono opacity-30">
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
                    className="w-full py-0.5 text-[8px] font-bold tracking-wider border border-red-500/20 hover:bg-red-500/10 text-red-400 hover:text-red-500 rounded-none transition-all uppercase mb-1"
                >
                    ABORT_TASK
                </WorkbenchButton>
            )}

            <div className="agent-card__stats pt-1.5 mt-0.5 border-t border-white/5">
                <div className="flex items-center gap-1.5 text-[8px] font-mono text-white/30 uppercase">
                    <WorkbenchIcon name="codicon:clock" size={10} /> 
                    {(isRunning || isPending) ? <ElapsedTime start={task.startedAt} /> : 'FINISHED'}
                </div>

                <div className="flex items-center gap-0.5 group">
                    <span className="text-[8px] font-bold text-white/30 group-hover:text-[#00ff9f] transition-colors uppercase tracking-wider">Inspect</span>
                    <WorkbenchIcon name="codicon:chevron-right" size={10} className="text-white/20 group-hover:text-[#00ff9f] transition-all" />
                </div>
            </div>

            {isRunning && (
                <div className="agent-card__progress-bar absolute bottom-0 left-0 h-[1px] bg-[#00ff9f] animate-pulse" style={{ width: '100%' }} />
            )}
        </div>
    );
}

function StatusIcon({ status }: { status: ActiveAgentTask['status'] }) {
    switch (status) {
        case 'completed': return <WorkbenchIcon name="codicon:check" size={14} className="text-green-500" />;
        case 'failed': return <WorkbenchIcon name="codicon:error" size={14} className="text-red-500" />;
        case 'in_progress': return <WorkbenchIcon name="codicon:pulse" size={14} className="text-[#00ff9f] animate-pulse" />;
        default: return <WorkbenchIcon name="codicon:clock" size={14} className="text-yellow-500 opacity-50" />;
    }
}

function StatusBadge({ task }: { task: ActiveAgentTask }) {
    const config = {
        pending: { icon: 'codicon:clock', color: 'text-yellow-500', label: 'PENDING' },
        in_progress: { icon: 'codicon:pulse', color: 'text-neon', label: 'ACTIVE' },
        completed: { icon: 'codicon:check', color: 'text-green-500', label: 'SUCCESS' },
        failed: { icon: 'codicon:error', color: 'text-red-500', label: 'FAULT' },
    }[task.status];

    return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-none bg-[#131316] border border-white/10">
            <WorkbenchIcon name={config.icon} size={11} className={config.color === 'text-neon' ? 'text-[#00ff9f]' : config.color} />
            <span className={`text-[9px] font-bold tracking-wider font-mono ${config.color === 'text-neon' ? 'text-[#00ff9f]' : config.color}`}>
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
            {!isChatType && <span className="log-entry__time text-[9px] font-mono opacity-30 group-hover:opacity-60 transition-opacity">[{time}]</span>}
            {!isChatType && <span className="log-entry__type text-[9px] font-bold tracking-wider uppercase opacity-60 w-[80px] shrink-0">{log.type.toUpperCase().replace('_', ' ')}</span>}
            
            <div className={`flex flex-col gap-1.5 flex-grow min-w-0 ${isChatType ? 'chat-bubble-style' : ''}`}>
                <div className="log-entry__content text-[11px] text-zinc-300 leading-relaxed group-hover:text-white transition-colors">
                    <MarkdownContent content={log.message || log.type} />
                </div>
                
                {log.type === 'tool_call' && log.metadata && (
                    <div className="log-entry__meta bg-black/20 p-2.5 rounded-none border-l border-[#00ff9f]/40 overflow-hidden font-mono transition-all">
                        <div className="flex items-center gap-1.5 mb-1">
                            <WorkbenchIcon name="codicon:zap" size={10} className="text-[#00ff9f]" />
                            <span className="text-[8px] text-[#00ff9f]/60 uppercase font-bold tracking-wider">[TOOL_DATA]</span>
                        </div>

                        <div className="text-[10px] text-green-400 leading-tight overflow-x-auto">
                            <pre className="whitespace-pre-wrap break-all opacity-90">{JSON.stringify(log.metadata, null, 2)}</pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
