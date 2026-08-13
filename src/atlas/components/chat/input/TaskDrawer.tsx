import { useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { motionDurations, motionEasings, useReducedMotion } from '@/lib/motion';
import { AlertCircle, Check, ChevronDown, Circle, Loader2, XCircle } from 'lucide-react';
import { normalizeTaskDisplayStatus, normalizeTaskText, taskStatusLabel } from '@/lib/tasks/taskStatus';
import type { Task } from '@/lib/stores/taskStore';

interface TaskDrawerProps {
  tasks: Task[];
  isOpen: boolean;
  onToggle: () => void;
}

export function TaskDrawer({ tasks, isOpen, onToggle }: TaskDrawerProps) {
  const reducedMotion = useReducedMotion();
  const completedCount = tasks.filter(t => normalizeTaskDisplayStatus(t.status) === 'completed').length;
  const totalCount = tasks.length;
  const taskPanelId = `composer-task-plan-${useId().replace(/:/g, '')}`;

  return (
    <div className="composer-popover absolute bottom-full left-0 z-50 w-full overflow-hidden rounded-t-md">
      {/* Header */}
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={taskPanelId}
        aria-label={`${isOpen ? "Collapse" : "Expand"} task plan`}
        className="composer-menu-item px-2.5 py-1.5 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-medium text-foreground">Task plan</span>
          <span className="composer-meta font-mono">{completedCount}/{totalCount}</span>
        </div>
        <ChevronDown 
          size={12} 
          className={cn("text-muted-foreground", isOpen && "rotate-180")}
        />
      </button>

      {/* List Container */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : {
              duration: motionDurations.standard,
              ease: motionEasings.standard,
            }}
            id={taskPanelId}
            role="region"
            aria-label="Task plan details"
            className="overflow-hidden bg-popover"
          >
            <div className="max-h-[min(50vh,20rem)] overflow-y-auto px-2.5 pb-2 pt-1 space-y-1.5">
              {tasks.map((task) => {
                const status = normalizeTaskDisplayStatus(task.status);
                const StatusIcon = status === 'completed'
                  ? Check
                  : status === 'running'
                    ? Loader2
                    : status === 'error'
                      ? AlertCircle
                      : status === 'cancelled'
                        ? XCircle
                        : Circle;
                const statusTone = status === 'completed'
                  ? "text-success"
                  : status === 'running'
                    ? "text-primary"
                    : status === 'error'
                      ? "text-destructive"
                      : status === 'cancelled'
                        ? "text-muted-foreground"
                        : "text-warning";
                return (
                  <div key={task.id} className="flex min-w-0 items-start gap-1.5">
                    <StatusIcon
                      size={14}
                      strokeWidth={status === 'completed' ? 3 : 2}
                      className={cn("mt-0.5 h-4 w-4 shrink-0", statusTone, status === 'running' && "motion-safe:animate-spin motion-reduce:transition-none")}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className={cn(
                        "text-[12px] font-normal leading-4",
                        status === 'completed' ? "text-muted-foreground line-through" : "text-foreground"
                      )}>
                        {normalizeTaskText(task.description, "Untitled task")}
                      </div>
                      <div className={cn("text-[10px]", statusTone)}>{taskStatusLabel(status)}</div>
                      {status === 'error' && task.error && (
                        <div className="truncate text-[10px] text-muted-foreground" title={normalizeTaskText(task.error)}>{normalizeTaskText(task.error)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
