import { describe, it, expect } from "vitest";
import {
  deriveAssistantMessageViewState,
  getExecutionStepKey,
  isVisibleChatActionStep,
  isVisibleChatStatusStep,
} from "../AssistantMessage.logic";
import type { DelegationTree } from "@/atlas/agentRuntime/delegationTree";
import type { GroupedAssistantStep } from "../assistantMessageParts";
import type { Message } from "../types";

const emptyDelegationTree: DelegationTree = {
  nodes: new Map(),
  steps: new Map(),
  childrenByParent: new Map(),
  roots: [],
};

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    role: "assistant",
    content: "",
    ...overrides,
  };
}

function textStep(content: string): GroupedAssistantStep {
  return { type: "text", content, cleanText: content, cards: [], orderedCards: [] };
}

describe("AssistantMessage.logic", () => {
  describe("isVisibleChatStatusStep / isVisibleChatActionStep", () => {
    it("hides raw chat_status rows unless the phase is the agent-streaming phase", () => {
      expect(isVisibleChatStatusStep({ type: "action", kind: "tool_call" })).toBe(true);
      expect(isVisibleChatStatusStep({ type: "action", kind: "chat_status", metadata: { phase: "tool_call_ready" } })).toBe(false);
      expect(isVisibleChatStatusStep({ type: "action", kind: "chat_status", metadata: { phase: "agent_streaming" } })).toBe(true);
    });

    it("only surfaces approval, clarification, and visible chat-status actions", () => {
      expect(isVisibleChatActionStep({ type: "action", kind: "approval_request" })).toBe(true);
      expect(isVisibleChatActionStep({ type: "action", kind: "clarification_request" })).toBe(true);
      expect(isVisibleChatActionStep({ type: "action", kind: "chat_status", metadata: { phase: "agent_streaming" } })).toBe(true);
      expect(isVisibleChatActionStep({ type: "action", kind: "tool_call" })).toBe(false);
      expect(isVisibleChatActionStep({ type: "text" })).toBe(false);
    });
  });

  describe("getExecutionStepKey", () => {
    it("uses the canonical tool id for a group with one", () => {
      const key = getExecutionStepKey(
        { type: "tool-group", toolCalls: [{ id: "tool-1" }] },
        0,
      );
      expect(key).toBe("tool-group-tool-1");
    });

    it("uses a stable fallback fingerprint for groups without ids", () => {
      const caches: [Map<string, string>, Map<string, string>, Map<string, number>] = [
        new Map(),
        new Map(),
        new Map(),
      ];
      const first = getExecutionStepKey(
        { type: "tool-group", toolCalls: [{ name: "read_file" }] },
        0,
        caches[0],
        caches[1],
        caches[2],
      );
      const second = getExecutionStepKey(
        { type: "tool-group", toolCalls: [{ name: "read_file" }] },
        1,
        caches[0],
        caches[1],
        caches[2],
      );
      expect(first).toBe(second);
    });

    it("keeps action and subagent event ids stable", () => {
      expect(getExecutionStepKey({ type: "action", eventId: "action-1" }, 3)).toBe("action-action-1");
      expect(getExecutionStepKey({ type: "subagent", eventId: "sub-1" }, 2)).toBe("subagent-sub-1");
      expect(getExecutionStepKey({ type: "text" }, 1)).toBe("text-1");
    });
  });

  describe("deriveAssistantMessageViewState", () => {
    it("treats answer text as a visible answer and shows message actions", () => {
      const view = deriveAssistantMessageViewState({
        message: message({ content: "Done." }),
        groupedSteps: [textStep("Done.")],
        groupedToolCalls: [],
        delegationTree: emptyDelegationTree,
      });
      expect(view.hasVisibleAnswer).toBe(true);
      expect(view.hasVisibleTextStep).toBe(true);
      expect(view.hasOnlyLiveProgress).toBe(false);
      expect(view.showMessageActions).toBe(true);
      expect(view.parentWorkingStatus).toBeUndefined();
    });

    it("stays quiet for live-only action progress without an answer", () => {
      const view = deriveAssistantMessageViewState({
        message: message({ status: "sending" }),
        groupedSteps: [{ type: "action", kind: "orchestrator_progress", status: "running" }],
        groupedToolCalls: [],
        delegationTree: emptyDelegationTree,
      });
      expect(view.hasVisibleAnswer).toBe(false);
      expect(view.hasOnlyLiveProgress).toBe(true);
      expect(view.showMessageActions).toBe(false);
    });

    it("derives the parent status from the latest chat-status phase while streaming", () => {
      const view = deriveAssistantMessageViewState({
        message: message({ status: "sending" }),
        groupedSteps: [
          { type: "action", kind: "chat_status", status: "running", metadata: { phase: "agent_streaming" } },
        ],
        groupedToolCalls: [],
        delegationTree: emptyDelegationTree,
      });
      expect(view.latestChatStatusPhase).toBe("agent_streaming");
      expect(view.parentWorkingStatus).toBe("thinking");
    });
  });
});
