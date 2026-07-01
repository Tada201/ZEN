import { describe, it, expect } from "vitest";
import { isSubagentChunkRoutable } from "../useAgentEvents";

describe("subagent chunk routing", () => {
  it("drops chunks without a chat_id", () => {
    expect(isSubagentChunkRoutable({})).toBe(false);
    expect(isSubagentChunkRoutable({ chat_id: "", chatId: "" })).toBe(false);
    expect(isSubagentChunkRoutable({ chat_id: "  ", chatId: " \n" })).toBe(false);
  });
  it("accepts chunks with a real chat_id", () => {
    expect(isSubagentChunkRoutable({ chat_id: "abc" })).toBe(true);
    expect(isSubagentChunkRoutable({ chatId: "abc" })).toBe(true);
  });
});
