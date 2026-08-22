import { describe, it, expect } from "vitest";
import { deriveAssistantMessageViewState } from "../AssistantMessage.logic";
import type { Message } from "../types";
import { groupAssistantSteps } from "../assistantMessageParts";

function makeMessage(steps: Message["steps"], status: Message["status"] = "sent"): Message {
  return {
    id: "m1",
    role: "assistant",
    content: "",
    status,
    steps,
  } as Message;
}

describe("foldPostAnswerReasoning (via deriveAssistantMessageViewState)", () => {
  const build = (message: Message) => {
    const groupedSteps = groupAssistantSteps(message.steps);
    return deriveAssistantMessageViewState({
      message,
      groupedSteps,
      groupedToolCalls: [],
    });
  };

  it("folds a trailing reasoning block back into the pre-answer reasoning on a settled turn", () => {
    const message = makeMessage([
      { type: "reasoning", content: "Validation\nfirst thought", eventId: "runtime:r1" },
      { type: "text", content: "The workspace contains no files.", eventId: "runtime:t1" },
      { type: "reasoning", content: "Result\nthe tool result.", eventId: "runtime:r2" },
    ]);
    const view = build(message);
    const reasoningSteps = view.visibleGroupedSteps.filter((s) => s.type === "reasoning");
    const lastText = view.visibleGroupedSteps.map((s) => s.type).lastIndexOf("text");
    const lastReasoning = view.visibleGroupedSteps.map((s) => s.type).lastIndexOf("reasoning");

    expect(reasoningSteps).toHaveLength(1);
    // Reasoning must never read after the answer.
    expect(lastReasoning).toBeLessThan(lastText);
    expect((reasoningSteps[0] as { content: string }).content).toContain("the tool result.");
  });

  it("keeps a trailing reasoning block intact while streaming (live Thinking…)", () => {
    const message = makeMessage(
      [
        { type: "reasoning", content: "first thought", eventId: "runtime:r1" },
        { type: "text", content: "partial answer", eventId: "runtime:t1" },
        { type: "reasoning", content: "still thinking", eventId: "runtime:r2" },
      ],
      "sending",
    );
    const view = build(message);
    const reasoningSteps = view.visibleGroupedSteps.filter((s) => s.type === "reasoning");
    expect(reasoningSteps).toHaveLength(2);
  });
});
