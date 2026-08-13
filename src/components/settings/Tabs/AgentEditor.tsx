import { FormEvent, useEffect, useMemo, useState } from "react";
import { AgentProfileDraft, AgentInfo } from "@/api";
import { mapBackendToolMeta, toolsApi, type ToolMeta } from "@/api";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchInput } from "@/components/ui/WorkbenchInput";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { ModelSearchDropdown } from "@/atlas/components/chat/input/ModelSearchDropdown";
import type { Model } from "@/atlas/components/ModelSelector";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import type { ModelInfo } from "@/lib/types/provider";
import { cn } from "@/lib/utils";

export type AgentDraft = AgentProfileDraft;

const COLORS = [
  { value: "slate", label: "Slate" },
  { value: "blue", label: "Blue" },
  { value: "violet", label: "Violet" },
  { value: "emerald", label: "Emerald" },
  { value: "amber", label: "Amber" },
  { value: "rose", label: "Rose" },
];

const EMPTY_DRAFT: AgentDraft = {
  id: "new-agent",
  name: "",
  description: "",
  instructions: "",
  tool_ids: [],
  model_override: null,
  model_provider: null,
  max_iterations: 20,
  context_window: null,
  max_messages_in_memory: null,
  color: "violet",
  user_invocable: false,
  model_invocable: true,
  allow_nested_delegation: false,
  allowed_agent_ids: [],
  inject_agents_md: true,
};

function defaultToolIds(tools: ToolMeta[]): string[] {
  return tools
    .filter((tool) => /read|search|list|grep|document|vector|knowledge/i.test(`${tool.id} ${tool.name}`))
    .map((tool) => tool.id)
    .filter((id) => !/spawn|write|edit|delete|command|shell|terminal/i.test(id));
}

function toDraft(agent?: AgentInfo): AgentDraft {
  if (!agent) return EMPTY_DRAFT;
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    instructions: agent.instructions,
    tool_ids: agent.tool_ids,
    model_override: agent.model_override || null,
    model_provider: agent.model_provider || null,
    max_iterations: agent.max_iterations ?? null,
    context_window: agent.context_window ?? null,
    max_messages_in_memory: agent.max_messages_in_memory ?? null,
    color: agent.color || "violet",
    user_invocable: agent.user_invocable,
    model_invocable: agent.model_invocable,
    allow_nested_delegation: agent.allow_nested_delegation,
    allowed_agent_ids: agent.allowed_agent_ids,
    inject_agents_md: agent.inject_agents_md,
  };
}

function toPickerModel(model: ModelInfo): Model {
  const provider = model.provider || "default";
  return {
    id: model.id,
    name: model.displayName || model.name || model.id,
    provider,
    description: model.description || "Provider model",
    category: "Balanced",
    capabilities: model.capabilities || [],
    available: model.state !== "missing",
    contextWindow: model.contextWindow,
    supportsReasoning: model.supportsReasoning,
    reasoningConfigType: model.reasoningConfigType,
  };
}

