import type { Step, ToolCall, ActionMeta, SubagentStepData } from "../../components/chat/types";
import { orderSteps } from "@/atlas/agentRuntime/types";

/**
 * Projects the live `assistant.steps` timeline down to a small UI-only
 * summary before persisting it as `steps_json`.
 *
 * The full live timeline can carry raw tool arguments, full tool output,
 * base64 blobs, and subagent transcripts. Persisting those verbatim bloats
 * the DB row and can exceed the 2 MB backend cap. After reload the UI only
 * needs enough data to render the progress ledger — completed groups are
 * hidden once answer text exists, and expanded traces show summaries, not
 * full replays.
 *
 * What is kept:
 *  - `text` step content (the answer itself)
 *  - `reasoning` content (capped at REASONING_CAP chars)
 *  - `tool-call`: tool id, name, status, durationMs, agentName, and a
 *    compact input containing only target-like fields (file_path, command,
 *    query, url) so the card can still show "Read file.ts" without
 *    persisting full arguments. Completed shell output keeps a bounded,
 *    redacted transcript so expanded terminal cards survive reload.
 *  - `action`: kind, status, content, timestamp, and lightweight metadata
 *    (phase, agentName, iteration, resultSummary, error). Heavy metadata
 *    (toolResult.rawResult, toolResult.args, toolCall.args) is dropped.
 *  - `subagent`: spawnId, agentName, task, status, resultSummary, error,
 *    durationMs, plus a bounded/redacted `resultContent` and `intermediateContent`
 *    (each capped and secret-scrubbed) so the Agents panel can replay the child's
 *    answer and interleaved commentary after reload.
 *
 * What is excluded:
 *  - Raw tool arguments (full input objects)
 *  - Full non-shell tool output (diffs/base64/large payloads)
 *  - Oversized reasoning blocks
 */
const REASONING_CAP = 4000;
const INPUT_TARGET_KEYS = new Set([
  "file_path",
  "filePath",
  "path",
  "targetPath",
  "command",
  "query",
  "url",
  "tool_id",
  "tool",
  "name",
]);

function compactToolCallInput(input: ToolCall["input"]): Record<string, unknown> {
  if (!input) return {};
  let record: Record<string, unknown>;
  if (typeof input === "string") {
    try {
      const parsed: unknown = JSON.parse(input);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        record = parsed as Record<string, unknown>;
      } else {
        return {};
      }
    } catch {
      return {};
    }
  } else if (input && typeof input === "object" && !Array.isArray(input)) {
    record = input as Record<string, unknown>;
  } else {
    return {};
  }
  const compacted: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (INPUT_TARGET_KEYS.has(key)) {
      compacted[key] = record[key];
    }
  }
  // Also check nested arguments for tool_exec-style wrapping.
  const args = record.arguments;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    const argsRecord = args as Record<string, unknown>;
    for (const key of Object.keys(argsRecord)) {
      if (INPUT_TARGET_KEYS.has(key)) {
        compacted[key] = argsRecord[key];
      }
    }
  }
  return compacted;
}

/**
 * Concise, redacted error summary persisted for error-state tools so the
 * Technical details disclosure still shows what went wrong after reload.
 *
 * Why not the raw 1,500-char prefix: the raw output can carry stack traces,
 * environment variables, request bodies, and credentials echoed back by a
 * failing tool. Persisting that verbatim bloats the DB row and risks storing
 * sensitive payloads the UI contract says should not live in normal timeline
 * data. Instead we keep a small, sanitized summary: secrets are redacted,
 * whitespace is collapsed, and the result is capped to ~280 chars so the
 * disclosure stays scannable without retaining full technical payloads.
 */
const ERROR_SUMMARY_CAP = 280;
const TERMINAL_OUTPUT_CAP = 12_000;
const OUTPUT_PREVIEW_CAP = 480;
const SECRET_PATTERN = /(api[_-]?key|authorization|bearer|credential|password|secret|token)[\s:=]+\S+/gi;
// Also scrub JSON-quoted secrets ("api_key": "sk-...") that a failing tool
// may echo back in an error body. Handles both the quoted-key form and the
// trailing comma/brace variants that appear in pretty-printed JSON.
const JSON_SECRET_PATTERN = /"(api[_-]?key|authorization|bearer|credential|password|secret|token)"\s*:\s*"[^"]*"/gi;

function redactErrorSummary(raw: string): string {
  if (!raw) return "";
  const stripped = raw
    .replace(JSON_SECRET_PATTERN, '"$1":"[redacted]"')
    .replace(SECRET_PATTERN, (_m, label: string) => `${label}=[redacted]`)
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= ERROR_SUMMARY_CAP) return stripped;
  return `${stripped.slice(0, ERROR_SUMMARY_CAP - 1)}…`;
}

function isTerminalToolName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("terminal") || lower.includes("shell") || lower.includes("command") || lower.includes("bash") || lower.includes("exec");
}

