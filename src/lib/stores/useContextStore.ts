import { create } from "zustand";
import type { ContextBreakdown } from "@/lib/types/contextBreakdown";

interface PerChatBreakdown {
  /** Latest breakdown delivered for this chat. Stamped with runId + iteration
   * for dedupe so a re-broadcast from the emitter doesn't flicker the
   * badge and a fresh later run replaces a stale earlier run predictably. */
  latest: ContextBreakdown | null;
  /** Iteration number of `latest`. Used as a monotonic dedupe key
   *  WITHIN a single run. */
  latestIteration: number;
  /** Monotonic per-Runner.run() id of `latest`. Used to decide when
   *  to fully replace the slot with a fresh run. */
  latestRunId: number;
  /** True when at least one iteration has emitted. */
  hasData: boolean;
  /** ISO timestamp of the most recent emission. */
  updatedAt: string | null;
}

export interface ContextStoreState {
  perChat: Record<string, PerChatBreakdown>;
  /** When non-null, indicates the user opened the right-panel tab and is
   *  actively watching this chat's breakdown history. */
  observingChatId: string | null;
}

interface ContextStoreActions {
  apply: (payload: ContextBreakdown) => void;
  reset: (chatId: string) => void;
  setObserving: (chatId: string | null) => void;
}

export const useContextStore = create<ContextStoreState & ContextStoreActions>(
  (set) => ({
    perChat: {},
    observingChatId: null,

    apply: (payload) =>
      set((state) => {
        const prior = state.perChat[payload.chatId];
        // Dedupe by `(chatId, runId, iteration)`. The chatId is
        // already encoded in the dict key, so the rule within a
        // chatId is:
        //   * same runId + older iteration → ignore (stale iter
        //     from the same Runner.run()).
        //   * fresh runId → always apply (a later Runner.run() on
        //     the same chat is the new truth; even if it starts at
        //     iteration 1 it must replace a stale earlier run).
        //   * prior.runId > payload.runId → ignore (defensive: out
        //     of order is impossible today because AtomicU64 is
        //     monotonically increasing, but the rule costs nothing).
        if (prior) {
          if (prior.latestRunId === payload.runId) {
            if (payload.iteration <= prior.latestIteration) {
              // Same (runId, iteration) normally means a stale re-broadcast
              // and is ignored. The one exception: the runner re-emits the
              // SAME iteration after its LLM call returns, now carrying the
              // provider-reported `actualInputTokens`/`actualOutputTokens`
              // the pre-call emit could not know. Let that upgrade through
              // so the live badge shows real usage on single-turn runs
              // instead of waiting for the next iteration (which never comes
              // when the run ends here).
              const priorHadActuals =
                prior.latest?.actualInputTokens != null ||
                prior.latest?.actualOutputTokens != null;
              const payloadHasActuals =
                payload.actualInputTokens != null ||
                payload.actualOutputTokens != null;
              const isActualsUpgrade =
                payload.iteration === prior.latestIteration &&
                payloadHasActuals &&
                !priorHadActuals;
              if (!isActualsUpgrade) {
                return state;
              }
            }
          } else if (prior.latestRunId > payload.runId) {
            return state;
          }
        }
        return {
          perChat: {
            ...state.perChat,
            [payload.chatId]: {
              latest: payload,
              latestIteration: payload.iteration,
              latestRunId: payload.runId,
              hasData: true,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      }),

    reset: (chatId) =>
      set((state) => ({
        perChat: {
          ...state.perChat,
          [chatId]: {
            latest: null,
            latestIteration: 0,
            latestRunId: 0,
            hasData: false,
            updatedAt: null,
          },
        },
      })),

    setObserving: (chatId) => set({ observingChatId: chatId }),
  }),
);

/**
 * Convenience selector: read the latest breakdown for a given chat.
 * Returns `null` until the first iteration broadcasts.
 */
export function selectLatestBreakdown(
  state: ContextStoreState,
  chatId: string | null | undefined,
): ContextBreakdown | null {
  if (!chatId) return null;
  return state.perChat[chatId]?.latest ?? null;
}
