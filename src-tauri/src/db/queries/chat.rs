use crate::db::models::*;
use crate::error::ZenResult;
use sqlx::SqlitePool;
use uuid::Uuid;

const MAX_CHAT_FOLDER_ITEMS: i64 = 500;
const MAX_ARCHIVED_CHAT_ITEMS: i64 = 500;
const MAX_CHAT_TEMPLATE_ITEMS: i64 = 500;
const MAX_CHAT_TAG_ITEMS: i64 = 500;
const MAX_ALL_CHAT_TAG_ITEMS: i64 = 2_000;
const MAX_UNIQUE_TAG_ITEMS: i64 = 500;
const MAX_SEARCH_RESULTS: i64 = 100;

// --- Chats ---

pub async fn insert_chat_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    id: &str,
    title: &str,
    model: Option<&str>,
) -> ZenResult<()> {
    sqlx::query("INSERT INTO chats (id, title, model, workspace_root) VALUES (?, ?, ?, NULL)")
        .bind(id).bind(title).bind(model).execute(&mut **tx).await?;
    Ok(())
}

pub async fn create_chat(
    pool: &SqlitePool,
    title: &str,
    model: Option<&str>,
    workspace_root: Option<&str>,
) -> ZenResult<Chat> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO chats (id, title, model, workspace_root) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(title)
        .bind(model)
        .bind(workspace_root)
        .execute(pool)
        .await?;

    get_chat(pool, &id).await
}

