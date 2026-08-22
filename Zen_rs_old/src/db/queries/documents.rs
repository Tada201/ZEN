use crate::db::models::*;
use crate::error::ZenResult;
use sqlx::{Row, SqlitePool};

const MAX_DOCUMENT_LIST_ITEMS: i64 = 1_000;
const MAX_CHAT_LIST_ITEMS: i64 = 500;

// --- Documents ---

/// Idempotently add the chat-scoped attachment columns + index. Extracted from
/// the schema bootstrap to keep db/mod.rs under the file-size cap; each ALTER
/// is ignored if the column already exists (SQLite has no ADD COLUMN IF NOT
/// EXISTS).
pub async fn migrate_chat_attachment_columns(pool: &SqlitePool) -> ZenResult<()> {
    for col in [
        "ALTER TABLE documents ADD COLUMN chat_id TEXT;",
        "ALTER TABLE documents ADD COLUMN token_estimate INTEGER;",
        "ALTER TABLE documents ADD COLUMN page_count INTEGER;",
        "ALTER TABLE documents ADD COLUMN sheet_names TEXT;",
        "ALTER TABLE documents ADD COLUMN content_hash TEXT;",
    ] {
        let _ = sqlx::query(col).execute(pool).await;
    }
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_documents_chat ON documents(chat_id);")
        .execute(pool)
        .await?;
    Ok(())
}

/// Parameters for inserting a new document.
pub struct NewDocument<'a> {
    pub id: &'a str,
    pub filename: &'a str,
    pub file_path: &'a str,
    pub file_size: i64,
    pub doc_type: &'a str,
    pub embedding_model: &'a str,
    pub mime_type: &'a str,
}

pub async fn add_document(
    pool: &SqlitePool,
    doc: &NewDocument<'_>,
) -> ZenResult<crate::db::models::Document> {
    sqlx::query(
        "INSERT INTO documents (id, filename, file_path, file_size, doc_type, embedding_model, mime_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'processing')"
    )
    .bind(doc.id)
    .bind(doc.filename)
    .bind(doc.file_path)
    .bind(doc.file_size)
    .bind(doc.doc_type)
    .bind(doc.embedding_model)
    .bind(doc.mime_type)
    .execute(pool)
    .await?;

    get_document(pool, doc.id).await
}

pub async fn link_document_to_workspace(
    pool: &SqlitePool,
    id: &str,
    filename: &str,
    file_path: &str,
    file_size: i64,
    doc_type: &str,
    mime_type: &str,
) -> ZenResult<crate::db::models::Document> {
    sqlx::query(
        "INSERT INTO documents (id, filename, file_path, file_size, doc_type, mime_type, status, workspace) VALUES (?, ?, ?, ?, ?, ?, 'workspace', 'default')"
    )
    .bind(id)
    .bind(filename)
    .bind(file_path)
    .bind(file_size)
    .bind(doc_type)
    .bind(mime_type)
    .execute(pool)
    .await?;

    get_document(pool, id).await
}

pub async fn get_document(pool: &SqlitePool, id: &str) -> ZenResult<crate::db::models::Document> {
    let doc =
        sqlx::query_as::<_, crate::db::models::Document>("SELECT * FROM documents WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await?;
    Ok(doc)
}

/// Parameters for inserting a chat-scoped attachment. Distinct from
/// `NewDocument` (workspace/RAG ingest) — an attachment is owned by a chat,
/// stored in the content-addressed blob store, and carries retrieval metadata
/// (token estimate, page/sheet counts) so `list_documents` can return decision
/// signals without reading content.
pub struct NewChatAttachment<'a> {
    pub id: &'a str,
    pub chat_id: &'a str,
    pub filename: &'a str,
    pub file_path: &'a str,
    pub file_size: i64,
    pub doc_type: &'a str,
    pub mime_type: &'a str,
    pub content_hash: &'a str,
    pub token_estimate: i64,
    pub page_count: Option<i64>,
    pub sheet_names: Option<&'a str>,
}

pub async fn add_chat_attachment(
    pool: &SqlitePool,
    doc: &NewChatAttachment<'_>,
) -> ZenResult<crate::db::models::Document> {
    sqlx::query(
        "INSERT INTO documents (id, chat_id, filename, file_path, file_size, doc_type, mime_type, content_hash, token_estimate, page_count, sheet_names, status) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed')",
    )
    .bind(doc.id)
    .bind(doc.chat_id)
    .bind(doc.filename)
    .bind(doc.file_path)
    .bind(doc.file_size)
    .bind(doc.doc_type)
    .bind(doc.mime_type)
    .bind(doc.content_hash)
    .bind(doc.token_estimate)
    .bind(doc.page_count)
    .bind(doc.sheet_names)
    .execute(pool)
    .await?;

    get_document(pool, doc.id).await
}

