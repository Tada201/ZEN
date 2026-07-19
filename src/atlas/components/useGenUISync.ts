import { useCallback, useEffect, useState } from "react";
import { preloadOpenUISystemPrompt } from "./genui/promptLoader";

/**
 * `useGenUISync` — owns the bidirectional generative-UI state for the
 * chat input composer.
 *
 * The composer receives `generativeUI?: boolean` as a controlled
 * prop; we mirror it into local state, fire a one-time prompt preload
 * (for performance) on transitions to ON, and propagate user changes
 * back via `onGenerativeUIChange`. Two effects drive the preload: one
 * for external `propValue` changes, one for user-driven local
 * changes. Both call the same preload path.
 *
 * Carved out of `PremiumChatInput.tsx` so the composer stays well
 * under the 350-line warning limit.
 */

export function useGenUISync(
  propValue: boolean | undefined,
  onChange?: (val: boolean) => void,
): readonly [boolean, (val: boolean) => void] {
  const [internal, setInternal] = useState<boolean>(propValue ?? false);

  useEffect(() => {
    if (propValue !== undefined) setInternal(propValue);
  }, [propValue]);

  // The preload is a single-fire idempotent side-effect; gating it on
  // the `internal` effect below is enough to cover both the user-
  // driven toggle and the external-prop-change flip paths. Putting
  // it in the setter AND the effect would double-fire on the
  // user-toggle path.
  const setInternalWrapped = useCallback(
    (val: boolean) => {
      setInternal(val);
      onChange?.(val);
    },
    [onChange],
  );

  useEffect(() => {
    if (internal) void preloadOpenUISystemPrompt();
  }, [internal]);

  return [internal, setInternalWrapped] as const;
}

export default useGenUISync;
