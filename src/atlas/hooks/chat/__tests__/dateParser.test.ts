import { describe, it, expect } from "vitest";
import { parseBackendDate } from "../useChatQueries";

describe("parseBackendDate", () => {
  it("forces UTC parsing for raw SQLite date strings", () => {
    // "2026-07-02 01:00:00" should be parsed as UTC 01:00:00, not local
    const raw = "2026-07-02 01:00:00";
    const date = parseBackendDate(raw);
    expect(date.getUTCHours()).toBe(1);
    expect(date.getUTCDate()).toBe(2);
  });

  it("handles numbers (milliseconds) directly", () => {
    const ms = 1782950400000; // 2026-07-02 UTC
    const date = parseBackendDate(ms);
    expect(date.getTime()).toBe(ms);
  });
});
