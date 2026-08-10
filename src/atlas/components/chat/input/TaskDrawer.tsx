import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { motionDurations, motionEasings, useReducedMotion } from '@/lib/motion';
import { ChevronDown, Check } from 'lucide-react';
import type { Task } from '@/lib/stores/taskStore';

interface TaskDrawerProps {
  tasks: Task[];
  isOpen: boolean;
  onToggle: () => void;
}

export function TaskDrawer({ tasks, isOpen, onToggle }: TaskDrawerProps) {
  const reducedMotion = useReducedMotion();
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.length;

  return (
    <div className="absolute bottom-full left-0 w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-t-xl overflow-hidden z-50 shadow-2xl">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#252525] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-medium text-neutral-200">Progress</span>
          <span className="text-[12px] text-neutral-500 font-mono">{completedCount}/{totalCount}</span>
        </div>
        <ChevronDown 
          size={12} 
          className={cn("text-neutral-500 transition-transform duration-300", isOpen && "rotate-180")} 
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
            className="overflow-hidden bg-[#1c1c1c]"
          >
            <div className="px-4 pb-3 space-y-2">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2.5">
                  <div className={cn(
                    "flex items-center justify-center h-4 w-4 shrink-0 rounded-full",
                    task.status === 'completed' ? "text-emerald-500" : "text-neutral-600"
                  )}>
                    <Check size={14} strokeWidth={3} />
                  </div>
                  <span className={cn(
                    "text-[12px] font-normal transition-all duration-300",
                    task.status === 'completed' 
                      ? "text-neutral-500 line-through decoration-neutral-600" 
                      : "text-neutral-300"
                  )}>
                    {task.description}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
