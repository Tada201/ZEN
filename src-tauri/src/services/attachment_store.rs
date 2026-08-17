//! Per-chat attachment blob store.
//!
//! Uploaded chat files live under `<app_data_dir>/attachments/<chat_id>/`,
//! one directory per chat so deleting a chat is a single recursive remove —
//! no cross-chat content-addressing, ref-counting, or GC sweep needed for a
//! single-user desktop app. Each attachment keeps two files:
//!   - `<doc_id>__<name>`      the original bytes (preview / download)
//!   - `<doc_id>.extracted.txt` the extracted plain text (agent read tool)
//!
//! `content_hash` (SHA-256 of the original bytes) is recorded for integrity
//! and in-chat duplicate detection, but is NOT the storage key.
//!
//! Security: the on-disk name is derived from the trusted `doc_id` plus a
//! sanitized display name; `chat_id` is validated as an opaque id (no path
//! separators). Nothing user-supplied is used as a raw path component.

use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

/// Hard per-file ceiling. Mirrors the industry chat-upload band (Claude 30MB /
/// ChatGPT ~20MB); 25MB is the middle. Enforced before any bytes are written.
pub const MAX_ATTACHMENT_BYTES: usize = 25 * 1024 * 1024;

/// Max attachments retained per chat (Claude uses 20/conversation).
pub const MAX_ATTACHMENTS_PER_CHAT: i64 = 20;

pub struct StoredBlob {
    pub blob_path: PathBuf,
    pub text_path: PathBuf,
    pub content_hash: String,
    pub size: i64,
}

/// Attachments root: `<app_data_dir>/attachments`.
pub fn attachments_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("attachments")
}

/// Directory for one chat's attachments. `chat_id` must be an opaque id; any
/// path separator or traversal token is rejected (defense in depth — chat ids
/// are UUID-like, so a violation means something is wrong).
pub fn chat_dir(app_data_dir: &Path, chat_id: &str) -> Result<PathBuf, String> {
    if chat_id.is_empty()
        || chat_id.contains('/')
        || chat_id.contains('\\')
        || chat_id.contains("..")
        || chat_id.contains(':')
    {
        return Err(format!("Invalid chat id for attachment store: {chat_id:?}"));
    }
    Ok(attachments_root(app_data_dir).join(chat_id))
}

/// Strip a display name down to a safe single path component: drop any
/// directory parts, control chars, and Windows-reserved characters; cap length.
pub fn sanitize_display_name(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let mut out: String = base
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    out = out.trim_matches([' ', '.']).to_string();
    if out.is_empty() {
        out = "file".to_string();
    }
    // Cap the on-disk name; keep the extension when possible.
    const MAX: usize = 120;
    if out.len() > MAX {
        let ext = Path::new(&out)
            .extension()
            .and_then(|s| s.to_str())
            .map(|e| format!(".{e}"))
            .unwrap_or_default();
        let keep = MAX.saturating_sub(ext.len());
        out = format!("{}{}", crate::tools::fs_tools::truncate_utf8(&out, keep), ext);
    }
    out
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

/// Write the original bytes + extracted text for one attachment.
/// The caller has already validated size and type.
pub async fn store_attachment(
    app_data_dir: &Path,
    chat_id: &str,
    doc_id: &str,
    display_name: &str,
    bytes: &[u8],
    extracted_text: &str,
) -> Result<StoredBlob, String> {
    let dir = chat_dir(app_data_dir, chat_id)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Failed to create attachment dir: {e}"))?;

    let content_hash = hex_encode(&Sha256::digest(bytes));
    let safe_name = sanitize_display_name(display_name);
    let blob_path = dir.join(format!("{doc_id}__{safe_name}"));
    let text_path = dir.join(format!("{doc_id}.extracted.txt"));

    tokio::fs::write(&blob_path, bytes)
        .await
        .map_err(|e| format!("Failed to write attachment blob: {e}"))?;
    tokio::fs::write(&text_path, extracted_text.as_bytes())
        .await
        .map_err(|e| format!("Failed to write extracted text: {e}"))?;

    Ok(StoredBlob {
        blob_path,
        text_path,
        content_hash,
        size: bytes.len() as i64,
    })
}

/// Remove every stored file for a chat (called on chat delete after the DB
/// rows are gone). Missing dir is not an error.
pub async fn delete_chat_attachments(app_data_dir: &Path, chat_id: &str) -> Result<(), String> {
    let dir = chat_dir(app_data_dir, chat_id)?;
    match tokio::fs::remove_dir_all(&dir).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Failed to remove attachment dir: {e}")),
    }
}

/// Remove one attachment's files (original + extracted text). Missing files
/// are ignored so delete is idempotent.
pub async fn delete_attachment_files(blob_path: &Path, text_path: &Path) {
    let _ = tokio::fs::remove_file(blob_path).await;
    let _ = tokio::fs::remove_file(text_path).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_path_and_reserved_chars() {
        assert_eq!(sanitize_display_name("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_display_name("a/b\\c:d*e?.txt"), "a_b_c_d_e?.txt".replace('?', "_"));
        assert_eq!(sanitize_display_name(""), "file");
        assert_eq!(sanitize_display_name("   ...  "), "file");
    }

    #[test]
    fn sanitize_caps_length_keeping_extension() {
        let long = format!("{}.txt", "x".repeat(300));
        let out = sanitize_display_name(&long);
        assert!(out.len() <= 120);
        assert!(out.ends_with(".txt"));
    }

    #[test]
    fn chat_dir_rejects_traversal() {
        let root = Path::new("/tmp/app");
        assert!(chat_dir(root, "../evil").is_err());
        assert!(chat_dir(root, "a/b").is_err());
        assert!(chat_dir(root, "c:\\x").is_err());
        assert!(chat_dir(root, "normal-uuid-1234").is_ok());
    }

    #[test]
    fn hex_encode_matches_known_vector() {
        // SHA-256("") known digest.
        let empty = Sha256::digest(b"");
        assert_eq!(
            hex_encode(&empty),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
