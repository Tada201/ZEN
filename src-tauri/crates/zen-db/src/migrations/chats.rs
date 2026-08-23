use sqlx::SqlitePool;
use zen_core::ZenResult;

pub(super) async fn chats_meta(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS chat_folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            icon TEXT,
            parent_folder_id TEXT REFERENCES chat_folders(id),
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS chat_folder_members (
            folder_id TEXT NOT NULL REFERENCES chat_folders(id) ON DELETE CASCADE,
            chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (folder_id, chat_id)
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_chat_folder_members_chat_id ON chat_folder_members(chat_id);").execute(pool).await;
    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_chat_folder_members_folder_id ON chat_folder_members(folder_id);").execute(pool).await;

    // Archive and Metadata for chats
    let _ = sqlx::query("ALTER TABLE chats ADD COLUMN is_archived INTEGER DEFAULT 0;")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE chats ADD COLUMN archived_at DATETIME;")
        .execute(pool)
        .await;
    let _ = sqlx::query(
        "UPDATE chats SET is_archived = 0 WHERE is_archived = 1 AND archived_at IS NULL;",
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_chats_archived ON chats(is_archived, archived_at);",
    )
    .execute(pool)
    .await;

    let _ = sqlx::query("ALTER TABLE chats ADD COLUMN message_count INTEGER DEFAULT 0;")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE chats ADD COLUMN total_tokens_in INTEGER DEFAULT 0;")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE chats ADD COLUMN total_tokens_out INTEGER DEFAULT 0;")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE chats ADD COLUMN last_activity DATETIME;")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE chats ADD COLUMN folder_id TEXT;")
        .execute(pool)
        .await;
    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_chats_last_activity ON chats(last_activity DESC);",
    )
    .execute(pool)
    .await;

    // Action timeline support for messages
    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN kind TEXT DEFAULT 'text';")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN metadata TEXT;")
        .execute(pool)
        .await;
    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_kind ON messages(kind);")
        .execute(pool)
        .await;

    // Full Text Search for Messages
    sqlx::query(
        r#"
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
            content,
            role,
            chat_id,
            content='messages',
            content_rowid='rowid'
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    sqlx::query(
        r#"
        CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
            INSERT INTO messages_fts(rowid, content, role, chat_id) 
            VALUES (NEW.rowid, NEW.content, NEW.role, NEW.chat_id);
        END;
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    sqlx::query(
        r#"
        CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
            INSERT INTO messages_fts(messages_fts, rowid, content, role, chat_id) 
            VALUES ('delete', OLD.rowid, OLD.content, OLD.role, OLD.chat_id);
        END;
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    sqlx::query(
        r#"
        CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
            INSERT INTO messages_fts(messages_fts, rowid, content, role, chat_id) 
            VALUES ('delete', OLD.rowid, OLD.content, OLD.role, OLD.chat_id);
            INSERT INTO messages_fts(rowid, content, role, chat_id) 
            VALUES (NEW.rowid, NEW.content, NEW.role, NEW.chat_id);
        END;
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}

pub(super) async fn templates_tags(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS chat_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            system_prompt TEXT,
            default_model TEXT,
            folder_id TEXT REFERENCES chat_folders(id),
            is_global INTEGER DEFAULT 1,
            initial_messages_json TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;

    // ── Phase 3: Differentiators (Tags) ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS chat_tags (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            color TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(chat_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_chat_tags_chat_id ON chat_tags(chat_id);
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}
