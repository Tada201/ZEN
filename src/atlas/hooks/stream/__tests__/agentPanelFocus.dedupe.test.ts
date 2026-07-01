import { describe, it, expect } from "vitest";
import { shouldFocusAgentsForSpawn } from "../agentPanelFocus";

describe("agent panel focus dedupe", () => {
  it("focuses only on the first occurrence per spawn_id", () => {
    const registry = new Set<string>();
    expect(shouldFocusAgentsForSpawn("spawn-1", registry)).toBe(true);
    expect(shouldFocusAgentsForSpawn("spawn-1", registry)).toBe(false);
    expect(shouldFocusAgentsForSpawn("spawn-2", registry)).toBe(true);
  });
});
