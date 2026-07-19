use anyhow::{Context, Result};
/// Workspace/Sandbox module for restricting agent file operations
///
/// This module provides path validation to ensure agents can only operate
/// within a designated workspace folder, preventing unauthorized access to
/// sensitive system files.
use std::path::{Component, Path, PathBuf};

/// Validates that a path is within the workspace folder
///
/// Returns Ok(canonical_path) if the path is safe, Err otherwise.
/// Prevents path traversal attacks (../, symlinks, etc.)
pub fn validate_workspace_path(workspace_root: &Path, requested_path: &Path) -> Result<PathBuf> {
    // Canonicalize the workspace root first
    let canonical_root = workspace_root.canonicalize().with_context(|| {
        format!(
            "Failed to resolve workspace root: {}",
            workspace_root.display()
        )
    })?;

    if requested_path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(anyhow::anyhow!(
            "Path traversal detected: {} contains parent directory components",
            requested_path.display()
        ));
    }

    // If the requested path exists, canonicalize it
    // If it doesn't exist yet (e.g., new file), we need to validate the parent
    let canonical_path = if requested_path.exists() {
        requested_path
            .canonicalize()
            .with_context(|| format!("Failed to resolve path: {}", requested_path.display()))?
    } else {
        let mut ancestor = requested_path
            .parent()
            .ok_or_else(|| anyhow::anyhow!("Invalid path: no parent directory"))?;

        while !ancestor.exists() {
            ancestor = ancestor.parent().ok_or_else(|| {
                anyhow::anyhow!(
                    "Invalid path: no existing ancestor for {}",
                    requested_path.display()
                )
            })?;
        }

        let canonical_ancestor = ancestor.canonicalize().with_context(|| {
            format!(
                "Failed to resolve ancestor directory: {}",
                ancestor.display()
            )
        })?;

        if !canonical_ancestor.starts_with(&canonical_root) {
            return Err(anyhow::anyhow!(
                "Path traversal detected: {} is outside workspace {}",
                requested_path.display(),
                workspace_root.display()
            ));
        }

        // Reconstruct the full path using the canonicalized ancestor to inherit the same UNC prefix/format
        let relative = requested_path
            .strip_prefix(&ancestor)
            .unwrap_or(requested_path);
        canonical_ancestor.join(relative)
    };

    // Critical security check: ensure the canonical path starts with workspace root
    let clean_path = strip_unc_prefix(&canonical_path);
    let clean_root = strip_unc_prefix(&canonical_root);

    if !clean_path.starts_with(&clean_root) {
        return Err(anyhow::anyhow!(
            "SECURITY VIOLATION: Path {} is outside workspace boundary {}",
            clean_path.display(),
            clean_root.display()
        ));
    }

    Ok(clean_path)
}

pub fn canonicalize_workspace_root(path: &Path) -> Result<PathBuf> {
    if !path.exists() || !path.is_dir() {
        return Err(anyhow::anyhow!(
            "Workspace root does not exist or is not a directory: {}",
            path.display()
        ));
    }

    path.canonicalize()
        .with_context(|| format!("Failed to resolve workspace root: {}", path.display()))
}

/// Resolves a path string (absolute or relative) to an absolute path within workspace
pub fn resolve_workspace_path(workspace_root: &Path, path_str: &str) -> Result<PathBuf> {
    let requested = PathBuf::from(path_str);

    // If it's an absolute path, validate it's within workspace
    if requested.is_absolute() {
        return validate_workspace_path(workspace_root, &requested);
    }

    // Relative path - join with workspace root
    let full_path = workspace_root.join(&requested);
    validate_workspace_path(workspace_root, &full_path)
}

/// Resolves a path within a session-specific sub-folder
/// Creates the session folder structure: workspace/sessions/{session_id}/{relative_path}
pub fn resolve_session_path(
    workspace_root: &Path,
    session_id: &str,
    relative_path: &str,
) -> Result<PathBuf> {
    // Create session folder: workspace/sessions/{session_id}/
    let session_root = workspace_root.join("sessions").join(session_id);

    // Validate the session root is within workspace
    if !session_root.starts_with(workspace_root) {
        return Err(anyhow::anyhow!("Invalid session folder structure"));
    }

    // Resolve the relative path within session folder
    let full_path = session_root.join(relative_path);
    validate_workspace_path(workspace_root, &full_path)
}

