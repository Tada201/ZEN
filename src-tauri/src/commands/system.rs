use tauri::State;
use crate::error::AppResult;
use crate::models::SystemMetrics;
use crate::commands::AppState;

#[tauri::command]
pub async fn get_system_metrics(state: State<'_, AppState>) -> AppResult<SystemMetrics> {
    let mut hardware = state.hardware.lock().await;
    Ok(hardware.get_metrics())
}

#[tauri::command]
pub async fn get_system_status() -> AppResult<String> {
    Ok("OPERATIONAL".to_string())
}

#[tauri::command]
pub async fn get_system_stats() -> AppResult<SystemMetrics> {
    use sysinfo::{System, CpuRefreshKind, MemoryRefreshKind, RefreshKind};
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything())
    );
    sys.refresh_all();
    
    Ok(SystemMetrics {
        cpu_load: sys.global_cpu_usage(),
        mem_used: sys.used_memory(),
        mem_total: sys.total_memory(),
        net_up: 0.0,
        net_down: 0.0,
    })
}

#[tauri::command]
pub async fn get_hardware_info(state: State<'_, AppState>) -> AppResult<crate::services::HardwareInfo> {
    let hardware = state.hardware.lock().await;
    Ok(hardware.get_info().clone())
}
