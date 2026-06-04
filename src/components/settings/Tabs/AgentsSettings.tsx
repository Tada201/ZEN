import { useState, useEffect, useCallback } from 'react';
import { SettingsSection } from '../SettingsSection';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { agentsApi, type AgentInfo, type ToolMetadataItem } from '@/api';
import { AgentConfigEditor } from './agents/AgentConfigEditor';

export function AgentsSettings() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [tools, setTools] = useState<ToolMetadataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentList, toolList] = await Promise.all([
        agentsApi.listAgents().catch(() => [] as AgentInfo[]),
        agentsApi.listToolsForConfig().catch(() => [] as ToolMetadataItem[]),
      ]);
      setAgents(agentList ?? []);
      setTools(toolList ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const path = prompt('Enter the file path to import an agent config:');
      if (!path) return;
      const result = await agentsApi.importAgentConfigFile(path);
      if (result) {
        setError(null);
        await loadData();
      }
    } catch (e: unknown) {
      setError(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <WorkbenchIcon name="codicon:loading" size={32} className="text-brand-purple animate-spin" />
          <span className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest">
            Loading agent configs...
          </span>
        </div>
      </div>
    );
  }

  if (error && agents.length === 0) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <WorkbenchIcon name="codicon:warning" size={32} className="text-red-400" />
          <span className="text-[12px] font-bold text-red-400 uppercase tracking-widest">
            {error}
          </span>
          <WorkbenchButton variant="secondary" onClick={loadData} className="h-8">
            <span className="text-[10px] font-extrabold uppercase">Retry</span>
          </WorkbenchButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Agents</h3>
        <p className="text-[13px] text-muted-foreground">
          Configure each sub-agent's model, tools, and execution limits. Configs are stored as JSON files.
        </p>
      </div>

      {/* Global Controls */}
      <SettingsSection
        title="Config Management"
        icon="codicon:settings-gear"
        description="Import and manage agent configuration files."
      >
        <div className="flex items-center gap-3 flex-wrap">
          <WorkbenchButton
            variant="secondary"
            className="h-8 gap-2 border-white/5"
            onClick={handleImport}
            disabled={importing}
          >
            <WorkbenchIcon name="codicon:folder-opened" size={14} className="text-brand-purple" />
            <span className="text-[10px] font-extrabold uppercase">
              {importing ? 'Importing...' : 'Import Config File'}
            </span>
          </WorkbenchButton>
          <span className="text-[10px] text-zinc-500">
            Import a JSON config file to override an agent's settings.
            {tools.length > 0 && ` ${tools.length} tools available.`}
          </span>
        </div>
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
            <WorkbenchIcon name="codicon:warning" size={14} className="text-red-400 shrink-0" />
            <span className="text-[10px] text-red-400">{error}</span>
          </div>
        )}
      </SettingsSection>

      {/* Agent Config Editors */}
      <SettingsSection
        title="Sub-Agent Configuration"
        icon="codicon:robot"
        description={`${agents.length} registered agent${agents.length !== 1 ? 's' : ''}. Edit per-agent config to customize model, turns, and tool access.`}
      >
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <WorkbenchIcon name="codicon:robot" size={24} className="text-zinc-500" />
            <span className="text-[11px] text-zinc-500">No agents registered in the system.</span>
          </div>
        ) : (
          <div className="space-y-4">
            {agents.map((agent) => (
              <AgentConfigEditor
                key={agent.id}
                agent={agent}
                allTools={tools}
                onSaved={() => {}}
                onDeleted={() => {}}
              />
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
