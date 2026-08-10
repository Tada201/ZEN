use crate::agent::tools::AgentTool;
use crate::commands::AppState;
use anyhow::Result;
use async_trait::async_trait;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

pub struct SystemMetricsTool;

#[async_trait]
impl AgentTool for SystemMetricsTool {
    fn id(&self) -> &str {
        "get_system_metrics"
    }

    fn description(&self) -> &str {
        "Retrieves real-time hardware performance metrics including CPU load, available RAM, and network throughput. \
         Use this when the user asks about system health, performance, or resource usage."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        _chat_id: String,
        _input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let state = app.state::<AppState>();

        // Refresh sysinfo data
        {
            let mut sys = state.sys_metrics.system.write().await;
            sys.refresh_all();
        }
        {
            let mut nets = state.sys_metrics.networks.write().await;
            nets.refresh(true);
        }

        let sys: tokio::sync::RwLockReadGuard<'_, sysinfo::System> =
            state.sys_metrics.system.read().await;
        let nets: tokio::sync::RwLockReadGuard<'_, sysinfo::Networks> =
            state.sys_metrics.networks.read().await;

        let total_memory = sys.total_memory();
        let used_memory = sys.used_memory();
        let cpu_global = sys.global_cpu_usage();

        let mut total_transmitted = 0;
        let mut total_received = 0;
        for data in nets.values() {
            total_transmitted += data.transmitted();
            total_received += data.received();
        }

        Ok(json!({
            "status": "nominal",
            "cpu_usage_percent": format!("{:.1}%", cpu_global),
            "memory": {
                "total_mb": total_memory / 1024 / 1024,
                "used_mb": used_memory / 1024 / 1024,
                "percent_used": format!("{:.1}%", (used_memory as f64 / total_memory as f64) * 100.0)
            },
            "network": {
                "total_received_bytes": total_received,
                "total_transmitted_bytes": total_transmitted
            }
        }))
    }
}
