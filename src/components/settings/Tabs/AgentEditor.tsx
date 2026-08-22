import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bot, ChevronDown, User, X } from "lucide-react";
import { AgentProfileDraft, AgentInfo } from "@/api";
import { mapBackendToolMeta, toolsApi, type ToolMeta } from "@/api";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchInput } from "@/components/ui/WorkbenchInput";
import { Switch } from "@/components/ui/switch";
import { ModelSearchDropdown } from "@/atlas/components/chat/input/ModelSearchDropdown";
import type { Model } from "@/atlas/components/model-types";
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

const COLOR_DOT: Record<string, string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-400",
  violet: "bg-violet-400",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
};

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
    reasoning: model.reasoning,
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

  // The dropdown's own selected value already communicates inherit vs override —
  // no caption underneath duplicating it.
  return (
    <div className="flex items-center gap-0.5">
      <ModelSearchDropdown
        isOpen={pickerOpen}
        setIsOpen={setPickerOpen}
        models={models}
        selectedModelId={model || activeModel}
        selectedProvider={provider || activeProvider}
        onSelectModel={(id, nextProvider) => onChange(id, nextProvider)}
        isCompact={false}
        triggerClassName="h-8 min-h-0 justify-between gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium shadow-xs hover:border-border-strong"
      />
      {model && (
        <button
          type="button"
          onClick={() => onChange(null, null)}
          aria-label="Clear model override so this agent inherits the parent model"
          title="Clear the override so this agent inherits the parent model"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X aria-hidden="true" className="h-3 w-3" />
        </button>
      )}
      {fetchingModels && <span className="text-[11px] text-muted-foreground">Refreshing…</span>}
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  );
}

/**
 * Collapsible form section. Collapsed state shows a one-line summary of the
 * current values so users don't expand a section just to confirm settings.
 */
function Section({
  id, title, summary, defaultOpen = false, children,
}: {
  id: string;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        <h4 id={`${id}-heading`} className="text-xs font-semibold text-foreground">{title}</h4>
        {summary && <span className="ml-auto min-w-0 truncate text-[11px] font-normal text-muted-foreground">{summary}</span>}
      </button>
      {open && <div className="space-y-3 border-t border-border px-3.5 py-3">{children}</div>}
    </section>
  );
}

/** Compact delegation row: icon + label + switch; description lives in the tooltip. */
function SwitchRow({
  icon, label, detail, checked, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label title={detail} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
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

      {error && <div className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</div>}

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
        <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving || fetchingModels} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-60">
          {saving && <WorkbenchIcon name="codicon:loading" className="h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save model"}
        </button>
      </footer>
    </div>
  );
}