/**
 * Keep enough structured terminal output for the expanded card while applying
 * the same secret redaction and size bound used by failure summaries. The
 * model-facing formatted result is retained as a fallback for older adapters,
 * but stdout/stderr are preserved separately whenever the backend provides
 * them.
 */
function redactTerminalOutput(raw: string): string {
  if (!raw) return "";
  const redacted = raw
    .replace(JSON_SECRET_PATTERN, '"$1":"[redacted]"')
    .replace(SECRET_PATTERN, (_m, label: string) => `${label}=[redacted]`);
  if (redacted.length <= TERMINAL_OUTPUT_CAP) return redacted;
  return `${redacted.slice(0, TERMINAL_OUTPUT_CAP - 1)}…`;
}

function outputPreview(raw: string): string | undefined {
  if (!raw) return undefined;
  const redacted = redactTerminalOutput(raw).replace(/\s+/g, " ").trim();
  if (!redacted) return undefined;
  return redacted.length <= OUTPUT_PREVIEW_CAP
    ? redacted
    : `${redacted.slice(0, OUTPUT_PREVIEW_CAP - 1)}…`;
}

function compactToolCall(toolCall: ToolCall): ToolCall {
  // Error-state tools keep a short safe summary. Completed shell tools keep a
  // larger bounded transcript because their expanded terminal card is a
  // durable part of the execution trace. Running tools remain empty until a
  // terminal result arrives.
  const persistedOutput = typeof toolCall.output === "string"
    ? toolCall.status === "error"
      ? redactErrorSummary(toolCall.output)
      : toolCall.status === "completed" && isTerminalToolName(toolCall.name)
        ? redactTerminalOutput(toolCall.output)
        : ""
    : "";
  return {
    id: toolCall.id,
    name: toolCall.name,
    status: toolCall.status,
    input: compactToolCallInput(toolCall.input),
    output: persistedOutput,
    outputPreview: outputPreview(toolCall.outputPreview || toolCall.output),
    durationMs: toolCall.durationMs,
    runId: toolCall.runId,
    messageId: toolCall.messageId,
    parentAgentId: toolCall.parentAgentId,
    parentToolCallId: toolCall.parentToolCallId,
    sequence: toolCall.sequence,
    phase: toolCall.phase,
    executionId: toolCall.executionId,
    toolBatchId: toolCall.toolBatchId,
    agentId: toolCall.agentId,
    agentName: toolCall.agentName,
    iteration: toolCall.iteration,
    traceId: toolCall.traceId,
    batchId: toolCall.batchId,
    startTime: toolCall.startTime,
    completedAt: toolCall.completedAt,
    // approvalContext is kept without argumentsPreview (which can be large).
    approvalContext: toolCall.approvalContext
      ? {
          riskLevel: toolCall.approvalContext.riskLevel,
          description: toolCall.approvalContext.description,
          suggestedPatterns: toolCall.approvalContext.suggestedPatterns,
        }
      : undefined,
  };
}

