//! Inline schema migrations, no external files (split from the old
//! 1,056-line db/mod.rs in BIG_MIGRATION Phase 3; statement order and SQL
//! text preserved verbatim).

pub(super) mod agent;
pub(super) mod automation;
pub(super) mod chats;
pub(super) mod core_tables;
pub(super) mod documents;
pub(super) mod graphs;
pub(super) mod gtsm;
pub(super) mod ops;
pub(super) mod telemetry;
pub(super) mod traces;
pub(super) mod workbench;

use sqlx::SqlitePool;
use zen_core::ZenResult;

pub(crate) async fn run_migrations(pool: &SqlitePool) -> ZenResult<()> {
    // Connection pragmas. journal_mode=WAL must be set before any table
    // creation; each PRAGMA is a separate query (sqlx only executes the
    // first statement in a multi-statement string).

    core_tables::core_tables(pool).await?;
    workbench::workbench(pool).await?;
    documents::documents(pool).await?;
    ops::ops_security(pool).await?;
    // session permission seed (queries)
    crate::queries::init_session_permissions(pool).await?;
    ops::settings(pool).await?;
    telemetry::telemetry(pool).await?;
    graphs::graphs_canvas(pool).await?;
    gtsm::gtsm_core(pool).await?;
    chats::chats_meta(pool).await?;
    chats::templates_tags(pool).await?;
    agent::clarification(pool).await?;
    agent::artifacts_orch(pool).await?;
    automation::automation(pool).await?;
    automation::message_alters(pool).await?;
    traces::traces(pool).await?;
    // legacy trace upgrade (idempotent)
    crate::queries::migrate_legacy_trace_rows(pool).await?;
    gtsm::gtsm_layers(pool).await?;
    agent::thread_goals(pool).await?;

    tracing::info!("Database migrations complete");
    Ok(())
}
