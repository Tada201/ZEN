use crate::db::models::*;
use crate::error::ZenResult;
use sqlx::SqlitePool;

// --- Documents ---

pub async fn add_document(
    pool: &SqlitePool,
    id: &str,
    filename: &str,
    file_path: &str,
    file_size: i64,
    doc_type: &str,
    embedding_model: &str,
    mime_type: &str,
) -> ZenResult<crate::db::models::Document> {
    sqlx::query(
        "INSERT INTO documents (id, filename, file_path, file_size, doc_type, embedding_model, mime_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'processing')"
    )
    .bind(id)
    .bind(filename)
    .bind(file_path)
    .bind(file_size)
    .bind(doc_type)
    .bind(embedding_model)
    .bind(mime_type)
    .execute(pool)
    .await?;

    get_document(pool, id).await
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

pub async fn list_documents(pool: &SqlitePool) -> ZenResult<Vec<crate::db::models::Document>> {
    let docs = sqlx::query_as::<_, crate::db::models::Document>(
        "SELECT * FROM documents ORDER BY created_at DESC",
    )
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

pub async fn list_chats(pool: &SqlitePool) -> ZenResult<Vec<Chat>> {
    let chats = sqlx::query_as::<_, Chat>(
        "SELECT c.id, c.title, c.model, c.created_at, c.updated_at, c.pinned, c.is_archived, c.archived_at, c.message_count, c.total_tokens_in, c.total_tokens_out, c.last_activity, COALESCE(c.folder_id, cfm.folder_id) as folder_id FROM chats c LEFT JOIN chat_folder_members cfm ON c.id = cfm.chat_id WHERE c.is_archived = 0 OR c.is_archived IS NULL ORDER BY c.updated_at DESC"
    )
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
