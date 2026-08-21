/**
 * Vitest unit test for `useChatInputModes`.
 *
 * Coverage:
 *   1. Defaults — non-reasoning modes are `false`; reasoning intent starts at
 *      effort="medium", budget=2048.
 *   2. Restore — the persisted non-reasoning `localStorage` entries are picked
 *      up through the lazy `useState` initializer.
 *   3. `buildThinkingPayload` is capability-driven:
 *        - not thinking → `{ enabled: false }`;
 *        - non-Zen control (unsupported/unknown/always_on/provider_managed)
 *          → `{ enabled: false }`;
 *        - tunable effort → `{ enabled: true, effort }`;
 *        - tunable budget → `{ enabled: true, budgetTokens }`;
 *        - toggleable → `{ enabled: true }` (boolean only).
 *   4. `useAutoDisableThinking` — turns thinking OFF when the capability can no
 *      longer be driven from Zen.
 *   5. Persistence — non-reasoning setters write through to `localStorage`.
 *
 * Runtime caveat: vitest is not yet installed in `package.json`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  useChatInputModes,
  useAutoDisableThinking,
} from "../useChatInputModes";
import type { ReasoningCapability } from "@/lib/types/provider";

// ── Capability fixtures ─────────────────────────────────────────

const BASE: ReasoningCapability = {
  support: "unknown",
  protocol: "none",
  controlAvailability: "none",
  canDisable: false,
  reasoningVisibility: "none",
  source: "unknown",
  confidence: "unknown",
};

const EFFORT: ReasoningCapability = {
  ...BASE,
  support: "tunable",
  protocol: "openai_effort",
  controlAvailability: "zen",
  levels: ["low", "medium", "high"],
  defaultLevel: "medium",
  canDisable: true,
  reasoningVisibility: "summary",
  source: "registry",
  confidence: "authoritative",
};

const BUDGET: ReasoningCapability = {
  ...BASE,
  support: "tunable",
  protocol: "anthropic_budget",
  controlAvailability: "zen",
  minBudget: 1024,
  maxBudget: 32768,
  stepBudget: 1024,
  canDisable: true,
  reasoningVisibility: "summary",
  source: "registry",
  confidence: "authoritative",
};

const TOGGLEABLE: ReasoningCapability = {
  ...BASE,
  support: "toggleable",
  protocol: "none",
  controlAvailability: "zen",
  canDisable: true,
};

const ALWAYS_ON: ReasoningCapability = {
  ...BASE,
  support: "always_on",
  controlAvailability: "none",
};

const PROVIDER_MANAGED: ReasoningCapability = {
  ...BASE,
  support: "tunable",
  controlAvailability: "provider_managed",
  levels: ["low", "high"],
};

// ── Local renderHook harness ────────────────────────────────

interface Harness<T> {
  get value(): T;
  rerender(hookFn: () => T): void;
  unmount(): void;
}

function renderHook<T>(hookFn: () => T): Harness<T> {
  const box: { current: T | undefined } = { current: undefined };
  const container = document.createElement("div");
  const root: Root = createRoot(container);
  const Wrapper = () => {
    box.current = hookFn();
    return null;
  };
  act(() => {
    root.render(Wrapper());
  });
  return {
    get value() {
      return box.current as T;
    },
    rerender(nextHookFn) {
      act(() => {
        root.render(nextHookFn() as unknown as null);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
    },
  };
}

const LS_KEYS = {
  webSearch: "zen_web_search",
  deepResearch: "zen_deep_research",
  imageGen: "zen_image_gen",
};

function clearLocalStorage() {
  Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
}

// ── Tests ──────────────────────────────────────────────────────

describe("useChatInputModes", () => {
  beforeEach(() => {
    clearLocalStorage();
  });

  afterEach(() => {
    clearLocalStorage();
  });

  it("defaults: non-reasoning flags off; effort='medium', budget=2048", () => {
    const h = renderHook(() => useChatInputModes());

    expect(h.value.isWebSearch).toBe(false);
    expect(h.value.isThinking).toBe(false);
    expect(h.value.thinkingEffort).toBe("medium");
    expect(h.value.thinkingBudget).toBe(2048);
    expect(h.value.isDeepResearch).toBe(false);
    expect(h.value.isImageGenEnabled).toBe(false);

    h.unmount();
  });

  it("restore: non-reasoning localStorage values are picked up on mount", () => {
    localStorage.setItem(LS_KEYS.webSearch, "true");
    localStorage.setItem(LS_KEYS.deepResearch, "true");
    localStorage.setItem(LS_KEYS.imageGen, "true");

    const h = renderHook(() => useChatInputModes());

    expect(h.value.isWebSearch).toBe(true);
    expect(h.value.isDeepResearch).toBe(true);
    expect(h.value.isImageGenEnabled).toBe(true);

    h.unmount();
  });

  it("buildThinkingPayload: returns { enabled: false } for a non-Zen capability", async () => {
    const h = renderHook(() => useChatInputModes());

    await act(async () => {
      h.value.setIsThinking(true);
    });

    let payload: ReturnType<
      ReturnType<typeof useChatInputModes>["buildThinkingPayload"]
    > | null = null;
    act(() => {
      payload = h.value.buildThinkingPayload(ALWAYS_ON);
    });

    expect(payload).toEqual({ enabled: false });

    h.unmount();
  });

  it("buildThinkingPayload: returns { enabled: false } when isThinking is off", () => {
    let payload: ReturnType<ReturnType<typeof useChatInputModes>["buildThinkingPayload"]> | null = null;
    const h = renderHook(() => {
      const m = useChatInputModes();
      payload = m.buildThinkingPayload(EFFORT);
      return m;
    });
    expect(payload).toEqual({ enabled: false });
    h.unmount();
  });

  it("buildThinkingPayload: tunable effort capability emits effort + thinkingEffort value", async () => {
    let payload: ReturnType<ReturnType<typeof useChatInputModes>["buildThinkingPayload"]> | null = null;
    const h = renderHook(() => useChatInputModes());

    await act(async () => {
      h.value.setIsThinking(true);
      h.value.setThinkingEffort("high");
    });

    act(() => {
      payload = h.value.buildThinkingPayload(EFFORT);
    });

    expect(payload).toEqual({ enabled: true, effort: "high" });

    h.unmount();
  });

  it("buildThinkingPayload: tunable budget capability emits enabled + budgetTokens", async () => {
    let payload: ReturnType<ReturnType<typeof useChatInputModes>["buildThinkingPayload"]> | null = null;
    const h = renderHook(() => useChatInputModes());

    await act(async () => {
      h.value.setIsThinking(true);
      h.value.setThinkingBudget(4096);
    });

    act(() => {
      payload = h.value.buildThinkingPayload(BUDGET);
    });

    expect(payload).toEqual({ enabled: true, budgetTokens: 4096 });

    h.unmount();
  });

  it("buildThinkingPayload: toggleable capability emits boolean-only enabled payload", async () => {
    let payload: ReturnType<ReturnType<typeof useChatInputModes>["buildThinkingPayload"]> | null = null;
    const h = renderHook(() => useChatInputModes());

    await act(async () => {
      h.value.setIsThinking(true);
    });

    act(() => {
      payload = h.value.buildThinkingPayload(TOGGLEABLE);
    });

    expect(payload).toEqual({ enabled: true });
    expect((payload as { effort?: unknown } | null)?.effort).toBeUndefined();
    expect(
      (payload as { budgetTokens?: unknown } | null)?.budgetTokens,
    ).toBeUndefined();

    h.unmount();
  });

  it("buildThinkingPayload: provider_managed never emits a wire intent", async () => {
    let payload: ReturnType<ReturnType<typeof useChatInputModes>["buildThinkingPayload"]> | null = null;
    const h = renderHook(() => useChatInputModes());
    await act(async () => {
      h.value.setIsThinking(true);
    });
    act(() => {
      payload = h.value.buildThinkingPayload(PROVIDER_MANAGED);
    });
    expect(payload).toEqual({ enabled: false });
    h.unmount();
  });

  it("useAutoDisableThinking: turns thinking off when the capability can't be driven from Zen", () => {
    const setIsThinking = vi.fn();

    const h = renderHook(() => {
      useAutoDisableThinking(ALWAYS_ON, true, setIsThinking);
      return null;
    });

    expect(setIsThinking).toHaveBeenCalledWith(false);

    // Stays silent when the capability is Zen-controllable.
    h.rerender(() => {
      useAutoDisableThinking(EFFORT, true, setIsThinking);
      return null;
    });
    expect(setIsThinking).toHaveBeenCalledTimes(1);

    h.unmount();
  });

  it("useAutoDisableThinking: stays silent when isThinking is already off", () => {
    const setIsThinking = vi.fn();
    const h = renderHook(() => {
      useAutoDisableThinking(ALWAYS_ON, false, setIsThinking);
      return null;
    });

    expect(setIsThinking).not.toHaveBeenCalled();

    h.unmount();
  });

  it("persistence: non-reasoning setters write through to localStorage", async () => {
    const h = renderHook(() => useChatInputModes());

    await act(async () => {
      h.value.setIsWebSearch(true);
    });
    expect(localStorage.getItem(LS_KEYS.webSearch)).toBe("true");

    await act(async () => {
      h.value.setIsDeepResearch(true);
    });
    expect(localStorage.getItem(LS_KEYS.deepResearch)).toBe("true");

    await act(async () => {
      h.value.setIsImageGenEnabled(true);
    });
    expect(localStorage.getItem(LS_KEYS.imageGen)).toBe("true");

    h.unmount();
  });

  it("buildThinkingPayload: effort branch reflects the latest thinkingEffort after a setter", async () => {
    const h = renderHook(() => useChatInputModes());

    await act(async () => {
      h.value.setIsThinking(true);
      h.value.setThinkingEffort("low");
    });
    expect(h.value.buildThinkingPayload(EFFORT)).toEqual({
      enabled: true,
      effort: "low",
    });

    await act(async () => {
      h.value.setThinkingEffort("high");
    });
    expect(h.value.buildThinkingPayload(EFFORT)).toEqual({
      enabled: true,
      effort: "high",
    });

    h.unmount();
  });
});
