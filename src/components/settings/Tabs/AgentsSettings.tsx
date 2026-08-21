import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, ChevronDown, X } from "lucide-react";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { agentsApi, type AgentInfo } from "@/api";
import { SettingsSection } from "../SettingsSection";
import { AgentEditor, type AgentDraft } from "./AgentEditor";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { ModelSearchDropdown } from "@/atlas/components/chat/input/ModelSearchDropdown";
import type { Model } from "@/atlas/components/model-types";
import type { ModelInfo } from "@/lib/types/provider";
import { cn } from "@/lib/utils";

const LEVEL_LABEL: Record<string, string> = {
  none: "None", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "X-High", max: "Max",
};
const effortLabel = (v: string) => LEVEL_LABEL[v] ?? v.charAt(0).toUpperCase() + v.slice(1);

// Tinted avatar chips per agent color: soft fill + matching icon tone, so the
// card reads as one accent without hard swatches next to text.
const AVATAR_CLASSES: Record<string, string> = {
  slate: "bg-slate-400/12 text-slate-300 ring-slate-400/25",
  blue: "bg-blue-400/12 text-blue-300 ring-blue-400/25",
  violet: "bg-violet-400/12 text-violet-300 ring-violet-400/25",
  emerald: "bg-emerald-400/12 text-emerald-300 ring-emerald-400/25",
  amber: "bg-amber-400/12 text-amber-300 ring-amber-400/25",
  rose: "bg-rose-400/12 text-rose-300 ring-rose-400/25",
};

function toPickerModel(model: ModelInfo): Model {
  return {
    id: model.id,
    name: model.displayName || model.name || model.id,
    provider: model.provider || "default",
    description: model.description || "Provider model",
    category: "Balanced",
    capabilities: model.capabilities || [],
    available: model.state !== "missing",
    contextWindow: model.contextWindow,
    reasoning: model.reasoning,
  };
}

/**
 * Inline model picker for a built-in agent card. Built-in profiles can't be
 * edited, so the chosen model is persisted separately under `agent_model.<id>`
 * (canonical `provider::model`). Reuses the composer's ModelSearchDropdown so
 * the surface matches the chat model selector. "Inherit" clears the selection
 * and the agent falls back to the parent turn's model.
 */
