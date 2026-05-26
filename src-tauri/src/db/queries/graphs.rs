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
        .await?;

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
    .await?;

    // Fetch the newly created session (non-recursive)
    let session = sqlx::query_as::<_, GraphSessionDb>("SELECT * FROM graph_sessions WHERE id = ?")
        .bind(session_id)
        .fetch_one(pool)
        .await?;

    Ok(session)
}

pub async fn save_graph_session(
    pool: &SqlitePool,
    session_id: &str,
    expressions_json: &str,
    variables_json: &str,
    viewport_x_min: f64,
    viewport_x_max: f64,
    viewport_y_min: f64,
    viewport_y_max: f64,
    current_version: i64,
    history_json: &str,
) -> ZenResult<()> {
    sqlx::query(
        r#"UPDATE graph_sessions 
           SET expressions = ?, variables = ?, viewport_x_min = ?, viewport_x_max = ?, 
               viewport_y_min = ?, viewport_y_max = ?, current_version = ?, history = ?,
               updated_at = datetime('now')
           WHERE id = ?"#,
    )
    .bind(expressions_json)
    .bind(variables_json)
    .bind(viewport_x_min)
    .bind(viewport_x_max)
    .bind(viewport_y_min)
    .bind(viewport_y_max)
    .bind(current_version)
    .bind(history_json)
    .bind(session_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_graph_session(
    pool: &SqlitePool,
    session_id: &str,
) -> ZenResult<Option<GraphSessionDb>> {
    let session = sqlx::query_as::<_, GraphSessionDb>("SELECT * FROM graph_sessions WHERE id = ?")
        .bind(session_id)
        .fetch_optional(pool)
        .await?;
    Ok(session)
}

pub async fn delete_graph_session(pool: &SqlitePool, session_id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM graph_sessions WHERE id = ?")
        .bind(session_id)
        .execute(pool)
        .await?;
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
            .await?;

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
    .await?;

    // Fetch the newly created canvas (non-recursive)
    let canvas =
        sqlx::query_as::<_, DrawingCanvasDb>("SELECT * FROM drawing_canvases WHERE id = ?")
            .bind(canvas_id)
            .fetch_one(pool)
            .await?;

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
    .await?;
    Ok(())
}
