//! Tool risk levels (from tools/permission.rs, Phase 4).

use serde::{Deserialize, Serialize};

// ========== RISK LEVELS ==========

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    /// Read-only, safe operations (e.g., system metrics, time)
    Low,
    /// File reads, non-destructive operations
    Medium,
    /// File writes, network requests
    High,
    /// Terminal commands, deletions
    Critical,
}

impl RiskLevel {
    pub fn description(&self) -> &'static str {
        match self {
            RiskLevel::Low => "Safe read-only operation",
            RiskLevel::Medium => "Non-destructive operation",
            RiskLevel::High => "Potentially destructive operation",
            RiskLevel::Critical => "High-risk system operation",
        }
    }
}
