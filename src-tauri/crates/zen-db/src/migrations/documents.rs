use sqlx::SqlitePool;
use tracing::info;
use zen_core::ZenResult;

pub(super) async fn documents(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS documents (
            id              TEXT PRIMARY KEY,
            filename        TEXT NOT NULL,
            mime_type       TEXT,
            file_path       TEXT,
            file_size       INTEGER,
            doc_type        TEXT CHECK(doc_type IN ('pdf','txt','md','docx','url','image')),
            status          TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','indexed','failed','workspace')),
            error_msg       TEXT,
            workspace       TEXT DEFAULT 'default',
            embedding_model TEXT,
            created_at      TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    // Migration Fix: Ensure 'documents' table status CHECK constraint includes 'workspace'
    let table_sql: String =
        sqlx::query_scalar("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'")
            .fetch_optional(pool)
            .await.map_err(crate::db_err)?
            .unwrap_or_default();

    if (!table_sql.is_empty() && !table_sql.contains("'workspace'")) || table_sql.is_empty() {
        // Double check if documents_old exists (implies a failed previous migration)
        let old_table_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='documents_old')")
            .fetch_one(pool)
            .await.map_err(crate::db_err)?;

        if !table_sql.contains("'workspace'") || old_table_exists {
            info!("Upgrading 'documents' table schema to support 'workspace' status (Old table exists: {})", old_table_exists);

            let mut migration_query = String::new();
            migration_query.push_str("PRAGMA foreign_keys = OFF; BEGIN TRANSACTION;");

            if !table_sql.is_empty() && !old_table_exists {
                migration_query.push_str("ALTER TABLE documents RENAME TO documents_old;");
            }

            migration_query.push_str(r#"
                CREATE TABLE IF NOT EXISTS documents (
                    id              TEXT PRIMARY KEY,
                    filename        TEXT NOT NULL,
                    mime_type       TEXT,
                    file_path       TEXT,
                    file_size       INTEGER,
                    doc_type        TEXT CHECK(doc_type IN ('pdf','txt','md','docx','url','image')),
                    status          TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','indexed','failed','workspace')),
                    error_msg       TEXT,
                    workspace       TEXT DEFAULT 'default',
                    embedding_model TEXT,
                    created_at      TEXT DEFAULT (datetime('now'))
                );
            "#);

            if old_table_exists || (!table_sql.is_empty()) {
                migration_query.push_str(
                    "INSERT INTO documents SELECT * FROM documents_old; DROP TABLE documents_old;",
                );
            }

            migration_query.push_str("COMMIT; PRAGMA foreign_keys = ON;");

            sqlx::query(&migration_query).execute(pool).await.map_err(crate::db_err)?;
            info!("'documents' table migration completed successfully");
        }
    }

    // Chat-scoped attachment columns (idempotent). See documents.rs.
    crate::queries::documents::migrate_chat_attachment_columns(pool).await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS document_chunks (
            id              TEXT PRIMARY KEY,
            document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            chunk_index     INTEGER NOT NULL,
            content         TEXT NOT NULL,
            token_count     INTEGER,
            start_offset    INTEGER,
            end_offset      INTEGER
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(document_id);")
        .execute(pool)
        .await.map_err(crate::db_err)?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS embeddings_metadata (
            id              TEXT PRIMARY KEY,
            model_name      TEXT NOT NULL,
            model_hash      TEXT,
            dimension       INTEGER NOT NULL,
            chunk_size      INTEGER DEFAULT 512,
            chunk_overlap   INTEGER DEFAULT 100,
            created_at      TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}
