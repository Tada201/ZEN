use sqlx::SqlitePool;
use tracing::info;
use zen_core::ZenResult;

pub(super) async fn clarification(pool: &SqlitePool) -> ZenResult<()> {
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
    .await.map_err(crate::db_err)?;
    Ok(())
}

pub(super) async fn artifacts_orch(pool: &SqlitePool) -> ZenResult<()> {
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
    .await.map_err(crate::db_err)?;

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
    .await.map_err(crate::db_err)?;

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
    .await.map_err(crate::db_err)?
    .unwrap_or_default();

    if !plan_table_sql.is_empty() && !plan_table_sql.contains("'planning'") {
        info!("Upgrading 'orchestration_plans' table schema to support new statuses");

        sqlx::query("PRAGMA foreign_keys = OFF;")
            .execute(pool)
            .await.map_err(crate::db_err)?;
        sqlx::query("BEGIN TRANSACTION;").execute(pool).await.map_err(crate::db_err)?;
        sqlx::query("ALTER TABLE orchestration_plans RENAME TO orchestration_plans_old;")
            .execute(pool)
            .await.map_err(crate::db_err)?;
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
        "#).execute(pool).await.map_err(crate::db_err)?;
        sqlx::query("INSERT INTO orchestration_plans SELECT * FROM orchestration_plans_old;")
            .execute(pool)
            .await.map_err(crate::db_err)?;
        sqlx::query("DROP TABLE orchestration_plans_old;")
            .execute(pool)
            .await.map_err(crate::db_err)?;
        sqlx::query("COMMIT;").execute(pool).await.map_err(crate::db_err)?;
        sqlx::query("PRAGMA foreign_keys = ON;")
            .execute(pool)
            .await.map_err(crate::db_err)?;
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
    .await.map_err(crate::db_err)?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_orchestration_tasks_plan ON orchestration_tasks(plan_id);",
    )
    .execute(pool)
    .await;
    Ok(())
}

pub(super) async fn thread_goals(pool: &SqlitePool) -> ZenResult<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS thread_goals (
            chat_id     TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
            objective   TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'active',
            turns_count INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}
