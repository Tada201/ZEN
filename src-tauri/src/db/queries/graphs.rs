use crate::error::ZenResult;
use sqlx::SqlitePool;

// --- Graph Sessions ---

use crate::db::models::GraphSessionDb;

pub async fn get_or_create_graph_session(
    pool: &SqlitePool,
    session_id: &str,
    chat_id: &str,
    name: &str,
) -> ZenResult<GraphSessionDb> {
    // Try to get existing session
    let existing = sqlx::query_as::<_, GraphSessionDb>("SELECT * FROM graph_sessions WHERE id = ?")
        .bind(session_id)
        .fetch_optional(pool)
        .await.map_err(crate::error::db_err)?;

    if let Some(session) = existing {
        return Ok(session);
    }

    // Create new session
    sqlx::query(
        r#"INSERT INTO graph_sessions (id, chat_id, name, expressions, variables, viewport_x_min, viewport_x_max, viewport_y_min, viewport_y_max)
           VALUES (?, ?, ?, '[]', '{}', -10.0, 10.0, -10.0, 10.0)"#
    )
    .bind(session_id)
    .bind(chat_id)
    .bind(name)
    .execute(pool)
    .await.map_err(crate::error::db_err)?;

    // Fetch the newly created session (non-recursive)
    let session = sqlx::query_as::<_, GraphSessionDb>("SELECT * FROM graph_sessions WHERE id = ?")
        .bind(session_id)
        .fetch_one(pool)
        .await.map_err(crate::error::db_err)?;

    Ok(session)
}

/// Parameters for saving/updating a graph session.
pub struct GraphSessionUpdate<'a> {
    pub session_id: &'a str,
    pub expressions_json: &'a str,
    pub variables_json: &'a str,
    pub viewport_x_min: f64,
    pub viewport_x_max: f64,
    pub viewport_y_min: f64,
    pub viewport_y_max: f64,
    pub current_version: i64,
    pub history_json: &'a str,
}

pub async fn save_graph_session(
    pool: &SqlitePool,
    update: &GraphSessionUpdate<'_>,
) -> ZenResult<()> {
    sqlx::query(
        r#"UPDATE graph_sessions 
           SET expressions = ?, variables = ?, viewport_x_min = ?, viewport_x_max = ?, 
               viewport_y_min = ?, viewport_y_max = ?, current_version = ?, history = ?,
               updated_at = datetime('now')
           WHERE id = ?"#,
    )
    .bind(update.expressions_json)
    .bind(update.variables_json)
    .bind(update.viewport_x_min)
    .bind(update.viewport_x_max)
    .bind(update.viewport_y_min)
    .bind(update.viewport_y_max)
    .bind(update.current_version)
    .bind(update.history_json)
    .bind(update.session_id)
    .execute(pool)
    .await.map_err(crate::error::db_err)?;
    Ok(())
}

pub async fn get_graph_session(
    pool: &SqlitePool,
    session_id: &str,
) -> ZenResult<Option<GraphSessionDb>> {
    let session = sqlx::query_as::<_, GraphSessionDb>("SELECT * FROM graph_sessions WHERE id = ?")
        .bind(session_id)
        .fetch_optional(pool)
        .await.map_err(crate::error::db_err)?;
    Ok(session)
}

pub async fn delete_graph_session(pool: &SqlitePool, session_id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM graph_sessions WHERE id = ?")
        .bind(session_id)
        .execute(pool)
        .await.map_err(crate::error::db_err)?;
    Ok(())
}

// --- Drawing Canvases ---

use crate::db::models::DrawingCanvasDb;

pub async fn get_or_create_drawing_canvas(
    pool: &SqlitePool,
    canvas_id: &str,
    chat_id: &str,
    name: &str,
) -> ZenResult<DrawingCanvasDb> {
    let existing =
        sqlx::query_as::<_, DrawingCanvasDb>("SELECT * FROM drawing_canvases WHERE id = ?")
            .bind(canvas_id)
            .fetch_optional(pool)
            .await.map_err(crate::error::db_err)?;

    if let Some(canvas) = existing {
        return Ok(canvas);
    }

    sqlx::query(
        r#"INSERT INTO drawing_canvases (id, chat_id, name, objects, background)
           VALUES (?, ?, ?, '[]', '#050505')"#,
    )
    .bind(canvas_id)
    .bind(chat_id)
    .bind(name)
    .execute(pool)
    .await.map_err(crate::error::db_err)?;

    // Fetch the newly created canvas (non-recursive)
    let canvas =
        sqlx::query_as::<_, DrawingCanvasDb>("SELECT * FROM drawing_canvases WHERE id = ?")
            .bind(canvas_id)
            .fetch_one(pool)
            .await.map_err(crate::error::db_err)?;

    Ok(canvas)
}

pub async fn save_drawing_canvas(
    pool: &SqlitePool,
    canvas_id: &str,
    objects_json: &str,
    background: &str,
) -> ZenResult<()> {
    sqlx::query(
        r#"UPDATE drawing_canvases 
           SET objects = ?, background = ?, updated_at = datetime('now')
           WHERE id = ?"#,
    )
    .bind(objects_json)
    .bind(background)
    .bind(canvas_id)
    .execute(pool)
    .await.map_err(crate::error::db_err)?;
    Ok(())
}
