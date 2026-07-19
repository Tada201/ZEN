/**
 * Global bridge between the Rust `context:breakdown` event bus and the
 * Zustand `useContextStore`. Runs once at app boot (mounted by
 * `useAppInit`) so the listener survives chat switches — every per-chat
 * breakdown emitted by the runner lands in the store without any chat
 * component needing to re-subscribe.
 *
 * Cold-start hydration is handled by the viewers themselves (Panel /
 * Badge) on chatId change so they pull a cached breakdown only when the
 * user is actually watching that chat, not every chat in the list.
 */

import { useEffect } from "react";
import { contextApi, CONTEXT_BREAKDOWN_EVENT } from "@/api/contextApi";
import { IS_TAURI } from "@/api/tauriClient";
import { useContextStore } from "@/lib/stores/useContextStore";

export function useContextBridge() {
  // Subscribe to live emissions from the runner.
  useEffect(() => {
    if (!IS_TAURI) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    contextApi
      .onBreakdown((payload) => {
        if (cancelled) return;
        useContextStore.getState().apply(payload);
      })
      .then((unsub) => {
        if (cancelled) {
          unsub();
        } else {
          unlisten = unsub;
        }
      })
      .catch((err) => {
        // Surface once — silent failure here would make the right-panel
        // appear connected but never update on a real run.
        console.warn(
          `[ContextBridge] failed to subscribe to ${CONTEXT_BREAKDOWN_EVENT}:`,
          err,
        );
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
