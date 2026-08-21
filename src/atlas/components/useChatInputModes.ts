/**
 * `useChatInputModes` — owns the per-chat-input mode toggles + persistence +
 * the generic reasoning payload builder. Carved out of `PremiumChatInput.tsx`.
 *
 * Reasoning is capability-driven: the composer only holds a generic intent
 * (on/off + a chosen effort level + a chosen budget). The active model's
 * backend-resolved `ReasoningCapability` decides how that intent is presented
 * and, ultimately, encoded on the wire — that logic lives in the backend
 * resolver, never here. `buildThinkingPayload` therefore emits only generic
 * fields (`enabled` / `effort` / `budgetTokens`); it never chooses a protocol.
 *
 * Non-reasoning modes (`isWebSearch`, `isDeepResearch`, `isImageGenEnabled`)
 * each mirror a `zen_<name>` localStorage entry. Reasoning intent is
 * reconciled centrally on capability change (see `useReconcileThinking`):
 * thinking turns off for models Zen can't drive, and the chosen effort/budget
 * is clamped into the model's supported range so a value carried from a
 * previous model can never leak an invalid request.
 */

import { useCallback, useEffect, useState } from "react";
import type { ThinkingPayload } from "./chat/input/PremiumChatInputTypes";
import type { ReasoningCapability } from "@/lib/types/provider";

export type ThinkingEffortLevel = string;

export interface ChatInputModesState {
  isWebSearch: boolean;
  setIsWebSearch: (val: boolean) => void;
  isThinking: boolean;
  setIsThinking: (val: boolean) => void;
  thinkingEffort: ThinkingEffortLevel;
  setThinkingEffort: (val: ThinkingEffortLevel) => void;
  thinkingBudget: number;
  setThinkingBudget: (val: number) => void;
  isDeepResearch: boolean;
  setIsDeepResearch: (val: boolean) => void;
  isImageGenEnabled: boolean;
  setIsImageGenEnabled: (val: boolean) => void;
  /**
   * Build the generic `ThinkingPayload` from the current intent and the
   * model's resolved capability. Returns `{ enabled: false }` whenever the
   * capability can't be driven from Zen (unsupported / unknown / always-on /
   * provider-managed) or thinking is off.
   */
  buildThinkingPayload: (capability: ReasoningCapability) => ThinkingPayload;
}

const LS_KEYS = {
  webSearch: "zen_web_search",
  deepResearch: "zen_deep_research",
  imageGen: "zen_image_gen",
  // Reasoning intent survives reloads; without these a refresh silently
  // resets the user's thinking toggle/effort/budget to defaults.
  thinking: "zen_thinking",
  thinkingEffort: "zen_thinking_effort",
  thinkingBudget: "zen_thinking_budget",
} as const;

const DEFAULT_THINKING_BUDGET = 2048;

const isClient = (): boolean => typeof window !== "undefined";

