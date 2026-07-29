import { useMemo } from "react";
import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSwitch } from "../ui/WorkbenchSwitch";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchSlider } from "../ui/WorkbenchSlider";
import { WorkbenchTextArea } from "../ui/WorkbenchTextArea";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { providerOrder } from "@/lib/types/provider";

interface ChatSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

const DEFAULT_TITLE_PROMPT =
  "Generate a concise, descriptive title (5 words or fewer, under 50 characters) for a chat session based on the user's first message. Output ONLY the title text — no quotes, punctuation, or explanation.";

export function ChatSettings({ settings, onUpdate }: ChatSettingsProps) {
  const activeProvider = useSettingsStore((s) => s.activeProvider);
  const activeModel = useSettingsStore((s) => s.activeModel);
  const availableModelsByProvider = useSettingsStore((s) => s.availableModelsByProvider);
  const revealCompletedToolHistory = useSettingsStore((s) => s.revealCompletedToolHistory);
  const setRevealCompletedToolHistory = useSettingsStore((s) => s.setRevealCompletedToolHistory);

  // Build the cross-provider picker AND a parallel model-to-provider lookup.
  // When the user picks a model we must persist BOTH identifiers: a model
  // id alone is ambiguous across the fleet (e.g. `llama3.2:3b` could
  // legitimately live under ollama OR nine_router). The Rust title-maker
  // command reads `chat.title-maker-provider` and only falls back to
  // `active_provider` when it is empty, so the selected provider must
  // round-trip through persistence intact.
  const { titleModelOptions, modelProviderFor } = useMemo(() => {
    const seen = new Set<string>();
    const flat: { value: string; label: string }[] = [];
    const providerByModel = new Map<string, string>();
    for (const [providerKey, models] of Object.entries(availableModelsByProvider)) {
      const providerName =
        providerOrder.find((p) => p.key === providerKey)?.name ?? providerKey;
      for (const model of models) {
        const id = model.id || model.name || "";
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const label = providerName ? `${model.name || id} (${providerName})` : model.name || id;
        flat.push({ value: id, label });
        providerByModel.set(id, providerKey);
      }
    }
    flat.sort((a, b) => a.label.localeCompare(b.label));
    const defaultEntry = activeModel
      ? { value: "", label: `Use chat model (${activeModel})` }
      : { value: "", label: "Use the current chat model" };
    return {
      titleModelOptions: [defaultEntry, ...flat],
      // Empty string is an explicit signal: the user picked the default
      // ("Use the current chat model") and the backend should fall back
      // to active_provider / active_model. Returning "" for safety on
      // unknown model ids too — never write a guessed provider name.
      modelProviderFor: (modelId: string): string =>
        (modelId && providerByModel.get(modelId)) || "",
    };
  }, [availableModelsByProvider, activeModel, activeProvider]);

  // Atomic title-maker model+provider update. Picking "Use the current
  // chat model" clears both fields so the backend falls back to
  // active_provider / active_model. Picking a real model writes both
  // fields from the same lookup so the picker and the persisted settings
  // never disagree.
  const handleTitleMakerModelChange = (modelId: string) => {
    const providerKey = modelProviderFor(modelId);
    onUpdate("chat.title-maker-model", modelId);
    onUpdate("chat.title-maker-provider", providerKey);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Chat</h3>
        <p className="text-[13px] text-muted-foreground">Configure conversation behavior and AI response settings.</p>
      </div>

      <SettingsSection title="Persona" icon="lucide:bot" description="AI response personality and instructions">
        <SettingsRow
          label="Response Style"
          description="Default communication tone"
          control={
            <WorkbenchSelect
              value={settings["chat.response-style"] || "neutral"}
              onValueChange={v => onUpdate("chat.response-style", v)}
              options={[
                { value: "neutral", label: "Neutral" },
                { value: "friendly", label: "Friendly" },
                { value: "technical", label: "Technical" },
                { value: "concise", label: "Concise" },
                { value: "detailed", label: "Detailed" },
              ]}
              width={140}
            />
          }
          icon="lucide:message-square"
        />

        <div className="px-3 py-2 space-y-2">
          <label className="text-[13px] font-medium text-foreground/80">System Instructions</label>
          <WorkbenchTextArea
            value={settings["chat.system-instructions"] || ""}
            onChangeText={v => onUpdate("chat.system-instructions", v)}
            placeholder="Custom instructions for the AI assistant..."
            className="min-h-[80px] text-xs bg-background/50"
          />
          <p className="text-[10px] text-muted-foreground/60">
            These instructions are prepended to every conversation.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Title Maker" icon="lucide:text-cursor-input" description="Auto-generate short session titles from the first user message">
        <SettingsRow
          label="Auto-generate Title"
          description="Generate a short title (≤5 words, ≤50 chars) for new sessions based on the first user message"
          control={
            <WorkbenchSwitch
              checked={settings["chat.title-maker-enabled"] !== "false"}
              onCheckedChange={v => onUpdate("chat.title-maker-enabled", String(v))}
            />
          }
          icon="lucide:sparkles"
        />

        {settings["chat.title-maker-enabled"] !== "false" && (
          <>
            <SettingsRow
              label="Title Model"
              description="Lightweight model used to generate the title. Defaults to the active chat model."
              control={
                <WorkbenchSelect
                  value={settings["chat.title-maker-model"] ?? ""}
                  onValueChange={handleTitleMakerModelChange}
                  options={titleModelOptions}
                  width={260}
                />
              }
              icon="lucide:cpu"
            />
            {titleModelOptions.length === 1 && (
              <p className="text-[10px] text-muted-foreground/60 px-3">
                No model list cached yet. Connect a provider in the Providers tab to populate available models.
              </p>
            )}

            <div className="px-3 py-2 space-y-2">
              <label className="text-[13px] font-medium text-foreground/80">Title System Prompt</label>
              <WorkbenchTextArea
                value={settings["chat.title-maker-prompt"] ?? DEFAULT_TITLE_PROMPT}
                onChangeText={v => onUpdate("chat.title-maker-prompt", v)}
                placeholder={DEFAULT_TITLE_PROMPT}
                className="min-h-[80px] text-xs bg-background/50"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Leave default to keep titles concise. Output is automatically truncated to 50 characters.
              </p>
            </div>
          </>
        )}
      </SettingsSection>

      <SettingsSection title="Timeline" icon="lucide:list-tree" description="How past tool execution appears in the chat transcript">
        <SettingsRow
          label="Show completed tool history"
          description="Keep completed successful tool groups visible after the answer arrives. Off by default so the transcript stays focused on the conversation; turn on to audit past turns."
          control={
            <WorkbenchSwitch
              checked={revealCompletedToolHistory}
              onCheckedChange={setRevealCompletedToolHistory}
            />
          }
          icon="lucide:history"
        />
      </SettingsSection>

      <SettingsSection title="Generation" icon="lucide:sparkles" description="Response generation parameters">
        <SettingsRow
          label="Streaming Speed"
          description="How tokens appear in the UI"
          control={
            <WorkbenchSelect
              value={settings["chat.streaming-speed"] || "instant"}
              onValueChange={v => onUpdate("chat.streaming-speed", v)}
              options={[
                { value: "instant", label: "Instant" },
                { value: "typewriter", label: "Typewriter" },
              ]}
              width={140}
            />
          }
          icon="lucide:cpu"
        />

        <SettingsRow
          label="External Tools"
          description="Allow AI to use file system and terminal tools"
          control={
            <WorkbenchSwitch
              checked={settings["chat.external-tools"] !== "false"}
              onCheckedChange={v => onUpdate("chat.external-tools", String(v))}
            />
          }
          icon="lucide:wrench"
        />
      </SettingsSection>

      <SettingsSection title="Streaming & reasoning" icon="lucide:brain" description="Advanced response behavior">
        <SettingsRow
          label="Response Streaming"
          description="Stream responses token-by-token as they're generated"
          control={
            <WorkbenchSwitch
              checked={settings["chat.streaming"] !== "false"}
              onCheckedChange={v => onUpdate("chat.streaming", String(v))}
            />
          }
          icon="lucide:zap"
        />

        <SettingsRow
          label="Reasoning mode"
          description="Allow supported models to provide concise reasoning summaries"
          control={
            <WorkbenchSwitch
              checked={settings["chat.chain-of-thought"] === "true"}
              onCheckedChange={v => onUpdate("chat.chain-of-thought", String(v))}
            />
          }
          icon="lucide:brain"
        />

        {settings["chat.chain-of-thought"] === "true" && (
          <>
            <SettingsRow
              label="Reasoning Budget"
              description="Max tokens allocated for reasoning"
              control={
                <div className="flex items-center gap-2 w-[140px]">
                  <WorkbenchSlider
                    value={[parseInt(settings["chat.reasoning-budget"] || "1024")]}
                    onValueChange={([v]) => onUpdate("chat.reasoning-budget", String(v))}
                    min={256}
                    max={8192}
                    step={256}
                    className="flex-1"
                  />
                  <span className="text-[11px] font-mono text-muted-foreground w-12 text-right">
                    {settings["chat.reasoning-budget"] || "1024"}
                  </span>
                </div>
              }
              icon="lucide:lightbulb"
            />

            <SettingsRow
              label="Reasoning Effort"
              description="Depth of reasoning analysis"
              control={
                <WorkbenchSelect
                  value={settings["chat.reasoning-effort"] || "medium"}
                  onValueChange={v => onUpdate("chat.reasoning-effort", v)}
                  options={[
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ]}
                  width={120}
                />
              }
              icon="lucide:brain"
            />
          </>
        )}

        <SettingsRow
          label="Prompt Caching"
          description="Cache repeated prompt prefixes for faster responses"
          control={
            <WorkbenchSwitch
              checked={settings["chat.prompt-caching"] !== "false"}
              onCheckedChange={v => onUpdate("chat.prompt-caching", String(v))}
            />
          }
          icon="lucide:cpu"
        />

        <SettingsRow
          label="Hardware Acceleration"
          description="Use GPU for model inference when available"
          control={
            <WorkbenchSwitch
              checked={settings["chat.hardware-accel"] !== "false"}
              onCheckedChange={v => onUpdate("chat.hardware-accel", String(v))}
            />
          }
          icon="lucide:zap"
        />
      </SettingsSection>
    </div>
  );
}
