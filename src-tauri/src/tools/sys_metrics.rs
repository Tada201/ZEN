use async_trait::async_trait;
use serde_json::json;
use tauri::{AppHandle, Manager};

use crate::commands::system::get_system_metrics;
use crate::commands::AppState;
use zen_security::RiskLevel;
use zen_tools::registry::{ToolError, ToolOutput};

pub struct SystemMetricsTool;

#[async_trait]
impl zen_tools::Tool<tauri::AppHandle> for SystemMetricsTool {
    fn name(&self) -> &str {
        "get_system_metrics"
    }

    fn description(&self) -> &str {
        "Retrieves current CPU, Memory, Disk, and Network usage from the host machine in real-time."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {},
            "required": []
        })
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Low
    }

    async fn execute(
        &self,
        app: AppHandle,
        _chat_id: String,
        _args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let state = app.state::<AppState>();
        let metrics_res: zen_core::error::AppResult<zen_core::SystemMetrics> =
            get_system_metrics(state).await;
        let metrics =
            metrics_res.map_err(|e: zen_core::error::ZenError| ToolError::ExecutionFailed {
                message: e.to_string(),
            })?;

        Ok(ToolOutput {
            content: json!(metrics),
            metadata: None,
        })
    }
}
