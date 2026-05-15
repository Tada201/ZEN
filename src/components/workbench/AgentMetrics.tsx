import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { cn } from '@/lib/utils/style';

interface AgentMetric {
  agent_id: string;
  agent_name: string;
  tasks_completed: number;
  tasks_failed: number;
  success_rate: number;
  avg_execution_time_ms: number;
  health: 'healthy' | 'degraded' | 'unhealthy';
  recent_performance: number[];
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
    if (!data || data.length === 0) return null;

    const width = 80;
    const height = 30;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);

    const points = data.map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - min) / (max - min)) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} className="opacity-50">
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
            />
        </svg>
    );
}

const getHealthColor = (health: string) => {
  switch (health) {
    case 'healthy': return 'text-emerald-500';
    case 'degraded': return 'text-amber-500';
    case 'unhealthy': return 'text-red-500';
    default: return 'text-zinc-500';
  }
};

const getHealthBg = (health: string) => {
    switch (health) {
      case 'healthy': return 'bg-emerald-500/10';
      case 'degraded': return 'bg-amber-500/10';
      case 'unhealthy': return 'bg-red-500/10';
      default: return 'bg-zinc-500/10';
    }
  };

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export const AgentMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState<AgentMetric[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const result = await invoke('swarm_get_all_metrics');
      const data = result as { metrics?: AgentMetric[] };

      if (data && Array.isArray(data.metrics)) {
        setMetrics(data.metrics.map((m: AgentMetric) => ({
          agent_id: m.agent_id,
          agent_name: m.agent_name || m.agent_id,
          tasks_completed: m.tasks_completed || 0,
          tasks_failed: m.tasks_failed || 0,
          success_rate: m.success_rate || 1.0,
          avg_execution_time_ms: m.avg_execution_time_ms || 0,
          health: m.health || 'healthy',
          recent_performance: m.recent_performance || [],
        })));
      }
    } catch (error) {
      console.error('Failed to fetch agent metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    
    const unlistenTaskCompleted = listen('agent:task_completed', () => {
      fetchMetrics();
    });

    const unlistenTaskFailed = listen('agent:task_failed', () => {
      fetchMetrics();
    });

    return () => {
      unlistenTaskCompleted.then(u => u());
      unlistenTaskFailed.then(u => u());
    };
  }, []);

  return (
    <div className="flex flex-col gap-6 h-full">
        <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <WorkbenchIcon name="lucide:bar-chart-3" size={14} className="text-primary" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300">Agent Performance</h3>
            </div>
            <WorkbenchButton 
                variant="ghost" 
                size="xs" 
                onClick={fetchMetrics}
                className="h-6 w-6 p-0"
            >
                <WorkbenchIcon name="lucide:refresh-cw" size={12} className={cn("text-zinc-500", loading && "animate-spin")} />
            </WorkbenchButton>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-6">
            {/* Global Summary */}
            <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
                    <div className="text-sm font-black text-emerald-500">
                        {metrics.reduce((sum, m) => sum + m.tasks_completed, 0)}
                    </div>
                    <div className="text-[8px] font-black text-zinc-600 uppercase mt-1">Completed</div>
                </div>
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 text-center">
                    <div className="text-sm font-black text-red-500">
                        {metrics.reduce((sum, m) => sum + m.tasks_failed, 0)}
                    </div>
                    <div className="text-[8px] font-black text-zinc-600 uppercase mt-1">Failed</div>
                </div>
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
                    <div className="text-sm font-black text-primary">
                        {metrics.length > 0
                          ? (metrics.reduce((sum, m) => sum + m.avg_execution_time_ms, 0) / metrics.length).toFixed(0)
                          : 0}ms
                    </div>
                    <div className="text-[8px] font-black text-zinc-600 uppercase mt-1">Avg Latency</div>
                </div>
            </div>

            {/* Agent List */}
            <div className="space-y-4">
                {metrics.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
                        <WorkbenchIcon name="lucide:activity" size={32} className="mb-4" />
                        <p className="text-xs font-medium">No performance data</p>
                    </div>
                )}

                {metrics.map((metric) => (
                    <div key={metric.agent_id} className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", 
                                    metric.health === 'healthy' ? "bg-emerald-500" : 
                                    metric.health === 'degraded' ? "bg-amber-500" : "bg-red-500"
                                )} />
                                <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">{metric.agent_name}</span>
                            </div>
                            <div className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full uppercase", getHealthBg(metric.health), getHealthColor(metric.health))}>
                                {metric.health}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <div className="text-[9px] font-black text-zinc-600 uppercase">Success Rate</div>
                                <div className="text-xs font-mono font-bold text-zinc-300">{(metric.success_rate * 100).toFixed(1)}%</div>
                            </div>
                            <div className="space-y-1 text-right">
                                <div className="text-[9px] font-black text-zinc-600 uppercase">Avg Time</div>
                                <div className="text-xs font-mono font-bold text-zinc-300">{formatDuration(metric.avg_execution_time_ms)}</div>
                            </div>
                        </div>

                        {metric.recent_performance.length > 0 && (
                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                <span className="text-[9px] font-black text-zinc-600 uppercase">Performance</span>
                                <Sparkline data={metric.recent_performance} color="var(--color-primary)" />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
};
