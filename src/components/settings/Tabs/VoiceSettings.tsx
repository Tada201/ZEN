import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { providerOrder } from "@/lib/types/provider";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { STTConfig } from "./audio/STTConfig";
import { TTSConfig } from "./audio/TTSConfig";

export const VoiceSettings = memo(() => {
  const activeProvider = useSettingsStore((s) => s.activeProvider);
  const activeModel = useSettingsStore((s) => s.activeModel);
  const availableModelsByProvider = useSettingsStore((s) => s.availableModelsByProvider);
  const connectionStatuses = useSettingsStore((s) => s.connectionStatuses);
  const testingConnections = useSettingsStore((s) => s.testingConnections);
  const testProviderConnection = useSettingsStore((s) => s.testProviderConnection);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const providerLabel = useMemo(
    () => providerOrder.find((provider) => provider.key === activeProvider)?.name ?? activeProvider,
    [activeProvider],
  );
  const providerModels = availableModelsByProvider[activeProvider] ?? [];
  const selectedModel = providerModels.find(
    (model) => model.id === activeModel || model.name === activeModel,
  ) ?? null;
  const isTesting = Boolean(testingConnections[activeProvider]);
  const status = connectionStatuses[activeProvider] ?? "idle";

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
          Configure speech models and test the provider route used by voice mode.
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
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-[11px] text-muted-foreground">
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

      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        The automatic <span className="font-medium text-foreground">ZEN-DISPLAY</span> voice subagent is configured in Settings → Agents. Its prompt and board-only permissions are fixed; only its model can be changed.
      </div>
    </div>
  );
});

VoiceSettings.displayName = "VoiceSettings";
