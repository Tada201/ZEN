import { useCallback } from "react";
import type { SlashSuggestion } from "./chat/input/useSlashCommand";

/**
 * `useSlashApply` — wraps the "apply a picked slash command into the
 * textarea" behaviour: writes the invocation prefix plus a trailing
 * space, then refocuses the textarea so the user can keep typing.
 *
 * Carved out of `PremiumChatInput.tsx` so the composer's only residual
 * responsibility for the slash flow is a single line of hook-call +
 * spread-through to `ChatInputTextAreaBlock`.
 */

export function useSlashApply(
  setMessage: (val: string) => void,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
): (suggestion: SlashSuggestion) => void {
  return useCallback(
    (suggestion) => {
      setMessage(`${suggestion.invocationSyntax} `);
      if (textareaRef.current) textareaRef.current.focus();
    },
    [setMessage, textareaRef],
  );
}

export default useSlashApply;
