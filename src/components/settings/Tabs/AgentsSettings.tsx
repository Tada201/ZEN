import { useState, useEffect, useCallback } from 'react';
import { SettingsSection } from '../SettingsSection';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { agentsApi, type AgentInfo } from '@/api';

export function AgentsSettings() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const agentList = await agentsApi.listAgents().catch(() => [] as AgentInfo[]);
      setAgents(agentList ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <WorkbenchIcon name="codicon:loading" size={32} className="text-brand-purple animate-spin" />
          <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest">
            Loading agents...
          </span>
        </div>
      </div>
    );
  }

  if (error && agents.length === 0) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <WorkbenchIcon name="codicon:warning" size={32} className="text-destructive" />
          <span className="text-[12px] font-bold text-destructive uppercase tracking-widest">
            {error}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Agents</h3>
        <p className="text-[13px] text-muted-foreground">
          Sub-agents registered in the system. To customize, edit the agent JSON files in
          <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-foreground">resources/agents/</code>
          or in
          <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-foreground">~/.config/zen/agents/</code>.
        </p>
      </div>

      <SettingsSection
        title="Registered Sub-Agents"
        icon="codicon:robot"
        description={`${agents.length} agent${agents.length !== 1 ? 's' : ''} loaded from JSON config.`}
      >
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <WorkbenchIcon name="codicon:robot" size={24} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">No agents registered in the system.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/30 border border-border"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-[12px] font-bold text-foreground">{agent.name}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{agent.id}</span>
                  <span className="text-[11px] text-muted-foreground">{agent.description}</span>
                </div>
                <div className="flex flex-col items-end gap-1 text-right shrink-0">
                  <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">
                    {agent.tool_count} tools
                  </span>
                  <span className="text-[10px] font-mono text-brand-purple">
                    {agent.model_override || 'system default'}
                  </span>
                  {agent.max_iterations != null && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {agent.max_iterations} max iter
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
