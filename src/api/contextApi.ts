import { callCommand } from "@/api/tauriClient";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ContextBreakdown,
  ContextSnapshot,
} from "@/lib/types/contextBreakdown";

// Backend → frontend bridge: the Rust runner emits per-iteration
// breakdowns on `context:breakdown`. The Tauri-bridge task in
// `event_bus.rs::bridge_to_tauri::bridge_to_tauri` ships the inner
// payload (NOT the tagged enum wrapper), so we listen on the flat
// event name `context:breakdown`.
export const CONTEXT_BREAKDOWN_EVENT = "context:breakdown";

export const contextApi = {
  /**
   * Per-iteration breakdown subscription. Fires once per emitted
   * breakdown. Caller is responsible for filtering by chat_id.
   */
  onBreakdown(
    handler: (payload: ContextBreakdown) => void,
  ): Promise<UnlistenFn> {
    return listen<ContextBreakdown>(CONTEXT_BREAKDOWN_EVENT, (event) => {
      handler(event.payload);
    });
  },

  /**
   * On-demand fetch: the right-panel tab asks for the latest snapshot
   * after a page reload or when the user opens the tab mid-run.
   */
  getBreakdown(chatId: string): Promise<ContextBreakdown | null> {
    return callCommand<ContextBreakdown | null>("get_context_breakdown", {
      chatId,
    });
  },

  /**
   * Compact snapshot for the PremiumChatInput badge. Returns an empty
   * snapshot if the runner has not finished any iteration for `chatId` yet.
   */
  getSnapshot(
    chatId: string,
    contextWindow?: number,
  ): Promise<ContextSnapshot> {
    return callCommand<ContextSnapshot>("get_context_snapshot", {
      chatId,
      contextWindow,
    });
  },
};
