import { useEffect, useMemo, useState } from "react";
import { useTaskStore } from "@/lib/stores/taskStore";

/**
 * `useChatTaskDrawer` — owns the chat-task source-of-truth and the
 * user-controlled task-plan drawer for `PremiumChatInput`.
 *
 *   * `visibleTasks` — sorted tasks for the active chat (derived from
 *     `useTaskStore`).
 *   * `isOpen` / `setIsOpen` — drawer state, owned by this hook so
 *     the user can inspect the plan without disrupting the draft.
 *   * When the count drops to zero, the drawer auto-closes because
 *     there is no plan left to show.
 *
 * Carved out of `PremiumChatInput.tsx` so the composer stays well
 * under the 350-line warning limit.
 *
 * The return shape is inferred — no explicit exported interface.
 * Callers destructure `{ visibleTasks, isOpen, setIsOpen }`.
 */

export function useChatTaskDrawer(chatId: string | null | undefined) {
  const taskMap = useTaskStore((state) => state.tasks);
  const visibleTasks = useMemo(() => {
    if (!chatId) return [];
    return Array.from(taskMap.values())
      .filter((task) => task.chatId === chatId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [taskMap, chatId]);

  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    // A disclosure is local to the active chat. Do not carry an open task plan
    // into another session that happens to have a task at the same index.
    setIsOpen(false);
  }, [chatId]);
  useEffect(() => {
    if (visibleTasks.length === 0) setIsOpen(false);
  }, [visibleTasks.length]);

  return { visibleTasks, isOpen, setIsOpen };
}

export default useChatTaskDrawer;