export function AgentEditor({
  agent,
  agents: _agents,
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
  const [toolQuery, setToolQuery] = useState("");
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

  const update = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const toggleTool = (toolId: string) => {
    update("tool_ids", draft.tool_ids.includes(toolId)
      ? draft.tool_ids.filter((id) => id !== toolId)
      : [...draft.tool_ids, toolId]);
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
    <form onSubmit={submit} className="space-y-3">
      <header className="flex items-start gap-3">
        <button type="button" onClick={onCancel} className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to agents">
          <WorkbenchIcon name="lucide:arrow-left" className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-foreground">{isEditing ? "Edit subagent" : "New subagent"}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Create a focused specialist with bounded tools and a separate system prompt.</p>
        </div>
      </header>

      {error && <div className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</div>}

      <Section id="agent-basics" title="Basics" defaultOpen>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><FieldLabel htmlFor="agent-name">Name</FieldLabel><WorkbenchInput id="agent-name" value={draft.name} onChangeText={(value) => update("name", value)} placeholder="Code reviewer" required /></div>
          <div className="space-y-1.5"><FieldLabel htmlFor="agent-id">ID</FieldLabel><WorkbenchInput id="agent-id" value={draft.id} onChangeText={(value) => update("id", value)} disabled={isEditing} required /></div>
        </div>
        <div className="space-y-1.5"><FieldLabel htmlFor="agent-description">Description</FieldLabel><WorkbenchInput id="agent-description" value={draft.description} onChangeText={(value) => update("description", value)} placeholder="Reviews changes for correctness and security" /></div>
        {/* Inline swatch group — no label row; the swatches are self-evident. */}
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={draft.color === c.value}
              aria-label={c.label}
              title={c.label}
              onClick={() => update("color", c.value)}
              className={cn(
                "h-5 w-5 rounded-full transition-opacity",
                COLOR_DOT[c.value],
                draft.color === c.value
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                  : "opacity-60 hover:opacity-100",
              )}
            />
          ))}
        </div>
      </Section>

      <Section
        id="agent-execution"
        title="Execution"
        summary={`${draft.max_iterations ?? "∞"} iterations · ${draft.model_override ? draft.model_override : "inherit model"} · ${draft.context_window ? `${draft.context_window} tokens` : "inherit tokens"}`}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5"><FieldLabel htmlFor="agent-model">Model</FieldLabel><ModelSelectionField model={draft.model_override} provider={draft.model_provider} onChange={(model, provider) => setDraft((current) => ({ ...current, model_override: model, model_provider: provider }))} /></div>
          <div className="space-y-1.5"><FieldLabel htmlFor="agent-iterations">Max iterations</FieldLabel><WorkbenchInput id="agent-iterations" type="number" min={1} max={100} value={draft.max_iterations ?? ""} onChange={(event) => update("max_iterations", event.target.value ? Number(event.target.value) : null)} /></div>
          <div className="space-y-1.5"><FieldLabel htmlFor="agent-context">Context tokens</FieldLabel><WorkbenchInput id="agent-context" type="number" min={1024} value={draft.context_window ?? ""} onChange={(event) => update("context_window", event.target.value ? Number(event.target.value) : null)} placeholder="Inherit" /></div>
          <div className="space-y-1.5"><FieldLabel htmlFor="agent-memory">Max messages</FieldLabel><WorkbenchInput id="agent-memory" type="number" min={1} value={draft.max_messages_in_memory ?? ""} onChange={(event) => update("max_messages_in_memory", event.target.value ? Number(event.target.value) : null)} placeholder="Inherit" /></div>
        </div>
      </Section>

      <Section id="agent-tools" title="Allowed tools" summary={`${draft.tool_ids.length} tools selected`}>
        {toolsLoading ? <p className="text-xs text-muted-foreground">Loading tool capabilities…</p> : (
          <>
            <WorkbenchInput value={toolQuery} onChangeText={setToolQuery} placeholder={`Filter ${tools.length} tools…`} aria-label="Filter tools" />
            {/* Dense picker: one line per tool; description moved to tooltip. */}
            <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
              {tools
                .filter((tool) => `${tool.id} ${tool.name} ${tool.description}`.toLowerCase().includes(toolQuery.trim().toLowerCase()))
                .map((tool) => {
                  const selected = draft.tool_ids.includes(tool.id);
                  return (
                    <label key={tool.id} title={tool.description} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted">
                      <input type="checkbox" checked={selected} onChange={() => toggleTool(tool.id)} className="h-3.5 w-3.5 accent-primary" />
                      <span className={cn("min-w-0 truncate text-xs", selected ? "font-medium text-foreground" : "text-muted-foreground")}>{tool.name}</span>
                    </label>
                  );
                })}
            </div>
          </>
        )}
      </Section>

      <Section id="agent-behavior" title="Behavior" summary={`AGENTS.md ${draft.inject_agents_md ? "on" : "off"}`}>
        <div className="space-y-1.5"><FieldLabel htmlFor="agent-instructions">System prompt</FieldLabel><textarea id="agent-instructions" value={draft.instructions} onChange={(event) => update("instructions", event.target.value)} placeholder="Describe this subagent's role, workflow, and output format…" className="max-h-72 min-h-24 w-full resize-y field-sizing-content rounded-lg border border-border bg-background px-3 py-2 text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/20" required /></div>
        <SwitchRow
          icon={<WorkbenchIcon name="lucide:file-text" className="h-3.5 w-3.5" />}
          label="Load workspace AGENTS.md"
          detail="Append the workspace-root instructions to this subagent's system prompt."
          checked={draft.inject_agents_md}
          onChange={(value) => update("inject_agents_md", value)}
        />
      </Section>

      <Section
        id="agent-delegation"
        title="Delegation"
        summary={[draft.model_invocable && "main may invoke", draft.user_invocable && "user-facing"].filter(Boolean).join(" · ")}
      >
        <SwitchRow icon={<Bot aria-hidden="true" className="h-3.5 w-3.5" />} label="Main agent may invoke" detail="Allow the coordinator to select this profile for delegated tasks." checked={draft.model_invocable} onChange={(value) => update("model_invocable", value)} />
        <SwitchRow icon={<User aria-hidden="true" className="h-3.5 w-3.5" />} label="Show as a user agent" detail="Make this profile available for direct selection in future agent workflows." checked={draft.user_invocable} onChange={(value) => update("user_invocable", value)} />
      </Section>

      <footer className="flex items-center justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={onCancel} className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted">Cancel</button><button type="submit" disabled={saving || toolsLoading} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-60">{saving && <WorkbenchIcon name="codicon:loading" className="h-3.5 w-3.5 animate-spin" />}{saving ? "Saving…" : isEditing ? "Save changes" : "Create subagent"}</button></footer>
    </form>
  );
}
