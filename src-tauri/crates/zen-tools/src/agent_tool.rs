//! Canonical agent tool trait (from `src/agent/tools/mod.rs`, Phase 5
//! Pre-task A). Generic over the host handle `A` so this crate stays
//! tauri-free; the app crate binds `A = tauri::AppHandle` through a
//! non-generic type alias, which keeps every existing
//! `impl AgentTool for X` and `Arc<dyn AgentTool>` site unchanged.

use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;

#[async_trait]
pub trait AgentTool<A: Send + Sync + 'static>: Send + Sync {
    fn id(&self) -> &str;
    fn description(&self) -> &str;
    fn input_schema(&self) -> Value;
    async fn run(
        &self,
        app: A,
        chat_id: String,
        input: Value,
        depth: u32,
        allowed_tools: Option<Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        token: tokio_util::sync::CancellationToken,
    ) -> Result<Value>;

    /// Context-aware entry point for tools that need the stable call id.
    /// Mutation recovery wraps legacy tools at the canonical service boundary,
    /// so existing tools retain the smaller `run` contract by default.
    #[allow(clippy::too_many_arguments)]
    async fn run_with_context(
        &self,
        app: A,
        chat_id: String,
        _tool_call_id: String,
        input: Value,
        depth: u32,
        allowed_tools: Option<Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        self.run(app, chat_id, input, depth, allowed_tools, token).await
    }

    /// Execution timeout in seconds. Tools can override this for operations
    /// that need more or less time. Default is 45 seconds.
    fn timeout_seconds(&self) -> u64 {
        45
    }
}
