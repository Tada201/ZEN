export type DisclosureLifecycleStatus =
  | "running"
  | "awaiting_approval"
  | "error"
  | "failed"
  | "completed"
  | "cancelled";

export type DisclosureState = {
  open: boolean;
  userToggled: boolean;
  previousStatus: DisclosureLifecycleStatus;
};

export function isDisclosureAttentionState(status: DisclosureLifecycleStatus): boolean {
  return status === "running"
    || status === "awaiting_approval"
    || status === "error"
    || status === "failed";
}

export function isDisclosureTerminalState(status: DisclosureLifecycleStatus): boolean {
  return status === "completed" || status === "cancelled";
}

export function createDisclosureState(
  status: DisclosureLifecycleStatus,
  initialOpen = isDisclosureAttentionState(status),
): DisclosureState {
  return {
    open: initialOpen,
    userToggled: false,
    previousStatus: status,
  };
}

/**
 * Apply a lifecycle update without taking control away from the user.
 * Attention states open automatically; terminal states retain the current
 * disclosure so a live result cannot disappear while it is being read.
 */
export function transitionDisclosure(
  state: DisclosureState,
  status: DisclosureLifecycleStatus,
): DisclosureState {
  if (state.userToggled) {
    return { ...state, previousStatus: status };
  }

  if (isDisclosureAttentionState(status)) {
    return {
      ...state,
      open: true,
      previousStatus: status,
    };
  }

  // Terminal transitions preserve the current disclosure. This keeps a live
  // result visible, while a newly loaded terminal state remains summary-first.
  return {
    ...state,
    previousStatus: status,
  };
}

export function toggleDisclosure(state: DisclosureState, open: boolean): DisclosureState {
  return {
    ...state,
    open,
    userToggled: true,
  };
}
