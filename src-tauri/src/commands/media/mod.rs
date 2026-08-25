use crate::commands::AppState;
use crate::error::{AppResult, ZenError, ZenResult};
use crate::workspace::validate_workspace_path;
use std::path::Path;
use tauri::State;
use std::process::Command;

#[tauri::command]
pub async fn set_wallpaper_from_path(
    state: State<'_, AppState>,
    source_path: String,
) -> AppResult<String> {
    let source = Path::new(&source_path);
    if !source.is_file() {
        return Err(ZenError::Internal(format!(
            "Wallpaper source is not a file: {source_path}"
        )));
    }
    let abs = state.media.set_wallpaper(source).await?;
    Ok(abs.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn clear_wallpaper(state: State<'_, AppState>) -> AppResult<bool> {
    state.media.clear_wallpaper().await
}

#[tauri::command]
pub async fn get_current_wallpaper(
    state: State<'_, AppState>,
) -> AppResult<Option<String>> {
    Ok(state
        .media
        .current_wallpaper()
        .await?
        .map(|p| p.to_string_lossy().to_string()))
}

/// Re-encode a video via ffmpeg with brightness/saturation filter.
///
/// Security: both `input_path` and `output_path` MUST resolve inside the
/// active workspace root. Prevents path traversal / arbitrary writes outside
/// the sandboxed workspace. Throws `ZenError::Internal` on any escape.
#[tauri::command]
pub async fn reprocess_video(
    state: State<'_, AppState>,
    input_path: String,
    output_path: String,
) -> ZenResult<()> {
    // Resolve workspace root from AppState (tokio::sync::RwLock, async guard)
    let workspace_root = state.workspace_folder.read().await.clone();

    // Validate both paths resolve inside the workspace
    let abs_input = validate_workspace_path(&workspace_root, Path::new(&input_path))
        .map_err(|e| ZenError::Internal(format!("Input path rejected: {e}")))?;
    let abs_output = validate_workspace_path(&workspace_root, Path::new(&output_path))
        .map_err(|e| ZenError::Internal(format!("Output path rejected: {e}")))?;

    if !abs_input.is_file() {
        return Err(ZenError::Custom("Input video file not found".into()));
    }

    let in_str = abs_input.to_string_lossy().to_string();
    let out_str = abs_output.to_string_lossy().to_string();

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", &in_str,
            "-vf", "eq=brightness=0.6:saturation=0.5",
            "-c:v", "libx264",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-an",
            &out_str,
        ])
        .status()
        .map_err(|e| ZenError::Custom(format!("Failed to execute ffmpeg: {e}")))?;

    if !status.success() {
        return Err(ZenError::Custom("Video processing failed".into()));
    }

    Ok(())
}
