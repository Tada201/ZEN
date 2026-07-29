import { createActionStep } from "@/atlas/hooks/stream/agentActionLedger";
import chatFixtures from "../../test/chat-fixtures.json";

interface MockStreamingDeps {
  emit: (eventName: string, payload: unknown) => void;
  redact: (value: unknown, depth?: number) => unknown;
  saveAssistantMessage: (message: Record<string, unknown>) => void;
}

function getFixtureToolName(flow: any[], toolCallId: string): string {
  const lifecycleEvent = flow.find(
    (step: any) =>
      (step.type === "tool:start" || step.type === "tool:authorization_request" || step.type === "tool:complete") &&
      step.tool_call_id === toolCallId &&
      step.tool_name
  );
  return lifecycleEvent?.tool_name || toolCallId;
}

function getFixtureToolStartTimes(flow: any[]) {
  const startTimes = new Map<string, number>();
  let virtualElapsed = 0;
  const baseTime = Date.now();

  for (const step of flow) {
    if (step.type === "tool:start" || step.type === "tool:authorization_request") {
      startTimes.set(step.tool_call_id, baseTime + virtualElapsed);
    }
    virtualElapsed += typeof step.delay_ms === "number" ? step.delay_ms : 0;
  }

  return startTimes;
}

function buildFixtureActionStep(step: any, chatId: string, virtualTime: number) {
  if (step.type === "chat:status") {
    return createActionStep({ chat_id: chatId, timestamp: new Date(virtualTime).toISOString(), ...step.payload }, "chat_status");
  }
  if (step.type === "agent:spawn") {
    return createActionStep({ chat_id: chatId, timestamp: new Date(virtualTime).toISOString(), ...step.payload }, "agent_spawn");
  }
  if (step.type === "agent:complete") {
    return createActionStep({ chat_id: chatId, timestamp: new Date(virtualTime).toISOString(), ...step.payload }, "agent_complete");
  }
  return null;
}

function buildFixtureExecutionSteps(flow: any[], finalContent: string, chatId: string, redact: MockStreamingDeps["redact"]) {
  const toolCompletes = new Map(flow.filter((step: any) => step.type === "tool:complete").map((step: any) => [step.tool_call_id, step]));
  const toolStartTimes = getFixtureToolStartTimes(flow);
  const steps: any[] = [];
  const baseTime = Date.now();
  let virtualElapsed = 0;

  for (const step of flow) {
    const virtualTime = baseTime + virtualElapsed;
    const actionStep = buildFixtureActionStep(step, chatId, virtualTime);
    if (actionStep) steps.push(actionStep);

    if (step.type === "tool:start" || step.type === "tool:authorization_request") {
      const toolComplete = toolCompletes.get(step.tool_call_id) as any;
      steps.push({
        type: "tool-call",
        toolCall: {
          id: step.tool_call_id,
          name: step.tool_name,
          status: toolComplete?.status === "success" ? "completed" : "error",
          input: step.arguments,
          output: toolComplete?.output || "",
          durationMs: toolComplete?.duration_ms,
          agentId: step.agent_id,
          agentName: step.agent_name,
          iteration: step.iteration,
          batchId: step.batch_id || step.batchId || step.tool_batch_id || step.toolBatchId,
          startTime: toolStartTimes.get(step.tool_call_id),
          approvalContext: step.context ? {
            riskLevel: step.context.risk_level || step.context.riskLevel,
            description: step.context.description,
            argumentsPreview: redact(step.context.arguments_preview || step.context.argumentsPreview),
            suggestedPatterns: step.context.suggested_patterns || step.context.suggestedPatterns,
          } : undefined,
        },
      });
    }
    virtualElapsed += typeof step.delay_ms === "number" ? step.delay_ms : 0;
  }

  if (finalContent.trim()) steps.push({ type: "text", content: finalContent });
  return steps;
}