export function useChatInputModes(): ChatInputModesState {
  const [isWebSearch, setIsWebSearch] = useState<boolean>(() =>
    isClient() ? localStorage.getItem(LS_KEYS.webSearch) === "true" : false,
  );
  const [isThinking, setIsThinking] = useState<boolean>(() =>
    isClient() ? localStorage.getItem(LS_KEYS.thinking) === "true" : false,
  );
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffortLevel>(() => {
    const stored = isClient() ? localStorage.getItem(LS_KEYS.thinkingEffort) : null;
    return stored && stored.trim() ? stored : "medium";
  });
  const [thinkingBudget, setThinkingBudget] = useState<number>(() => {
    const parsed = Number(isClient() ? localStorage.getItem(LS_KEYS.thinkingBudget) : NaN);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THINKING_BUDGET;
  });
  const [isDeepResearch, setIsDeepResearch] = useState<boolean>(() =>
    isClient() ? localStorage.getItem(LS_KEYS.deepResearch) === "true" : false,
  );
  const [isImageGenEnabled, setIsImageGenEnabled] = useState<boolean>(() =>
    isClient() ? localStorage.getItem(LS_KEYS.imageGen) === "true" : false,
  );

  useEffect(() => {
    if (isClient()) localStorage.setItem(LS_KEYS.webSearch, String(isWebSearch));
  }, [isWebSearch]);
  useEffect(() => {
    if (isClient()) localStorage.setItem(LS_KEYS.deepResearch, String(isDeepResearch));
  }, [isDeepResearch]);
  useEffect(() => {
    if (isClient()) localStorage.setItem(LS_KEYS.imageGen, String(isImageGenEnabled));
  }, [isImageGenEnabled]);
  useEffect(() => {
    if (isClient()) {
      localStorage.setItem(LS_KEYS.thinking, String(isThinking));
      localStorage.setItem(LS_KEYS.thinkingEffort, thinkingEffort);
      localStorage.setItem(LS_KEYS.thinkingBudget, String(thinkingBudget));
    }
  }, [isThinking, thinkingEffort, thinkingBudget]);

  const buildThinkingPayload = useCallback(
    (capability: ReasoningCapability): ThinkingPayload => {
      // Only "tunable"/"toggleable" reasoning that Zen can drive yields a wire
      // intent. Every other state (unsupported/unknown/always_on/off/
      // provider_managed) resolves to disabled, so the backend never receives
      // a parameter the model can't honor.
      if (!isThinking) return { enabled: false };
      if (capability.controlAvailability !== "zen") return { enabled: false };

      if (capability.support === "toggleable") {
        return { enabled: true };
      }
      if (capability.support === "tunable") {
        const usesBudget =
          capability.minBudget != null || capability.maxBudget != null;
        if (usesBudget) {
          return { enabled: true, budgetTokens: thinkingBudget };
        }
        return { enabled: true, effort: thinkingEffort };
      }
      return { enabled: false };
    },
    [isThinking, thinkingEffort, thinkingBudget],
  );

  return {
    isWebSearch,
    setIsWebSearch,
    isThinking,
    setIsThinking,
    thinkingEffort,
    setThinkingEffort,
    thinkingBudget,
    setThinkingBudget,
    isDeepResearch,
    setIsDeepResearch,
    isImageGenEnabled,
    setIsImageGenEnabled,
    buildThinkingPayload,
  };
}

interface ReconcileArgs {
  capability: ReasoningCapability;
  isThinking: boolean;
  setIsThinking: (val: boolean) => void;
  thinkingEffort: string;
  setThinkingEffort: (val: string) => void;
  thinkingBudget: number;
  setThinkingBudget: (val: number) => void;
}

/**
 * Central model-switch reconciliation for reasoning intent. Runs whenever the
 * active model's capability changes: disables thinking for models Zen can't
 * drive, and clamps the chosen effort/budget into the model's supported range.
 */
export function useReconcileThinking({
  capability,
  isThinking,
  setIsThinking,
  thinkingEffort,
  setThinkingEffort,
  thinkingBudget,
  setThinkingBudget,
}: ReconcileArgs): void {
  useEffect(() => {
    const zenControllable =
      capability.controlAvailability === "zen" &&
      (capability.support === "toggleable" || capability.support === "tunable");

    if (!zenControllable) {
      if (isThinking) setIsThinking(false);
      return;
    }

    // Clamp effort into the model's real level set (seed the model's default
    // when the carried value isn't valid here).
    const levels = capability.levels;
    if (levels && levels.length > 0 && !levels.includes(thinkingEffort)) {
      setThinkingEffort(capability.defaultLevel ?? levels[Math.floor(levels.length / 2)]);
    }

    // Clamp budget into the model's supported range. Seed the model's own
    // default budget when the carried value falls outside it, rather than
    // pinning to a bound, so a fresh budget model opens at its intended level.
    const min = capability.minBudget;
    const max = capability.maxBudget;
    let clamped = thinkingBudget;
    if ((min != null && clamped < min) || (max != null && clamped > max)) {
      clamped = capability.defaultBudget ?? clamped;
    }
    if (min != null && clamped < min) clamped = min;
    if (max != null && clamped > max) clamped = max;
    if (clamped !== thinkingBudget) setThinkingBudget(clamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capability]);
}

// Back-compat alias: the composer previously called `useAutoDisableThinking`.
export const useAutoDisableThinking = (
  capability: ReasoningCapability,
  isThinking: boolean,
  setIsThinking: (val: boolean) => void,
): void => {
  useEffect(() => {
    const zenControllable =
      capability.controlAvailability === "zen" &&
      (capability.support === "toggleable" || capability.support === "tunable");
    if (!zenControllable && isThinking) setIsThinking(false);
  }, [capability, isThinking, setIsThinking]);
};

export default useChatInputModes;