function ModelSelectionField({
  model,
  provider,
  onChange,
}: {
  model?: string | null;
  provider?: string | null;
  onChange: (model: string | null, provider: string | null) => void;
}) {
  const activeModel = useSettingsStore((state) => state.activeModel);
  const activeProvider = useSettingsStore((state) => state.activeProvider);
  const availableModels = useSettingsStore((state) => state.availableModels);
  const fetchingModels = useSettingsStore((state) => state.fetchingModels);
  const syncModelCatalog = useSettingsStore((state) => state.syncModelCatalog);
  const [pickerOpen, setPickerOpen] = useState(false);
  const models = useMemo(() => availableModels.map(toPickerModel), [availableModels]);

  useEffect(() => {
    if (availableModels.length === 0 && !fetchingModels) {
      void syncModelCatalog();
    }
  }, [availableModels.length, fetchingModels, syncModelCatalog]);

  const selectedModelId = model || activeModel;
  const selectedProvider = provider || activeProvider;
  const label = model ? `${provider || activeProvider} / ${model}` : `Inherit parent · ${activeProvider} / ${activeModel || "active model"}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ModelSearchDropdown
        isOpen={pickerOpen}
        setIsOpen={setPickerOpen}
        models={models}
        selectedModelId={selectedModelId}
        selectedProvider={selectedProvider}
        onSelectModel={(id, nextProvider) => onChange(id, nextProvider)}
        isCompact={false}
      />
      <span className="min-w-0 truncate text-xs text-muted-foreground" title={label}>{label}</span>
      {model && <button type="button" onClick={() => onChange(null, null)} className="text-[11px] font-medium text-primary hover:underline">Use parent model</button>}
      {fetchingModels && <span className="text-[11px] text-muted-foreground">Refreshing models…</span>}
    </div>
  );
}

function FieldLabel({ htmlFor, children, detail }: { htmlFor: string; children: React.ReactNode; detail?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-foreground">
      {children}
      {detail && <span className="ml-2 text-[11px] font-normal text-muted-foreground">{detail}</span>}
    </label>
  );
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5 hover:bg-muted">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}

function VoiceDisplayModelEditor({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (model: string | null) => Promise<void>;
}) {
  const activeModel = useSettingsStore((state) => state.activeModel);
  const activeProvider = useSettingsStore((state) => state.activeProvider);
  const availableModels = useSettingsStore((state) => state.availableModels);
  const fetchingModels = useSettingsStore((state) => state.fetchingModels);
  const voiceDisplayAgentModel = useSettingsStore((state) => state.voiceDisplayAgentModel);
  const syncModelCatalog = useSettingsStore((state) => state.syncModelCatalog);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(voiceDisplayAgentModel || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const models = useMemo(() => availableModels.map(toPickerModel), [availableModels]);
  const selection = selectedModel.split("::");
  const selectedModelId = selection.length > 1 ? selection.slice(1).join("::") : selectedModel || activeModel;
  const selectedProvider = selection.length > 1 ? selection[0] : activeProvider;
  const selectedLabel = selectedModel
    ? selectedModel
    : `Inherit parent · ${activeProvider} / ${activeModel || "active model"}`;

  useEffect(() => {
    if (availableModels.length === 0 && !fetchingModels) {
      void syncModelCatalog();
    }
  }, [availableModels.length, fetchingModels, syncModelCatalog]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(selectedModel || null);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "The voice display model could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-7">
      <header className="flex items-start gap-3">
        <button type="button" onClick={onCancel} className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to agents">
          <WorkbenchIcon name="lucide:arrow-left" className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">ZEN-DISPLAY</h3>
            <span className="rounded border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] text-cyan-200">Voice only</span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">This automatic built-in subagent renders the voice board. Its prompt, board-only tool permission, and execution limits are fixed by Zen. Only the model can be changed.</p>
        </div>
      </header>

      {error && <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</div>}

      <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-labelledby="voice-display-model-heading">
        <div>
          <h4 id="voice-display-model-heading" className="text-sm font-semibold text-foreground">Display model</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Use the existing provider catalog. Search by provider or model name, or inherit the model selected for the main agent.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ModelSearchDropdown
            isOpen={pickerOpen}
            setIsOpen={setPickerOpen}
            models={models}
            selectedModelId={selectedModelId}
            selectedProvider={selectedProvider}
            onSelectModel={(id, provider) => setSelectedModel(`${provider}::${id}`)}
            isCompact={false}
          />
          <span className="min-w-0 truncate text-xs text-muted-foreground" title={selectedLabel}>{selectedLabel}</span>
          {selectedModel && <button type="button" onClick={() => setSelectedModel("")} className="text-[11px] font-medium text-primary hover:underline">Use parent model</button>}
        </div>
        {fetchingModels && <p className="text-[11px] text-muted-foreground">Refreshing provider models…</p>}
        {!fetchingModels && models.length === 0 && <p className="text-[11px] text-amber-200">No provider models are cached. Configure a provider in Models & providers, then return here.</p>}
      </section>

      <footer className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <button type="button" onClick={onCancel} className="h-9 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving || fetchingModels} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-60">
          {saving && <WorkbenchIcon name="codicon:loading" className="h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save model"}
        </button>
      </footer>
    </div>
  );
}

export function AgentEditor({
  agent,
  agents,
  modelOnly = false,
  onCancel,
  onSave,
  onSaveModel,
}: {
  agent?: AgentInfo;
  agents: AgentInfo[];
  modelOnly?: boolean;
  onCancel: () => void;
  onSave?: (draft: AgentDraft) => Promise<void>;
  onSaveModel?: (model: string | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AgentDraft>(() => toDraft(agent));
  const [tools, setTools] = useState<ToolMeta[]>([]);
  const [toolsLoading, setToolsLoading] = useState(!modelOnly);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(agent);

  useEffect(() => {
    if (modelOnly) return;
    let cancelled = false;
    toolsApi.listToolMetadata()
      .then((items) => {
        if (cancelled) return;
        const mapped = items.filter((item) => item.name).map(mapBackendToolMeta);
        setTools(mapped);
        if (!agent && draft.tool_ids.length === 0) {
          setDraft((current) => ({ ...current, tool_ids: defaultToolIds(mapped) }));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Tool capabilities could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setToolsLoading(false);
      });
    return () => { cancelled = true; };
  }, [agent, draft.tool_ids.length, modelOnly]);

  const availableChildren = useMemo(
    () => agents.filter((candidate) => candidate.id !== agent?.id),
    [agent?.id, agents],
  );

  const update = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const toggleTool = (toolId: string) => {
    update("tool_ids", draft.tool_ids.includes(toolId)
      ? draft.tool_ids.filter((id) => id !== toolId)
      : [...draft.tool_ids, toolId]);
  };

  const toggleChild = (agentId: string) => {
    update("allowed_agent_ids", draft.allowed_agent_ids.includes(agentId)
      ? draft.allowed_agent_ids.filter((id) => id !== agentId)
      : [...draft.allowed_agent_ids, agentId]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!draft.name.trim() || !draft.instructions.trim()) {
      setError("Name and system instructions are required.");
      return;
    }
    if (draft.tool_ids.length === 0) {
      setError("Select at least one allowed tool.");
      return;
    }
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({
        ...draft,
        id: draft.id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "new-agent",
        name: draft.name.trim(),
        description: draft.description.trim(),
        instructions: draft.instructions.trim(),
        model_override: draft.model_override?.trim() || null,
        model_provider: draft.model_override?.trim() ? draft.model_provider?.trim() || null : null,
      });
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "The agent could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (modelOnly && onSaveModel) {
    return <VoiceDisplayModelEditor onCancel={onCancel} onSave={onSaveModel} />;
  }

  return (
    <form onSubmit={submit} className="space-y-7">
      <header className="flex items-start gap-3">
        <button type="button" onClick={onCancel} className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to agents">
          <WorkbenchIcon name="lucide:arrow-left" className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-foreground">{isEditing ? "Edit subagent" : "New subagent"}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Create a focused specialist with bounded tools and a separate system prompt.</p>
        </div>
      </header>

      {error && <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</div>}

      <section className="space-y-3" aria-labelledby="agent-basics-heading">
        <div><h4 id="agent-basics-heading" className="text-sm font-semibold text-foreground">Basics</h4><p className="text-xs text-muted-foreground">How this specialist appears in Zen.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><FieldLabel htmlFor="agent-name">Name</FieldLabel><WorkbenchInput id="agent-name" value={draft.name} onChangeText={(value) => update("name", value)} placeholder="Code reviewer" required /></div>
          <div className="space-y-1.5"><FieldLabel htmlFor="agent-id" detail="stable internal ID">ID</FieldLabel><WorkbenchInput id="agent-id" value={draft.id} onChangeText={(value) => update("id", value)} disabled={isEditing} required /></div>
        </div>
        <div className="space-y-1.5"><FieldLabel htmlFor="agent-description">Description</FieldLabel><WorkbenchInput id="agent-description" value={draft.description} onChangeText={(value) => update("description", value)} placeholder="Reviews changes for correctness and security" /></div>
        <div className="space-y-1.5"><FieldLabel htmlFor="agent-color">Color</FieldLabel><WorkbenchSelect value={draft.color || "violet"} onValueChange={(value) => update("color", value)} options={COLORS} width={180} /></div>
      </section>

      <section className="space-y-3" aria-labelledby="agent-execution-heading">
        <div><h4 id="agent-execution-heading" className="text-sm font-semibold text-foreground">Execution</h4><p className="text-xs text-muted-foreground">Keep delegated work scoped to the capabilities it needs.</p></div>
        <div className="space-y-1.5"><FieldLabel htmlFor="agent-model" detail="leave blank to inherit the parent model">Model override</FieldLabel><ModelSelectionField model={draft.model_override} provider={draft.model_provider} onChange={(model, provider) => setDraft((current) => ({ ...current, model_override: model, model_provider: provider }))} /></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><FieldLabel htmlFor="agent-iterations">Max iterations</FieldLabel><WorkbenchInput id="agent-iterations" type="number" min={1} max={100} value={draft.max_iterations ?? ""} onChange={(event) => update("max_iterations", event.target.value ? Number(event.target.value) : null)} /></div>
          <div className="space-y-1.5"><FieldLabel htmlFor="agent-context">Context tokens</FieldLabel><WorkbenchInput id="agent-context" type="number" min={1024} value={draft.context_window ?? ""} onChange={(event) => update("context_window", event.target.value ? Number(event.target.value) : null)} placeholder="Inherit" /></div>
          <div className="space-y-1.5"><FieldLabel htmlFor="agent-memory">Max messages</FieldLabel><WorkbenchInput id="agent-memory" type="number" min={1} value={draft.max_messages_in_memory ?? ""} onChange={(event) => update("max_messages_in_memory", event.target.value ? Number(event.target.value) : null)} placeholder="Inherit" /></div>
        </div>
        <div><h5 className="mb-2 text-xs font-medium text-foreground">Allowed tools <span className="font-normal text-muted-foreground">({draft.tool_ids.length} selected)</span></h5>{toolsLoading ? <p className="text-xs text-muted-foreground">Loading tool capabilities…</p> : <div className="grid gap-2 sm:grid-cols-2">{tools.map((tool) => { const selected = draft.tool_ids.includes(tool.id); return <label key={tool.id} className={cn("flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2", selected ? "border-primary bg-muted" : "border-border bg-card hover:bg-muted")}><input type="checkbox" checked={selected} onChange={() => toggleTool(tool.id)} className="mt-0.5 h-4 w-4 accent-primary" /><span className="min-w-0"><span className="block truncate text-xs font-medium text-foreground">{tool.name}</span><span className="block truncate text-[10px] text-muted-foreground">{tool.description}</span></span></label>; })}</div>}</div>
      </section>

      <section className="space-y-3" aria-labelledby="agent-behavior-heading">
        <div><h4 id="agent-behavior-heading" className="text-sm font-semibold text-foreground">Behavior</h4><p className="text-xs text-muted-foreground">The prompt is isolated from the parent conversation and receives the delegated task.</p></div>
        <div className="space-y-1.5"><FieldLabel htmlFor="agent-instructions">System prompt</FieldLabel><textarea id="agent-instructions" value={draft.instructions} onChange={(event) => update("instructions", event.target.value)} placeholder="Describe this subagent's role, workflow, and output format…" className="min-h-44 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/20" required /></div>
        <Toggle label="Load workspace AGENTS.md" detail="Append the workspace-root instructions to this subagent's system prompt." checked={draft.inject_agents_md} onChange={(value) => update("inject_agents_md", value)} />
      </section>

      <section className="space-y-3" aria-labelledby="agent-delegation-heading">
        <div><h4 id="agent-delegation-heading" className="text-sm font-semibold text-foreground">Delegation</h4><p className="text-xs text-muted-foreground">Control who can use this specialist and whether it can create more work.</p></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle label="Main agent may invoke" detail="Allow the coordinator to select this profile for delegated tasks." checked={draft.model_invocable} onChange={(value) => update("model_invocable", value)} />
          <Toggle label="Show as a user agent" detail="Make this profile available for direct selection in future agent workflows." checked={draft.user_invocable} onChange={(value) => update("user_invocable", value)} />
          <Toggle label="Allow nested delegation" detail="Permit this subagent to spawn child agents. Off by default to prevent recursion." checked={draft.allow_nested_delegation} onChange={(value) => update("allow_nested_delegation", value)} />
        </div>
        {draft.allow_nested_delegation && <div className="space-y-2"><h5 className="text-xs font-medium text-foreground">Allowed child agents</h5>{availableChildren.length === 0 ? <p className="text-xs text-muted-foreground">No other agent profiles are available.</p> : <div className="grid gap-2 sm:grid-cols-2">{availableChildren.map((child) => <label key={child.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2"><input type="checkbox" checked={draft.allowed_agent_ids.includes(child.id)} onChange={() => toggleChild(child.id)} className="h-4 w-4 accent-primary" /><span className="truncate text-xs text-foreground">{child.name}</span></label>)}</div>}</div>}
      </section>

      <footer className="flex items-center justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={onCancel} className="h-9 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted">Cancel</button><button type="submit" disabled={saving || toolsLoading} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-60">{saving && <WorkbenchIcon name="codicon:loading" className="h-3.5 w-3.5 animate-spin" />}{saving ? "Saving…" : isEditing ? "Save changes" : "Create subagent"}</button></footer>
    </form>
  );
}
