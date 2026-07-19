import { useEffect, useMemo, useRef, useState } from "react";
import { useTaskStore } from "@/lib/stores/taskStore";

/**
 * `useChatTaskDrawer` — owns the chat-task source-of-truth and the
 * task-drawer auto-open behaviour for `PremiumChatInput`.
 *
 *   * `visibleTasks` — sorted tasks for the active chat (derived from
 *     `useTaskStore`).
 *   * `isOpen` / `setIsOpen` — drawer state, owned by this hook so
 *     auto-open can flip it without round-tripping through the
 *     composer.
 *   * Auto-open: when the visible task count grows past the previous
 *     count, the drawer opens so the user notices new work. When
 *     the count drops to zero, the drawer auto-closes.
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
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (visibleTasks.length > prevCountRef.current && visibleTasks.length > 0) {
      setIsOpen(true);
    } else if (visibleTasks.length === 0) {
      setIsOpen(false);
    }
    prevCountRef.current = visibleTasks.length;
  }, [visibleTasks.length]);

  return { visibleTasks, isOpen, setIsOpen };
}

export default useChatTaskDrawer;
