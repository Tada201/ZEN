import { describe, it, expect } from "vitest";
import {
  buildTurnMap,
  deriveFoldedTurnIds,
  deriveTurnFoldLabel,
  TURNS_KEEP_EXPANDED,
  type TurnInfo,
} from "../messageListTurns";

function turn(id: string, turnId: string, turnIndex: number, messageCount = 1): [string, TurnInfo] {
  return [
    id,
    {
      turnId,
      turnIndex,
      messageCount,
      messageIds: [id],
    },
  ];
}

describe("messageListTurns", () => {
  describe("buildTurnMap", () => {
    it("opens a new turn at every user message and attaches assistants", () => {
      const map = buildTurnMap([
        { id: "u1", role: "user" },
        { id: "a1", role: "assistant" },
        { id: "a2", role: "assistant" },
        { id: "u2", role: "user" },
        { id: "a3", role: "assistant" },
      ]);
      expect(map.get("u1")?.turnIndex).toBe(0);
      expect(map.get("a1")?.turnIndex).toBe(0);
      expect(map.get("a2")?.turnIndex).toBe(0);
      expect(map.get("u2")?.turnIndex).toBe(1);
      expect(map.get("a3")?.turnIndex).toBe(1);
      expect(map.get("a2")?.messageCount).toBe(3);
    });

    it("is total even when the list starts without a user message", () => {
      const map = buildTurnMap([
        { id: "a0", role: "assistant" },
        { id: "u1", role: "user" },
        { id: "a1", role: "assistant" },
      ]);
      expect(map.get("a0")?.turnIndex).toBe(0);
      expect(map.get("u1")?.turnIndex).toBe(1);
      expect(map.get("a1")?.turnIndex).toBe(1);
    });

    it("keeps message ids in arrival order", () => {
      const map = buildTurnMap([
        { id: "u1", role: "user" },
        { id: "a1", role: "assistant" },
        { id: "a2", role: "assistant" },
      ]);
      expect(map.get("u1")?.messageIds).toEqual(["u1", "a1", "a2"]);
    });
  });

  describe("deriveFoldedTurnIds", () => {
    it("never folds the opening turn", () => {
      const map = new Map([turn("u1", "u1", 0), turn("u2", "u2", 1), turn("u3", "u3", 2)]);
      const folded = deriveFoldedTurnIds(map, 3, new Set());
      expect(folded.has("u1")).toBe(false);
    });

    it("keeps the most recent turns expanded", () => {
      const map = new Map([
        turn("u1", "u1", 0),
        turn("u2", "u2", 1),
        turn("u3", "u3", 2),
        turn("u4", "u4", 3),
        turn("u5", "u5", 4),
      ]);
      const folded = deriveFoldedTurnIds(map, 5, new Set());
      expect(folded.has("u2")).toBe(true);
      expect(folded.has("u3")).toBe(true);
      expect(folded.has("u4")).toBe(false);
      expect(folded.has("u5")).toBe(false);
    });

    it("folds nothing when the thread is too short to have old turns", () => {
      const map = new Map([turn("u1", "u1", 0), turn("u2", "u2", 1), turn("u3", "u3", 2)]);
      const folded = deriveFoldedTurnIds(map, 3, new Set());
      expect(folded.size).toBe(0);
    });

    it("respects the keepExpanded override", () => {
      const map = new Map([
        turn("u1", "u1", 0),
        turn("u2", "u2", 1),
        turn("u3", "u3", 2),
        turn("u4", "u4", 3),
      ]);
      const folded = deriveFoldedTurnIds(map, 4, new Set(), 1);
      expect(folded.has("u2")).toBe(true);
      expect(folded.has("u3")).toBe(true);
      expect(folded.has("u4")).toBe(false);
    });

    it("keeps explicitly revealed turns expanded", () => {
      const map = new Map([
        turn("u1", "u1", 0),
        turn("u2", "u2", 1),
        turn("u3", "u3", 2),
        turn("u4", "u4", 3),
        turn("u5", "u5", 4),
      ]);
      const folded = deriveFoldedTurnIds(map, 5, new Set(["u2"]));
      expect(folded.has("u2")).toBe(false);
      expect(folded.has("u3")).toBe(true);
    });

    it("defaults to TURNS_KEEP_EXPANDED = 2", () => {
      expect(TURNS_KEEP_EXPANDED).toBe(2);
    });
  });

  describe("deriveTurnFoldLabel", () => {
    it("leads with the opening user prompt and message count", () => {
      const turn: TurnInfo = { turnId: "u1", turnIndex: 2, messageCount: 4, messageIds: ["u1", "a1", "a2", "a3"] };
      const label = deriveTurnFoldLabel(turn, [
        { id: "u1", content: "  Fix the build error  " },
        { id: "a1", content: "done" },
      ]);
      expect(label.preview).toBe("Fix the build error");
      expect(label.text).toBe('"Fix the build error" · 4 messages');
    });

    it("elides long prompts with an ellipsis at the preview cap", () => {
      const turn: TurnInfo = { turnId: "u1", turnIndex: 2, messageCount: 1, messageIds: ["u1"] };
      const longPrompt = "a".repeat(100);
      const label = deriveTurnFoldLabel(turn, [{ id: "u1", content: longPrompt }]);
      expect(label.preview.length).toBe(48 + 1); // 48 chars + ellipsis
      expect(label.preview.endsWith("…")).toBe(true);
      expect(label.text.startsWith('"')).toBe(true);
    });

    it("falls back to Turn N · M messages when the turn has no user prompt", () => {
      const turn: TurnInfo = { turnId: "a0", turnIndex: 0, messageCount: 2, messageIds: ["a0", "a1"] };
      const label = deriveTurnFoldLabel(turn, [{ id: "a0", content: "" }]);
      expect(label.preview).toBe("");
      expect(label.text).toBe("Turn 1 · 2 messages");
    });

    it("honors a custom preview cap", () => {
      const turn: TurnInfo = { turnId: "u1", turnIndex: 0, messageCount: 1, messageIds: ["u1"] };
      const label = deriveTurnFoldLabel(turn, [{ id: "u1", content: "abcdefghij" }], 5);
      expect(label.preview).toBe("abcde…");
    });
  });
});
