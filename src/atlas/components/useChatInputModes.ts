/**
 * `useChatInputModes` — owns the per-chat-input mode toggles +
 * persistence + reasoning payload builder. Carved out of
 * `PremiumChatInput.tsx` so the composer no longer carries ~60 lines of
 * `useState`/`useEffect` plumbing for six related booleans / numbers /
 * strings.
 *
 * Single source of truth for:
 *   * `isWebSearch`, `isThinking`, `thinkingEffort`, `thinkingBudget`,
 *     `isDeepResearch`, `isImageGenEnabled` — each mirrors a
 *     `zen_<name>` localStorage entry so the user's last selection
 *     survives across reloads.
 *   * The auto-disable effect that turns thinking OFF when the active
 *     model lacks reasoning support (`supportsReasoning === false`).
 *   * `buildThinkingPayload(supportsReasoning, reasoningConfigType)` —
 *     maps the modes above to a `ThinkingPayload` the LLM client
 *     understands, picking the right envelope per `reasoningConfigType`
 *     (`effort` / `budget`); `none` models have no tunable parameter, so
 *     they report `enabled: false` rather than an on state that sends
 *     nothing on the wire.
 *
 * The hook returns getters + setters + builder. Callers should destructure
 * the shape they care about; doing so also gives the correct memo
 * semantics (the returned setters are stable across renders because they
 * are wrapped in `useCallback` with empty deps).
 */

import { useCallback, useEffect, useState } from "react";
import type { ThinkingPayload } from "./chat/input/PremiumChatInputTypes";

export type ThinkingEffortLevel = "low" | "medium" | "high";
export type ReasoningConfigType = "effort" | "budget" | "none" | string | undefined;

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
   * Build the LLM `ThinkingPayload` from the current modes and the
   * model's reasoning capability flags. Returns `{ enabled: false }`
   * when reasoning isn't supported, thinking is OFF, or the model
   * exposes no tunable reasoning parameter (`none`).
   */
  buildThinkingPayload: (
    supportsReasoning: boolean,
    reasoningConfigType?: ReasoningConfigType,
  ) => ThinkingPayload;
}

const LS_KEYS = {
  webSearch: "zen_web_search",
  thinking: "zen_thinking",
  thinkingEffort: "zen_thinking_effort",
  thinkingBudget: "zen_thinking_budget",
  deepResearch: "zen_deep_research",
  imageGen: "zen_image_gen",
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
    if (!isClient()) return "medium";
    const saved = localStorage.getItem(LS_KEYS.thinkingEffort);
    return saved === "low" || saved === "medium" || saved === "high" ? saved : "medium";
  });
  const [thinkingBudget, setThinkingBudget] = useState<number>(() => {
    if (!isClient()) return DEFAULT_THINKING_BUDGET;
    const saved = localStorage.getItem(LS_KEYS.thinkingBudget);
    return saved ? parseInt(saved, 10) : DEFAULT_THINKING_BUDGET;
  });
  const [isDeepResearch, setIsDeepResearch] = useState<boolean>(() =>
    isClient() ? localStorage.getItem(LS_KEYS.deepResearch) === "true" : false,
  );
  const [isImageGenEnabled, setIsImageGenEnabled] = useState<boolean>(() =>
    isClient() ? localStorage.getItem(LS_KEYS.imageGen) === "true" : false,
  );

  // Mirror every mode into localStorage. One effect per mode keeps the
  // dependency arrays tight and avoids serialising unrelated state.
  useEffect(() => {
    if (isClient()) localStorage.setItem(LS_KEYS.webSearch, String(isWebSearch));
  }, [isWebSearch]);
  useEffect(() => {
    if (isClient()) localStorage.setItem(LS_KEYS.thinking, String(isThinking));
  }, [isThinking]);
  useEffect(() => {
    if (isClient()) localStorage.setItem(LS_KEYS.thinkingEffort, thinkingEffort);
  }, [thinkingEffort]);
  useEffect(() => {
    if (isClient())
      localStorage.setItem(LS_KEYS.thinkingBudget, String(thinkingBudget));
  }, [thinkingBudget]);
  useEffect(() => {
    if (isClient()) localStorage.setItem(LS_KEYS.deepResearch, String(isDeepResearch));
  }, [isDeepResearch]);
  useEffect(() => {
    if (isClient()) localStorage.setItem(LS_KEYS.imageGen, String(isImageGenEnabled));
  }, [isImageGenEnabled]);

  const buildThinkingPayload = useCallback(
    (supportsReasoning: boolean, reasoningConfigType?: ReasoningConfigType): ThinkingPayload => {
      if (!supportsReasoning || !isThinking) {
        return { enabled: false };
      }

      if (reasoningConfigType === "effort") {
        return { enabled: true, effort: thinkingEffort };
      }

      if (reasoningConfigType === "budget") {
        return { enabled: true, budgetTokens: thinkingBudget };
      }

      // 'none': no tunable reasoning parameter — nothing is sent on the wire, so the payload must not claim enabled.
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

/**
 * Tiny companion hook: when the active model loses reasoning support,
 * turn thinking OFF. Returns the latest effective `isThinking` value
 * (kept in sync with what the user typed if the model still supports
 * reasoning). Used by `PremiumChatInput` alongside `useChatInputModes`.
 */
export function useAutoDisableThinking(
  supportsReasoning: boolean,
  isThinking: boolean,
  setIsThinking: (val: boolean) => void,
): void {
  useEffect(() => {
    if (!supportsReasoning && isThinking) {
      setIsThinking(false);
    }
  }, [supportsReasoning, isThinking, setIsThinking]);
}

export default useChatInputModes;