function AgentModelPicker({ agent, onChanged }: { agent: AgentInfo; onChanged: () => void }) {
  const activeModel = useSettingsStore((state) => state.activeModel);
  const activeProvider = useSettingsStore((state) => state.activeProvider);
  const availableModels = useSettingsStore((state) => state.availableModels);
  const fetchingModels = useSettingsStore((state) => state.fetchingModels);
  const syncModelCatalog = useSettingsStore((state) => state.syncModelCatalog);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const models = useMemo(() => availableModels.map(toPickerModel), [availableModels]);

  useEffect(() => {
    if (availableModels.length === 0 && !fetchingModels) void syncModelCatalog();
  }, [availableModels.length, fetchingModels, syncModelCatalog]);

  const selectedModelId = agent.model_override || activeModel;
  const selectedProvider = agent.model_provider || activeProvider;

  const persist = async (model: string | null) => {
    setSaving(true);
    try {
      await agentsApi.setAgentModel(agent.id, model);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    // Single baseline row: the clear-override affordance is an icon chip, not a
    // text label — a stacked "Inherit" caption duplicated the picker's own
    // selected value and knocked the neighboring dropdown off its baseline.
    <div className="flex shrink-0 items-center gap-0.5">
      {/* Boxed trigger so the selected model reads as a field, not bare text. */}
      <ModelSearchDropdown
        isOpen={open}
        setIsOpen={setOpen}
        models={models}
        selectedModelId={selectedModelId}
        selectedProvider={selectedProvider}
        onSelectModel={(id, provider) => void persist(`${provider}::${id}`)}
        triggerClassName="h-8 min-h-0 justify-between gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium shadow-xs hover:border-border-strong"
      />
      {agent.model_override && (
        <button
          type="button"
          onClick={() => void persist(null)}
          disabled={saving}
          aria-label="Clear model selection so this agent inherits the parent model"
          title="Clear the selection so this agent inherits the parent model"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <X aria-hidden="true" className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Inline reasoning-effort picker for a built-in agent card. Mirrors the model
 * picker: built-ins persist the level under `agent_reasoning.<id>`. The offered
 * levels come from the selected model's resolved capability; a model that can't
 * be tuned from Zen hides the control. "Inherit" clears the override.
 */
function AgentReasoningPicker({
  agent, selectedModel, onChanged,
}: { agent: AgentInfo; selectedModel: Model | undefined; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const cap = selectedModel?.reasoning;
  const zenTunable = cap?.support === "tunable" && cap.controlAvailability === "zen";
  const levels = zenTunable ? (cap?.levels ?? []) : [];
  // Only effort-level (not raw-budget) models get the inline level picker.
  const usesBudget = cap?.minBudget != null || cap?.maxBudget != null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Always visible: every built-in card shows the thinking control. Models
  // without Zen-tunable effort levels render it disabled at "Inherit" so the
  // capability state stays honest instead of the control silently vanishing.
  const tunable = levels.length > 0 && !usesBudget;

  const current = agent.reasoning_effort || "";
  const persist = async (effort: string | null) => {
    setSaving(true);
    try {
      await agentsApi.setAgentReasoning(agent.id, effort);
      onChanged();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!tunable) {
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          disabled
          title={usesBudget
            ? "This model is tuned by token budget, not effort levels"
            : "The selected model has no Zen-tunable thinking levels"}
          className="composer-control h-8 min-h-0 cursor-not-allowed gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium opacity-60"
        >
          <Brain aria-hidden="true" className="h-3.5 w-3.5 text-warning" />
          <span>Inherit</span>
          <ChevronDown aria-hidden="true" className="h-3 w-3 opacity-50" />
        </button>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Reasoning effort for this agent"
        className="composer-control h-8 min-h-0 gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium shadow-xs hover:border-border-strong disabled:opacity-50"
      >
        <Brain aria-hidden="true" className="h-3.5 w-3.5 text-warning" />
        <span>{current ? effortLabel(current) : "Inherit"}</span>
        <ChevronDown aria-hidden="true" className="h-3 w-3 opacity-50" />
      </button>
      {open && (
        <div role="menu" className="composer-popover absolute right-0 top-full z-[120] mt-1 min-w-[9rem] p-1">
          <button
            type="button"
            role="menuitem"
            onClick={() => void persist(null)}
            className={cn("composer-menu-item text-xs", !current && "composer-menu-item--active")}
          >
            Inherit
            {!current && <WorkbenchIcon name="lucide:check" className="h-3.5 w-3.5 text-primary" />}
          </button>
          {levels.map((level) => (
            <button
              key={level}
              type="button"
              role="menuitem"
              onClick={() => void persist(level)}
              className={cn("composer-menu-item text-xs", current === level && "composer-menu-item--active")}
            >
              {effortLabel(level)}
              {current === level && <WorkbenchIcon name="lucide:check" className="h-3.5 w-3.5 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent, onEdit, onDelete, onModelChanged }: { agent: AgentInfo; onEdit: () => void; onDelete: () => void; onModelChanged: () => void }) {
  const voiceDisplayModel = useSettingsStore((state) => agent.config_mode === "model_only" ? state.voiceDisplayAgentModel : "");
  const activeModel = useSettingsStore((state) => state.activeModel);
  const activeProvider = useSettingsStore((state) => state.activeProvider);
  const availableModels = useSettingsStore((state) => state.availableModels);
  const selectedModelLabel = voiceDisplayModel || (agent.model_override
    ? `${agent.model_provider ? `${agent.model_provider} / ` : ""}${agent.model_override}`
    : "inherits model");
  // Built-in agents that actually run (not the voice-only render agent) expose
  // an inline model picker; custom agents keep the full editor.
  const showInlineModelPicker = agent.is_builtin && agent.config_mode !== "model_only";
  // Resolve the effective model so the reasoning picker can offer the right
  // levels: the agent's own override, else the active chat model it inherits.
  const effectiveModel = useMemo(() => {
    const id = agent.model_override || activeModel;
    const provider = agent.model_provider || activeProvider;
    const found = availableModels.find((m) => m.id === id && (m.provider || "default") === provider);
    return found ? toPickerModel(found) : undefined;
  }, [agent.model_override, agent.model_provider, activeModel, activeProvider, availableModels]);
  return (
    <article className="flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-strong/60">
      {/* Accent avatar — one tinted chip carries the agent color */}
      <div className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
        AVATAR_CLASSES[agent.color || "slate"] || AVATAR_CLASSES.slate,
      )} aria-hidden="true">
        <WorkbenchIcon name="lucide:bot" className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h4 className="truncate text-[13px] font-semibold leading-5 text-foreground">{agent.name}</h4>
          {agent.config_mode === "model_only"
            ? <span className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-px text-[10px] font-medium text-cyan-200">Voice only</span>
            : agent.is_builtin && <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-px text-[10px] font-medium text-muted-foreground">Built-in</span>}
        </div>
        <p className="mt-1 truncate text-xs leading-relaxed text-muted-foreground">{agent.description || "No description"}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1"><WorkbenchIcon name="lucide:wrench" className="h-3 w-3 opacity-70" />{agent.tool_count} tools</span>
          {!showInlineModelPicker && <><span aria-hidden="true">·</span><span className="truncate">{selectedModelLabel}</span></>}
          {agent.max_iterations != null && <><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><WorkbenchIcon name="lucide:repeat" className="h-3 w-3 opacity-70" />{agent.max_iterations} iterations</span></>}
          {agent.inject_agents_md && <><span aria-hidden="true">·</span><span>AGENTS.md</span></>}
          <span aria-hidden="true">·</span>
          {/* Spawn id stays visible: custom agents are referenced by it in spawn_agent calls. */}
          <span className="truncate font-mono opacity-70">{agent.id}</span>
        </div>
      </div>

      {/* Right rail: model + thinking selectors on top, row actions below */}
      <div className="flex shrink-0 flex-col items-end gap-2">
        {showInlineModelPicker && (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <AgentModelPicker agent={agent} onChanged={onModelChanged} />
            <AgentReasoningPicker agent={agent} selectedModel={effectiveModel} onChanged={onModelChanged} />
          </div>
        )}
        {(agent.user_editable || agent.config_mode === "model_only") && (
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={onEdit} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Configure ${agent.name}`} title={agent.config_mode === "model_only" ? "Choose display model" : "Edit agent"}><WorkbenchIcon name="lucide:pencil" className="h-3.5 w-3.5" /></button>
            {agent.user_editable && <button type="button" onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${agent.name}`} title="Delete agent"><WorkbenchIcon name="lucide:trash-2" className="h-3.5 w-3.5" /></button>}
          </div>
        )}
      </div>
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
        {agents.filter((agent) => !agent.is_builtin).length === 0 ? <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center"><WorkbenchIcon name="lucide:bot" className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-xs font-medium text-foreground">No custom subagents yet</p><p className="mt-1 text-[11px] text-muted-foreground">Start with a read-only reviewer or research specialist.</p></div> : <div className="space-y-2.5">{agents.filter((agent) => !agent.is_builtin).map((agent) => <AgentCard key={agent.id} agent={agent} onEdit={() => setEditorAgent(agent)} onDelete={() => void deleteAgent(agent)} onModelChanged={() => void loadData()} />)}</div>}
      </SettingsSection>

      <SettingsSection title="Built-in agents" icon="codicon:shield" description="Built-in profiles are managed by Zen. Pick the model each one runs on; leave it on Inherit to follow the model selected for the main chat.">
        <div className="space-y-2.5">{agents.filter((agent) => agent.is_builtin).map((agent) => <AgentCard key={agent.id} agent={agent} onEdit={() => setEditorAgent(agent)} onDelete={() => undefined} onModelChanged={() => void loadData()} />)}</div>
      </SettingsSection>
    </div>
  );
}
