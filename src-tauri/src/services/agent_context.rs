//! App-side construction of [`AgentContext`] and the host port adapters
//! (BIG_MIGRATION.md Phase 11).
//!
//! The context struct itself lives in `zen_agent::context`; every field here
//! is the SAME `Arc` instance `AppState` already owns (or an `Arc` over the
//! same `InitState`), so behavior is identical by construction. The port
//! adapters below wrap the app's concrete services (`ToolService`, the v1/v2
//! registries, `ToolManager`, `ManageBoardTool`, the canvas session map) so
//! zen-agent never needs `AppHandle`.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use zen_agent::init_state::InitState;
use zen_agent::ports::{
    BoardPort, BoardWatchGuard, GraphExpressionSnapshot, GraphSessionSnapshot, GraphSessionSource,
    PortToolExecution, ToolApprovalExecutionContext, ToolApprovalOutcome, ToolCatalogPort,
    ToolExecutionPort, ToolPipelinePort,
};
use zen_core::ports::{AuditEvent, AuditSink, SecretStore, SettingsStore};
use zen_db::models::AuditLogEntry;
use zen_security::approval::{PermissionContext, PermissionDecision};
use zen_tools::{ToolDescriptor, ToolError, ToolInfo, ToolSchema};

use crate::agent::tools::manage_board::ManageBoardTool;
use zen_tools::AgentTool;
use crate::canvas::session::GraphSession;
use crate::commands::AppState;
use sqlx::SqlitePool;

/// Wraps [`crate::services::SecretService`] behind the async port.
pub struct SecretServicePort(pub Arc<crate::services::SecretService>);

#[async_trait::async_trait]
impl SecretStore for SecretServicePort {
    async fn get_secret(&self, key: &str) -> zen_core::ZenResult<Option<String>> {
        self.0.get_secret(key).await
    }
    async fn set_secret(&self, key: String, value: String) -> zen_core::ZenResult<()> {
        self.0.set_secret(key, value).await
    }
    async fn delete_secret(&self, key: &str) -> zen_core::ZenResult<()> {
        self.0.delete_secret(key).await
    }
}

/// Wraps [`crate::services::SettingsService`] behind the async port.
pub struct SettingsServicePort(pub Arc<crate::services::SettingsService>);

#[async_trait::async_trait]
impl SettingsStore for SettingsServicePort {
    async fn get_setting(&self, key: &str) -> zen_core::ZenResult<Option<String>> {
        self.0.get(key).await
    }

    async fn set_setting(&self, key: String, value: String) -> zen_core::ZenResult<()> {
        self.0.set(key, value).await
    }
}

/// Audit sink sharing the app's DB init lifecycle: persists through the same
/// audit table as [`crate::services::audit_sink::ZenAuditSink`], reusing its
/// row mapping, but resolves the pool lazily so it can be constructed at boot
/// before migrations run.
struct SharedPoolAuditSink {
    pool: Arc<InitState<SqlitePool>>,
}

impl SharedPoolAuditSink {
    fn to_entry(event: AuditEvent) -> AuditLogEntry {
        crate::services::audit_sink::to_entry(event)
    }
}

impl AuditSink for SharedPoolAuditSink {
    fn record(&self, event: AuditEvent) {
        let pool_state = self.pool.clone();
        match tokio::runtime::Handle::try_current() {
            Ok(handle) => {
                handle.spawn(async move {
                    match pool_state.get().await {
                        Ok(pool) => {
                            let entry = Self::to_entry(event);
                            if let Err(e) =
                                zen_db::queries::add_audit_event(&pool, &entry).await
                            {
                                tracing::warn!(error = %e, "Failed to persist audit-sink event");
                            }
                        }
                        Err(_) => tracing::warn!(
                            action = %event.action,
                            "Audit-sink event dropped: db not initialized yet"
                        ),
                    }
                });
            }
            Err(no_runtime) => tracing::warn!(
                action = %event.action,
                error = %no_runtime,
                "Audit-sink event dropped: no tokio runtime on this thread"
            ),
        }
    }
}

// ── Tool execution port over `ToolService` ──────────────────────────────────

/// Routes zen-agent's tool calls into the app's canonical
/// [`crate::services::tool::ToolService`], supplying the `AppHandle` the
/// service contract requires (formerly passed per-call from the runner).
pub struct ToolExecutionAdapter {
    pub service: Arc<crate::services::tool::ToolService>,
    pub app: AppHandle,
}

