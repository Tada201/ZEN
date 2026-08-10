import { motion } from 'framer-motion';
import { Loader2 } from "lucide-react";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import type { ActiveAgentTask } from '@/lib/stores/agentActivityStore';
import type { LiveAgentPanelModel } from './agentOrchestratorModel';
import { LiveSessionExecution } from './AgentOrchestratorLiveSession';
import { AgentStatusIcon } from './AgentStatusIcon';
import { ElapsedTime } from './timeUtils';

const AGENT_ICONS: Record<string, string> = {
    generalist: 'codicon:circuit-board',
    tactical_expert: 'codicon:target',
    researcher: 'codicon:search',
    space_observer: 'codicon:telescope',
};

export interface BirdsEyeViewProps {
    activeTasks: ActiveAgentTask[];
    runningTasks: ActiveAgentTask[];
    pendingTasks: ActiveAgentTask[];
    historyTasks: ActiveAgentTask[];
    crossSessionTasks: ActiveAgentTask[];
    liveModel: LiveAgentPanelModel;
    isSessionStreaming: boolean;
    onSelectTask: (taskId: string) => void;
    onCancelTask: (taskId: string) => void;
    onClearAll: () => void;
}

function TaskCard({
    task,
    onClick,
    onCancel,
}: {
    task: ActiveAgentTask;
    onClick: () => void;
    onCancel?: () => void;
}) {
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
                    <AgentStatusIcon status={task.status} />
                </div>
            </div>

            <div className="agent-card__task">
                {task.task}
            </div>

            {onCancel && (isRunning || isPending) && (
                <WorkbenchButton
                    onClick={(e) => { e.stopPropagation(); onCancel(); }}
                    className="w-full py-0.5 text-[11px] font-medium border border-destructive/20 hover:bg-destructive/10 text-destructive hover:text-destructive rounded-md transition-colors mb-1"
                >
                    Stop
                </WorkbenchButton>
            )}

            <div className="agent-card__stats pt-1.5 mt-0.5 border-t border-border">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground uppercase">
                    <WorkbenchIcon name="codicon:clock" size={10} />
                    {(isRunning || isPending) ? <ElapsedTime start={task.startedAt} /> : 'Done'}
                </div>

                <div className="flex items-center gap-0.5 group">
                    <span className="text-[11px] text-muted-foreground group-hover:text-primary transition-colors">Open</span>
                    <WorkbenchIcon name="codicon:chevron-right" size={10} className="text-muted-foreground group-hover:text-primary transition-all" />
                </div>
            </div>

            {isRunning && (
                <div className="agent-card__progress-bar absolute bottom-0 left-0 h-[1px] bg-primary animate-pulse" style={{ width: '100%' }} />
            )}
        </div>
    );
}

export default function BirdsEyeView({
    activeTasks,
    runningTasks,
    pendingTasks,
    historyTasks,
    crossSessionTasks,
    liveModel,
    isSessionStreaming,
    onSelectTask,
    onCancelTask,
    onClearAll,
}: BirdsEyeViewProps) {
    return (
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
                    <span className="agent-birds-eye__title">Live agents</span>
                </div>

                <div className="flex items-center gap-3">
                    {runningTasks.length > 0 && (
                        <div className="flex items-center gap-1.5 rounded-md bg-card border border-border px-2 py-0.5">
                            <Loader2 className="h-3 w-3 text-primary animate-spin" aria-hidden="true" />
                            <span className="text-[11px] text-foreground">{runningTasks.length} running</span>
                        </div>
                    )}
                    {activeTasks.length > 0 && (
                        <WorkbenchButton
                            onClick={onClearAll}
                            className="p-1 hover:bg-destructive/10 rounded-sm text-muted-foreground hover:text-destructive transition-colors"
                            title="Clear agent panel"
                        >
                            <WorkbenchIcon name="codicon:trash" size={13} />
                        </WorkbenchButton>
                    )}
                </div>
            </div>

            {!liveModel.message && activeTasks.length === 0 ? (
                <div className="flex-grow flex flex-col items-center justify-center opacity-25 pointer-events-none p-6 text-center">
                    <WorkbenchIcon name="codicon:git-branch" size={48} className="text-muted-foreground" />
                    <div className="mt-4 text-[11px] text-muted-foreground">No agents running</div>
                </div>
            ) : (
                <div className="agent-birds-eye__grid pb-10">
                    {liveModel.message && (
                        <LiveSessionExecution model={liveModel} isStreaming={isSessionStreaming} />
                    )}

                    {/* Active Cluster */}
                    {runningTasks.length > 0 && (
                        <div className="border-b border-border">
                            <div className="text-[11px] text-foreground bg-card font-medium px-3.5 py-1.5 border-b border-border flex items-center gap-1.5">
                                <WorkbenchIcon name="codicon:zap" size={12} className="text-primary" />
                                Running in this session
                            </div>
                            <div className="flex flex-col divide-y divide-white/5">
                                {runningTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => onSelectTask(task.id)} onCancel={() => onCancelTask(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pending Queue */}
                    {pendingTasks.length > 0 && (
                        <div className="border-b border-border">
                            <div className="text-[11px] text-foreground bg-card font-medium px-3.5 py-1.5 border-b border-border flex items-center gap-1.5">
                                <WorkbenchIcon name="codicon:clock" size={12} className="text-warning" />
                                Waiting
                            </div>
                            <div className="flex flex-col divide-y divide-white/5 opacity-80">
                                {pendingTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => onSelectTask(task.id)} onCancel={() => onCancelTask(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Session History */}
                    {historyTasks.length > 0 && (
                        <div className="border-b border-border">
                            <div className="text-[11px] text-foreground bg-card font-medium px-3.5 py-1.5 border-b border-border flex items-center gap-1.5">
                                <WorkbenchIcon name="codicon:archive" size={12} className="text-muted-foreground" />
                                Completed in this session
                            </div>
                            <div className="flex flex-col divide-y divide-white/5">
                                {historyTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => onSelectTask(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Cross-Session History */}
                    {crossSessionTasks.length > 0 && (
                        <div>
                            <div className="text-[11px] text-muted-foreground bg-card font-medium px-3.5 py-1.5 border-b border-border flex items-center gap-1.5">
                                <WorkbenchIcon name="codicon:history" size={12} className="text-muted-foreground" />
                                Other sessions
                            </div>
                            <div className="flex flex-col divide-y divide-white/5 opacity-70">
                                {crossSessionTasks.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => onSelectTask(task.id)} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
}
