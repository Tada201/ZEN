pub mod models;
pub mod queries;

use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::path::Path;
use tracing::info;

use crate::error::ZenResult;

/// Initialize the SQLite database: create file, run migrations, return pool.
pub async fn init_pool(db_path: &Path) -> ZenResult<SqlitePool> {
    // Ensure parent directory exists
    if let Some(parent) = db_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
    info!(path = %db_path.display(), "Opening SQLite database");

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // Run migrations (embedded SQL)
    run_migrations(&pool).await?;

    info!("Database initialized successfully");
    Ok(pool)
}

/// Run schema migrations inline — no external migration files needed.
async fn run_migrations(pool: &SqlitePool) -> ZenResult<()> {
    // Each PRAGMA must be a separate query — sqlx only executes the first
    // statement in a multi-statement string, silently ignoring the rest.
    sqlx::query("PRAGMA journal_mode = WAL;")
        .execute(pool)
        .await?;
    sqlx::query("PRAGMA foreign_keys = ON;")
        .execute(pool)
        .await?;
    sqlx::query("PRAGMA synchronous = NORMAL;")
        .execute(pool)
        .await?;
    sqlx::query("PRAGMA cache_size = -64000;")
        .execute(pool)
        .await?;
    sqlx::query("PRAGMA temp_store = MEMORY;")
        .execute(pool)
        .await?;
    sqlx::query("PRAGMA mmap_size = 268435456;")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS chats (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT 'New Chat',
            model       TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now')),
            pinned      INTEGER DEFAULT 0
        );
        "#,
    )
    .execute(pool)
    .await?;

    // Attempt to add columns if the DB already exists from an older version
    let _ = sqlx::query("ALTER TABLE chats ADD COLUMN pinned INTEGER DEFAULT 0;")
        .execute(pool)
        .await;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS messages (
            id           TEXT PRIMARY KEY,
            chat_id      TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            role         TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
            content      TEXT NOT NULL,
            tokens_in    INTEGER,
            tokens_out   INTEGER,
            model        TEXT,
            is_complete  INTEGER DEFAULT 1,
            tool_calls   TEXT,
            tool_call_id TEXT,
            images       TEXT,
            attachments  TEXT,
            kind         TEXT DEFAULT 'text',
            metadata     TEXT,
            created_at   TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    // Attempt to add columns if the DB already exists from an older version
    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN tokens_in INTEGER;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN tokens_out INTEGER;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN model TEXT;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN tool_calls TEXT;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN tool_call_id TEXT;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN images TEXT;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN attachments TEXT;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN is_complete INTEGER DEFAULT 1;")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN kind TEXT DEFAULT 'text';")
        .execute(pool)
        .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN metadata TEXT;")
        .execute(pool)
        .await;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);")
        .execute(pool)
        .await?;

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
    .await?;

    // Migration Fix: Ensure 'documents' table status CHECK constraint includes 'workspace'
    let table_sql: String =
        sqlx::query_scalar("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'")
            .fetch_optional(pool)
            .await?
            .unwrap_or_default();

    if (!table_sql.is_empty() && !table_sql.contains("'workspace'")) || table_sql.is_empty() {
        // Double check if documents_old exists (implies a failed previous migration)
        let old_table_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='documents_old')")
            .fetch_one(pool)
            .await?;

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

            sqlx::query(&migration_query).execute(pool).await?;
            info!("'documents' table migration completed successfully");
        }
    }

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
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(document_id);")
        .execute(pool)
        .await?;

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
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS tools (
            id          TEXT PRIMARY KEY,
            name        TEXT UNIQUE NOT NULL,
            enabled     INTEGER DEFAULT 1,
            config_json TEXT
        );
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS tool_logs (
            id          TEXT PRIMARY KEY,
            tool_id     TEXT REFERENCES tools(id),
            chat_id     TEXT REFERENCES chats(id),
            input_json  TEXT,
            output_json TEXT,
            duration_ms INTEGER,
            status      TEXT CHECK(status IN ('ok','error','timeout')),
            created_at  TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS audit_events (
            id          TEXT PRIMARY KEY,
            timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
            operation   TEXT NOT NULL,
            decision    TEXT NOT NULL,
            caller      TEXT NOT NULL,
            target      TEXT,
            reason      TEXT
        );
        "#,
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp DESC);",
    )
    .execute(pool)
    .await;

    queries::init_session_permissions(pool).await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS settings (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    // Attempt to add columns if the DB already exists from an older version
    let _ =
        sqlx::query("ALTER TABLE settings ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));")
            .execute(pool)
            .await;

    // ── Telemetry snapshots for historical data ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS telemetry_snapshots (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id   TEXT NOT NULL,
            timestamp   INTEGER NOT NULL,
            lat         REAL NOT NULL,
            lon         REAL NOT NULL,
            alt         REAL NOT NULL DEFAULT 0,
            metadata    TEXT
        );
        "#,
    )
    .execute(pool)
    .await?;

    // Indexes for efficient history queries
    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_snap_type_time ON telemetry_snapshots(entity_type, timestamp);"
    ).execute(pool).await;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_snap_entity ON telemetry_snapshots(entity_id, timestamp);",
    )
    .execute(pool)
    .await;

    // ── Graph Sessions ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS graph_sessions (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            nodes TEXT NOT NULL DEFAULT '[]',
            edges TEXT NOT NULL DEFAULT '[]',
            metadata TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_graph_sessions_chat ON graph_sessions(chat_id);",
    )
    .execute(pool)
    .await;

    // ── Drawing Canvases ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS drawing_canvases (
            id              TEXT PRIMARY KEY,
            chat_id         TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            name            TEXT NOT NULL DEFAULT 'Canvas',
            objects         TEXT NOT NULL DEFAULT '[]',  -- JSON array of drawing objects
            background      TEXT DEFAULT '#050505',
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_drawing_canvases_chat ON drawing_canvases(chat_id);",
    )
    .execute(pool)
    .await;

    // ── GTSM Geofences ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS gtsm_geofences (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            geofence_type   TEXT NOT NULL CHECK(geofence_type IN ('circle','polygon','box')),
            center_lat      REAL,
            center_lon      REAL,
            radius_km       REAL,
            polygon_coords  TEXT,  -- JSON array of [lat,lon] pairs
            box_north       REAL,
            box_south       REAL,
            box_east        REAL,
            box_west        REAL,
            alert_enabled   INTEGER DEFAULT 1,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    // ── GTSM Custom Markers ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS gtsm_markers (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            marker_type     TEXT NOT NULL CHECK(marker_type IN ('waypoint','target','poi')),
            lat             REAL NOT NULL,
            lon             REAL NOT NULL,
            alt             REAL DEFAULT 0,
            color           TEXT DEFAULT '#00FF9F',
            icon            TEXT DEFAULT 'default',
            metadata        TEXT,  -- JSON object
            created_at      TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    // ── Phase 1: Chat Session Management ──
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
    .await?;

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
    .await?;

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
    .await?;

    sqlx::query(
        r#"
        CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
            INSERT INTO messages_fts(rowid, content, role, chat_id) 
            VALUES (NEW.rowid, NEW.content, NEW.role, NEW.chat_id);
        END;
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
            INSERT INTO messages_fts(messages_fts, rowid, content, role, chat_id) 
            VALUES ('delete', OLD.rowid, OLD.content, OLD.role, OLD.chat_id);
        END;
        "#,
    )
    .execute(pool)
    .await?;

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
    .await?;

    // ── Phase 2: Enhanced Features ──
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
    .await?;

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
    .await?;

    // Clarification requests for agent interaction
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS clarification_requests (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            question TEXT NOT NULL,
            clarification_type TEXT NOT NULL,
            options TEXT NOT NULL,
            response TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            responded_at DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_clarification_requests_chat_id ON clarification_requests(chat_id);
        "#,
    )
    .execute(pool)
    .await?;

    // ── Artifacts Persistence ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS artifacts (
            id              TEXT PRIMARY KEY,
            chat_id         TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            message_id      TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            artifact_type   TEXT NOT NULL,
            title           TEXT NOT NULL,
            content         TEXT NOT NULL,
            language        TEXT,
            metadata        TEXT, -- JSON e.g., { "currentStep": 2 }
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    // Restore accidentally dropped index for artifacts
    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_artifacts_chat_id ON artifacts(chat_id);")
        .execute(pool)
        .await;

    // ── Orchestration Persistence ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS orchestration_plans (
            id          TEXT PRIMARY KEY,
            chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            goal        TEXT NOT NULL,
            complexity  TEXT,
            status      TEXT NOT NULL CHECK(status IN ('planning', 'executing', 'synthesizing', 'completed', 'failed', 'rejected')),
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_orchestration_plans_chat ON orchestration_plans(chat_id);",
    )
    .execute(pool)
    .await;

    // Migration Fix: Ensure 'orchestration_plans' table status CHECK constraint includes new statuses
    let plan_table_sql: String = sqlx::query_scalar(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='orchestration_plans'",
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or_default();

    if !plan_table_sql.is_empty() && !plan_table_sql.contains("'planning'") {
        info!("Upgrading 'orchestration_plans' table schema to support new statuses");

        sqlx::query("PRAGMA foreign_keys = OFF;")
            .execute(pool)
            .await?;
        sqlx::query("BEGIN TRANSACTION;").execute(pool).await?;
        sqlx::query("ALTER TABLE orchestration_plans RENAME TO orchestration_plans_old;")
            .execute(pool)
            .await?;
        sqlx::query(r#"
            CREATE TABLE orchestration_plans (
                id          TEXT PRIMARY KEY,
                chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                goal        TEXT NOT NULL,
                complexity  TEXT,
                status      TEXT NOT NULL CHECK(status IN ('planning', 'executing', 'synthesizing', 'completed', 'failed', 'rejected')),
                created_at  TEXT DEFAULT (datetime('now')),
                updated_at  TEXT DEFAULT (datetime('now'))
            );
        "#).execute(pool).await?;
        sqlx::query("INSERT INTO orchestration_plans SELECT * FROM orchestration_plans_old;")
            .execute(pool)
            .await?;
        sqlx::query("DROP TABLE orchestration_plans_old;")
            .execute(pool)
            .await?;
        sqlx::query("COMMIT;").execute(pool).await?;
        sqlx::query("PRAGMA foreign_keys = ON;")
            .execute(pool)
            .await?;
        info!("'orchestration_plans' table migration completed successfully");
    }

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS orchestration_tasks (
            id              TEXT PRIMARY KEY,
            plan_id         TEXT NOT NULL REFERENCES orchestration_plans(id) ON DELETE CASCADE,
            description     TEXT NOT NULL,
            agent_id        TEXT NOT NULL,
            priority        INTEGER DEFAULT 0,
            status          TEXT NOT NULL CHECK(status IN ('pending', 'ready', 'running', 'completed', 'failed')),
            dependencies    TEXT NOT NULL, -- JSON array of task IDs
            result          TEXT,
            retry_count     INTEGER DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_orchestration_tasks_plan ON orchestration_tasks(plan_id);",
    )
    .execute(pool)
    .await;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS zen_commands (
            id              TEXT PRIMARY KEY,
            name            TEXT UNIQUE NOT NULL,
            description     TEXT,
            allowed_tools   TEXT, -- JSON array
            instructions    TEXT,
            variables       TEXT, -- JSON array
            enabled         INTEGER DEFAULT 1
        );
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS hooks (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            trigger         TEXT NOT NULL,
            patterns        TEXT, -- JSON array
            enabled         INTEGER DEFAULT 1,
            trigger_count   INTEGER DEFAULT 0
        );
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS hook_logs (
            timestamp       INTEGER NOT NULL,
            hook_id         TEXT NOT NULL REFERENCES hooks(id) ON DELETE CASCADE,
            hook_name       TEXT NOT NULL,
            trigger         TEXT NOT NULL,
            result          TEXT NOT NULL,
            message         TEXT,
            PRIMARY KEY (timestamp, hook_id)
        );
        "#,
    )
    .execute(pool)
    .await?;

    // ── Hierarchical Memory Migrations ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS conversation_summaries (
            id            TEXT PRIMARY KEY,
            chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            summary       TEXT NOT NULL,
            message_count INTEGER,
            token_count   INTEGER,
            created_at    TEXT DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_conversation_summaries_chat ON conversation_summaries(chat_id);"
    )
    .execute(pool)
    .await;

    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN is_compacted INTEGER DEFAULT 0;")
        .execute(pool)
        .await;

    // Reasoning persistence: store Vec<ReasoningBlock> as JSON
    let _ = sqlx::query("ALTER TABLE messages ADD COLUMN reasoning_details TEXT;")
        .execute(pool)
        .await;

    // GTSM GeoJSON Saved Layers table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS gtsm_geojson_layers (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT,
            data        TEXT NOT NULL,
            is_visible  INTEGER NOT NULL DEFAULT 1,
            style       TEXT NOT NULL,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await?;

    info!("Database migrations complete");
    Ok(())
}