function findActiveFixture(userContent: string): keyof typeof chatFixtures | null {
  const normalizedInput = userContent.trim().toLowerCase();
  if (normalizedInput.includes("markdown") || normalizedInput.includes("test markdown")) return "test_markdown";
  if (normalizedInput.includes("genui") || normalizedInput.includes("test genui")) return "test_genui";
  if (normalizedInput.includes("toolcall") || normalizedInput.includes("test toolcall")) return "test_toolcall";
  if (normalizedInput.includes("agentic") || normalizedInput.includes("codebuff") || normalizedInput.includes("delegation")) return "test_agentic";
  return null;
}

export function triggerMockStream(chatId: string, userContent: string, deps: MockStreamingDeps) {
  const { emit, redact, saveAssistantMessage } = deps;
  const activeFixtureKey = findActiveFixture(userContent);

  if (activeFixtureKey) {
    const fixture = chatFixtures[activeFixtureKey];
    let stepIndex = 0;

    function runNextStep() {
      if (stepIndex >= fixture.flow.length) return;
      const step: any = fixture.flow[stepIndex];
      stepIndex++;
      let delay = 300;

      if (step.type === "chat:status") {
        emit("chat:status", { chat_id: chatId, ...step.payload });
        delay = 200;
      } else if (step.type === "agent:spawn") {
        emit("agent:spawn", { chat_id: chatId, ...step.payload });
        delay = 450;
      } else if (step.type === "agent:complete") {
        emit("agent:complete", { chat_id: chatId, ...step.payload });
        delay = 350;
      } else if (step.type === "research-step") {
        emit("chat:research-step", { chat_id: chatId, text: step.text, status: step.status });
        delay = 600;
      } else if (step.type === "chunk:first") {
        emit("chat:chunk:first", { chat_id: chatId, delta: step.delta || "", type: "text" });
        delay = 100;
      } else if (step.type === "chunk") {
        emit("chat:chunk", { chat_id: chatId, delta: step.delta || "", type: "text" });
        delay = 150;
      } else if (step.type === "artifact:start") {
        emit("artifact:start", { chat_id: chatId, artifact_type: step.artifact_type, title: step.title, language: step.language });
        delay = 300;
      } else if (step.type === "artifact:delta") {
        emit("artifact:delta", { chat_id: chatId, delta: step.delta || "" });
        delay = 400;
      } else if (step.type === "artifact:complete") {
        emit("artifact:complete", { chat_id: chatId });
        delay = 200;
      } else if (step.type === "tool:start") {
        emit("tool:start", {
          chat_id: chatId,
          tool_call_id: step.tool_call_id,
          tool_name: step.tool_name,
          arguments: step.arguments,
          agent_id: step.agent_id,
          agent_name: step.agent_name,
          iteration: step.iteration,
          batch_id: step.batch_id || step.batchId || step.tool_batch_id || step.toolBatchId,
        });
        delay = 1000;
      } else if (step.type === "tool:authorization_request") {
        emit("tool:authorization_request", {
          chat_id: chatId,
          tool_call_id: step.tool_call_id,
          tool_name: step.tool_name,
          arguments: step.arguments,
          context: step.context || {},
          agent_id: step.agent_id,
          agent_name: step.agent_name,
          iteration: step.iteration,
          batch_id: step.batch_id || step.batchId || step.tool_batch_id || step.toolBatchId,
        });
        delay = 700;
      } else if (step.type === "tool:complete") {
        emit("tool:complete", {
          chat_id: chatId,
          tool_call_id: step.tool_call_id,
          tool_name: step.tool_name || getFixtureToolName(fixture.flow, step.tool_call_id),
          status: step.status,
          output: step.output,
          duration_ms: step.duration_ms,
          agent_id: step.agent_id,
          agent_name: step.agent_name,
          iteration: step.iteration,
          batch_id: step.batch_id || step.batchId || step.tool_batch_id || step.toolBatchId,
        });
        delay = 300;
      } else if (step.type === "done") {
        const assistantMsg: Record<string, unknown> = {
          id: `msg-${Date.now()}-assistant`,
          chatId,
          role: "assistant",
          content: step.content || "",
          createdAt: Date.now(),
          isComplete: 1,
          kind: "text",
        };

        if (activeFixtureKey === "test_genui") {
          const start = fixture.flow.find((s: any) => s.type === "artifact:start") as any;
          const delta = fixture.flow.find((s: any) => s.type === "artifact:delta") as any;
          if (start && delta) {
            assistantMsg.artifact = { type: start.artifact_type, title: start.title, language: start.language, content: delta.delta || "" };
          }
        }

        if (activeFixtureKey === "test_toolcall" || activeFixtureKey === "test_agentic") {
          const toolStarts = fixture.flow.filter((s: any) => s.type === "tool:start" || s.type === "tool:authorization_request") as any[];
          const toolCompletes = new Map(fixture.flow.filter((s: any) => s.type === "tool:complete").map((s: any) => [s.tool_call_id, s]));
          const toolStartTimes = getFixtureToolStartTimes(fixture.flow);
          if (toolStarts.length > 0) {
            assistantMsg.toolCalls = toolStarts.map((toolStart) => {
              const toolComplete = toolCompletes.get(toolStart.tool_call_id) as any;
              return {
                id: toolStart.tool_call_id,
                name: toolStart.tool_name,
                status: toolComplete?.status === "success" ? "completed" : "error",
                input: toolStart.arguments,
                output: toolComplete?.output || "",
                durationMs: toolComplete?.duration_ms,
                agentId: toolStart.agent_id,
                agentName: toolStart.agent_name,
                iteration: toolStart.iteration,
                batchId: toolStart.batch_id || toolStart.batchId || toolStart.tool_batch_id || toolStart.toolBatchId,
                startTime: toolStartTimes.get(toolStart.tool_call_id),
                approvalContext: toolStart.context ? {
                  riskLevel: toolStart.context.risk_level || toolStart.context.riskLevel,
                  description: toolStart.context.description,
                  argumentsPreview: redact(toolStart.context.arguments_preview || toolStart.context.argumentsPreview),
                  suggestedPatterns: toolStart.context.suggested_patterns || toolStart.context.suggestedPatterns,
                } : undefined,
              };
            });
          }
          assistantMsg.steps = buildFixtureExecutionSteps(fixture.flow, step.content || "", chatId, redact);
          assistantMsg.metadata = JSON.stringify({ executionSteps: assistantMsg.steps });
        }

        saveAssistantMessage(assistantMsg);
        emit("chat:done", { chat_id: chatId, content: step.content || "", message_id: assistantMsg.id });
        return;
      }

      setTimeout(runNextStep, typeof step.delay_ms === "number" ? step.delay_ms : delay);
    }

    setTimeout(runNextStep, 200);
    return;
  }

  emit("chat:chunk:first", { chat_id: chatId, delta: "", type: "text" });
  emit("chat:research-step", { chat_id: chatId, text: "Analyzing project architecture and configuration...", status: "running" });

  setTimeout(() => {
    emit("chat:research-step", { chat_id: chatId, text: "Found relevant files: package.json, vite.config.ts", status: "completed" });
  }, 1000);

  const responseText = `I have received your message: "${userContent}".\n\nThis is a fully-functioning Browser Dummy mode. You can edit files, query settings, and inspect components inside your standard web browser! Outstanding!`;
  const chunks = responseText.split(" ");
  let chunkIdx = 0;

  function emitNextChunk() {
    if (chunkIdx < chunks.length) {
      emit("chat:chunk", { chat_id: chatId, delta: `${chunks[chunkIdx]} ` });
      chunkIdx++;
      setTimeout(emitNextChunk, 80);
      return;
    }

    const mockAssistantId = `msg-${Date.now()}-assistant`;
    saveAssistantMessage({
      id: mockAssistantId,
      chatId,
      role: "assistant",
      content: responseText,
      createdAt: Date.now(),
      isComplete: 1,
      kind: "text",
    });
    emit("chat:done", { chat_id: chatId, content: responseText, message_id: mockAssistantId });
  }

  setTimeout(emitNextChunk, 1500);
}
