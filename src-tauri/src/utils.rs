use crate::error::{AppResult, ZenError};
use std::path::{Component, Path};

/// Validates that a path is safe and does not attempt to traverse outside allowed boundaries.
///
/// Returns Ok(PathBuf) if safe, or Err if suspicious.
pub fn validate_path(path: &str) -> AppResult<std::path::PathBuf> {
    let p = Path::new(path);

    // Prevent absolute paths that might point to system directories if not explicitly allowed
    // For now, we allow them but verify they don't contain traversal components

    for component in p.components() {
        match component {
            Component::ParentDir => {
                return Err(ZenError::Internal(
                    "Security: Path traversal attempt detected (..) ".to_string(),
                ));
            }
            Component::RootDir => {
                // Root is allowed if we're browsing the whole disk,
                // but usually we want to restrict to a workspace.
                // For this app, we'll allow it for now but log it.
            }
            _ => {}
        }
    }

    let resolved = if p.exists() {
        p.canonicalize()
            .map_err(|e| ZenError::Internal(format!("Failed to resolve path: {}", e)))?
    } else {
        p.to_path_buf()
    };

    Ok(resolved)
}

/// Checks if a path is within a specific root directory.
pub fn is_path_in_root(path: &Path, root: &Path) -> bool {
    let path_abs = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => return false, // Path doesn't exist or is invalid
    };
    let root_abs = match root.canonicalize() {
        Ok(p) => p,
        Err(_) => return false,
    };

    path_abs.starts_with(root_abs)
}
