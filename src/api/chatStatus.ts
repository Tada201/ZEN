// Mirrors `src-tauri/src/agent/chat_status.rs::ChatStatusPhase`.
// Keep this list in sync with the Rust enum.

export const CHAT_STATUS_PHASES = {
  Idle: "idle",
  Streaming: "streaming",
  AgentStep: "agent_step",
  AgentStreaming: "agent_streaming",
  ToolCallStreaming: "tool_call_streaming",
  ToolCallReady: "tool_call_ready",
  ToolBatchPlanned: "tool_batch_planned",
  ApprovalRequired: "approval_required",
  ToolExecuting: "tool_executing",
  Handoff: "handoff",
  ToolModeRetry: "tool_mode_retry",
  ModelEscalating: "model_escalating",
  ModelEscalated: "model_escalated",
  ProviderReady: "provider_ready",
  ProviderMissing: "provider_missing",
  Done: "done",
  Error: "error",
  EarlyToolError: "early_tool_error",
} as const;

export type ChatStatusPhase =
  (typeof CHAT_STATUS_PHASES)[keyof typeof CHAT_STATUS_PHASES];

export const CHAT_STATUS_PHASE_VALUES: readonly ChatStatusPhase[] =
  Object.values(CHAT_STATUS_PHASES);
