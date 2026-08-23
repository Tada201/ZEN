//! One canonical tool architecture crate (BIG_MIGRATION.md Phase 5):
//! the `Tool`/`AgentTool` trait surface, both registries behind a single
//! roof (Pre-task A ends the in-tree v1/v2 duplication), the discovery
//! manager, capability metadata, and the one pure built-in executor
//! (calculator). Host-specific behavior stays in the app crate:
//! executors that need `AppState` are registered into these registries
//! from outside, and `A` is bound to `tauri::AppHandle` there via
//! non-generic type aliases, so existing impls compile unchanged.

pub mod agent_tool;
pub mod calculator;
pub mod capability;
pub mod manager;
pub mod registry;

pub use agent_tool::AgentTool;
pub use calculator::CalculatorTool;
pub use manager::{meta_tool_definitions, ToolDescriptor, ToolManager, ToolMetadata, ToolSchema};
pub use registry::{
    default_tool_risk, AgentToolRegistry, GlobalToolRegistry, LazyToolMetadata, LazyToolSource,
    Tool, ToolAnnotations, ToolCall, ToolDefinition, ToolError, ToolExecutionRecord, ToolOutput,
    ToolRegistry,
};
pub use zen_core::ToolInfo;
