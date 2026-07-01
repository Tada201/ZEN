import { useState, useEffect, useCallback, memo } from 'react';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { agentsApi, type AgentConfigFileData, type AgentInfo, type ToolMetadataItem } from '@/api';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { cn } from '@/lib/utils';

interface AgentConfigEditorProps {
  agent: AgentInfo;
  allTools: ToolMetadataItem[];
  onSaved: () => void;
  onDeleted: () => void;
}

export const AgentConfigEditor = memo(({ agent, allTools, onSaved, onDeleted }: AgentConfigEditorProps) => {
  const [config, setConfig] = useState<AgentConfigFileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const availableModels = useSettingsStore((s) => s.availableModels ?? []);
  const fetchModels = useSettingsStore((s) => s.fetchModels);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await agentsApi.getAgentConfigFile(agent.id);
      setConfig(data);
    } catch {
      setConfig(null);
      setError('Failed to load config file');
    } finally {
      setLoading(false);
    }
  }, [agent.id]);

  useEffect(() => {
    loadConfig();
    if (availableModels.length === 0) {
      fetchModels().catch(() => {});
    }
  }, [agent.id, loadConfig, fetchModels, availableModels.length]);

  const showStatus = (msg: string, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(null), 4000);
    } else {
      setSuccess(msg);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      await agentsApi.saveAgentConfigFile(agent.id, config);
      showStatus('Config saved');
      onSaved();
    } catch (e: unknown) {
      showStatus(`Save failed: ${e instanceof Error ? e.message : String(e)}`, true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError(null);
    try {
      await agentsApi.deleteAgentConfigFile(agent.id);
      await loadConfig();
      showStatus('Config deleted — using defaults');
      onDeleted();
    } catch (e: unknown) {
      showStatus(`Delete failed: ${e instanceof Error ? e.message : String(e)}`, true);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const exportPath = `${agent.id}_config.json`;
      await agentsApi.exportAgentConfigFile(agent.id, exportPath);
      showStatus(`Exported to ${exportPath}`);
    } catch (e: unknown) {
      showStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`, true);
    } finally {
      setExporting(false);
    }
  };

  const toggleTool = (toolId: string) => {
    if (!config) return;
    const tools = config.enabled_tools.includes(toolId)
      ? config.enabled_tools.filter((t) => t !== toolId)
      : [...config.enabled_tools, toolId];
    setConfig({ ...config, enabled_tools: tools });
  };

  const modelOptions = [
    { value: '', label: 'Use global default' },
    ...availableModels.map((m) => ({ value: m.id, label: `${m.name} [${m.provider ?? '?'}]` })),
  ];

  const selectedModel = config?.model_name ?? '';

  // If no model in list matches the config, add it as a fallback option
  if (selectedModel && !modelOptions.some((o) => o.value === selectedModel)) {
    modelOptions.push({ value: selectedModel, label: `${selectedModel} (custom)` });
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-muted/30 border border-border p-5 flex items-center justify-center gap-3 py-8">
        <WorkbenchIcon name="codicon:loading" size={16} className="text-brand-purple animate-spin" />
        <span className="text-[11px] text-muted-foreground">Loading config...</span>
      </div>
    );
  }

  if (!config) {
    // No config file exists — show create button
    return (
      <div className="rounded-xl bg-muted/30 border border-border p-5 flex flex-col gap-3 items-center py-8">
        <WorkbenchIcon name="codicon:file-code" size={24} className="text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground text-center">No custom config for this agent.<br />Using system defaults.</span>
        <WorkbenchButton
          variant="secondary"
          className="h-8 gap-2 border-border hover:bg-brand-purple/10"
          onClick={async () => {
            const defaultCfg: AgentConfigFileData = {
              agent_id: agent.id,
              model_name: '',
              max_iterations: 10,
              context_window: 0,
              max_messages_in_memory: 0,
              enabled_tools: [],
              system_prompt_override: undefined,
            };
            try {
              await agentsApi.saveAgentConfigFile(agent.id, defaultCfg);
              await loadConfig();
            } catch {}
          }}
        >
          <WorkbenchIcon name="codicon:add" size={14} className="text-brand-purple" />
          <span className="text-[10px] font-extrabold uppercase">Create Custom Config</span>
        </WorkbenchButton>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-muted/30 border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-brand-purple/10 flex items-center justify-center border border-brand-purple/20">
            <WorkbenchIcon name="codicon:robot" size={16} className="text-brand-purple" />
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-bold text-foreground">{agent.name}</span>
            <span className="text-[9px] font-mono text-muted-foreground">{agent.id}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <WorkbenchButton
            variant="secondary"
            className="h-7 gap-1 border-border px-2"
            onClick={handleExport}
            disabled={exporting}
          >
            <WorkbenchIcon name="codicon:save-as" size={12} className="text-muted-foreground" />
            <span className="text-[9px] font-extrabold uppercase">Export</span>
          </WorkbenchButton>
          <WorkbenchButton
            variant="secondary"
            className="h-7 gap-1 border-border hover:border-destructive/20 hover:bg-destructive/5 px-2"
            onClick={handleDelete}
            disabled={saving}
          >
            <WorkbenchIcon name="codicon:trash" size={12} className="text-destructive" />
          </WorkbenchButton>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col gap-4">
        {/* Model Selector */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[11px] font-bold text-foreground">Model</span>
            <span className="text-[10px] text-muted-foreground">LLM model for this agent. Empty = use global default.</span>
          </div>
          <WorkbenchSelect
            value={config.model_name}
            onValueChange={(v) => setConfig({ ...config, model_name: v })}
            options={modelOptions}
            placeholder="Use global default"
            width={220}
          />
        </div>

        {/* Max Iterations */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[11px] font-bold text-foreground">Max Turns</span>
            <span className="text-[10px] text-muted-foreground">Maximum tool/turn iterations for this agent.</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={50}
              value={config.max_iterations}
              onChange={(e) => {
                const v = Math.max(1, Math.min(50, parseInt(e.target.value) || 1));
                setConfig({ ...config, max_iterations: v });
              }}
              className="w-16 h-9 text-xs text-center bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-brand-purple/50"
            />
            <span className="text-[10px] text-muted-foreground">turns</span>
          </div>
        </div>

        {/* Tools */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-bold text-foreground">Available Tools</span>
              <span className="text-[10px] text-muted-foreground">
                Empty = use agent defaults. Check to enable specific tools.
              </span>
            </div>
            <span className="text-[10px] font-mono text-brand-purple">
              {config.enabled_tools.length} selected
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 max-h-[200px] overflow-y-auto bg-card/50 rounded-lg p-2 border border-border">
            {allTools.map((tool) => {
              const isChecked = config.enabled_tools.includes(tool.id);
              return (
                <label
                  key={tool.id}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-[10px]',
                    isChecked ? 'bg-brand-purple/10 text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-muted-foreground'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleTool(tool.id)}
                    className="h-3 w-3 rounded border-border bg-muted accent-brand-purple"
                  />
                  <span className="truncate">{tool.id}</span>
                  <span className={cn(
                    'text-[8px] font-mono shrink-0 ml-auto',
                    tool.risk_level === 'High' ? 'text-destructive' : tool.risk_level === 'Medium' ? 'text-warning' : 'text-muted-foreground/70'
                  )}>
                    {tool.risk_level}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-[10px] text-destructive font-medium">{error}</span>
          )}
          {success && (
            <span className="text-[10px] text-success font-medium">{success}</span>
          )}
        </div>
        <WorkbenchButton
          variant="primary"
          className="h-8 gap-2 px-4"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <WorkbenchIcon name="codicon:loading" size={14} className="animate-spin" />
          ) : (
            <WorkbenchIcon name="codicon:check" size={14} />
          )}
          <span className="text-[10px] font-extrabold uppercase">Save Config</span>
        </WorkbenchButton>
      </div>
    </div>
  );
});
