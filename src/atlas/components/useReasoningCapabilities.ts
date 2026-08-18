import { useMemo } from "react";
import type { Model } from "./model-types";

/**
 * `useReasoningCapabilities` — owns the three derivations the chat
 * input composer reads from the active model:
 *
 *   1. `selectedModelInfo` — the matching `Model` entry, or `null`
 *      when no model matches `selectedModelId + selectedProvider`.
 *   2. `supportsReasoning` — boolean: does the model advertise
 *      reasoning support (either via `supportsReasoning: true` or
 *      `capabilities.includes("reasoning")`)?
 *   3. `reasoningConfigType` — literal union `"none" | "effort" | "budget"`,
 *      narrowed from the model's freeform `reasoningConfigType`
 *      string to what `PinnedActionBar` accepts.
 *
 * Carved out of `PremiumChatInput.tsx` so the composer stays well
 * under the 350-line warning limit.
 */

export type ReasoningConfigType = "none" | "effort" | "budget";

export interface ReasoningCapabilities {
  selectedModelInfo: Model | null;
  supportsReasoning: boolean;
  reasoningConfigType: ReasoningConfigType;
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

  const supportsReasoning = useMemo(() => {
    if (!selectedModelInfo) return false;
    return (
      selectedModelInfo.supportsReasoning === true ||
      selectedModelInfo.capabilities?.includes("reasoning") === true
    );
  }, [selectedModelInfo]);

  const reasoningConfigType = useMemo<ReasoningConfigType>(() => {
    if (!supportsReasoning || !selectedModelInfo) return "none";
    const rct = selectedModelInfo.reasoningConfigType;
    if (rct === "effort" || rct === "budget") return rct;
    return "none";
  }, [selectedModelInfo, supportsReasoning]);

  return { selectedModelInfo, supportsReasoning, reasoningConfigType };
}

export default useReasoningCapabilities;
