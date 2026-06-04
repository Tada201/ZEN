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
      <div className="rounded-xl bg-zinc-900/15 border border-white/[0.04] p-5 flex items-center justify-center gap-3 py-8">
        <WorkbenchIcon name="codicon:loading" size={16} className="text-brand-purple animate-spin" />
        <span className="text-[11px] text-zinc-500">Loading config...</span>
      </div>
    );
  }

  if (!config) {
    // No config file exists — show create button
    return (
      <div className="rounded-xl bg-zinc-900/15 border border-white/[0.04] p-5 flex flex-col gap-3 items-center py-8">
        <WorkbenchIcon name="codicon:file-code" size={24} className="text-zinc-500" />
        <span className="text-[11px] text-zinc-500 text-center">No custom config for this agent.<br />Using system defaults.</span>
        <WorkbenchButton
          variant="secondary"
          className="h-8 gap-2 border-white/5 hover:bg-brand-purple/10"
          onClick={async () => {
            const defaultCfg: AgentConfigFileData = {
              agent_id: agent.id,
              model_name: '',
              max_iterations: 10,
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
    <div className="rounded-xl bg-zinc-900/15 border border-white/[0.04] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-white/[0.02] border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-brand-purple/10 flex items-center justify-center border border-brand-purple/20">
            <WorkbenchIcon name="codicon:robot" size={16} className="text-brand-purple" />
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-bold text-white">{agent.name}</span>
            <span className="text-[9px] font-mono text-zinc-500">{agent.id}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <WorkbenchButton
            variant="secondary"
            className="h-7 gap-1 border-white/5 px-2"
            onClick={handleExport}
            disabled={exporting}
          >
            <WorkbenchIcon name="codicon:save-as" size={12} className="text-zinc-400" />
            <span className="text-[9px] font-extrabold uppercase">Export</span>
          </WorkbenchButton>
          <WorkbenchButton
            variant="secondary"
            className="h-7 gap-1 border-white/5 hover:border-red-500/20 hover:bg-red-500/5 px-2"
            onClick={handleDelete}
            disabled={saving}
          >
            <WorkbenchIcon name="codicon:trash" size={12} className="text-red-400" />
          </WorkbenchButton>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col gap-4">
        {/* Model Selector */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[11px] font-bold text-zinc-300">Model</span>
            <span className="text-[10px] text-zinc-500">LLM model for this agent. Empty = use global default.</span>
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
            <span className="text-[11px] font-bold text-zinc-300">Max Turns</span>
            <span className="text-[10px] text-zinc-500">Maximum tool/turn iterations for this agent.</span>
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
              className="w-16 h-9 text-xs text-center bg-zinc-950 border border-white/10 rounded-lg text-zinc-200 focus:outline-none focus:border-brand-purple/50"
            />
            <span className="text-[10px] text-zinc-500">turns</span>
          </div>
        </div>

        {/* Tools */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-bold text-zinc-300">Available Tools</span>
              <span className="text-[10px] text-zinc-500">
                Empty = use agent defaults. Check to enable specific tools.
              </span>
            </div>
            <span className="text-[10px] font-mono text-brand-purple">
              {config.enabled_tools.length} selected
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 max-h-[200px] overflow-y-auto bg-zinc-950/30 rounded-lg p-2 border border-white/[0.04]">
            {allTools.map((tool) => {
              const isChecked = config.enabled_tools.includes(tool.id);
              return (
                <label
                  key={tool.id}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-[10px]',
                    isChecked ? 'bg-brand-purple/10 text-zinc-200' : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-400'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleTool(tool.id)}
                    className="h-3 w-3 rounded border-zinc-600 bg-zinc-900 accent-brand-purple"
                  />
                  <span className="truncate">{tool.id}</span>
                  <span className={cn(
                    'text-[8px] font-mono shrink-0 ml-auto',
                    tool.risk_level === 'High' ? 'text-red-400' : tool.risk_level === 'Medium' ? 'text-amber-400' : 'text-zinc-600'
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
      <div className="px-5 py-3 border-t border-white/[0.04] bg-white/[0.01] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-[10px] text-red-400 font-medium">{error}</span>
          )}
          {success && (
            <span className="text-[10px] text-emerald-400 font-medium">{success}</span>
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
