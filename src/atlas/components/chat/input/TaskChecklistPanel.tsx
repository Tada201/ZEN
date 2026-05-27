import { CheckCircle2, ChevronDown, Circle, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils/style';

interface VisibleTask {
  id: string;
  status: string;
  description: string;
}

interface TaskChecklistPanelProps {
  tasks: VisibleTask[];
  isOpen: boolean;
  onToggle: () => void;
}

export function TaskChecklistPanel({ tasks, isOpen, onToggle }: TaskChecklistPanelProps) {
  const completedTaskCount = tasks.filter(task => task.status === 'completed').length;

  return (
    <div className="absolute inset-x-0 bottom-[calc(100%+8px)] px-1 pointer-events-auto">
      <div className="rounded-xl border border-white/10 bg-[#111113]/95 shadow-2xl overflow-hidden backdrop-blur-xl">
        <button
          type="button"
          onClick={onToggle}
          className="w-full h-10 px-3 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            <ListTodo className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-200">Task checklist</span>
            <span className="text-xs tabular-nums text-zinc-500">{completedTaskCount}/{tasks.length}</span>
          </span>
          <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform", isOpen && "rotate-180")} />
        </button>
        <div className={cn(
          "grid transition-all duration-200 ease-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}>
          <div className="overflow-hidden">
            <div className="px-3 pb-3 space-y-2 max-h-48 overflow-y-auto">
              {tasks.map(task => {
                const done = task.status === 'completed';
                const running = task.status === 'in-progress';
                return (
                  <div key={task.id} className="flex items-start gap-2 text-sm">
                    {done ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className={cn("w-4 h-4 mt-0.5 shrink-0", running ? "text-blue-400 animate-pulse" : "text-zinc-600")} />
                    )}
                    <span className={cn(
                      "leading-5 min-w-0",
                      done ? "text-zinc-500 line-through" : running ? "text-zinc-200" : "text-zinc-400"
                    )}>
                      {task.description}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