/// Checks if a path attempts to traverse outside the workspace
/// Quick pre-validation before doing expensive canonicalization
pub fn looks_like_path_traversal(path_str: &str) -> bool {
    // Check for common path traversal patterns
    path_str.contains("..")
        || path_str.starts_with('/')
        || path_str.starts_with('\\')
        || path_str.contains('~')
        || path_str.starts_with('$')
}

fn find_project_workspace_from_current_dir() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        let has_tauri = dir.join("src-tauri").join("Cargo.toml").is_file();
        let has_package = dir.join("package.json").is_file();
        let is_tauri_dir = dir.join("Cargo.toml").is_file()
            && dir
                .parent()
                .map(|parent| parent.join("package.json").is_file())
                .unwrap_or(false);

        if has_tauri && has_package {
            return Some(dir);
        }

        if is_tauri_dir {
            return dir.parent().map(Path::to_path_buf);
        }

        if !dir.pop() {
            return None;
        }
    }
}

/// Gets the default workspace folder.
pub fn get_default_workspace() -> PathBuf {
    if let Some(project_workspace) = find_project_workspace_from_current_dir() {
        return project_workspace;
    }

    // A packaged app must not silently grant its tools access to the entire
    // home directory. Create a dedicated, user-visible workspace instead.
    if let Some(home) = dirs::home_dir() {
        let projects = home.join("zen-projects");
        if std::fs::create_dir_all(&projects).is_ok() {
            return projects;
        }
    }

    // Fallback to current directory
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[cfg(target_os = "windows")]
fn strip_unc_prefix(path: &Path) -> PathBuf {
    let path_str = path.to_string_lossy();
    if path_str.starts_with(r"\\?\") {
        PathBuf::from(&path_str[4..])
    } else {
        path.to_path_buf()
    }
}

#[cfg(not(target_os = "windows"))]
fn strip_unc_prefix(path: &Path) -> PathBuf {
    path.to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_valid_workspace_path() {
        let temp_dir = TempDir::new().unwrap();
        let workspace = temp_dir.path();

        // Create a test file
        let test_file = workspace.join("test.txt");
        std::fs::write(&test_file, "content").unwrap();

        // Should succeed
        let result = validate_workspace_path(workspace, &test_file);
        assert!(result.is_ok());
    }

    #[test]
    fn test_path_traversal_blocked() {
        let temp_dir = TempDir::new().unwrap();
        let workspace = temp_dir.path();

        // Try to escape workspace
        let escape_path = workspace.join("../escape.txt");

        // Should fail
        let result = validate_workspace_path(workspace, &escape_path);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Path traversal detected"));
    }

    #[test]
    fn test_nonexistent_nested_path_traversal_blocked() {
        let temp_dir = TempDir::new().unwrap();
        let workspace = temp_dir.path();

        let escape_path = workspace
            .join("missing")
            .join("..")
            .join("..")
            .join("escape.txt");

        let result = validate_workspace_path(workspace, &escape_path);
        assert!(result.is_err());
    }

    #[test]
    fn test_absolute_path_outside_workspace() {
        let temp_dir = TempDir::new().unwrap();
        let workspace = temp_dir.path();

        // Try to access /etc/passwd or similar
        let result = validate_workspace_path(workspace, Path::new("/etc/passwd"));
        assert!(result.is_err());
    }

    #[test]
    fn test_nonexistent_file_inside_workspace() {
        let temp_dir = TempDir::new().unwrap();
        let workspace = temp_dir.path();
        let test_file = workspace.join("nested_folder").join("new_file.txt");

        let result = validate_workspace_path(workspace, &test_file);
        assert!(result.is_ok());
    }
}