/// Attachments owned by a single chat, newest first.
pub async fn list_documents_for_chat(
    pool: &SqlitePool,
    chat_id: &str,
) -> ZenResult<Vec<crate::db::models::Document>> {
    let docs = sqlx::query_as::<_, crate::db::models::Document>(
        "SELECT * FROM documents WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .bind(chat_id)
    .bind(MAX_DOCUMENT_LIST_ITEMS)
    .fetch_all(pool)
    .await?;
    Ok(docs)
}

/// Number of attachments already on a chat (for the per-chat file-count cap).
pub async fn count_documents_for_chat(pool: &SqlitePool, chat_id: &str) -> ZenResult<i64> {
    Ok(
        sqlx::query("SELECT COUNT(*) AS count FROM documents WHERE chat_id = ?")
            .bind(chat_id)
            .fetch_one(pool)
            .await?
            .get::<i64, _>("count"),
    )
}

/// How many document rows still reference a blob hash (GC ref-counting).
pub async fn count_documents_by_hash(pool: &SqlitePool, content_hash: &str) -> ZenResult<i64> {
    Ok(
        sqlx::query("SELECT COUNT(*) AS count FROM documents WHERE content_hash = ?")
            .bind(content_hash)
            .fetch_one(pool)
            .await?
            .get::<i64, _>("count"),
    )
}

/// Delete every attachment row for a chat, returning the deleted rows so the
/// caller can GC now-unreferenced blobs. Application-level cascade — SQLite
/// cannot add the FK via ALTER TABLE on the existing table.
pub async fn delete_documents_for_chat(
    pool: &SqlitePool,
    chat_id: &str,
) -> ZenResult<Vec<crate::db::models::Document>> {
    let docs = list_documents_for_chat(pool, chat_id).await?;
    sqlx::query("DELETE FROM documents WHERE chat_id = ?")
        .bind(chat_id)
        .execute(pool)
        .await?;
    Ok(docs)
}

pub async fn list_documents(pool: &SqlitePool) -> ZenResult<Vec<crate::db::models::Document>> {
    list_documents_page(pool, MAX_DOCUMENT_LIST_ITEMS, 0).await
}

pub async fn list_documents_page(
    pool: &SqlitePool,
    limit: i64,
    offset: i64,
) -> ZenResult<Vec<crate::db::models::Document>> {
    let docs = sqlx::query_as::<_, crate::db::models::Document>(
        "SELECT * FROM documents ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .bind(limit.clamp(1, MAX_DOCUMENT_LIST_ITEMS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await?;
    Ok(docs)
}

pub async fn update_document_status(
    pool: &SqlitePool,
    id: &str,
    status: &str,
    error_msg: Option<&str>,
) -> ZenResult<()> {
    sqlx::query("UPDATE documents SET status = ?, error_msg = ? WHERE id = ?")
        .bind(status)
        .bind(error_msg)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn add_document_chunk(
    pool: &SqlitePool,
    id: &str,
    document_id: &str,
    chunk_index: i64,
    content: &str,
    token_count: i64,
) -> ZenResult<()> {
    sqlx::query(
        "INSERT INTO document_chunks (id, document_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id)
    .bind(document_id)
    .bind(chunk_index)
    .bind(content)
    .bind(token_count)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_document(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM documents WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn count_chats(pool: &SqlitePool) -> ZenResult<i64> {
    Ok(sqlx::query("SELECT COUNT(*) AS count FROM chats").fetch_one(pool).await?.get::<i64, _>("count"))
}

pub async fn list_all_chats_for_backup(pool: &SqlitePool) -> ZenResult<Vec<Chat>> {
    sqlx::query_as::<_, Chat>("SELECT c.id, c.title, c.model, c.created_at, c.updated_at, c.pinned, c.is_archived, c.archived_at, c.message_count, c.total_tokens_in, c.total_tokens_out, c.last_activity, COALESCE(c.folder_id, cfm.folder_id) as folder_id, c.workspace_root FROM chats c LEFT JOIN chat_folder_members cfm ON c.id = cfm.chat_id ORDER BY c.created_at ASC, c.id ASC")
        .fetch_all(pool).await.map_err(Into::into)
}

pub async fn list_chats(pool: &SqlitePool) -> ZenResult<Vec<Chat>> {
    list_chats_page(pool, MAX_CHAT_LIST_ITEMS, 0).await
}

pub async fn list_chats_page(pool: &SqlitePool, limit: i64, offset: i64) -> ZenResult<Vec<Chat>> {
    let chats = sqlx::query_as::<_, Chat>(
        "SELECT c.id, c.title, c.model, c.created_at, c.updated_at, c.pinned, c.is_archived, c.archived_at, c.message_count, c.total_tokens_in, c.total_tokens_out, c.last_activity, COALESCE(c.folder_id, cfm.folder_id) as folder_id, c.workspace_root FROM chats c LEFT JOIN chat_folder_members cfm ON c.id = cfm.chat_id WHERE c.is_archived = 0 OR c.is_archived IS NULL OR (c.is_archived = 1 AND c.archived_at IS NULL) ORDER BY c.updated_at DESC LIMIT ? OFFSET ?"
    )
    .bind(limit.clamp(1, MAX_CHAT_LIST_ITEMS + 1))
    .bind(offset.max(0))
    .fetch_all(pool)
    .await?;
    Ok(chats)
}

pub async fn update_chat_title(pool: &SqlitePool, id: &str, title: &str) -> ZenResult<()> {
    sqlx::query("UPDATE chats SET title = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(title)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_chat(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM chats WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn toggle_pin_chat(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("UPDATE chats SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
