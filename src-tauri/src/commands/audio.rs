use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;
use tauri::State;
use tracing::warn;

use crate::commands::AppState;
use crate::error::ZenError;

#[derive(Debug, Clone, Serialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

fn collect_devices<I>(iter: I, default_name: Option<String>) -> Vec<AudioDevice>
where
    I: IntoIterator<Item = cpal::Device>,
{
    let mut out: Vec<AudioDevice> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for device in iter {
        let name = match device.name() {
            Ok(n) if !n.is_empty() => n,
            _ => continue,
        };
        if !seen.insert(name.clone()) {
            continue;
        }
        out.push(AudioDevice {
            id: name.clone(),
            name: name.clone(),
            is_default: default_name.as_deref() == Some(name.as_str()),
        });
    }
    out
}

#[tauri::command]
pub async fn list_input_devices() -> Result<Vec<AudioDevice>, ZenError> {
    tokio::task::spawn_blocking(|| {
        let host = cpal::default_host();
        let default_name = host.default_input_device().and_then(|d| d.name().ok());
        let iter = host
            .input_devices()
            .map_err(|e| ZenError::Internal(format!("List input devices failed: {e}")))?;
        Ok::<_, ZenError>(collect_devices(iter, default_name))
    })
    .await
    .map_err(|e| ZenError::Internal(format!("Device enumeration task failed: {e}")))?
}

#[tauri::command]
pub async fn list_output_devices() -> Result<Vec<AudioDevice>, ZenError> {
    tokio::task::spawn_blocking(|| {
        let host = cpal::default_host();
        let default_name = host.default_output_device().and_then(|d| d.name().ok());
        let iter = host
            .output_devices()
            .map_err(|e| ZenError::Internal(format!("List output devices failed: {e}")))?;
        Ok::<_, ZenError>(collect_devices(iter, default_name))
    })
    .await
    .map_err(|e| ZenError::Internal(format!("Device enumeration task failed: {e}")))?
}

#[tauri::command]
pub async fn set_active_output_device(
    state: State<'_, AppState>,
    device_name: Option<String>,
) -> Result<(), ZenError> {
    let tts_lock = state.tts.read().await;
    let tts = tts_lock
        .as_ref()
        .ok_or_else(|| ZenError::Internal("TTS service not initialized".into()))?;

    match tts.set_output_device(device_name).await {
        Ok(()) => Ok(()),
        Err(e) => {
            warn!(error = %e, "Failed to set output device; falling back to default");
            tts.set_output_device(None)
                .await
                .map_err(|e2| ZenError::Internal(e2.to_string()))
        }
    }
}
