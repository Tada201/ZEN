// Chat-scoped tombstones for assistant targets a newer turn has replaced.
// A superseded run's late events (regenerate clicked mid-stream, rapid
// re-send) still carry the old backend message id; routing must drop them
// instead of falling through to the new active assistant, which would graft
// stale prose onto the replacement turn.
const retiredTargets = new Map<string, Set<string>>();

export function retireStreamTargets(
  chatId: string,
  assistantIds: Array<string | null | undefined>,
): void {
  let set = retiredTargets.get(chatId);
  if (!set) {
    set = new Set();
    retiredTargets.set(chatId, set);
  }
  for (const id of assistantIds) {
    if (id) set.add(id);
  }
}

export function isRetiredStreamTarget(
  chatId: string | null | undefined,
  assistantId: string | null | undefined,
): boolean {
  if (!chatId || !assistantId) return false;
  return retiredTargets.get(chatId)?.has(assistantId) ?? false;
}

export function clearRetiredStreamTargets(chatId: string): void {
  retiredTargets.delete(chatId);
}
