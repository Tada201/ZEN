/**
 * Vitest unit test for `useSendHandler`.
 *
 * Coverage:
 *   1. Send pipeline with attachments — `fileToAttachment` is mocked
 *      at the top of the file so the dispatch receives a fabricated
 *      `Attachment[]` without exercising the real `FileReader`.
 *   2. Ctrl+Enter send — `useSendHandler.handleSend` is what the
 *      composer's `<ChatInputTextAreaBlock>` wires to
 *      `(Ctrl | Cmd) + Enter`. We mount a tiny `<ChatTextAreaWire>`
 *      component that calls `handleSend` on the same key chord,
 *      dispatch a synthetic `KeyboardEvent`, and confirm `onSend`
 *      was called.
 *   3. Queue-when-loading — `isLoading === true` with an active chat
 *      enqueues the prompt in `usePromptQueueStore` and skips
 *      `ctx.onSend`; stopping is a dedicated footer control.
 *   4. Suggested-prompt pipeline — `handleSuggestedClick("hello")`
 *      pays out with `files: []`, `attachments: []`, and
 *      `generativeUI` honouring `ctx.internalGenerativeUI` or the
 *      "genui" substring heuristic.
 *   5. selectedModelInfo fallback chain — three explicit cases:
 *        - explicit `selectedModelId` / `selectedProvider` wins
 *          over the modelInfo snapshot;
 *        - falls back to `selectedModelInfo.id` /
 *          `selectedModelInfo.provider` when the composer-level
 *          selectors are empty;
 *        - falls back to the `"No Model"` / `"ollama"` sentinel
 *          pair when both are empty.
 *
 * Runtime caveat: vitest is not yet installed in `package.json`.
 * This file compiles against the ambient shim at
 * `src/types/vitest.d.ts` and is structured to run unmodified once
 * `pnpm add -D vitest jsdom @vitest/ui` lands. Until then, this is
 * a co-located spec — not executed by `npm test`.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// ── Module mocks (auto-hoisted at vitest runtime) ──────────────
//
// `fileToAttachment` is the heavy bit — it spins up real FileReader
// instances. Mock it so the test only inspects the dispatch shape.
//
// `chatApi` is mocked for hygiene: while `useSendHandler` itself
// doesn't touch `chatApi`, the parent composer pushes requests
// through `chatApi.sendMessage` downstream. Mocking it ensures any
// incidental import chain returns a stub instead of opening a Tauri
// command channel.

vi.mock("../chat/input/fileAttachments", () => ({
  fileToAttachment: vi.fn(
    async (file: { name: string }): Promise<{
      name: string;
      type: "file";
      data: string;
      mimeType: string;
      extractedText: string;
    }> => ({
      name: file.name,
      type: "file",
      data: "data:text/plain;base64,",
      mimeType: "text/plain",
      extractedText: "stub-extracted-text",
    }),
  ),
}));

vi.mock("@/api/chatApi", () => ({
  chatApi: {
    sendMessage: vi.fn(async () => undefined),
    abortChat: vi.fn(async () => undefined),
    listChats: vi.fn(async () => []),
  },
}));

// The queue/goal paths pull in sonner toasts and the Tauri event bus.
// Neither belongs in a unit test env — stub both.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("@/api/events", () => ({
  listenAppEvent: vi.fn(async () => () => undefined),
}));

// Static imports AFTER the vi.mock factories so vitest's hoister
// rewires `fileToAttachment` and `chatApi.sendMessage` first.

import { useSendHandler } from "../useSendHandler";
import type { UseSendHandlerCtx } from "../useSendHandler";
import { fileToAttachment } from "../chat/input/fileAttachments";
import { chatApi } from "@/api/chatApi";
import { usePromptQueueStore } from "@/lib/stores/promptQueueStore";

// ── Local renderHook harness (no @testing-library/react) ───
//
// `react-dom/client`'s `createRoot` + React 19's `act` (exported from
// the main `react` package) is enough to drive React state through
// `useCallback`-memoised closures and `useEffect` writes. The
// `swapCtx` helper below is how the fallback-chain tests exercise the
// "swap to selectedModelInfo" case after the first render.

interface Boxed<T> {
  current: T | undefined;
}

function mountWithCtx<T>(
  initialCtx: UseSendHandlerCtx,
  useHook: (ctx: UseSendHandlerCtx) => T,
): {
  box: Boxed<T>;
  swapCtx: (next: UseSendHandlerCtx) => void;
  flush: () => void;
  unmount: () => void;
  root: Root;
} {
  const ctxRef = { current: initialCtx };
  const box: Boxed<T> = { current: undefined };
  const container = document.createElement("div");
  const root = createRoot(container);
  const Wrapper = () => {
    box.current = useHook(ctxRef.current);
    return null;
  };
  const flush = () => {
    act(() => {
      root.render(<Wrapper />);
    });
  };
  flush();
  return {
    box,
    swapCtx: (next) => {
      ctxRef.current = next;
      flush();
    },
    flush,
    unmount: () =>
      act(() => {
        root.unmount();
      }),
    root,
  };
}

// ── Test ctx builder ────────────────────────────────────────────

type OnSendArgs = Parameters<UseSendHandlerCtx["onSend"]>[0];

function buildCtx(overrides: Partial<UseSendHandlerCtx> = {}): UseSendHandlerCtx {
  return {
    message: "",
    selectedFiles: [],
    isLoading: false,
    onAbort: vi.fn(),
    selectedModelId: "gpt-4o",
    selectedProvider: "openai",
    selectedModelInfo: { id: "gpt-4o-fallback", provider: "openai-fallback" },
    isWebSearch: false,
    isDeepResearch: false,
    isImageGenEnabled: false,
    internalGenerativeUI: false,
    supportsReasoning: true,
    reasoningConfigType: "effort",
    buildThinkingPayload: vi.fn(
      (
        supportsReasoning: boolean,
        reasoningConfigType?: string,
      ): { enabled: boolean; effort?: "low" | "medium" | "high" } => ({
        enabled: supportsReasoning,
        effort:
          supportsReasoning && reasoningConfigType === "effort"
            ? "medium"
            : undefined,
      }),
    ),
    onSend: vi.fn(),
    convertFiles: vi.fn(
      async (
        files: File[],
      ): Promise<Awaited<ReturnType<UseSendHandlerCtx["convertFiles"]>>> =>
        (await Promise.all(
          files.map((file) => fileToAttachment(file)),
        )) as Awaited<ReturnType<UseSendHandlerCtx["convertFiles"]>>,
    ),
    resetMessage: vi.fn(),
    resetFiles: vi.fn(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe("useSendHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("send pipeline: handleSend with attachments calls convertFiles + onSend + resets", async () => {
    const ctx = buildCtx({
      message: "Summarise this",
      selectedFiles: [
        new File(["hello"], "hello.txt", { type: "text/plain" }),
        new File(["world"], "world.txt", { type: "text/plain" }),
      ],
    });
    const m = mountWithCtx(ctx, useSendHandler);

    await act(async () => {
      await (m.box.current as ReturnType<typeof useSendHandler>).handleSend();
    });

    expect(ctx.convertFiles).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ctx.convertFiles).mock.calls[0]?.[0]).toHaveLength(2);
    expect(fileToAttachment).toHaveBeenCalledTimes(2);

    expect(ctx.onSend).toHaveBeenCalledTimes(1);
    const sendArgs = vi.mocked(ctx.onSend).mock.calls[0]?.[0] as
      | OnSendArgs
      | undefined;
    expect(sendArgs?.message).toBe("Summarise this");
    expect(sendArgs?.files).toHaveLength(2);
    expect(Array.isArray(sendArgs?.attachments)).toBe(true);
    expect((sendArgs?.attachments ?? []).length).toBe(2);
    expect((sendArgs?.attachments ?? [])[0]?.name).toBe("hello.txt");
    expect((sendArgs?.attachments ?? [])[1]?.name).toBe("world.txt");
    expect(sendArgs?.thinking).toEqual({ enabled: true, effort: "medium" });

    expect(ctx.resetMessage).toHaveBeenCalledTimes(1);
    expect(ctx.resetFiles).toHaveBeenCalledTimes(1);

    m.unmount();
  });

  it("send pipeline: chatApi.sendMessage is not exercised directly by handleSend", async () => {
    const ctx = buildCtx({ message: "Direct dispatch test" });
    const m = mountWithCtx(ctx, useSendHandler);

    await act(async () => {
      await (m.box.current as ReturnType<typeof useSendHandler>).handleSend();
    });

    // The hook dispatches via the ctx-supplied onSend. The mocked
    // chatApi is asserted for hygiene (no false-positive dispatch).
    expect(ctx.onSend).toHaveBeenCalledTimes(1);
    expect(chatApi.sendMessage).not.toHaveBeenCalled();

    m.unmount();
  });

  it("Ctrl+Enter send: a synthetic keydown on a wired textarea triggers onSend", async () => {
    const ctx = buildCtx({ message: "From Ctrl+Enter" });

    // Tiny wiring component mirroring the production Ctrl+Enter
    // handler shape used in <ChatInputTextAreaBlock>: preventDefault
    // then call handleSend.
    function ChatTextAreaWire({
      ctx,
    }: {
      ctx: UseSendHandlerCtx;
    }) {
      const hookApi = useSendHandler(ctx);
      return (
        <textarea
          data-testid="chat-input"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void hookApi.handleSend();
            }
          }}
        />
      );
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(<ChatTextAreaWire ctx={ctx} />);
    });

    const ta = container.querySelector(
      'textarea[data-testid="chat-input"]',
    ) as HTMLTextAreaElement | null;
    expect(ta).not.toBeNull();

    await act(async () => {
      ta!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      // Let the microtask queue drain (handleSend is async).
      await Promise.resolve();
    });

    expect(ctx.onSend).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ctx.onSend).mock.calls[0]?.[0]?.message).toBe(
      "From Ctrl+Enter",
    );

    act(() => {
      root.unmount();
    });
  });

  it("queue-when-loading: handleSend enqueues the prompt instead of aborting", async () => {
    const chatId = "queue-test-chat";
    const ctx = buildCtx({
      message: "queued prompt",
      isLoading: true,
      activeChatId: chatId,
    });
    const m = mountWithCtx(ctx, useSendHandler);

    await act(async () => {
      await (m.box.current as ReturnType<typeof useSendHandler>).handleSend();
    });

    const queue = usePromptQueueStore.getState().queues[chatId] ?? [];
    expect(queue).toHaveLength(1);
    expect(queue[0]?.payload.message).toBe("queued prompt");
    expect(ctx.onSend).not.toHaveBeenCalled();
    expect(ctx.onAbort).not.toHaveBeenCalled();
    expect(ctx.resetMessage).toHaveBeenCalledTimes(1);
    expect(ctx.resetFiles).toHaveBeenCalledTimes(1);

    usePromptQueueStore.getState().clear(chatId);
    m.unmount();
  });

  it("suggested-prompt: handleSuggestedClick dispatches with empty files + messages text only", async () => {
    const ctx = buildCtx({
      internalGenerativeUI: false,
      selectedModelId: "gpt-4o",
      selectedProvider: "openai",
      selectedModelInfo: null,
    });
    const m = mountWithCtx(ctx, useSendHandler);
    const api = m.box.current as ReturnType<typeof useSendHandler>;

    act(() => {
      api.handleSuggestedClick("Draft a product brief");
    });

    expect(ctx.onSend).toHaveBeenCalledTimes(1);
    const args = vi.mocked(ctx.onSend).mock.calls[0]?.[0] as
      | OnSendArgs
      | undefined;
    expect(args?.message).toBe("Draft a product brief");
    expect(args?.files).toEqual([]);
    expect(args?.attachments).toEqual([]);
    expect(args?.generativeUI).toBe(false);

    m.unmount();
  });

  it("suggested-prompt: prompt containing 'genui' forces generativeUI true", async () => {
    const ctx = buildCtx({
      internalGenerativeUI: false,
      selectedModelId: "gpt-4o",
      selectedProvider: "openai",
      selectedModelInfo: null,
    });
    const m = mountWithCtx(ctx, useSendHandler);
    const api = m.box.current as ReturnType<typeof useSendHandler>;

    act(() => {
      api.handleSuggestedClick("Render a genui component for me");
    });

    expect(ctx.onSend).toHaveBeenCalledTimes(1);
    const args = vi.mocked(ctx.onSend).mock.calls[0]?.[0] as
      | OnSendArgs
      | undefined;
    expect(args?.generativeUI).toBe(true);

    m.unmount();
  });

  it("suggested-prompt: missing modelId/providerId short-circuits to no-op", async () => {
    const ctx = buildCtx({
      selectedModelId: undefined,
      selectedProvider: undefined,
      selectedModelInfo: null,
    });
    const m = mountWithCtx(ctx, useSendHandler);
    const api = m.box.current as ReturnType<typeof useSendHandler>;

    act(() => {
      api.handleSuggestedClick("Will be dropped");
    });

    expect(ctx.onSend).not.toHaveBeenCalled();

    m.unmount();
  });

  it("suggested-prompt: while isLoading, handleSuggestedClick is a no-op", async () => {
    const ctx = buildCtx({ isLoading: true });
    const m = mountWithCtx(ctx, useSendHandler);
    const api = m.box.current as ReturnType<typeof useSendHandler>;

    act(() => {
      api.handleSuggestedClick("any");
    });

    expect(ctx.onSend).not.toHaveBeenCalled();

    m.unmount();
  });

  it("fallback chain: explicit selectedModelId/selectedProvider wins over modelInfo", async () => {
    const ctx = buildCtx({
      message: "explicit",
      selectedModelId: "explicit-model-id",
      selectedProvider: "explicit-provider-id",
      selectedModelInfo: { id: "fallback-id", provider: "fallback-provider" },
    });
    const m = mountWithCtx(ctx, useSendHandler);

    await act(async () => {
      await (m.box.current as ReturnType<typeof useSendHandler>).handleSend();
    });

    const args = vi.mocked(ctx.onSend).mock.calls[0]?.[0] as
      | OnSendArgs
      | undefined;
    expect(args?.model).toBe("explicit-model-id");
    expect(args?.provider).toBe("explicit-provider-id");

    m.unmount();
  });

  it("fallback chain: empty composer selectors fall back to selectedModelInfo", async () => {
    const ctx = buildCtx({
      message: "fallback-1",
      selectedModelId: undefined,
      selectedProvider: undefined,
      selectedModelInfo: { id: "info-id", provider: "info-provider" },
    });
    const m = mountWithCtx(ctx, useSendHandler);

    await act(async () => {
      await (m.box.current as ReturnType<typeof useSendHandler>).handleSend();
    });

    const args = vi.mocked(ctx.onSend).mock.calls[0]?.[0] as
      | OnSendArgs
      | undefined;
    expect(args?.model).toBe("info-id");
    expect(args?.provider).toBe("info-provider");

    m.unmount();
  });

  it("fallback chain: both selectors + modelInfo empty → 'No Model' / 'ollama' sentinels", async () => {
    const ctx = buildCtx({
      message: "no model at all",
      selectedModelId: undefined,
      selectedProvider: undefined,
      selectedModelInfo: null,
    });
    const m = mountWithCtx(ctx, useSendHandler);

    await act(async () => {
      await (m.box.current as ReturnType<typeof useSendHandler>).handleSend();
    });

    const args = vi.mocked(ctx.onSend).mock.calls[0]?.[0] as
      | OnSendArgs
      | undefined;
    expect(args?.model).toBe("No Model");
    expect(args?.provider).toBe("ollama");

    m.unmount();
  });
});
