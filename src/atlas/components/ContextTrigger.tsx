/**
 * `ContextTrigger` — thin wrapper around `ContextViewerBadge`.
 *
 * The badge now owns its own composition popover (opened directly above
 * the circular gauge), so this wrapper no longer wires a right-panel
 * open handler. Kept as the single mount point in `ChatInputFooter` so
 * the composer file stays under the line-count warning limit.
 */

import { ContextViewerBadge } from "./context/ContextViewerBadge";

interface ContextTriggerProps {
  chatId: string | null | undefined;
}

export const ContextTrigger = ({ chatId }: ContextTriggerProps) => {
  return <ContextViewerBadge chatId={chatId} />;
};

export default ContextTrigger;