pub async fn get_chat(pool: &SqlitePool, id: &str) -> ZenResult<Chat> {
    let chat = sqlx::query_as::<_, Chat>(
        "SELECT c.id, c.title, c.model, c.created_at, c.updated_at, c.pinned, c.is_archived, c.archived_at, c.message_count, c.total_tokens_in, c.total_tokens_out, c.last_activity, COALESCE(c.folder_id, cfm.folder_id) as folder_id, c.workspace_root FROM chats c LEFT JOIN chat_folder_members cfm ON c.id = cfm.chat_id WHERE c.id = ?"
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    Ok(chat)
}

/// Freeze a chat's session model the first time it is known: sets `chats.model`
/// to `model` only when the column is currently NULL or blank. Chats created
/// with a model keep it; a chat that started model-less (e.g. created while
/// "No Model" was selected) locks onto the model used for its first send. A
/// later Settings model switch never rewrites an already-set session model, so
/// an existing session's subagents keep inheriting the model the session was
/// created/first-run with — only a new session picks up the newly selected one.
pub async fn set_chat_model_if_unset(pool: &SqlitePool, id: &str, model: &str) -> ZenResult<()> {
    if model.trim().is_empty() {
        return Ok(());
    }
    sqlx::query(
        "UPDATE chats SET model = ? WHERE id = ? AND (model IS NULL OR trim(model) = '')",
    )
    .bind(model)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}


// --- Chat Session Management (Phase 1) ---

use crate::db::models::{ChatFolder, SearchResult};

pub async fn create_chat_folder(
    pool: &SqlitePool,
    name: &str,
    color: Option<&str>,
    icon: Option<&str>,
) -> ZenResult<ChatFolder> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO chat_folders (id, name, color, icon) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(name)
        .bind(color)
        .bind(icon)
        .execute(pool)
        .await?;

    let folder = sqlx::query_as::<_, ChatFolder>("SELECT * FROM chat_folders WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await?;
    Ok(folder)
}

pub async fn update_chat_folder(
    pool: &SqlitePool,
    folder_id: &str,
    name: Option<&str>,
    color: Option<&str>,
) -> ZenResult<()> {
    if let Some(n) = name {
        sqlx::query("UPDATE chat_folders SET name = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(n)
            .bind(folder_id)
            .execute(pool)
            .await?;
    }
    if let Some(c) = color {
        sqlx::query("UPDATE chat_folders SET color = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(c)
            .bind(folder_id)
            .execute(pool)
            .await?;
    }
    Ok(())
}

pub async fn delete_chat_folder(pool: &SqlitePool, folder_id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM chat_folders WHERE id = ?")
        .bind(folder_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_chat_folders(pool: &SqlitePool) -> ZenResult<Vec<ChatFolder>> {
    let folders = sqlx::query_as::<_, ChatFolder>(
        "SELECT * FROM chat_folders ORDER BY sort_order ASC, name ASC LIMIT ?",
    )
    .bind(MAX_CHAT_FOLDER_ITEMS)
    .fetch_all(pool)
    .await?;
    Ok(folders)
}

pub async fn move_chat_to_folder(
    pool: &SqlitePool,
    chat_id: &str,
    folder_id: &str,
) -> ZenResult<()> {
    sqlx::query("DELETE FROM chat_folder_members WHERE chat_id = ?")
        .bind(chat_id)
        .execute(pool)
        .await?;

    sqlx::query("INSERT INTO chat_folder_members (folder_id, chat_id) VALUES (?, ?)")
        .bind(folder_id)
        .bind(chat_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn remove_chat_from_folder(pool: &SqlitePool, chat_id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM chat_folder_members WHERE chat_id = ?")
        .bind(chat_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_chat_workspace(
    pool: &SqlitePool,
    chat_id: &str,
    workspace_root: Option<&str>,
) -> ZenResult<()> {
    sqlx::query("UPDATE chats SET workspace_root = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(workspace_root)
        .bind(chat_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn archive_chat(pool: &SqlitePool, chat_id: &str) -> ZenResult<()> {
    sqlx::query("UPDATE chats SET is_archived = 1, archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
        .bind(chat_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn unarchive_chat(pool: &SqlitePool, chat_id: &str) -> ZenResult<()> {
    sqlx::query("UPDATE chats SET is_archived = 0, archived_at = NULL, updated_at = datetime('now') WHERE id = ?")
        .bind(chat_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_archived_chats(pool: &SqlitePool) -> ZenResult<Vec<Chat>> {
    list_archived_chats_page(pool, MAX_ARCHIVED_CHAT_ITEMS, 0).await
}

pub async fn list_archived_chats_page(
    pool: &SqlitePool,
    limit: i64,
    offset: i64,
) -> ZenResult<Vec<Chat>> {
    let chats = sqlx::query_as::<_, Chat>(
        "SELECT c.id, c.title, c.model, c.created_at, c.updated_at, c.pinned, c.is_archived, c.archived_at, c.message_count, c.total_tokens_in, c.total_tokens_out, c.last_activity, COALESCE(c.folder_id, cfm.folder_id) as folder_id, c.workspace_root FROM chats c LEFT JOIN chat_folder_members cfm ON c.id = cfm.chat_id WHERE c.is_archived = 1 AND c.archived_at IS NOT NULL ORDER BY c.archived_at DESC LIMIT ? OFFSET ?",
    )
    .bind(limit.clamp(1, MAX_ARCHIVED_CHAT_ITEMS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await?;
    Ok(chats)
}

pub async fn search_chats(
    pool: &SqlitePool,
    query: &str,
    limit: Option<i64>,
) -> ZenResult<Vec<SearchResult>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let limit_val = limit.unwrap_or(20).clamp(1, MAX_SEARCH_RESULTS);
    // Escape standard FTS quote character
    let fts_query = format!("\"{}\"", query.replace("\"", "\"\""));

    let results = sqlx::query_as::<_, SearchResult>(
        r#"
        SELECT 
            c.id AS chat_id, 
            c.title AS chat_title, 
            m.id AS message_id, 
            snippet(messages_fts, 0, '<mark>', '</mark>', '...', 20) AS message_content,
            m.role,
            m.created_at AS timestamp,
            bm25(messages_fts) AS rank
        FROM messages_fts f
        JOIN messages m ON f.rowid = m.rowid
        JOIN chats c ON m.chat_id = c.id
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT ?
        "#,
    )
    .bind(&fts_query)
    .bind(limit_val)
    .fetch_all(pool)
    .await?;

    Ok(results)
}

pub async fn create_chat_template(
    pool: &SqlitePool,
    name: &str,
    description: Option<&str>,
    system_prompt: Option<&str>,
    default_model: Option<&str>,
) -> ZenResult<crate::db::models::ChatTemplate> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO chat_templates (id, name, description, system_prompt, default_model) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(name)
    .bind(description)
    .bind(system_prompt)
    .bind(default_model)
    .execute(pool)
    .await?;

    let template = sqlx::query_as::<_, crate::db::models::ChatTemplate>(
        "SELECT * FROM chat_templates WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(pool)
    .await?;
    Ok(template)
}

pub async fn list_chat_templates(
    pool: &SqlitePool,
) -> ZenResult<Vec<crate::db::models::ChatTemplate>> {
    let templates = sqlx::query_as::<_, crate::db::models::ChatTemplate>(
        "SELECT * FROM chat_templates ORDER BY name ASC LIMIT ?",
    )
    .bind(MAX_CHAT_TEMPLATE_ITEMS)
    .fetch_all(pool)
    .await?;
    Ok(templates)
}

pub async fn delete_chat_template(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM chat_templates WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn bulk_delete_chats(pool: &SqlitePool, ids: &[String]) -> ZenResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let mut tx = pool.begin().await?;
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!("DELETE FROM chats WHERE id IN ({})", placeholders);
    let mut q = sqlx::query(&query);
    for id in ids {
        q = q.bind(id);
    }
    q.execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn bulk_archive_chats(pool: &SqlitePool, ids: &[String]) -> ZenResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let mut tx = pool.begin().await?;
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!("UPDATE chats SET is_archived = 1, archived_at = datetime('now'), updated_at = datetime('now') WHERE id IN ({})", placeholders);
    let mut q = sqlx::query(&query);
    for id in ids {
        q = q.bind(id);
    }
    q.execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn fork_chat(
    pool: &SqlitePool,
    chat_id: &str,
    up_to_message_id: &str,
) -> ZenResult<Chat> {
    let old_chat = get_chat(pool, chat_id).await?;
    let new_id = Uuid::new_v4().to_string();
    let new_title = format!("{} (Fork)", old_chat.title);

    // Create new chat
    sqlx::query("INSERT INTO chats (id, title, model, pinned, workspace_root) VALUES (?, ?, ?, 0, ?)")
        .bind(&new_id)
        .bind(&new_title)
        .bind(&old_chat.model)
        .bind(&old_chat.workspace_root)
        .execute(pool)
        .await?;

    // Copy messages
    sqlx::query(
        r#"INSERT INTO messages (id, chat_id, role, content, model, is_complete, tool_calls, tool_call_id, images, attachments, tokens_in, tokens_out, created_at)
           SELECT lower(hex(randomblob(16))), ?, role, content, model, is_complete, tool_calls, tool_call_id, images, attachments, tokens_in, tokens_out, created_at
           FROM messages 
           WHERE chat_id = ? AND created_at <= (SELECT created_at FROM messages WHERE id = ?)
           ORDER BY created_at ASC"#
    )
    .bind(&new_id)
    .bind(chat_id)
    .bind(up_to_message_id)
    .execute(pool)
    .await?;

    get_chat(pool, &new_id).await
}

pub async fn add_chat_tag(
    pool: &SqlitePool,
    chat_id: &str,
    tag_name: &str,
    color: Option<String>,
) -> ZenResult<()> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO chat_tags (id, chat_id, name, color) VALUES (?, ?, ?, ?)
         ON CONFLICT(chat_id, name) DO UPDATE SET color = excluded.color",
    )
    .bind(id)
    .bind(chat_id)
    .bind(tag_name)
    .bind(color)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn remove_chat_tag(pool: &SqlitePool, chat_id: &str, tag_name: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM chat_tags WHERE chat_id = ? AND name = ?")
        .bind(chat_id)
        .bind(tag_name)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_chat_tags(
    pool: &SqlitePool,
    chat_id: &str,
) -> ZenResult<Vec<crate::db::models::ChatTag>> {
    list_chat_tags_page(pool, chat_id, MAX_CHAT_TAG_ITEMS, 0).await
}

pub async fn list_chat_tags_page(
    pool: &SqlitePool,
    chat_id: &str,
    limit: i64,
    offset: i64,
) -> ZenResult<Vec<crate::db::models::ChatTag>> {
    let tags = sqlx::query_as::<_, crate::db::models::ChatTag>(
        "SELECT * FROM chat_tags WHERE chat_id = ? ORDER BY name ASC LIMIT ? OFFSET ?",
    )
    .bind(chat_id)
    .bind(limit.clamp(1, MAX_CHAT_TAG_ITEMS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await?;
    Ok(tags)
}

pub async fn list_all_chat_tags(pool: &SqlitePool) -> ZenResult<Vec<crate::db::models::ChatTag>> {
    list_all_chat_tags_page(pool, MAX_ALL_CHAT_TAG_ITEMS, 0).await
}

pub async fn list_all_chat_tags_page(
    pool: &SqlitePool,
    limit: i64,
    offset: i64,
) -> ZenResult<Vec<crate::db::models::ChatTag>> {
    let tags = sqlx::query_as::<_, crate::db::models::ChatTag>(
        "SELECT * FROM chat_tags ORDER BY chat_id, name ASC LIMIT ? OFFSET ?",
    )
    .bind(limit.clamp(1, MAX_ALL_CHAT_TAG_ITEMS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await?;
    Ok(tags)
}

pub async fn list_unique_tag_names(pool: &SqlitePool) -> ZenResult<Vec<String>> {
    list_unique_tag_names_page(pool, MAX_UNIQUE_TAG_ITEMS, 0).await
}

pub async fn list_unique_tag_names_page(
    pool: &SqlitePool,
    limit: i64,
    offset: i64,
) -> ZenResult<Vec<String>> {
    let tags = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT name FROM chat_tags ORDER BY name ASC LIMIT ? OFFSET ?",
    )
    .bind(limit.clamp(1, MAX_UNIQUE_TAG_ITEMS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await?;
    Ok(tags)
}
