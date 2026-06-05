import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import type { SettingsState } from "@/lib/stores/settings/types";
import { VOICE_DISPLAY_AGENT_DEFAULT_PROMPT } from "@/lib/stores/settings/voiceDefaults";
import { providerOrder } from "@/lib/types/provider";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { SettingsSection } from "../SettingsSection";
import { WorkbenchInput } from "@/components/settings/ui/WorkbenchInput";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSlider } from "@/components/settings/ui/WorkbenchSlider";
import { WorkbenchSwitch } from "@/components/settings/ui/WorkbenchSwitch";
import { WorkbenchTextArea } from "@/components/settings/ui/WorkbenchTextArea";
import { STTConfig } from "./audio/STTConfig";
import { TTSConfig } from "./audio/TTSConfig";

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export const VoiceSettings = memo(() => {
  const activeProvider = useSettingsStore((s) => s.activeProvider);
  const activeModel = useSettingsStore((s) => s.activeModel);
  const availableModelsByProvider = useSettingsStore((s) => s.availableModelsByProvider);
  const connectionStatuses = useSettingsStore((s) => s.connectionStatuses);
  const testingConnections = useSettingsStore((s) => s.testingConnections);
  const testProviderConnection = useSettingsStore((s) => s.testProviderConnection);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const voiceDisplayAgentEnabled = useSettingsStore((s) => s.voiceDisplayAgentEnabled);
  const contextTokens = useSettingsStore((s) => s.voiceDisplayAgentContextTokens);
  const maxTurns = useSettingsStore((s) => s.voiceDisplayAgentMaxTurns);
  const autoCompactEnabled = useSettingsStore((s) => s.voiceDisplayAgentAutoCompactEnabled);
  const compactThreshold = useSettingsStore((s) => s.voiceDisplayAgentCompactThreshold);
  const voicePrompt = useSettingsStore((s) => s.voiceDisplayAgentPrompt);
  const boardMemoryLimit = useSettingsStore((s) => s.voiceDisplayAgentBoardMemoryLimit);

  const [testMessage, setTestMessage] = useState<string | null>(null);

  const providerLabel = useMemo(() => {
    return providerOrder.find((provider) => provider.key === activeProvider)?.name ?? activeProvider;
  }, [activeProvider]);

  const providerModels = availableModelsByProvider[activeProvider] ?? [];
  const selectedModel =
    providerModels.find((model) => model.id === activeModel || model.name === activeModel) ?? null;
  const isTesting = Boolean(testingConnections[activeProvider]);
  const status = connectionStatuses[activeProvider] ?? "idle";

  const setNumberSetting = useCallback(
    (key: keyof SettingsState, value: number, min: number, max: number) => {
      updateSetting(key, clampNumber(value, min, max) as never);
    },
    [updateSetting]
  );

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

  const resetPrompt = useCallback(() => {
    updateSetting("voiceDisplayAgentPrompt", VOICE_DISPLAY_AGENT_DEFAULT_PROMPT);
    toast.success("Voice display prompt reset");
  }, [updateSetting]);

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
              <span className="text-[10px] font-bold uppercase text-zinc-500">{status}</span>
              <WorkbenchButton size="sm" variant="outline" loading={isTesting} onClick={handleProviderTest}>
                <WorkbenchIcon name="lucide:plug-zap" size={13} />
                Test
              </WorkbenchButton>
            </div>
          }
        />
        <div className="rounded-xl border border-white/[0.04] bg-zinc-950/40 px-4 py-3 text-[11px] text-zinc-500">
          {selectedModel ? (
            <span>
              Selected model context:{" "}
              <span className="font-bold text-zinc-300">
                {selectedModel.contextWindow ? `${selectedModel.contextWindow.toLocaleString()} tokens` : "unknown"}
              </span>
            </span>
          ) : (
            <span>No selected model metadata is cached for this provider yet.</span>
          )}
          {testMessage && <div className="mt-2 text-zinc-400">{testMessage}</div>}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Display Agent"
        subtitle="Voice Stage"
        icon="lucide:panel-top"
        description="Controls the render-only agent that prepares cards, charts, tables, and board updates for voice mode."
      >
        <SettingsRow
          label="Enable display agent"
          description="The main agent owns data gathering and tools; this agent only renders the voice board."
          control={
            <WorkbenchSwitch
              checked={voiceDisplayAgentEnabled}
              onCheckedChange={(checked) => updateSetting("voiceDisplayAgentEnabled", checked)}
            />
          }
        />
        <SettingsRow
          label="Context budget"
          description="Default is 128k. This limits the render agent's retained voice-board context."
          control={
            <div className="flex w-[210px] items-center gap-2">
              <WorkbenchInput
                type="number"
                min={4096}
                max={1048576}
                step={1024}
                value={contextTokens}
                onChangeText={(value) =>
                  setNumberSetting("voiceDisplayAgentContextTokens", Number(value), 4096, 1048576)
                }
              />
              <span className="w-12 text-right text-[10px] font-bold text-zinc-500">tokens</span>
            </div>
          }
        />
        <SettingsRow
          label="Max turns"
          description="Conversation turns retained by the render agent before compaction. Hard max is 50."
          control={
            <div className="flex w-[160px] items-center gap-3">
              <WorkbenchSlider
                value={[maxTurns]}
                min={1}
                max={50}
                step={1}
                onValueChange={([value]) => setNumberSetting("voiceDisplayAgentMaxTurns", value, 1, 50)}
                className="flex-1"
              />
              <span className="w-8 text-right text-[11px] font-bold text-zinc-300">{maxTurns}</span>
            </div>
          }
        />
        <SettingsRow
          label="Auto compact context"
          description="Compacts render-agent context before it grows large enough to slow voice mode."
          control={
            <WorkbenchSwitch
              checked={autoCompactEnabled}
              onCheckedChange={(checked) => updateSetting("voiceDisplayAgentAutoCompactEnabled", checked)}
            />
          }
        />
        <SettingsRow
          label="Compact threshold"
          description="Default is 75% of the configured render-agent context budget."
          control={
            <div className="flex w-[160px] items-center gap-3">
              <WorkbenchSlider
                value={[compactThreshold]}
                min={50}
                max={95}
                step={5}
                disabled={!autoCompactEnabled}
                onValueChange={([value]) =>
                  setNumberSetting("voiceDisplayAgentCompactThreshold", value, 50, 95)
                }
                className="flex-1"
              />
              <span className="w-8 text-right text-[11px] font-bold text-zinc-300">{compactThreshold}%</span>
            </div>
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Board Memory"
        subtitle="Context Board"
        icon="lucide:layout-dashboard"
        description="Defines how many finished boards stay available for edit and replacement requests."
      >
        <SettingsRow
          label="Remembered boards"
          description="A new-board request clears old board context. Edit and replace requests can use retained boards."
          control={
            <div className="flex w-[160px] items-center gap-3">
              <WorkbenchSlider
                value={[boardMemoryLimit]}
                min={1}
                max={3}
                step={1}
                onValueChange={([value]) =>
                  setNumberSetting("voiceDisplayAgentBoardMemoryLimit", value, 1, 3)
                }
                className="flex-1"
              />
              <span className="w-8 text-right text-[11px] font-bold text-zinc-300">{boardMemoryLimit}</span>
            </div>
          }
        />
        <div className="grid gap-2 sm:grid-cols-3">
          {["New board clears old board context", "Edit/replace can reuse retained boards", "Excess boards are pruned oldest first"].map((text) => (
            <div key={text} className="rounded-xl border border-white/[0.04] bg-zinc-950/40 p-3 text-[11px] text-zinc-400">
              {text}
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Render Prompt"
        subtitle="Prompt"
        icon="lucide:file-pen-line"
        description="Editable system prompt for the render-only voice display agent."
      >
        <WorkbenchTextArea
          value={voicePrompt}
          onChangeText={(value) => updateSetting("voiceDisplayAgentPrompt", value)}
          className="min-h-[190px] resize-y rounded-xl border-white/[0.08] bg-zinc-950/60 text-xs leading-relaxed"
        />
        <div className="flex justify-end">
          <WorkbenchButton size="sm" variant="outline" onClick={resetPrompt}>
            <WorkbenchIcon name="lucide:rotate-ccw" size={13} />
            Reset Default
          </WorkbenchButton>
        </div>
      </SettingsSection>
    </div>
  );
});

VoiceSettings.displayName = "VoiceSettings";
