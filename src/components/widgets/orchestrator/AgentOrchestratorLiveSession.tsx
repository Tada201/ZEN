import { AgentDelegationLane } from '@/atlas/components/chat/AgentDelegationLane';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import type { LiveAgentPanelModel } from './agentOrchestratorModel';

export function LiveSessionExecution({ model, isStreaming }: { model: LiveAgentPanelModel; isStreaming: boolean }) {
    const recentTools = model.toolCalls.slice(-6).reverse();

    return (
        <div className="live-agent-panel border-b border-border">
            <div className="live-agent-panel__header">
                <div className="flex min-w-0 items-center gap-2">
                    <WorkbenchIcon name="codicon:run-all" size={13} className={isStreaming ? "text-[#00ff9f]" : "text-muted-foreground"} />
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
                <MetricCell label="failed" value={model.failedAgents} tone={model.failedAgents > 0 ? 'warn' : undefined} />
            </div>

            {model.lanes.length > 0 && (
                <div className="live-agent-panel__section">
                    <div className="live-agent-panel__section-title">Agent lanes</div>
                    <div className="space-y-2">
                        {model.lanes.map((lane) => (
                            <AgentDelegationLane
                                key={lane.spawnId || `${lane.parentName}:${lane.agentName}:${lane.iteration ?? 'root'}`}
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
                        {recentTools.map((tool, index) => {
                            const status = tool.status;
                            const key = [
                                tool.id || 'tool',
                                tool.name || 'unknown',
                                tool.batchId || tool.toolBatchId || 'batch',
                                tool.lastUpdatedAt || tool.completedAt || tool.startTime || index,
                            ].join(':');
                            return (
                                <div key={key} className="live-agent-panel__tool-row">
                                    <span className={`live-agent-panel__tool-status live-agent-panel__tool-status--${status}`} />
                                    <span className="min-w-0 flex-1 truncate text-foreground">{tool.name || 'Tool'}</span>
                                    {tool.agentName && <span className="max-w-[96px] truncate text-muted-foreground">{tool.agentName}</span>}
                                    <span className="uppercase text-muted-foreground">{status.replace('_', ' ')}</span>
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
