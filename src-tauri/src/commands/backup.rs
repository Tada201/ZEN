use crate::commands::AppState;
use zen_db::models::{Chat, Message};
use zen_core::error::{ZenError, ZenResult};
use zen_security::secrets::is_secret_key;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::State;
use zip::write::SimpleFileOptions;

const FORMAT_VERSION: u32 = 1;
const MAX_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupOptions {
    pub include_media: bool,
    pub include_indexes: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub format_version: u32,
    pub app_version: String,
    pub created_at: String,
    pub categories: Vec<String>,
    pub entries: Vec<BackupEntry>,
    pub secrets_excluded: bool,
    pub workspace_roots_excluded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub name: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub chat_count: i64,
    pub message_count: i64,
    pub setting_count: i64,
    pub secrets_excluded: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackupImportMode { Merge, Replace }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInspection {
    pub format_version: u32,
    pub app_version: String,
    pub created_at: String,
    pub categories: Vec<String>,
    pub bytes: u64,
    pub secrets_excluded: bool,
    pub workspace_roots_excluded: bool,
    pub chat_count: usize,
    pub message_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupSnapshot {
    chats: Vec<Chat>,
    messages: Vec<Message>,
    settings: std::collections::HashMap<String, String>,
}

#[tauri::command]
pub async fn get_backup_summary(state: State<'_, AppState>) -> ZenResult<BackupSummary> {
    let db = state.db().await?;
    let chats = zen_db::queries::count_chats(&db).await?;
    let messages = zen_db::queries::count_messages(&db).await?;
    let settings = zen_db::queries::count_settings(&db).await?;
    Ok(BackupSummary { chat_count: chats, message_count: messages, setting_count: settings, secrets_excluded: true })
}

#[tauri::command]
pub async fn export_zen_backup(
    state: State<'_, AppState>,
    destination: String,
    _options: BackupOptions,
) -> ZenResult<BackupInspection> {
    let db = state.db().await?;
    let chats: Vec<Chat> = zen_db::queries::list_all_chats_for_backup(&db).await?;
    let chats = chats.into_iter().map(|mut chat| { chat.workspace_root = None; chat }).collect::<Vec<_>>();
    let mut messages = Vec::new();
    for chat in &chats {
        let rows: Vec<Message> = zen_db::queries::get_all_messages_for_backup(&db, &chat.id).await?;
        messages.extend(rows);
    }
    let settings = state.settings_manager.get_all_public().await?
        .into_iter().filter(|(key, _)| !is_secret_key(key) && !key.contains("workspace") && !key.contains("path")).collect();
    let snapshot = serde_json::to_vec(&BackupSnapshot { chats, messages, settings })
        .map_err(|error| ZenError::Custom(format!("Could not serialize backup: {error}")))?;
    let entry = BackupEntry { name: "snapshot.json".to_string(), bytes: snapshot.len() as u64, sha256: hex_sha256(&snapshot) };
    let manifest = BackupManifest {
        format_version: FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        categories: vec!["chats".to_string(), "messages".to_string(), "settings".to_string()],
        entries: vec![entry],
        secrets_excluded: true,
        workspace_roots_excluded: true,
    };
    let destination_path = PathBuf::from(&destination);
    let parent = destination_path.parent().unwrap_or_else(|| Path::new("."));
    let temp_path = parent.join(format!(".zen-backup-{}.tmp", uuid::Uuid::new_v4()));
    let file = File::create(&temp_path).map_err(|error| ZenError::Custom(format!("Could not create backup staging file: {error}")))?;
    let mut zip = zip::ZipWriter::new(file);
    let options_zip = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("manifest.json", options_zip).map_err(zip_error)?;
    zip.write_all(&serde_json::to_vec_pretty(&manifest).map_err(serde_error)?).map_err(io_error)?;
    zip.start_file("snapshot.json", options_zip).map_err(zip_error)?;
    zip.write_all(&snapshot).map_err(io_error)?;
    zip.finish().map_err(zip_error)?;
    let bytes = fs::metadata(&temp_path).map_err(io_error)?.len();
    if bytes > MAX_ARCHIVE_BYTES {
        let _ = fs::remove_file(&temp_path);
        return Err(ZenError::Custom("Backup exceeds the maximum archive size".to_string()));
    }
    fs::rename(&temp_path, &destination_path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        ZenError::Custom(format!("Could not finalize backup: {error}"))
    })?;
    let snapshot_meta: BackupSnapshot = serde_json::from_slice(&snapshot).map_err(serde_error)?;
    Ok(BackupInspection { format_version: FORMAT_VERSION, app_version: manifest.app_version, created_at: manifest.created_at, categories: manifest.categories, bytes, secrets_excluded: true, workspace_roots_excluded: true, chat_count: snapshot_meta.chats.len(), message_count: snapshot_meta.messages.len() })
}

#[tauri::command]
pub async fn import_zen_backup(
    state: State<'_, AppState>,
    source: String,
    mode: BackupImportMode,
    confirmation: Option<String>,
) -> ZenResult<BackupInspection> {
    if matches!(mode, BackupImportMode::Replace)
        && confirmation.as_deref() != Some("REPLACE ZEN DATA")
    {
        return Err(ZenError::Custom("Replace import requires explicit confirmation".to_string()));
    }
    if matches!(mode, BackupImportMode::Replace) {
        return Err(ZenError::Custom("Replace import is not available until restart-safe database replacement is enabled. Choose Merge.".to_string()));
    }
    let file = File::open(&source).map_err(io_error)?;
    if file.metadata().map_err(io_error)?.len() > MAX_ARCHIVE_BYTES { return Err(ZenError::Custom("Backup exceeds the maximum archive size".to_string())); }
    let mut archive = zip::ZipArchive::new(file).map_err(zip_error)?;
    if archive.len() != 2 { return Err(ZenError::Custom("Backup must contain exactly manifest.json and snapshot.json".to_string())); }
    let mut manifest_content = Vec::new();
    archive.by_name("manifest.json").map_err(zip_error)?.read_to_end(&mut manifest_content).map_err(io_error)?;
    if manifest_content.len() > 1024 * 1024 { return Err(ZenError::Custom("Backup manifest is too large".to_string())); }
    let manifest: BackupManifest = serde_json::from_slice(&manifest_content).map_err(serde_error)?;
    if manifest.format_version != FORMAT_VERSION || !manifest.secrets_excluded || !manifest.workspace_roots_excluded { return Err(ZenError::Custom("Unsupported or unsafe backup manifest".to_string())); }
    let mut snapshot_content = Vec::new();
    archive.by_name("snapshot.json").map_err(zip_error)?.read_to_end(&mut snapshot_content).map_err(io_error)?;
    validate_manifest(&manifest)?;
    let entry = manifest.entries.iter().find(|entry| entry.name == "snapshot.json").ok_or_else(|| ZenError::Custom("Backup manifest is missing snapshot metadata".to_string()))?;
    if snapshot_content.len() as u64 > MAX_ARCHIVE_BYTES || hex_sha256(&snapshot_content) != entry.sha256 { return Err(ZenError::Custom("Backup snapshot checksum or size validation failed".to_string())); }
    let snapshot: BackupSnapshot = serde_json::from_slice(&snapshot_content).map_err(serde_error)?;
    validate_snapshot(&snapshot)?;
    let db = state.db().await?;
    let mut tx = db.begin().await.map_err(crate::error::db_err)?;
    let chat_count = snapshot.chats.len();
    let message_count = snapshot.messages.len();
    for chat in snapshot.chats {
        let imported_id = uuid::Uuid::new_v4().to_string();
        zen_db::queries::insert_chat_tx(&mut tx, &imported_id, &format!("{} (Imported)", chat.title), chat.model.as_deref()).await?;
        for message in snapshot.messages.iter().filter(|message| message.chat_id == chat.id) {
            zen_db::queries::add_message_tx(&mut tx, &zen_db::queries::NewMessage {
                chat_id: &imported_id, id: None, role: &message.role, content: &message.content,
                model: message.model.as_deref(), is_complete: message.is_complete.unwrap_or(1) == 1,
                tool_calls: message.tool_calls.as_deref(), tool_call_id: message.tool_call_id.as_deref(), images: message.images.as_deref(), attachments: message.attachments.as_deref(),
                tokens_in: message.tokens_in, tokens_out: message.tokens_out, kind: message.kind.as_deref(), metadata: message.metadata.as_deref(), reasoning_details: message.reasoning_details.as_deref(), steps_json: message.steps_json.as_deref(),
            }, &uuid::Uuid::new_v4().to_string()).await?;
        }
    }
    // Public settings are intentionally exported as metadata only for now;
    // merge restores preserve current machine configuration.
    tx.commit().await.map_err(crate::error::db_err)?;
    Ok(BackupInspection { format_version: manifest.format_version, app_version: manifest.app_version, created_at: manifest.created_at, categories: manifest.categories, bytes: snapshot_content.len() as u64, secrets_excluded: true, workspace_roots_excluded: true, chat_count, message_count })
}

#[tauri::command]
pub async fn inspect_zen_backup(source: String) -> ZenResult<BackupInspection> {
    let file = File::open(&source).map_err(io_error)?;
    let size = file.metadata().map_err(io_error)?.len();
    if size > MAX_ARCHIVE_BYTES { return Err(ZenError::Custom("Backup exceeds the maximum archive size".to_string())); }
    let mut archive = zip::ZipArchive::new(file).map_err(zip_error)?;
    let mut content = Vec::new();
    {
        let manifest_file = archive.by_name("manifest.json").map_err(zip_error)?;
        manifest_file.take(1024 * 1024 + 1).read_to_end(&mut content).map_err(io_error)?;
    }
    if content.len() > 1024 * 1024 { return Err(ZenError::Custom("Backup manifest is too large".to_string())); }
    let manifest: BackupManifest = serde_json::from_slice(&content).map_err(serde_error)?;
    if manifest.format_version != FORMAT_VERSION || !manifest.secrets_excluded || !manifest.workspace_roots_excluded { return Err(ZenError::Custom("Unsupported or unsafe backup manifest".to_string())); }
    let snapshot_entry = manifest.entries.iter().find(|entry| entry.name == "snapshot.json").ok_or_else(|| ZenError::Custom("Backup manifest is missing snapshot metadata".to_string()))?;
    if snapshot_entry.bytes > MAX_ARCHIVE_BYTES || !_safe_entry_name(&snapshot_entry.name) { return Err(ZenError::Custom("Backup contains an unsafe snapshot entry".to_string())); }
    let snapshot_file = archive.by_name("snapshot.json").map_err(zip_error)?;
    let mut snapshot_content = Vec::new();
    snapshot_file.take(MAX_ARCHIVE_BYTES + 1).read_to_end(&mut snapshot_content).map_err(io_error)?;
    if snapshot_content.len() as u64 != snapshot_entry.bytes || hex_sha256(&snapshot_content) != snapshot_entry.sha256 { return Err(ZenError::Custom("Backup snapshot checksum or size validation failed".to_string())); }
    let snapshot: BackupSnapshot = serde_json::from_slice(&snapshot_content).map_err(serde_error)?;
    Ok(BackupInspection { format_version: manifest.format_version, app_version: manifest.app_version, created_at: manifest.created_at, categories: manifest.categories, bytes: size, secrets_excluded: true, workspace_roots_excluded: true, chat_count: snapshot.chats.len(), message_count: snapshot.messages.len() })
}

fn validate_manifest(manifest: &BackupManifest) -> ZenResult<()> {
    if manifest.entries.len() != 1 || manifest.entries.iter().filter(|entry| entry.name == "snapshot.json").count() != 1 {
        return Err(ZenError::Custom("Backup manifest must contain exactly one snapshot entry".to_string()));
    }
    if manifest.entries.iter().any(|entry| entry.name.is_empty() || !_safe_entry_name(&entry.name) || entry.bytes > MAX_ARCHIVE_BYTES || entry.sha256.len() != 64 || !entry.sha256.chars().all(|ch| ch.is_ascii_hexdigit())) {
        return Err(ZenError::Custom("Backup manifest contains an invalid entry".to_string()));
    }
    Ok(())
}

fn validate_snapshot(snapshot: &BackupSnapshot) -> ZenResult<()> {
    if snapshot.chats.len() > 100_000 || snapshot.messages.len() > 1_000_000 || snapshot.settings.len() > 10_000 {
        return Err(ZenError::Custom("Backup contains too many records".to_string()));
    }
    let chat_ids = snapshot.chats.iter().map(|chat| chat.id.as_str()).collect::<std::collections::HashSet<_>>();
    if chat_ids.len() != snapshot.chats.len() { return Err(ZenError::Custom("Backup contains duplicate chat IDs".to_string())); }
    let mut message_ids = std::collections::HashSet::new();
    for message in &snapshot.messages {
        if !chat_ids.contains(message.chat_id.as_str()) { return Err(ZenError::Custom("Backup contains an orphan message".to_string())); }
        if !message_ids.insert(message.id.as_str()) { return Err(ZenError::Custom("Backup contains duplicate message IDs".to_string())); }
        if !matches!(message.role.as_str(), "user" | "assistant" | "system" | "tool") { return Err(ZenError::Custom("Backup contains an invalid message role".to_string())); }
        if message.content.len() > 16 * 1024 * 1024 { return Err(ZenError::Custom("Backup contains an oversized message".to_string())); }
    }
    Ok(())
}

fn hex_sha256(bytes: &[u8]) -> String { Sha256::digest(bytes).iter().map(|byte| format!("{byte:02x}")).collect() }
fn io_error(error: std::io::Error) -> ZenError { ZenError::Custom(format!("Backup I/O error: {error}")) }
fn zip_error<E: std::fmt::Display>(error: E) -> ZenError { ZenError::Custom(format!("Invalid backup archive: {error}")) }
fn serde_error<E: std::fmt::Display>(error: E) -> ZenError { ZenError::Custom(format!("Invalid backup data: {error}")) }

#[allow(dead_code)]
fn _safe_entry_name(name: &str) -> bool { let path = Path::new(name); !name.contains('\0') && !path.is_absolute() && !path.components().any(|part| matches!(part, std::path::Component::ParentDir)) }
