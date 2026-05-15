use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemMetrics {
    pub cpu_load: f32,
    pub mem_used: u64,
    pub mem_total: u64,
    pub net_up: f32,
    pub net_down: f32,
}