#[async_trait::async_trait]
impl ToolExecutionPort for ToolExecutionAdapter {
    async fn execute_agent_tool(
        &self,
        params: PortToolExecution,
    ) -> zen_agent::types::ToolResult {
        self.service
            .execute_agent_tool(crate::services::tool::AgentToolParams {
                tool: None,
                app: self.app.clone(),
                chat_id: params.chat_id,
                tool_call: params.tool_call,
                token: params.token,
                depth: params.depth,
                allowed_tools: params.allowed_tools,
                delegation_allowed: params.delegation_allowed,
            })
            .await
    }

    async fn request_approval(
        &self,
        caller: &str,
        chat_id: &str,
        tool_call: &zen_tools::ToolCall,
        context: PermissionContext,
        execution_context: Option<ToolApprovalExecutionContext>,
    ) -> ToolApprovalOutcome {
        self.service
            .request_interactive_approval(
                self.app.clone(),
                caller,
                chat_id,
                tool_call,
                context,
                execution_context,
            )
            .await
    }

    async fn execute_interactive(
        &self,
        caller: &str,
        chat_id: String,
        tool_call: zen_tools::ToolCall,
    ) -> Result<serde_json::Value, String> {
        self.service
            .execute_interactive(self.app.clone(), caller, chat_id, tool_call)
            .await
    }

    async fn check_permission(
        &self,
        caller: &str,
        tool_call: &zen_tools::ToolCall,
    ) -> Result<PermissionDecision, ToolError> {
        self.service.check_permission(caller, tool_call).await
    }
}

// ── Tool catalog port over the v1 agent-tool registry + v2 permissions ──────

/// Read view over both registries (same Arcs as `AppState`). Locking moved
/// inside the adapter; each call takes a short read lock where the former
/// code held one across several operations — read locks don't exclude each
/// other, so authorization semantics are unchanged.
pub struct ToolCatalogAdapter {
    pub v1: Arc<tokio::sync::RwLock<crate::agent::tools::ToolRegistry>>,
    pub v2: crate::tools::GlobalToolRegistry,
}

#[async_trait::async_trait]
impl ToolCatalogPort for ToolCatalogAdapter {
    async fn v1_tool_ids(&self) -> Vec<String> {
        self.v1
            .read()
            .await
            .list()
            .into_iter()
            .map(|tool| tool.id().to_string())
            .collect()
    }

    async fn v1_tools_info(&self) -> Vec<ToolInfo> {
        self.v1.read().await.list_as_tool_info()
    }

    async fn v2_executable_tool_names(&self) -> Vec<String> {
        self.v2
            .read()
            .await
            .executable_tool_names()
            .into_iter()
            .collect()
    }

    async fn v2_definition(&self, id: &str) -> Option<ToolInfo> {
        let guard = self.v2.read().await;
        guard.get(id).map(|tool| tool.info())
    }
}

// ── Meta-tool pipeline port over `ToolManager` ──────────────────────────────

pub struct ToolPipelineAdapter {
    pub manager: Arc<crate::tools::ToolManager>,
}

#[async_trait::async_trait]
impl ToolPipelinePort for ToolPipelineAdapter {
    async fn list_allowed_matching(
        &self,
        allowed_ids: &[String],
        query: Option<&str>,
    ) -> Vec<ToolDescriptor> {
        self.manager
            .list_allowed_matching(allowed_ids, query)
            .await
    }

    async fn get_info(&self, id: &str) -> Option<ToolSchema> {
        self.manager.get_info(id).await
    }

    async fn resolve_tool_exec(
        &self,
        args: &serde_json::Value,
    ) -> Option<(String, serde_json::Value)> {
        self.manager.resolve_tool_exec(args).await
    }
}

// ── Board port over tauri events + ManageBoardTool ──────────────────────────

pub struct BoardPortAdapter {
    pub app: AppHandle,
}

#[async_trait::async_trait]
impl BoardPort for BoardPortAdapter {
    fn watch_board_updates(
        &self,
        chat_id: String,
        flag: Arc<AtomicBool>,
    ) -> BoardWatchGuard {
        use tauri::Listener;
        let listener_id = self.app.listen("board:update", move |event| {
            if serde_json::from_str::<serde_json::Value>(event.payload())
                .ok()
                .and_then(|payload| {
                    payload
                        .get("chat_id")
                        .and_then(|value| value.as_str())
                        .map(str::to_string)
                })
                .as_deref()
                == Some(chat_id.as_str())
            {
                flag.store(true, Ordering::Release);
            }
        });
        let app = self.app.clone();
        BoardWatchGuard::new(Box::new(move || app.unlisten(listener_id)))
    }