function compactMetadata(metadata: ActionMeta | undefined): ActionMeta | undefined {
  if (!metadata) return undefined;
  const compacted: ActionMeta = {};
  // Keep lightweight identity/progress fields.
  const keepKeys: Array<keyof ActionMeta> = [
    "runId",
    "messageId",
    "parentAgentId",
    "parentToolCallId",
    "sequence",
    "phase",
    "executionId",
    "batchId",
    "toolBatchId",
    "agentId",
    "agentName",
    "iteration",
    "depth",
    "phase",
    "message",
    "provider",
    "model",
    "toolCount",
    "parallel",
    "tools",
    "workflowId",
    "totalTasks",
    "tasksCompleted",
    "durationMs",
    "taskId",
    "assignedTo",
    "tier",
    "resultSummary",
    "error",
    "recoverable",
    "traceVersion",
    "traceStatus",
    "progressPercent",
    "status",
    // Per-turn GenUI capability. This local_queued marker is the only
    // durable carrier of the flag (the row metadata is saved as None), so
    // dropping it here disables OpenUI rendering after reload.
    "generativeUI",
  ];
  for (const key of keepKeys) {
    const value = metadata[key];
    if (value !== undefined) {
      (compacted as Record<string, unknown>)[key] = value;
    }
  }
  // Redact/cap the action error so secrets and oversized payloads don't
  // land in steps_json. The raw error can carry stack traces, environment
  // variables, or echoed credentials from a failing tool/agent — the same
  // risk as tool-call output, so it gets the same redactErrorSummary pass.
  if (typeof compacted.error === "string" && compacted.error.trim()) {
    compacted.error = redactErrorSummary(compacted.error);
  }
  // Keep toolCallPreview but drop argumentsDelta/argumentsPreview (can be large).
  if (metadata.toolCallPreview) {
    compacted.toolCallPreview = {
      index: metadata.toolCallPreview.index,
      toolCallId: metadata.toolCallPreview.toolCallId,
      toolName: metadata.toolCallPreview.toolName,
      ready: metadata.toolCallPreview.ready,
    };
  }
  // Keep toolResult summary but drop rawResult and args. Redact/cap the
  // summary for error/timeout results so secrets and oversized payloads
  // don't land in steps_json — a failing tool can echo credentials, env
  // vars, or stack traces back in its summary, the same risk as the
  // tool-call output and metadata.error paths. Successful ('ok') summaries
  // (e.g. "Edited 3 files (+12 −4)") stay verbatim so the card's scannable
  // outcome line survives reload.
  if (metadata.toolResult) {
    const resultStatus = metadata.toolResult.status || "ok";
    const rawSummary = metadata.toolResult.contentSummary;
    compacted.toolResult = {
      toolName: metadata.toolResult.toolName,
      status: resultStatus,
      durationMs: metadata.toolResult.durationMs,
      contentSummary:
        (resultStatus === "error" || resultStatus === "timeout") &&
        typeof rawSummary === "string" &&
        rawSummary.trim()
          ? redactErrorSummary(rawSummary)
          : rawSummary,
      files: metadata.toolResult.files,
    };
  }
  // Keep spawn summary but drop nothing extra (SpawnMeta is already lightweight).
  if (metadata.spawn) {
    compacted.spawn = metadata.spawn;
  }
  // Keep approval/clarification context (needed for display) but drop arguments.
  if (metadata.approvalRequest) {
    compacted.approvalRequest = {
      tool_call_id: metadata.approvalRequest.tool_call_id,
      tool_name: metadata.approvalRequest.tool_name,
      arguments: {},
      chat_id: metadata.approvalRequest.chat_id,
      model: metadata.approvalRequest.model,
      context: metadata.approvalRequest.context,
    };
  }
  if (metadata.clarificationRequest) {
    compacted.clarificationRequest = metadata.clarificationRequest;
  }
  // Keep research progress summaries.
  if (metadata.researchSteps) {
    compacted.researchSteps = metadata.researchSteps;
  }
  if (metadata.researchProgress) {
    compacted.researchProgress = metadata.researchProgress;
  }
  return compacted;
}

function compactSubagent(subagent: SubagentStepData | undefined): SubagentStepData | undefined {
  if (!subagent) return undefined;
  return {
    spawnId: subagent.spawnId,
    parentToolCallId: subagent.parentToolCallId,
    agentId: subagent.agentId,
    agentName: subagent.agentName,
    task: subagent.task,
    status: subagent.status,
    resultSummary: subagent.resultSummary,
    // The full child answer is rendered in the Agents panel. Reuse the terminal
    // redactor: same secret-scrub + size bound so a large reply can't bloat the
    // persisted trace or leak credentials echoed back by the child.
    resultContent: subagent.resultContent ? redactTerminalOutput(subagent.resultContent) : subagent.resultContent,
    // Interleaved child commentary: same redact + per-segment cap so a chatty
    // child can't bloat the persisted trace or leak secrets echoed in text.
    intermediateContent: subagent.intermediateContent
      ?.slice(0, 40)
      .map((segment) => ({ sequence: segment.sequence, text: redactTerminalOutput(segment.text) })),
    // Redact/cap the subagent error for the same reason as action/tool
    // errors: the raw message can carry stack traces, env vars, or
    // credentials echoed back by a failing child agent.
    error: subagent.error ? redactErrorSummary(subagent.error) : subagent.error,
    durationMs: subagent.durationMs,
    timestamp: subagent.timestamp,
    // Preserve explicit ownership so delegation children can be re-owned on
    // reload without relying on legacy trace-id inference.
    childToolCallIds: [...new Set(subagent.childToolCallIds || [])],
  };
}

export function projectStepsForPersistence(steps: Step[] | undefined): Step[] {
  if (!steps || steps.length === 0) return [];

  // Persist in the same canonical order the live timeline renders, so a
  // reloaded message replays byte-identical to what was on screen. Ordering
  // before compaction keeps the sequence fields intact for the comparator.
  const compacted = orderSteps(steps).map((step): Step => {
    switch (step.type) {
      case "text":
        return { ...step };
      case "reasoning":
        return {
          ...step,
          content:
            typeof step.content === "string" && step.content.length > REASONING_CAP
              ? `${step.content.slice(0, REASONING_CAP)}…`
              : step.content,
        };
      case "tool-call":
        return {
          ...step,
          toolCall: step.toolCall ? compactToolCall(step.toolCall) : undefined,
        };
      case "action":
        return {
          ...step,
          metadata: compactMetadata(step.metadata),
        };
      case "subagent":
        return {
          ...step,
          subagent: compactSubagent(step.subagent),
        };
      default:
        return step;
    }
  });
  return compacted;
}
