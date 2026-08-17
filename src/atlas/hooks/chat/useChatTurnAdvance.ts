import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { listenAppEvent } from "@/api/events";
import { useChatStore } from "@/lib/stores/useChatStore";
import { usePromptQueueStore, type QueuedPromptPayload } from "@/lib/stores/promptQueueStore";
import { useGoalStore } from "@/lib/stores/goalStore";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";

/**
 * `useChatTurnAdvance` — the single decision point for "what happens after a
 * turn ends". When the backend finishes (`chat:done`) or fails (`chat:error`)
 * a turn for a chat, exactly one of these may follow, in priority order:
 *
 * 1. The next queued user prompt (prompt queue) replays through the normal
 *    send pipeline.
 * 2. If an active `/goal` is armed and the finished turn actually used tools
 *    (Codex-style no-spin guard), an automatic goal-continuation turn starts.
 *
 * Cancelled turns never auto-advance — the user interrupted on purpose, so
 * queued prompts stay visible above the composer until resumed manually.
 *
 * The send function is always read through a ref so remounts pick up fresh
 * closures. Double-mounted sections are safe: `handleSendMessage` flips the
 * chat's streaming flag synchronously before its first await, so a second
 * advance racing the first no-ops on the streaming guard.
 */

/** Hard cap on consecutive automatic goal turns before the goal auto-pauses. */
const MAX_GOAL_CONTINUATIONS = 25;
/** Grace period so chat:done finalization settles before the next send. */
const ADVANCE_DELAY_MS = 250;

export type TurnAdvanceSendFn = (
  data: QueuedPromptPayload & { targetSessionId: string; goalContinuation?: boolean },
) => void | Promise<void>;

function buildGoalContinuationMessage(objective: string, turn: number): string {
  return [
    `[Goal continuation — turn ${turn}]`,
    `Continue working toward the session goal: "${objective}".`,
    "Assess what is already done, then take the next concrete step.",
    'If the goal is verifiably achieved, call update_goal with status "complete" and cite the evidence.',
    'If the same blocker persists and you cannot proceed without the user, call update_goal with status "blocked".',
    "Otherwise keep working — do not restate the plan, act on it.",
  ].join("\n");
}

export function useChatTurnAdvance(send: TurnAdvanceSendFn) {
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];
    const timers = new Map<string, number>();

    const advance = (chatId: string) => {
      timers.delete(chatId);
      if (useChatStore.getState().streamingChats[chatId]) return;

      // 1) Queued user prompts win over goal continuation.
      const queued = usePromptQueueStore.getState().shift(chatId);
      if (queued) {
        void sendRef.current({ ...queued.payload, targetSessionId: chatId });
        return;
      }

      // 2) Goal continuation: active goal, tools were used (no-spin guard),
      //    under the runaway cap.
      const goalStore = useGoalStore.getState();
      const goal = goalStore.getGoal(chatId);
      if (!goal || goal.status !== "active") return;
      if (!goalStore.consumeToolActivity(chatId)) return;
      if ((goalStore.continuationCounts[chatId] ?? 0) >= MAX_GOAL_CONTINUATIONS) {
        void goalStore.updateStatus(chatId, "paused");
        toast.info(
          `Goal paused after ${MAX_GOAL_CONTINUATIONS} automatic turns.`,
          { description: "Resume it with /goal resume when you want the agent to continue." },
        );
        return;
      }

      const turn = goalStore.nextContinuation(chatId);
      const settings = useSettingsStore.getState();
      const model = settings.activeModel || "No Model";
      const provider = settings.activeProvider || undefined;
      void sendRef.current({
        message: buildGoalContinuationMessage(goal.objective, turn),
        model,
        provider,
        targetSessionId: chatId,
        goalContinuation: true,
      });
    };

    const schedule = (chatId: string | null | undefined, cancelled: boolean) => {
      if (!chatId) return;
      if (cancelled) {
        // A user stop must not trigger the next queued/continuation turn.
        // Clear any pending advance so a stop mid-grace-period can't fire it.
        const pending = timers.get(chatId);
        if (pending !== undefined) {
          window.clearTimeout(pending);
          timers.delete(chatId);
        }
        return;
      }
      if (timers.has(chatId)) return;
      timers.set(chatId, window.setTimeout(() => advance(chatId), ADVANCE_DELAY_MS));
    };

    unlisteners.push(
      listenAppEvent("chat:done", (event) => {
        schedule(event.payload.chat_id, event.payload.reason === "cancelled");
      }),
    );
    unlisteners.push(
      listenAppEvent("chat:error", (event) => {
        // Transport errors surface inline; retry stays user-driven. The queue
        // is preserved so nothing is lost, but we do not auto-drain into a
        // failing provider.
        schedule(event.payload.chat_id, true);
      }),
    );

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      void Promise.all(unlisteners).then((fns) => fns.forEach((fn) => fn()));
    };
  }, []);
}
