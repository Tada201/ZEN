use crate::models::WorkbenchTab;
use zen_core::ZenResult;
use sqlx::SqlitePool;

pub async fn list_workbench_tabs(pool: &SqlitePool, chat_id: &str) -> ZenResult<Vec<WorkbenchTab>> {
    sqlx::query_as::<_, WorkbenchTab>(
        "SELECT id, chat_id, view_id, label, position, state_json, created_at, updated_at
         FROM workbench_tabs WHERE chat_id = ? ORDER BY position ASC, created_at ASC",
    )
    .bind(chat_id)
    .fetch_all(pool)
    .await
    .map_err(crate::db_err)
}

pub async fn upsert_workbench_tab(
    pool: &SqlitePool,
    tab: &WorkbenchTab,
) -> ZenResult<()> {
    sqlx::query(
        "INSERT INTO workbench_tabs (id, chat_id, view_id, label, position, state_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           chat_id = excluded.chat_id,
           view_id = excluded.view_id,
           label = excluded.label,
           position = excluded.position,
           state_json = excluded.state_json,
           updated_at = datetime('now')",
    )
    .bind(&tab.id)
    .bind(&tab.chat_id)
    .bind(&tab.view_id)
    .bind(&tab.label)
    .bind(tab.position)
    .bind(&tab.state_json)
    .execute(pool)
    .await.map_err(crate::db_err)?;
    Ok(())
}

pub async fn delete_workbench_tab(pool: &SqlitePool, chat_id: &str, tab_id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM workbench_tabs WHERE chat_id = ? AND id = ?")
        .bind(chat_id)
        .bind(tab_id)
        .execute(pool)
        .await.map_err(crate::db_err)?;
    Ok(())
}
