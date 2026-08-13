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
  const activeModel = useSettingsStore((state) => state.activeModel);
  const availableModelsByProvider = useSettingsStore((state) => state.availableModelsByProvider);
  const { titleModelOptions, modelProviderFor } = useMemo(() => {
    const seen = new Set<string>();
    const models: Array<{ value: string; label: string }> = [];
    const providers = new Map<string, string>();

    for (const [providerKey, providerModels] of Object.entries(availableModelsByProvider)) {
      const providerName = providerOrder.find((provider) => provider.key === providerKey)?.name ?? providerKey;
      for (const model of providerModels) {
        const id = model.id || model.name || "";
        if (!id || seen.has(id)) continue;
        seen.add(id);
        models.push({ value: id, label: `${model.name || id} (${providerName})` });
        providers.set(id, providerKey);
      }
    }

    models.sort((left, right) => left.label.localeCompare(right.label));
    return {
      titleModelOptions: [
        { value: "", label: activeModel ? `Use chat model (${activeModel})` : "Use the current chat model" },
        ...models,
      ],
      modelProviderFor: (modelId: string) => (modelId ? providers.get(modelId) ?? "" : ""),
    };
  }, [activeModel, availableModelsByProvider]);

  const handleTitleMakerModelChange = (modelId: string) => {
    onUpdate("chat.title-maker-model", modelId);
    onUpdate("chat.title-maker-provider", modelProviderFor(modelId));
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
          <label className="text-[13px] font-medium text-foreground">System Instructions</label>
          <WorkbenchTextArea
            value={settings["chat.system-instructions"] || ""}
            onChangeText={v => onUpdate("chat.system-instructions", v)}
            placeholder="Custom instructions for the AI assistant..."
            className="min-h-[80px] text-xs bg-background"
          />
          <p className="text-[10px] text-muted-foreground">
            These instructions are prepended to every conversation.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Session titles" icon="lucide:text-cursor-input" description="Automatically name new sessions from the first user message">
        <SettingsRow
          label="Auto-generate titles"
          description="Create a short title for each new session"
          control={
            <WorkbenchSwitch
              checked={settings["chat.title-maker-enabled"] !== "false"}
              onCheckedChange={(value) => onUpdate("chat.title-maker-enabled", String(value))}
            />
          }
          icon="lucide:sparkles"
        />

        {settings["chat.title-maker-enabled"] !== "false" && (
          <>
            <SettingsRow
              label="Title model"
              description="Uses the current chat model by default"
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
              <p className="px-3 py-2 text-[10px] text-muted-foreground">
                Connect a provider to choose a separate title model.
              </p>
            )}
            <div className="space-y-2 px-3 py-3">
              <label className="text-[13px] font-medium text-foreground">Title instructions</label>
              <WorkbenchTextArea
                value={settings["chat.title-maker-prompt"] ?? DEFAULT_TITLE_PROMPT}
                onChangeText={(value) => onUpdate("chat.title-maker-prompt", value)}
                placeholder={DEFAULT_TITLE_PROMPT}
                className="min-h-[80px] text-xs bg-background"
              />
              <p className="text-[10px] text-muted-foreground">
                Keep the output short and descriptive; titles are limited to 50 characters.
              </p>
            </div>
          </>
        )}
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
          label="Reasoning disclosure"
          description="Choose how much reasoning detail is visible by default"
          control={
            <WorkbenchSelect
              value={settings["chat.reasoning-disclosure-density"] || "balanced"}
              onValueChange={v => onUpdate("chat.reasoning-disclosure-density", v)}
              options={[
                { value: "compact", label: "Compact" },
                { value: "balanced", label: "Balanced" },
                { value: "detailed", label: "Detailed" },
              ]}
              width={140}
            />
          }
          icon="lucide:panels-top-left"
        />

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
