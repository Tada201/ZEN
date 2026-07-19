import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import type { ActiveAgentTask, AgentActivity } from '@/lib/stores/agentActivityStore';
import { MemoizedLogEntry } from './LogEntry';
import { ElapsedTime } from './timeUtils';

const AGENT_ICONS: Record<string, string> = {
    generalist: 'codicon:circuit-board',
    tactical_expert: 'codicon:target',
    researcher: 'codicon:search',
    space_observer: 'codicon:telescope',
};

function StatusBadge({ task }: { task: ActiveAgentTask }) {
    const isRunning = task.status === 'in_progress';
    const isFailed = task.status === 'failed';
    const isCompleted = task.status === 'completed';
    const BadgeIcon = isRunning ? Loader2 : isFailed ? XCircle : isCompleted ? CheckCircle2 : Clock;
    const tone = isRunning
        ? 'text-primary/80'
        : isFailed
            ? 'text-destructive/80'
            : isCompleted
                ? 'text-success/80'
                : 'text-warning/80';
    const label = isRunning
        ? 'Running'
        : isFailed
            ? 'Failed'
            : isCompleted
                ? 'Done'
                : 'Waiting';

    return (
        <div
            className="flex items-center gap-1.5"
            aria-label={`${label} agent`}
        >
            <BadgeIcon
                className={cn("h-3.5 w-3.5", tone, isRunning && "motion-safe:animate-spin")}
                aria-hidden="true"
            />
            <span className={cn("text-[11px] font-medium", tone)}>
                {isRunning ? <ElapsedTime start={task.startedAt} /> : label}
            </span>
        </div>
    );
}

export interface AgentWorkspaceProps {
    selectedTask: ActiveAgentTask;
    taskLogs: AgentActivity[];
    onBack: () => void;
    onRemoveTask: (taskId: string) => void;
}

export default function AgentWorkspace({
    selectedTask,
    taskLogs,
    onBack,
    onRemoveTask,
}: AgentWorkspaceProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="agent-workspace"
        >
            <div className="agent-workspace__header">
                <WorkbenchButton onClick={onBack} className="back-button" title="Return to Dashboard">
                    <WorkbenchIcon name="codicon:chevron-left" size={18} />
                </WorkbenchButton>

                <div className="flex items-center gap-2 flex-grow">
                    <div className="task-item__icon w-7 h-7 bg-primary/10 border border-primary/20 flex items-center justify-center text-primary rounded-sm">
                        <WorkbenchIcon name={AGENT_ICONS[selectedTask.agentId] || 'codicon:circuit-board'} size={15} />
                    </div>

                    <div className="flex flex-col">
                        <div className="text-[12px] font-semibold text-foreground">{selectedTask.agentName}</div>
                        <div className="text-[11px] text-muted-foreground">Delegated task</div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <StatusBadge task={selectedTask} />
                    <WorkbenchButton
                        onClick={() => onRemoveTask(selectedTask.id)}
                        className="p-1.5 hover:bg-destructive/10 rounded-sm text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove log entry"
                    >
                        <WorkbenchIcon name="codicon:trash" size={14} />
                    </WorkbenchButton>
                </div>
            </div>

            <div className="agent-workspace__content">
                <div className="agent-workspace__task-info p-3 px-4 border-b border-border bg-card">
                    <div className="flex items-center gap-1.5 text-[11px] text-foreground mb-2 font-medium">
                        <WorkbenchIcon name="codicon:target" size={12} className="text-primary opacity-70" /> Task
                    </div>

                    <div className="text-[12px] text-foreground leading-relaxed font-mono p-3 bg-muted border border-border rounded-md">
                        {selectedTask.task}
                    </div>
                </div>

                <div className="agent-workspace__telemetry custom-scrollbar h-full">
                    <div className="telemetry-header sticky top-0 bg-card z-20 px-4 py-1.5 border-b border-border flex justify-between items-center">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                            <WorkbenchIcon name="codicon:zap" size={12} className="text-primary" /> Activity
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="text-[11px] text-foreground">
                                {taskLogs.length} events
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
                                <Loader2 className="h-7 w-7 motion-safe:animate-spin text-muted-foreground/60" aria-hidden="true" />
                                Loading…
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
                    <div className="text-[11px] text-success mb-2 font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-success/80" aria-hidden="true" /> Result
                    </div>

                    <div className="text-[12px] text-success bg-muted p-3 border border-success/20 rounded-md overflow-auto max-h-[200px] custom-scrollbar font-mono leading-relaxed">
                        {typeof selectedTask.result === 'string' ? (selectedTask.result as string) : JSON.stringify(selectedTask.result, null, 2)}
                    </div>
                </div>
            )}

            {selectedTask.error && (
                <div className="agent-workspace__footer p-3 px-4 bg-card border-t border-border">
                    <div className="text-[11px] text-destructive mb-2 font-medium flex items-center gap-1.5">
                        <XCircle className="h-3 w-3 text-destructive/80" aria-hidden="true" /> Failure details
                    </div>

                    <div className="text-[12px] text-destructive bg-destructive/10 p-3 border border-destructive/20 rounded-md font-mono leading-relaxed">
                        {selectedTask.error}
                    </div>
                </div>
            )}
        </motion.div>
    );
}
