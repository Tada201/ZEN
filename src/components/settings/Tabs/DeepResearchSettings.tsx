import { memo, useCallback, useMemo } from "react";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import type { SettingsState } from "@/lib/stores/settings/types";
import { providerOrder } from "@/lib/types/provider";
import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchSlider } from "../ui/WorkbenchSlider";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export const DeepResearchSettings = memo(() => {
  const activeProvider = useSettingsStore((state) => state.activeProvider);
  const activeModel = useSettingsStore((state) => state.activeModel);
  const availableModelsByProvider = useSettingsStore((state) => state.availableModelsByProvider);
  const deepResearchModel = useSettingsStore((state) => state.deepResearchModel);
  const maxRounds = useSettingsStore((state) => state.deepResearchMaxRounds);
  const parallelAgents = useSettingsStore((state) => state.deepResearchParallelAgents);
  const maxSourcesPerRound = useSettingsStore((state) => state.deepResearchMaxSourcesPerRound);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  const providerLabel = useMemo(
    () => providerOrder.find((provider) => provider.key === activeProvider)?.name ?? activeProvider,
    [activeProvider]
  );
  const providerModels = availableModelsByProvider[activeProvider] ?? [];
  const modelOptions = useMemo(
    () => [
      {
        value: "",
        label: activeModel ? `Use chat model (${activeModel})` : "Use the current chat model",
      },
      ...providerModels
        .map((model) => {
          const value = model.id || model.name || "";
          return value ? { value, label: model.name || model.id || value } : null;
        })
        .filter((option): option is { value: string; label: string } => option !== null),
    ],
    [activeModel, providerModels]
  );

  const setNumber = useCallback(
    (key: keyof SettingsState, value: number, min: number, max: number) => {
      updateSetting(key, clamp(value, min, max) as never);
    },
    [updateSetting]
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Deep Research</h3>
        <p className="text-[13px] text-muted-foreground">
          Configure the model and bounded research workload used for multi-source investigations.
        </p>
      </div>

      <SettingsSection
        title="Research Model"
        subtitle="Active Provider"
        icon="lucide:brain-circuit"
        description="Deep Research uses the current provider connection, so its model can be changed without crossing credentials or provider routes."
      >
        <SettingsRow
          label="Research model"
          description={`Available through ${providerLabel}. Leave this on the chat model unless you want a different trade-off for longer investigations.`}
          control={
            <WorkbenchSelect
              value={deepResearchModel}
              onValueChange={(value) => updateSetting("deepResearchModel", value)}
              options={modelOptions}
              width={260}
            />
          }
          icon="lucide:bot"
        />
        {providerModels.length === 0 && (
          <div className="flex items-start gap-2 border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
            <WorkbenchIcon name="lucide:triangle-alert" size={14} className="mt-0.5 shrink-0" />
            <span>No model list is cached for this provider yet. Deep Research will use the active chat model.</span>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Research Scope"
        subtitle="Bounded Runtime"
        icon="lucide:route"
        description="These limits balance coverage, latency, and provider cost. Zen validates them again when a research run starts."
      >
        <SettingsRow
          label="Research depth"
          description="Maximum investigation rounds. More rounds improve coverage but take longer."
          control={
            <SliderValue
              value={maxRounds}
              min={2}
              max={8}
              onChange={(value) => setNumber("deepResearchMaxRounds", value, 2, 8)}
              suffix="rounds"
            />
          }
          icon="lucide:layers-3"
        />
        <SettingsRow
          label="Parallel researchers"
          description="Independent research threads working at the same time. Keep this lower for rate-limited providers."
          control={
            <SliderValue
              value={parallelAgents}
              min={1}
              max={4}
              onChange={(value) => setNumber("deepResearchParallelAgents", value, 1, 4)}
              suffix="agents"
            />
          }
          icon="lucide:git-fork"
        />
        <SettingsRow
          label="Sources per research pass"
          description="Maximum source pages collected for each generated research query."
          control={
            <SliderValue
              value={maxSourcesPerRound}
              min={2}
              max={10}
              onChange={(value) => setNumber("deepResearchMaxSourcesPerRound", value, 2, 10)}
              suffix="sources"
            />
          }
          icon="lucide:files"
        />
      </SettingsSection>

      <div className="flex gap-3 border-l-2 border-primary/50 bg-muted/30 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        <WorkbenchIcon name="lucide:shield-check" size={15} className="mt-0.5 shrink-0 text-primary" />
        <span>
          Zen automatically retries transient provider failures, preserves partial findings, and stops active work when you cancel the research request.
        </span>
      </div>
    </div>
  );
});

DeepResearchSettings.displayName = "DeepResearchSettings";

function SliderValue({
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex w-48 items-center gap-3">
      <WorkbenchSlider value={[value]} min={min} max={max} step={1} onValueChange={([next]) => onChange(next)} />
      <span className="w-16 text-right text-[11px] tabular-nums text-foreground">
        {value} {suffix}
      </span>
    </div>
  );
}
