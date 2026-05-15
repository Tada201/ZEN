import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { motion } from 'framer-motion';
import { useSwarmStore } from '@/lib/stores/swarmStore';
import { cn } from '@/lib/utils/style';

export const WorkflowProgress: React.FC = () => {
  const {
    activeWorkflows,
    isWorkflowPanelOpen,
    setWorkflowPanelOpen,
    setActiveWorkflows,
    updateWorkflow,
  } = useSwarmStore();

  // Listen for workflow events
  useEffect(() => {
    const unlistenStarted = listen('agent:workflow_started', (event) => {
      const payload = event.payload as any;
      setActiveWorkflows((prev: any[]) => [...prev, {
        workflow_id: payload.workflow_id,
        name: payload.workflow_name || 'Workflow',
        state: 'running',
        progress: 0,
        completed_tasks: 0,
        total_tasks: payload.total_tasks || 0,
        failed_tasks: 0,
        tasks: [],
      }]);
    });

    const unlistenCompleted = listen('agent:workflow_completed', (event) => {
      const payload = event.payload as any;
      updateWorkflow({
        workflow_id: payload.workflow_id,
        state: 'completed',
        progress: 100,
      });
    });

    const unlistenFailed = listen('agent:workflow_failed', (event) => {
      const payload = event.payload as any;
      updateWorkflow({
        workflow_id: payload.workflow_id,
        state: 'failed',
      });
    });

    const unlistenProgress = listen('agent:workflow_progress', (event) => {
        const payload = event.payload as any;
        updateWorkflow({
          workflow_id: payload.workflow_id,
          progress: payload.progress,
          completed_tasks: payload.completed_tasks,
          total_tasks: payload.total_tasks,
        });
      });

    return () => {
      unlistenStarted.then(u => u());
      unlistenCompleted.then(u => u());
      unlistenFailed.then(u => u());
      unlistenProgress.then(u => u());
    };
  }, [setActiveWorkflows, updateWorkflow]);

  const handlePause = async (workflowId: string) => {
    try {
      await invoke('workflow_pause', { workflowId });
      updateWorkflow({ workflow_id: workflowId, state: 'paused' });
    } catch (error) {
      console.error('Failed to pause workflow:', error);
    }
  };

  const handleResume = async (workflowId: string) => {
    try {
      await invoke('workflow_resume', { workflowId });
      updateWorkflow({ workflow_id: workflowId, state: 'running' });
    } catch (error) {
      console.error('Failed to resume workflow:', error);
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'running': return 'text-primary';
      case 'completed': return 'text-emerald-500';
      case 'failed': return 'text-red-500';
      case 'paused': return 'text-sky-500';
      default: return 'text-zinc-500';
    }
  };

  const getStateBg = (state: string) => {
    switch (state) {
      case 'running': return 'bg-primary/10';
      case 'completed': return 'bg-emerald-500/10';
      case 'failed': return 'bg-red-500/10';
      case 'paused': return 'bg-sky-500/10';
      default: return 'bg-zinc-500/10';
    }
  };

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'running': return "lucide:activity";
      case 'completed': return "lucide:check-circle";
      case 'failed': return "lucide:alert-circle";
      case 'paused': return "lucide:pause-circle";
      default: return "lucide:clock";
    }
  };

  if (!isWorkflowPanelOpen) return null;

  return (
    <div className="flex flex-col gap-4 h-full">
        <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <WorkbenchIcon name="lucide:play" size={14} className="text-primary" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300">Workflow Engine</h3>
            </div>
            <WorkbenchButton 
                variant="ghost" 
                size="xs" 
                onClick={() => setWorkflowPanelOpen(false)}
                className="h-6 w-6 p-0"
            >
                <WorkbenchIcon name="lucide:x" size={14} className="text-zinc-500" />
            </WorkbenchButton>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-4">
            {activeWorkflows.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                    <WorkbenchIcon name="lucide:play" size={32} className="mb-4" />
                    <p className="text-xs font-medium">No active workflows</p>
                    <p className="text-[10px] mt-1 max-w-[200px]">Complex operations requiring multiple steps will appear here.</p>
                </div>
            )}

            {activeWorkflows.map((workflow) => (
                <div 
                    key={workflow.workflow_id}
                    className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-4"
                >
                    <div className="flex items-start justify-between">
                        <div>
                            <h4 className="text-sm font-bold text-zinc-200">{workflow.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                                <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider", getStateBg(workflow.state), getStateColor(workflow.state))}>
                                    <WorkbenchIcon name={getStateIcon(workflow.state)} size={10} className={cn(workflow.state === 'running' && "animate-pulse")} />
                                    <span>{workflow.state}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                            <span>PROGRESS</span>
                            <span>{Math.round(workflow.progress)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                            <motion.div 
                                className="h-full bg-primary"
                                initial={{ width: 0 }}
                                animate={{ width: `${workflow.progress}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-black/20 p-2 rounded-lg border border-white/5 text-center">
                            <div className="text-xs font-bold text-emerald-500">{workflow.completed_tasks}</div>
                            <div className="text-[8px] font-black text-zinc-600 uppercase mt-0.5">Done</div>
                        </div>
                        <div className="bg-black/20 p-2 rounded-lg border border-white/5 text-center">
                            <div className="text-xs font-bold text-zinc-400">{workflow.total_tasks - workflow.completed_tasks - workflow.failed_tasks}</div>
                            <div className="text-[8px] font-black text-zinc-600 uppercase mt-0.5">Pending</div>
                        </div>
                        <div className="bg-black/20 p-2 rounded-lg border border-white/5 text-center">
                            <div className="text-xs font-bold text-red-500">{workflow.failed_tasks}</div>
                            <div className="text-[8px] font-black text-zinc-600 uppercase mt-0.5">Failed</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {workflow.state === 'running' && (
                            <WorkbenchButton 
                                variant="outline" 
                                size="sm" 
                                className="flex-1 text-[10px] h-8 gap-2 border-white/10"
                                onClick={() => handlePause(workflow.workflow_id)}
                            >
                                <WorkbenchIcon name="lucide:pause" size={12} />
                                PAUSE
                            </WorkbenchButton>
                        )}
                        {workflow.state === 'paused' && (
                            <WorkbenchButton 
                                variant="primary" 
                                size="sm" 
                                className="flex-1 text-[10px] h-8 gap-2"
                                onClick={() => handleResume(workflow.workflow_id)}
                            >
                                <WorkbenchIcon name="lucide:play" size={12} />
                                RESUME
                            </WorkbenchButton>
                        )}
                        {workflow.state === 'failed' && (
                            <WorkbenchButton 
                                variant="destructive" 
                                size="sm" 
                                className="flex-1 text-[10px] h-8 gap-2"
                            >
                                <WorkbenchIcon name="lucide:refresh-ccw" size={12} />
                                RETRY
                            </WorkbenchButton>
                        )}
                    </div>
                </div>
            ))}
        </div>
    </div>
  );
};

export default WorkflowProgress;
