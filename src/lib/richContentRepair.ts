import { chatApi } from "@/api/chatApi";
import { useChatStore } from "@/lib/stores/useChatStore";
import type { Message, Step } from "@/atlas/components/chat/types";

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace the first ```lang fenced block whose body exactly matches `code` in
 * a markdown string. Returns the updated string, or `null` when no such block
 * exists (callers then fall back to a local-only repair).
 */
export function replaceFirstFencedBlock(
  source: string,
  lang: string,
  code: string,
  replacement: string,
): string | null {
  if (!source || !code) return null;
  const pattern = new RegExp("( {0,3}```" + lang + "\\s*)" + escapeRegExp(code) + "(\\s*```)");
  if (!pattern.test(source)) return null;
  return source.replace(pattern, (_match, open: string, close: string) => `${open}${replacement}${close}`);
}

/**
 * Persist an AI-repaired fenced block (```mermaid / ```chart) into the stored
 * assistant message so the fix survives app reloads:
 * 1. Rewrites the fence in the message content AND in the execution timeline
 *    (`steps_json` is the source of truth on reload).
 * 2. Writes through the typed IPC wrapper.
 * 3. Mirrors the edit into the live chat store so the UI updates immediately.
 *
 * Returns `false` (and changes nothing) when chat/message context is missing,
 * the fence cannot be located, or the backend write fails — callers then keep
 * the local-only repair.
 */
export async function persistFencedRepair(params: {
  chatId?: string;
  messageId?: string;
  lang: "mermaid" | "chart";
  code: string;
  fixed: string;
}): Promise<boolean> {
  const { chatId, messageId, lang, code, fixed } = params;
  if (!chatId || !messageId) return false;

  const current = useChatStore
    .getState()
    .getSessionMessages(chatId)
    .find((m) => m.id === messageId);
  if (!current) return false;

  const originalContent = current.content ?? "";
  const updatedContent = replaceFirstFencedBlock(originalContent, lang, code, fixed) ?? originalContent;
  const contentChanged = updatedContent !== originalContent;

  let updatedStepsJson: string | undefined;
  if (Array.isArray(current.steps) && current.steps.length > 0) {
    let replacedAny = false;
    const updatedSteps = current.steps.map((step) => {
      if (step.type !== "text" || typeof step.content !== "string") return step;
      const replaced = replaceFirstFencedBlock(step.content, lang, code, fixed);
      if (replaced != null && replaced !== step.content) {
        replacedAny = true;
        return { ...step, content: replaced };
      }
      return step;
    });
    if (replacedAny) updatedStepsJson = JSON.stringify(updatedSteps);
  }
  if (!contentChanged && !updatedStepsJson) return false;

  const traceStatus =
    current.status === "cancelled"
      ? "interrupted"
      : current.status === "failed"
        ? "failed"
        : "completed";
  try {
    await chatApi.updateMessageContent(chatId, messageId, updatedContent, updatedStepsJson, traceStatus);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[rich-content] persisting repair failed", err);
    return false;
  }

  useChatStore.getState().setSessionMessages(chatId, (prev) =>
    prev.map((m) => {
      if (m.id !== messageId) return m;
      const next: Message = { ...m, content: updatedContent };
      if (updatedStepsJson) {
        try {
          next.steps = JSON.parse(updatedStepsJson) as Step[];
        } catch {
          // Keep the original steps on malformed payloads.
        }
      }
      return next;
    }),
  );
  return true;
}
