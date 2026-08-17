import { toast } from "sonner";
import { getIpcErrorMessage } from "@/api";
import { contextApi } from "@/api/contextApi";

/**
 * Client-side `/compact` command handling. Like `/goal`, it is intercepted
 * in the send path and never reaches the model. It asks the backend to
 * summarize the chat's history into a persisted summary immediately
 * (marking the covered messages compacted); optional free-text
 * instructions focus the summary.
 *
 * Grammar:
 *   /compact                      compact now
 *   /compact <instructions>       compact now, focusing the summary
 */

export interface CompactCommand {
  instructions?: string;
}

/** Returns null when the text is not a `/compact` invocation. */
export function parseCompactCommand(raw: string): CompactCommand | null {
  const trimmed = raw.trim();
  if (
    trimmed !== "/compact" &&
    !trimmed.startsWith("/compact ") &&
    !trimmed.startsWith("/compact\t")
  ) {
    return null;
  }
  const instructions = trimmed.slice("/compact".length).trim();
  return instructions ? { instructions } : {};
}

/** Run the parsed command. Returns true when the input is fully consumed. */
export async function executeCompactCommand(
  command: CompactCommand,
  ctx: { chatId?: string | null; isLoading?: boolean },
): Promise<boolean> {
  if (!ctx.chatId) {
    toast.error("Start or select a chat before using /compact.");
    return true;
  }
  if (ctx.isLoading) {
    toast.info("Wait for the current response to finish before compacting.");
    return true;
  }
  try {
    const outcome = await contextApi.compactChatContext(
      ctx.chatId,
      command.instructions,
    );
    toast.success(
      `Context compacted — ${outcome.messagesSummarized} messages summarized`,
    );
    return true;
  } catch (e) {
    toast.error(getIpcErrorMessage(e, "Compaction failed"));
    return true;
  }
}
