import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import type { SettingsState } from "@/lib/stores/settings/types";
import { VOICE_DISPLAY_AGENT_DEFAULT_PROMPT } from "@/lib/stores/settings/voiceDefaults";
import { providerOrder } from "@/lib/types/provider";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSwitch } from "@/components/settings/ui/WorkbenchSwitch";
import { WorkbenchInput } from "@/components/settings/ui/WorkbenchInput";
import { WorkbenchSlider } from "@/components/settings/ui/WorkbenchSlider";
import { WorkbenchTextArea } from "@/components/settings/ui/WorkbenchTextArea";
import { STTConfig } from "./audio/STTConfig";
import { TTSConfig } from "./audio/TTSConfig";

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export const VoiceSettings = memo(() => {
  const activeProvider = useSettingsStore((s) => s.activeProvider);
  const activeModel = useSettingsStore((s) => s.activeModel);
  const availableModelsByProvider = useSettingsStore((s) => s.availableModelsByProvider);
  const connectionStatuses = useSettingsStore((s) => s.connectionStatuses);
  const testingConnections = useSettingsStore((s) => s.testingConnections);
  const testProviderConnection = useSettingsStore((s) => s.testProviderConnection);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const voiceDisplayAgentEnabled = useSettingsStore((s) => s.voiceDisplayAgentEnabled);
  const displayAgentModel = useSettingsStore((s) => s.voiceDisplayAgentModel);
  const contextTokens = useSettingsStore((s) => s.voiceDisplayAgentContextTokens);
  const maxTurns = useSettingsStore((s) => s.voiceDisplayAgentMaxTurns);
  const autoCompactEnabled = useSettingsStore((s) => s.voiceDisplayAgentAutoCompactEnabled);
  const compactThreshold = useSettingsStore((s) => s.voiceDisplayAgentCompactThreshold);
  const voicePrompt = useSettingsStore((s) => s.voiceDisplayAgentPrompt);

  const [testMessage, setTestMessage] = useState<string | null>(null);

  const providerLabel = useMemo(() => {
    return providerOrder.find((provider) => provider.key === activeProvider)?.name ?? activeProvider;
  }, [activeProvider]);

  const providerModels = availableModelsByProvider[activeProvider] ?? [];
  const displayAgentModels = useMemo(() =>
    Object.entries(availableModelsByProvider).flatMap(([provider, models]) =>
      models.map((model) => ({ ...model, provider }))
    ), [availableModelsByProvider]);
  const selectedModel =
    providerModels.find((model) => model.id === activeModel || model.name === activeModel) ?? null;
  const isTesting = Boolean(testingConnections[activeProvider]);
  const status = connectionStatuses[activeProvider] ?? "idle";
  const setNumberSetting = useCallback((key: keyof SettingsState, value: number, min: number, max: number) => {
    updateSetting(key, clampNumber(value, min, max) as never);
  }, [updateSetting]);

  const handleProviderTest = useCallback(async () => {
    setTestMessage(null);
    const toastId = toast.loading("Testing voice provider route...");
    try {
      await testProviderConnection(activeProvider);
      const nextStatus = useSettingsStore.getState().connectionStatuses[activeProvider];
      if (nextStatus === "success") {
        setTestMessage("Provider reachable. Model discovery returned usable models.");
        toast.success("Voice provider route is working", { id: toastId });
      } else {
        setTestMessage("Provider test finished, but no usable model list was returned.");
        toast.warning("Voice provider test did not find usable models", { id: toastId });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider test failed";
      setTestMessage(message);
      toast.error(message, { id: toastId });
    }
  }, [activeProvider, testProviderConnection]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Voice</h3>
        <p className="text-[13px] text-muted-foreground">
          Configure speech models, voice-stage rendering, and board context policy.
        </p>
      </div>

      <STTConfig />
      <TTSConfig />

      <SettingsSection
        title="Provider Test"
        subtitle="Voice Route"
        icon="lucide:radio"
        description="Checks the currently selected provider and model-discovery path used by voice mode."
      >
        <SettingsRow
          label="Active provider"
          description={`${providerLabel}${activeModel ? ` / ${activeModel}` : ""}`}
          control={
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">{status}</span>
              <WorkbenchButton size="sm" variant="outline" loading={isTesting} onClick={handleProviderTest}>
                <WorkbenchIcon name="lucide:plug-zap" size={13} />
                Test
              </WorkbenchButton>
            </div>
          }
        />
        <div className="rounded-xl border border-border bg-card/60 px-4 py-3 text-[11px] text-muted-foreground">
          {selectedModel ? (
            <span>
              Selected model context:{" "}
              <span className="font-bold text-foreground">
                {selectedModel.contextWindow ? `${selectedModel.contextWindow.toLocaleString()} tokens` : "unknown"}
              </span>
            </span>
          ) : (
            <span>No selected model metadata is cached for this provider yet.</span>
          )}
          {testMessage && <div className="mt-2 text-muted-foreground">{testMessage}</div>}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Display Agent"
        subtitle="Voice Board"
        icon="lucide:panel-top"
        description="A fast, lightweight subagent that renders main-agent data on the voice board. It only has access to board rendering."
      >
        <SettingsRow
          label="Enable display agent"
          description="When enabled, the model may spawn a separate display agent to render structured content on the voice board. Leave off if you prefer text-only voice responses."
          control={
            <WorkbenchSwitch
              checked={voiceDisplayAgentEnabled}
              onCheckedChange={(checked) => updateSetting("voiceDisplayAgentEnabled", checked)}
            />
          }
        />
        {voiceDisplayAgentEnabled && (
          <>
            <div className="rounded-xl border border-border bg-card/60 p-4 mb-2 space-y-2">
              <div className="flex items-center gap-2">
                <WorkbenchIcon name="lucide:info" size={13} className="text-primary" />
                <span className="text-[11px] font-semibold text-primary">How it works</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The display agent runs alongside the main conversation. It uses the <code className="text-foreground bg-muted/50 px-1 rounded">manage_board</code> tool to update the scratch pad with notes, metrics, tables, charts, code, diagrams, SVGs, palettes, diffs, and more. The main agent handles your requests normally — the display agent just keeps the board populated visually.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { icon: "lucide:check", text: "Render main-agent data" },
                  { icon: "lucide:check", text: "Manage board (cards, charts, code)" },
                  { icon: "lucide:x", text: "No filesystem access" },
                  { icon: "lucide:x", text: "No shell or command execution" },
                  { icon: "lucide:x", text: "No agent delegation" },
                  { icon: "lucide:x", text: "No message sending" },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-1.5 text-[10px]">
                    <WorkbenchIcon name={item.icon} size={10} className={item.icon.includes("check") ? "text-success" : "text-muted-foreground/70"} />
                    <span className="text-muted-foreground">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <SettingsRow
              label="Display agent model"
              description="Choose which model powers the display agent. A fast local model is recommended — the agent only needs basic reasoning to structure data visually."
              control={
                <select
                  value={displayAgentModel || ""}
                  onChange={(e) => updateSetting("voiceDisplayAgentModel", e.target.value)}
                  className="h-8 rounded-lg border border-border bg-card/80 px-2.5 text-xs text-foreground outline-none focus:border-border/[0.15]"
                >
                  <option value="">Same as main agent</option>
                  {displayAgentModels.map((model) => (
                    <option key={`${model.provider}::${model.id || model.name}`} value={`${model.provider}::${model.id || model.name || ""}`}>
                      {model.provider} / {model.name || model.id}
                    </option>
                  ))}
                </select>
              }
            />
            <SettingsRow
              label="Context budget"
              description="Maximum context retained by the render agent."
              control={<WorkbenchInput type="number" min={4096} max={1048576} step={1024} value={contextTokens} onChangeText={(value) => setNumberSetting("voiceDisplayAgentContextTokens", Number(value), 4096, 1048576)} />}
            />
            <SettingsRow
              label="Max turns"
              description="Turns retained before compaction. Maximum 50."
              control={<div className="flex w-40 items-center gap-3"><WorkbenchSlider value={[maxTurns]} min={1} max={50} step={1} onValueChange={([value]) => setNumberSetting("voiceDisplayAgentMaxTurns", value, 1, 50)} /><span className="w-7 text-right text-xs">{maxTurns}</span></div>}
            />
            <SettingsRow
              label="Auto compact context"
              description="Compact retained context before it reaches the configured limit."
              control={<WorkbenchSwitch checked={autoCompactEnabled} onCheckedChange={(checked) => updateSetting("voiceDisplayAgentAutoCompactEnabled", checked)} />}
            />
            <SettingsRow
              label="Compact threshold"
              description="Percentage of context usage that triggers compaction."
              control={<div className="flex w-40 items-center gap-3"><WorkbenchSlider value={[compactThreshold]} min={50} max={95} step={5} disabled={!autoCompactEnabled} onValueChange={([value]) => setNumberSetting("voiceDisplayAgentCompactThreshold", value, 50, 95)} /><span className="w-8 text-right text-xs">{compactThreshold}%</span></div>}
            />
            <div className="space-y-2 rounded-lg border border-border bg-background/20 p-3">
              <div className="flex items-center justify-between"><span className="text-xs font-medium text-foreground">Render prompt</span><WorkbenchButton size="sm" variant="outline" onClick={() => updateSetting("voiceDisplayAgentPrompt", VOICE_DISPLAY_AGENT_DEFAULT_PROMPT)}>Reset Default</WorkbenchButton></div>
              <WorkbenchTextArea value={voicePrompt} onChangeText={(value) => updateSetting("voiceDisplayAgentPrompt", value)} className="min-h-36 resize-y text-xs" />
            </div>
          </>
        )}
      </SettingsSection>
    </div>
  );
});

VoiceSettings.displayName = "VoiceSettings";
