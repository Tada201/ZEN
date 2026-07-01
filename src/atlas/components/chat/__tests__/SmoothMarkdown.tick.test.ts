import { describe, it, expect } from "vitest";
import { DEFAULT_TICK_MS } from "../SmoothMarkdown";

describe("SmoothMarkdown tick", () => {
  it("uses 48ms tick to keep up under subagent store pressure", () => {
    expect(DEFAULT_TICK_MS).toBe(48);
  });
});
