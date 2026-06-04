pub struct ChatStatusPhase;

impl ChatStatusPhase {
    pub const AGENT_STEP: &'static str = "agent_step";
    pub const AGENT_STREAMING: &'static str = "agent_streaming";
    pub const TOOL_CALL_STREAMING: &'static str = "tool_call_streaming";
    pub const TOOL_CALL_READY: &'static str = "tool_call_ready";
    pub const TOOL_BATCH_PLANNED: &'static str = "tool_batch_planned";
    pub const APPROVAL_REQUIRED: &'static str = "approval_required";
    pub const TOOL_EXECUTING: &'static str = "tool_executing";
    pub const HANDOFF: &'static str = "handoff";
    pub const TOOL_MODE_RETRY: &'static str = "tool_mode_retry";
    pub const MODEL_ESCALATING: &'static str = "model_escalating";
    pub const MODEL_ESCALATED: &'static str = "model_escalated";
    pub const PROVIDER_READY: &'static str = "provider_ready";
    pub const PROVIDER_MISSING: &'static str = "provider_missing";
}
