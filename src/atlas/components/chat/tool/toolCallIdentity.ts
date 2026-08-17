import type { ToolCall } from "../types";

type ToolIdentityInput = Pick<
  ToolCall,
  | "id"
  | "name"
  | "executionId"
  | "messageId"
  | "runId"
  | "traceId"
  | "parentToolCallId"
  | "batchId"
  | "toolBatchId"
  | "sequence"
  | "startTime"
>;

/**
 * Returns the identity shared by all lifecycle updates for one tool call.
 *
 * Backend ids are authoritative. The remaining fields are ordered from most
 * specific to least specific so sparse stream events can still reconcile
 * without using a render-time array index.
 */
export function getToolCallIdentity(tool: ToolIdentityInput, fallbackIndex?: number): string {
  if (tool.id?.trim()) return tool.id;
  if (tool.executionId) return `execution:${tool.executionId}`;
  if (tool.messageId && tool.sequence !== undefined) return `message:${tool.messageId}:${tool.sequence}`;
  if (tool.runId && tool.sequence !== undefined) return `run:${tool.runId}:${tool.sequence}`;
  if (tool.traceId && tool.sequence !== undefined) return `trace:${tool.traceId}:${tool.sequence}`;
  if (tool.parentToolCallId && tool.sequence !== undefined) {
    return `parent:${tool.parentToolCallId}:${tool.sequence}`;
  }
  if (tool.toolBatchId && tool.sequence !== undefined) return `tool-batch:${tool.toolBatchId}:${tool.sequence}`;
  if (tool.batchId && tool.sequence !== undefined) return `batch:${tool.batchId}:${tool.sequence}`;
  if (tool.name && tool.startTime !== undefined) return `tool:${tool.name}:${tool.startTime}`;
  if (tool.name && tool.sequence !== undefined) return `tool:${tool.name}:sequence:${tool.sequence}`;
  return fallbackIndex === undefined ? "" : `tool:unidentified:${fallbackIndex}`;
}
