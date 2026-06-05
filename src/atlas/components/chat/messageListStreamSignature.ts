import type { Message, Step } from "./types";

const CONTENT_BUCKET_SIZE = 48;
const TOOL_OUTPUT_BUCKET_SIZE = 1024;

function bucketLength(value: string | undefined, size: number) {
  return Math.floor((value?.length || 0) / size);
}

function stepSignature(step: Step) {
  if (step.type === "tool-call") {
    return [
      step.type,
      step.toolCall?.id || "",
      step.toolCall?.status || "",
      step.toolCall?.batchId || "",
      step.toolCall?.toolBatchId || "",
      step.toolCall?.agentId || "",
      step.toolCall?.parentAgentId || "",
      bucketLength(step.toolCall?.output, TOOL_OUTPUT_BUCKET_SIZE),
    ].join(":");
  }
  if (step.type === "action") {
    const metadata = step.metadata || {};
    const phase = typeof metadata.phase === "string" ? metadata.phase : "";
    const progress = typeof metadata.progressPercent === "number" ? Math.floor(metadata.progressPercent / 5) : "";
    const taskProgress =
      typeof metadata.tasksCompleted === "number" && typeof metadata.totalTasks === "number"
        ? `${metadata.tasksCompleted}/${metadata.totalTasks}`
        : "";
    const toolBatch = metadata.toolBatchId || metadata.batchId || "";
    return [
      step.type,
      step.kind || "",
      step.status || "",
      step.eventId || "",
      phase,
      progress,
      taskProgress,
      toolBatch,
      bucketLength(step.content, CONTENT_BUCKET_SIZE),
    ].join(":");
  }
  return [step.type, step.status || "", bucketLength(step.content, CONTENT_BUCKET_SIZE)].join(":");
}

function toolCallsFingerprint(toolCalls: Message["toolCalls"]) {
  if (!toolCalls || toolCalls.length === 0) return "";
  return toolCalls
    .map((tc) => `${tc.id}:${tc.status || ""}:${tc.name || ""}`)
    .join(",");
}

export function buildMessageListStreamSignature(message: Message | undefined) {
  if (!message) return "";
  const stepFingerprint = (message.steps || []).map(stepSignature).join("|");
  return [
    message.id,
    message.status || "",
    bucketLength(message.content, CONTENT_BUCKET_SIZE),
    bucketLength(message.reasoning, CONTENT_BUCKET_SIZE),
    message.artifact ? `${message.artifact.type}:${bucketLength(message.artifact.content, TOOL_OUTPUT_BUCKET_SIZE)}` : "",
    stepFingerprint,
    toolCallsFingerprint(message.toolCalls),
  ].join(":");
}