    async fn run_board_operation(
        &self,
        chat_id: String,
        operation: serde_json::Value,
        depth: u32,
        allowed_tools: Option<Arc<tokio::sync::Mutex<HashSet<String>>>>,
        token: CancellationToken,
    ) -> anyhow::Result<()> {
        ManageBoardTool::new()
            .run(
                self.app.clone(),
                chat_id,
                operation,
                depth,
                allowed_tools,
                token,
            )
            .await
            .map(|_| ())
    }
}

// ── Graph session snapshot port over the canvas map ─────────────────────────

pub struct GraphSessionSourceAdapter(
    pub Arc<tokio::sync::Mutex<HashMap<String, GraphSession>>>,
);

impl GraphSessionSource for GraphSessionSourceAdapter {
    fn snapshot(&self, session_id: &str) -> Option<GraphSessionSnapshot> {
        let sessions = self.0.try_lock().ok()?;
        let session = sessions.get(session_id)?;
        let mut variables: Vec<(String, f64)> = session
            .variables
            .iter()
            .map(|(name, value)| (name.clone(), *value))
            .collect();
        variables.sort_by(|a, b| a.0.cmp(&b.0));
        Some(GraphSessionSnapshot {
            expressions: session
                .expressions
                .iter()
                .map(|expr| GraphExpressionSnapshot {
                    id: expr.id.clone(),
                    expr: expr.expr.clone(),
                    visible: expr.visible,
                    error: expr.error.clone(),
                })
                .collect(),
            variables,
            viewport: (
                session.viewport.x_min,
                session.viewport.x_max,
                session.viewport.y_min,
                session.viewport.y_max,
            ),
            issue_count: session.issues.len(),
            current_version: session.current_version,
        })
    }
}

// ── Construction ────────────────────────────────────────────────────────────

/// Builds the context from managed state. Call once in `setup`, after
/// `AppState` is managed. All clones share instances with `AppState`.
/// (Formerly `AgentContext::new`; an inherent method can't be added to the
/// foreign struct, so the constructor is this free function.)
pub fn build(app: &AppHandle) -> AgentContext {
    let state = app.state::<AppState>();
    let state = state.inner();

    AgentContext {
        events: Arc::new(crate::services::event_sink::TauriEventSink::new(
            app.clone(),
        )),
        secrets: Arc::new(SecretServicePort(state.secret_manager.clone())),
        settings: Arc::new(SettingsServicePort(state.settings_manager.clone())),
        audit: Arc::new(SharedPoolAuditSink {
            pool: state.db.clone(),
        }),

        db: state.db.clone(),
        conversation_store: state.conversation_store.clone(),

        next_run_id: state.next_run_id.clone(),
        tool_catalog: Arc::new(ToolCatalogAdapter {
            v1: state.tool_registry_v1.clone(),
            v2: state.tools.clone(),
        }),
        tool_service: Arc::new(ToolExecutionAdapter {
            service: state.tool_service.clone(),
            app: app.clone(),
        }),
        tool_manager: Arc::new(ToolPipelineAdapter {
            manager: state.tool_manager.clone(),
        }),
        board: Arc::new(BoardPortAdapter { app: app.clone() }),
        session_permissions: state.session_permissions.clone(),
        subagent_cancellation_tokens: state.subagent_cancellation_tokens.clone(),
        recall_cache: state.recall_cache.clone(),
        context_breakdown_cache: state.context_breakdown_cache.clone(),
        skills_manager: state.skills_manager.clone(),
        embedding_model: state.documents.embedding_model.clone(),
        mcp_discovery: state.mcp_discovery.clone(),
        graph_sessions: Arc::new(GraphSessionSourceAdapter(state.graph_sessions.clone())),
        agent_registry: state.agent_registry.clone(),
        provider_registry: state.provider_registry.clone(),
        workspace_folder: state.workspace_folder.clone(),
        pause_controls: state.chat_pause_controls.clone(),
    }
}

// Re-exported so historical `crate::services::agent_context::AgentContext`
// paths keep compiling (relocation doctrine §4.6).
pub use zen_agent::context::AgentContext;
