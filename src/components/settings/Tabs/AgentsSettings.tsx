import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { agentsApi, type AgentInfo } from "@/api";
import { SettingsSection } from "../SettingsSection";
import { AgentEditor, type AgentDraft } from "./AgentEditor";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { cn } from "@/lib/utils";

const COLOR_CLASSES: Record<string, string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-400",
  violet: "bg-violet-400",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
};

function AgentCard({ agent, onEdit, onDelete }: { agent: AgentInfo; onEdit: () => void; onDelete: () => void }) {
  const color = COLOR_CLASSES[agent.color || "slate"] || COLOR_CLASSES.slate;
  const voiceDisplayModel = useSettingsStore((state) => agent.config_mode === "model_only" ? state.voiceDisplayAgentModel : "");
  const selectedModelLabel = voiceDisplayModel || (agent.model_override
    ? `${agent.model_provider ? `${agent.model_provider} / ` : ""}${agent.model_override}`
    : "inherits model");
  return (
    <article className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", color)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h4 className="truncate text-xs font-semibold text-foreground">{agent.name}</h4>
          {agent.config_mode === "model_only" ? <span className="shrink-0 rounded border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] text-cyan-200">Voice only</span> : agent.is_builtin && <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Built-in</span>}
        </div>
        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{agent.id}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{agent.description || "No description"}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
          <span>{agent.tool_count} tools</span>
          <span aria-hidden="true">·</span>
          <span>{selectedModelLabel}</span>
          {agent.max_iterations != null && <><span aria-hidden="true">·</span><span>{agent.max_iterations} iterations</span></>}
          {agent.inject_agents_md && <><span aria-hidden="true">·</span><span>AGENTS.md</span></>}
        </div>
      </div>
      {(agent.user_editable || agent.config_mode === "model_only") && <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={onEdit} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Configure ${agent.name}`} title={agent.config_mode === "model_only" ? "Choose display model" : "Edit agent"}><WorkbenchIcon name="lucide:pencil" className="h-3.5 w-3.5" /></button>
        {agent.user_editable && <button type="button" onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${agent.name}`} title="Delete agent"><WorkbenchIcon name="lucide:trash-2" className="h-3.5 w-3.5" /></button>}
      </div>}
    </article>
  );
}

export function AgentsSettings() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorAgent, setEditorAgent] = useState<AgentInfo | null | undefined>(undefined);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAgents(await agentsApi.listAgents());
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Agents could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const saveAgent = async (draft: AgentDraft) => {
    if (editorAgent) {
      await agentsApi.updateAgent(draft);
    } else {
      await agentsApi.createAgent(draft);
    }
    await loadData();
    setEditorAgent(undefined);
  };

  const saveVoiceDisplayModel = async (model: string | null) => {
    await agentsApi.setVoiceDisplayModel(model);
    updateSetting("voiceDisplayAgentModel", model || "");
    setEditorAgent(undefined);
  };

  const deleteAgent = async (agent: AgentInfo) => {
    if (!window.confirm(`Delete the ${agent.name} subagent? Existing runs are not affected.`)) return;
    setError(null);
    try {
      await agentsApi.deleteAgent(agent.id);
      await loadData();
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "The agent could not be deleted.");
    }
  };

  if (editorAgent !== undefined) {
    const modelOnly = editorAgent?.config_mode === "model_only";
    return <AgentEditor agent={editorAgent || undefined} agents={agents} modelOnly={modelOnly} onCancel={() => setEditorAgent(undefined)} onSave={modelOnly ? undefined : saveAgent} onSaveModel={modelOnly ? saveVoiceDisplayModel : undefined} />;
  }

  if (loading) {
    return <div className="flex items-center justify-center gap-3 py-20 text-xs text-muted-foreground" role="status"><WorkbenchIcon name="codicon:loading" className="h-4 w-4 animate-spin" />Loading agents…</div>;
  }

  return (
    <div className="space-y-7">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1"><h3 className="text-lg font-semibold tracking-tight text-foreground">Agents</h3><p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">Create focused specialists for research, review, implementation, and other delegated work. Profiles are stored in your user configuration.</p></div>
        <button type="button" onClick={() => setEditorAgent(null)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"><WorkbenchIcon name="lucide:plus" className="h-3.5 w-3.5" />New subagent</button>
      </header>

      {error && <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</div>}

      <SettingsSection title="Your subagents" icon="codicon:robot" description="User-created profiles can be edited or removed without changing built-in agents.">
        {agents.filter((agent) => !agent.is_builtin).length === 0 ? <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center"><WorkbenchIcon name="lucide:bot" className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-xs font-medium text-foreground">No custom subagents yet</p><p className="mt-1 text-[11px] text-muted-foreground">Start with a read-only reviewer or research specialist.</p></div> : <div className="space-y-2">{agents.filter((agent) => !agent.is_builtin).map((agent) => <AgentCard key={agent.id} agent={agent} onEdit={() => setEditorAgent(agent)} onDelete={() => void deleteAgent(agent)} />)}</div>}
      </SettingsSection>

      <SettingsSection title="Built-in agents" icon="codicon:shield" description="Built-in profiles are managed by Zen. Voice-only profiles expose only their approved configuration controls.">
        <div className="space-y-2">{agents.filter((agent) => agent.is_builtin).map((agent) => <AgentCard key={agent.id} agent={agent} onEdit={() => setEditorAgent(agent)} onDelete={() => undefined} />)}</div>
      </SettingsSection>
    </div>
  );
}
