import type { ArtifactData, ToolCall, Step } from "./types";
import { AgentExecutionTrace } from "./AgentExecutionTrace";

/**
 * Thin wrapper around `AgentExecutionTrace` for grouped tool execution in the
 * chat timeline.
 *
 * Previously this component rendered its own `FoldOutCard` + `ExecutionRow`
 * header and nested `AgentExecutionTrace` (which rendered *another* header)
 * inside, producing double headers and conflicting collapse behavior.
 * `AgentExecutionTrace` already owns the group summary header (verb, target,
 * status, duration, chevron) and the collapsed/expanded body, so this wrapper
 * is now a pure pass-through with `preferCompact` so the trace collapses
 * finished groups by default.
 */
type ExecutionGroupProps = {
  toolCalls: ToolCall[];
  executionSteps: Step[];
  sessionId?: string;
  onOpenArtifact: (artifact: ArtifactData) => void;
};

export function ExecutionGroup({
  toolCalls,
  executionSteps,
  sessionId,
  onOpenArtifact,
}: ExecutionGroupProps) {
  return (
    <AgentExecutionTrace
      toolCalls={toolCalls}
      executionSteps={executionSteps}
      sessionId={sessionId}
      onOpenArtifact={onOpenArtifact}
      preferCompact
    />
  );
}
