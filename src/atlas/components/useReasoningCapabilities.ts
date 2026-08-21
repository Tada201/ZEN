import { useMemo } from "react";
import type { Model } from "./model-types";
import type { ReasoningCapability } from "@/lib/types/provider";

/**
 * `useReasoningCapabilities` — resolves the active model's backend-owned
 * `ReasoningCapability` and derives the small set of flags the composer UI
 * needs. All product-level reasoning policy lives in the backend resolver; this
 * hook only reads the resolved object off the selected model.
 *
 *   1. `selectedModelInfo` — the matching `Model`, or `null`.
 *   2. `capability` — the resolved `ReasoningCapability` (falls back to
 *      `unknown` when the model or its capability is missing).
 *   3. `showControl` — whether the composer should render a reasoning
 *      affordance at all (hidden for `unsupported` / `unknown`).
 *   4. `isTunable` — whether effort/budget controls apply.
 */

export const UNKNOWN_REASONING: ReasoningCapability = {
  support: "unknown",
  protocol: "none",
  controlAvailability: "none",
  canDisable: false,
  reasoningVisibility: "none",
  source: "unknown",
  confidence: "unknown",
};

export interface ReasoningCapabilities {
  selectedModelInfo: Model | null;
  capability: ReasoningCapability;
  /** The chip/affordance is shown (support is always_on/toggleable/tunable). */
  showControl: boolean;
  /** Effort or budget controls apply and Zen can drive them. */
  isTunable: boolean;
}

export function useReasoningCapabilities(
  models: Model[],
  selectedModelId: string,
  selectedProvider: string,
): ReasoningCapabilities {
  const selectedModelInfo = useMemo(
    () =>
      models.find(
        (m) => m.id === selectedModelId && m.provider === selectedProvider,
      ) ?? null,
    [models, selectedModelId, selectedProvider],
  );

  const capability = useMemo<ReasoningCapability>(
    () => selectedModelInfo?.reasoning ?? UNKNOWN_REASONING,
    [selectedModelInfo],
  );

  const showControl = useMemo(
    () =>
      capability.support === "always_on" ||
      capability.support === "toggleable" ||
      capability.support === "tunable",
    [capability],
  );

  const isTunable = useMemo(
    () => capability.support === "tunable" && capability.controlAvailability === "zen",
    [capability],
  );

  return { selectedModelInfo, capability, showControl, isTunable };
}

export default useReasoningCapabilities;
