//! Pool construction and connection policy (from db/mod.rs, Phase 3).

use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use tracing::info;
use zen_core::ZenResult;

pub async fn init_pool(db_path: &Path) -> ZenResult<SqlitePool> {
    // Ensure parent directory exists
    if let Some(parent) = db_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
    info!(path = %db_path.display(), "Opening SQLite database");

    // SQLite permits many readers but still has one writer at a time. The
    // application persists user messages, assistant lifecycle state, tool
    // traces, and recovery checkpoints concurrently, so a pool connection
    // must wait for the active writer instead of failing immediately with
    // SQLITE_BUSY ("database is locked"). Keep this policy here so every
    // database caller receives the same connection behavior.
    //
    // journal_mode must be set on the CONNECT OPTIONS, not via a post-connect
    // `PRAGMA journal_mode = WAL` statement: sqlx pooled connections do not
    // keep a pragma-set WAL across the connection lifecycle, so fresh
    // databases silently stayed in rollback-journal mode (the FK-read write
    // path then fails with immediate SQLITE_BUSY instead of waiting — the
    // competing-writer test caught this). Options-level WAL is applied by
    // sqlx on every open, which both persists it for fresh databases and
    // keeps existing WAL databases unchanged. (The redundant WAL statement in
    // migrations is retained as a no-op reassertion.)
    let connect_options = SqliteConnectOptions::from_str(&db_url)
        .map_err(crate::db_err)?
        .busy_timeout(Duration::from_secs(10))
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await.map_err(crate::db_err)?;

    // Run migrations (embedded SQL)
    crate::migrations::run_migrations(&pool).await?;

    info!("Database initialized successfully");
    Ok(pool)
}


#[cfg(test)]
mod tests {
    use super::init_pool;
    use crate::queries::{add_message, create_chat, NewMessage};
    use std::time::Duration;
    use tempfile::tempdir;

    #[tokio::test]
    async fn waits_for_a_competing_writer_before_returning_database_locked() {
        let dir = tempdir().expect("temporary database directory");
        let pool = init_pool(&dir.path().join("zen.db"))
            .await
            .expect("database should initialize");
        let chat = create_chat(&pool, "Lock test", None, None)
            .await
            .expect("chat should be created");

        let mut held = pool.begin().await.expect("lock transaction should begin");
        sqlx::query("UPDATE chats SET title = ? WHERE id = ?")
            .bind("Writer 1")
            .bind(&chat.id)
            .execute(&mut *held)
            .await
            .expect("lock transaction should acquire the write lock");

        let writer_pool = pool.clone();
        let chat_id = chat.id.clone();
        let pending_writer = tokio::spawn(async move {
            add_message(
                &writer_pool,
                &NewMessage {
                    chat_id: &chat_id,
                    role: "user",
                    content: "Writer 2",
                    is_complete: true,
                    ..Default::default()
                },
            )
            .await
        });

        // Give the second writer a chance to reach SQLite while the first
        // transaction still owns the lock. Without busy_timeout this returns
        // SQLITE_BUSY immediately; with the shared connection policy it waits.
        tokio::time::sleep(Duration::from_millis(50)).await;
        held.commit().await.expect("first writer should commit");

        pending_writer
            .await
            .expect("writer task should not panic")
            .expect("second writer should wait and then commit");
    }
}

