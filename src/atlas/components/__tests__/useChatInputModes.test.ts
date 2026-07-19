/**
 * Vitest unit test for `useChatInputModes`.
 *
 * Coverage:
 *   1. Defaults — every mode is `false` / "medium" / 2048 when
 *      `localStorage` is empty.
 *   2. Restore — `localStorage.setItem(...)` before mount is picked
 *      up through the lazy `useState` initializer.
 *   3. `buildThinkingPayload` four branches:
 *        - `!supportsReasoning` → `{ enabled: false }`;
 *        - `supportsReasoning && !isThinking` → `{ enabled: false }`;
 *        - `reasoningConfigType === "effort"` → `{ enabled: true, effort }`;
 *        - `reasoningConfigType === "budget"` → `{ enabled: true, budgetTokens }`;
 *        - any other configType → `{ enabled: true }` (boolean-only).
 *   4. `useAutoDisableThinking` — when `supportsReasoning` drops to
 *      `false` while the user has thinking on, the hook flips
 *      `setIsThinking(false)` so the toggle reflects the new model.
 *   5. Persistence — post-mount setter invocations write through to
 *      `localStorage` in the dedicated effect.
 *
 * Runtime caveat: vitest is not yet installed in `package.json`.
 * This file compiles against the ambient shim at
 * `src/types/vitest.d.ts` and is structured to run unmodified once
 * `pnpm add -D vitest jsdom @vitest/ui` lands. Until then, this is
 * a co-located spec — not executed by `npm test`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  useChatInputModes,
  useAutoDisableThinking,
} from "../useChatInputModes";

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
  thinking: "zen_thinking",
  thinkingEffort: "zen_thinking_effort",
  thinkingBudget: "zen_thinking_budget",
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

  it("defaults: every flag is off, effort='medium', budget=2048 when localStorage is empty", () => {
    const h = renderHook(() => useChatInputModes());

    expect(h.value.isWebSearch).toBe(false);
    expect(h.value.isThinking).toBe(false);
    expect(h.value.thinkingEffort).toBe("medium");
    expect(h.value.thinkingBudget).toBe(2048);
    expect(h.value.isDeepResearch).toBe(false);
    expect(h.value.isImageGenEnabled).toBe(false);

    h.unmount();
  });

  it("restore: localStorage values are picked up on mount", () => {
    localStorage.setItem(LS_KEYS.webSearch, "true");
    localStorage.setItem(LS_KEYS.thinking, "true");
    localStorage.setItem(LS_KEYS.thinkingEffort, "high");
    localStorage.setItem(LS_KEYS.thinkingBudget, "8192");
    localStorage.setItem(LS_KEYS.deepResearch, "true");
    localStorage.setItem(LS_KEYS.imageGen, "true");

    const h = renderHook(() => useChatInputModes());

    expect(h.value.isWebSearch).toBe(true);
    expect(h.value.isThinking).toBe(true);
    expect(h.value.thinkingEffort).toBe("high");
    expect(h.value.thinkingBudget).toBe(8192);
    expect(h.value.isDeepResearch).toBe(true);
    expect(h.value.isImageGenEnabled).toBe(true);

    h.unmount();
  });

  it("buildThinkingPayload: returns { enabled: false } when supportsReasoning is false", async () => {
    const h = renderHook(() => useChatInputModes());

    await act(async () => {
      h.value.setIsThinking(true);
    });

    let payload: ReturnType<
      ReturnType<typeof useChatInputModes>["buildThinkingPayload"]
    > | null = null;
    act(() => {
      payload = h.value.buildThinkingPayload(false, "effort");
    });

    expect(payload).toEqual({ enabled: false });
    expect(
      (payload as { effort?: unknown } | null)?.effort,
    ).toBeUndefined();

    h.unmount();
  });

  it("buildThinkingPayload: returns { enabled: false } when isThinking is off", () => {
    let payload: ReturnType<ReturnType<typeof useChatInputModes>["buildThinkingPayload"]> | null = null;
    const h = renderHook(() => {
      const m = useChatInputModes();
      payload = m.buildThinkingPayload(true, "effort");
      return m;
    });
    expect(payload).toEqual({ enabled: false });
    h.unmount();
  });

  it("buildThinkingPayload: 'effort' configType emits effort + thinkingEffort value", async () => {
    let payload: ReturnType<ReturnType<typeof useChatInputModes>["buildThinkingPayload"]> | null = null;
    const h = renderHook(() => useChatInputModes());

    await act(async () => {
      h.value.setIsThinking(true);
      h.value.setThinkingEffort("high");
    });

    act(() => {
      payload = h.value.buildThinkingPayload(true, "effort");
    });

    expect(payload).toEqual({ enabled: true, effort: "high" });

    h.unmount();
  });

  it("buildThinkingPayload: 'budget' configType emits enabled + budgetTokens", async () => {
    let payload: ReturnType<ReturnType<typeof useChatInputModes>["buildThinkingPayload"]> | null = null;
    const h = renderHook(() => useChatInputModes());

    await act(async () => {
      h.value.setIsThinking(true);
      h.value.setThinkingBudget(4096);
    });

    act(() => {
      payload = h.value.buildThinkingPayload(true, "budget");
    });

    expect(payload).toEqual({ enabled: true, budgetTokens: 4096 });

    h.unmount();
  });

  it("buildThinkingPayload: unknown configType emits boolean-only enabled payload", async () => {
    let payload: ReturnType<ReturnType<typeof useChatInputModes>["buildThinkingPayload"]> | null = null;
    const h = renderHook(() => useChatInputModes());

    await act(async () => {
      h.value.setIsThinking(true);
    });

    act(() => {
      payload = h.value.buildThinkingPayload(true, "some-other-shape");
    });

    expect(payload).toEqual({ enabled: true });
    expect((payload as { effort?: unknown } | null)?.effort).toBeUndefined();
    expect(
      (payload as { budgetTokens?: unknown } | null)?.budgetTokens,
    ).toBeUndefined();

    h.unmount();
  });

  it("useAutoDisableThinking: turns thinking off when the model lacks reasoning support", () => {
    const setIsThinking = vi.fn();
    let supportsReasoning = true;
    let isThinking = true;

    const h = renderHook(() => {
      // Toggle the supportsReasoning prop to drive the effect.
      supportsReasoning = !supportsReasoning;
      useAutoDisableThinking(supportsReasoning, isThinking, setIsThinking);
      return null;
    });

    // After first render: supportsReasoning=false, isThinking=true.
    // Effect fires inside act() during the render — setIsThinking(false).
    expect(setIsThinking).toHaveBeenCalledWith(false);

    // Stays silent on rerender with isThinking=false.
    isThinking = false;
    h.rerender(() => {
      useAutoDisableThinking(false, false, setIsThinking);
      return null;
    });
    expect(setIsThinking).toHaveBeenCalledTimes(1);

    // Stays silent when reasoning is supported.
    isThinking = true;
    h.rerender(() => {
      useAutoDisableThinking(true, true, setIsThinking);
      return null;
    });
    expect(setIsThinking).toHaveBeenCalledTimes(1);

    h.unmount();
  });

  it("useAutoDisableThinking: stays silent on initial mount when isThinking is already off", () => {
    const setIsThinking = vi.fn();
    const h = renderHook(() => {
      useAutoDisableThinking(false, false, setIsThinking);
      return null;
    });

    expect(setIsThinking).not.toHaveBeenCalled();

    h.unmount();
  });

  it("persistence: setter invocations write through to localStorage on the dedicated effect", async () => {
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

    await act(async () => {
      h.value.setIsThinking(true);
    });
    expect(localStorage.getItem(LS_KEYS.thinking)).toBe("true");

    await act(async () => {
      h.value.setThinkingEffort("low");
    });
    expect(localStorage.getItem(LS_KEYS.thinkingEffort)).toBe("low");

    await act(async () => {
      h.value.setThinkingBudget(1024);
    });
    expect(localStorage.getItem(LS_KEYS.thinkingBudget)).toBe("1024");

    h.unmount();
  });

  it("persistence: setter mutations flip off path writes 'false' to localStorage", async () => {
    // Seed so the off-mutation is observable.
    localStorage.setItem(LS_KEYS.webSearch, "true");
    const h = renderHook(() => useChatInputModes());
    expect(h.value.isWebSearch).toBe(true);

    await act(async () => {
      h.value.setIsWebSearch(false);
    });
    expect(h.value.isWebSearch).toBe(false);
    expect(localStorage.getItem(LS_KEYS.webSearch)).toBe("false");

    h.unmount();
  });

  it("buildThinkingPayload: effort branch reflects the latest thinkingEffort after a setter", async () => {
    const h = renderHook(() => useChatInputModes());

    await act(async () => {
      h.value.setIsThinking(true);
      h.value.setThinkingEffort("low");
    });
    expect(h.value.buildThinkingPayload(true, "effort")).toEqual({
      enabled: true,
      effort: "low",
    });

    await act(async () => {
      h.value.setThinkingEffort("high");
    });
    expect(h.value.buildThinkingPayload(true, "effort")).toEqual({
      enabled: true,
      effort: "high",
    });

    h.unmount();
  });
});