use sqlx::SqlitePool;
use uuid::Uuid;

use crate::db::models::{Artifact, Chat, Message, Setting, OrchestrationPlan, OrchestrationTask};
use crate::error::ZenResult;

// ═══════════════════ Chats ═══════════════════

pub async fn create_chat(pool: &SqlitePool, title: &str, model: Option<&str>) -> ZenResult<Chat> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO chats (id, title, model) VALUES (?, ?, ?)"
    )
    .bind(&id)
    .bind(title)
    .bind(model)
    .execute(pool)
    .await?;

    get_chat(pool, &id).await
}

pub async fn get_chat(pool: &SqlitePool, id: &str) -> ZenResult<Chat> {
    let chat = sqlx::query_as::<_, Chat>(
        "SELECT c.id, c.title, c.model, c.created_at, c.updated_at, c.pinned, c.is_archived, c.archived_at, c.message_count, c.total_tokens_in, c.total_tokens_out, c.last_activity, COALESCE(c.folder_id, cfm.folder_id) as folder_id FROM chats c LEFT JOIN chat_folder_members cfm ON c.id = cfm.chat_id WHERE c.id = ?"
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    Ok(chat)
}

// ═══════════════════ Documents ═══════════════════

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
    let doc = sqlx::query_as::<_, crate::db::models::Document>("SELECT * FROM documents WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await?;
    Ok(doc)
}

pub async fn list_documents(pool: &SqlitePool) -> ZenResult<Vec<crate::db::models::Document>> {
    let docs = sqlx::query_as::<_, crate::db::models::Document>("SELECT * FROM documents ORDER BY created_at DESC")
        .fetch_all(pool)
        .await?;
    Ok(docs)
}

pub async fn update_document_status(pool: &SqlitePool, id: &str, status: &str, error_msg: Option<&str>) -> ZenResult<()> {
    sqlx::query("UPDATE documents SET status = ?, error_msg = ? WHERE id = ?")
        .bind(status)
        .bind(error_msg)
        .bind(id)
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

// ═══════════════════ Messages ═══════════════════

pub async fn add_message(
    pool: &SqlitePool,
    chat_id: &str,
    id: Option<&str>,
    role: &str,
    content: &str,
    model: Option<&str>,
    is_complete: bool,
    tool_calls: Option<&str>,
    tool_call_id: Option<&str>,
    images: Option<&str>,
    attachments: Option<&str>,
    tokens_in: Option<i64>,
    tokens_out: Option<i64>,
    kind: Option<&str>,
    metadata: Option<&str>,
) -> ZenResult<Message> {
    let id = id.map(|s| s.to_string()).unwrap_or_else(|| Uuid::new_v4().to_string());
    sqlx::query(
        "INSERT INTO messages (id, chat_id, role, content, model, is_complete, tool_calls, tool_call_id, images, attachments, tokens_in, tokens_out, kind, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(chat_id)
    .bind(role)
    .bind(content)
    .bind(model)
    .bind(is_complete as i32)
    .bind(tool_calls)
    .bind(tool_call_id)
    .bind(images)
    .bind(attachments)
    .bind(tokens_in)
    .bind(tokens_out)
    .bind(kind)
    .bind(metadata)
    .execute(pool)
    .await?;

    // Update chat metadata: message_count, tokens, updated_at, last_activity
    sqlx::query(
        r#"UPDATE chats 
           SET updated_at = datetime('now'),
               last_activity = datetime('now'),
               message_count = message_count + 1,
               total_tokens_in = total_tokens_in + ?,
               total_tokens_out = total_tokens_out + ?
           WHERE id = ?"#
    )
    .bind(tokens_in.unwrap_or(0))
    .bind(tokens_out.unwrap_or(0))
    .bind(chat_id)
    .execute(pool)
    .await?;

    let msg = sqlx::query_as::<_, Message>("SELECT * FROM messages WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await?;
    Ok(msg)
}

// ──═ Artifacts ═──

pub async fn upsert_artifact(pool: &SqlitePool, art: &Artifact) -> ZenResult<()> {
    sqlx::query(
        r#"
        INSERT INTO artifacts (id, chat_id, message_id, artifact_type, title, content, language, metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            content = excluded.content,
            language = excluded.language,
            metadata = excluded.metadata,
            updated_at = datetime('now')
        "#
    )
    .bind(&art.id)
    .bind(&art.chat_id)
    .bind(&art.message_id)
    .bind(&art.artifact_type)
    .bind(&art.title)
    .bind(&art.content)
    .bind(&art.language)
    .bind(&art.metadata)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_chat_artifacts(pool: &SqlitePool, chat_id: &str) -> ZenResult<Vec<Artifact>> {
    let artifacts = sqlx::query_as::<_, Artifact>(
        "SELECT * FROM artifacts WHERE chat_id = ? ORDER BY created_at DESC"
    )
    .bind(chat_id)
    .fetch_all(pool)
    .await?;
    Ok(artifacts)
}

pub async fn get_all_artifacts(pool: &SqlitePool) -> ZenResult<Vec<Artifact>> {
    let artifacts = sqlx::query_as::<_, Artifact>(
        "SELECT * FROM artifacts ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await?;
    Ok(artifacts)
}

pub async fn delete_artifact(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM artifacts WHERE id = ?")
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_messages(pool: &SqlitePool, chat_id: &str) -> ZenResult<Vec<Message>> {
    let msgs = sqlx::query_as::<_, Message>(
        "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC"
    )
    .bind(chat_id)
    .fetch_all(pool)
    .await?;
    Ok(msgs)
}

pub async fn complete_message(
    pool: &SqlitePool,
    id: &str,
    content: &str,
    tokens_in: Option<i64>,
    tokens_out: Option<i64>,
    tool_calls: Option<&str>,
) -> ZenResult<()> {
    sqlx::query(
        "UPDATE messages SET content = ?, is_complete = 1, tokens_in = ?, tokens_out = ?, tool_calls = ? WHERE id = ?"
    )
    .bind(content)
    .bind(tokens_in)
    .bind(tokens_out)
    .bind(tool_calls)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

// ═══════════════════ Settings ═══════════════════

pub async fn get_setting(pool: &SqlitePool, key: &str) -> ZenResult<Option<String>> {
    let result = sqlx::query_as::<_, Setting>("SELECT * FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(result.map(|s| s.value))
}

pub async fn get_all_settings(pool: &SqlitePool) -> ZenResult<std::collections::HashMap<String, String>> {
    let results = sqlx::query_as::<_, Setting>("SELECT * FROM settings")
        .fetch_all(pool)
        .await?;
    
    let mut map = std::collections::HashMap::new();
    for s in results {
        map.insert(s.key, s.value);
    }
    Ok(map)
}

pub async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> ZenResult<()> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')"
    )
    .bind(key)
    .bind(value)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn bulk_set_settings(pool: &SqlitePool, settings: std::collections::HashMap<String, String>) -> ZenResult<()> {
    let mut tx = pool.begin().await?;
    
    for (key, value) in settings {
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')"
        )
        .bind(&key)
        .bind(&value)
        .bind(&value)
        .execute(&mut *tx)
        .await?;
    }
    
    tx.commit().await?;
    Ok(())
}

pub async fn increment_setting(pool: &SqlitePool, key: &str) -> ZenResult<()> {
    // SQLite doesn't have an easy way to cast and increment a string value in one atomic query
    // so we fetch, increment, and save.
    let current = get_setting(pool, key).await?.unwrap_or_else(|| "0".to_string());
    let new_val: u64 = current.parse().unwrap_or(0) + 1;
    set_setting(pool, key, &new_val.to_string()).await?;
    Ok(())
}

// ═══════════════════ Graph Sessions ═══════════════════

use crate::db::models::GraphSessionDb;

pub async fn get_or_create_graph_session(
    pool: &SqlitePool,
    session_id: &str,
    chat_id: &str,
    name: &str,
) -> ZenResult<GraphSessionDb> {
    // Try to get existing session
    let existing = sqlx::query_as::<_, GraphSessionDb>(
        "SELECT * FROM graph_sessions WHERE id = ?"
    )
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
    let session = sqlx::query_as::<_, GraphSessionDb>(
        "SELECT * FROM graph_sessions WHERE id = ?"
    )
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
           WHERE id = ?"#
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

pub async fn get_graph_session(pool: &SqlitePool, session_id: &str) -> ZenResult<Option<GraphSessionDb>> {
    let session = sqlx::query_as::<_, GraphSessionDb>(
        "SELECT * FROM graph_sessions WHERE id = ?"
    )
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

// ═══════════════════ Drawing Canvases ═══════════════════

use crate::db::models::DrawingCanvasDb;

pub async fn get_or_create_drawing_canvas(
    pool: &SqlitePool,
    canvas_id: &str,
    chat_id: &str,
    name: &str,
) -> ZenResult<DrawingCanvasDb> {
    let existing = sqlx::query_as::<_, DrawingCanvasDb>(
        "SELECT * FROM drawing_canvases WHERE id = ?"
    )
    .bind(canvas_id)
    .fetch_optional(pool)
    .await?;

    if let Some(canvas) = existing {
        return Ok(canvas);
    }

    sqlx::query(
        r#"INSERT INTO drawing_canvases (id, chat_id, name, objects, background)
           VALUES (?, ?, ?, '[]', '#050505')"#
    )
    .bind(canvas_id)
    .bind(chat_id)
    .bind(name)
    .execute(pool)
    .await?;

    // Fetch the newly created canvas (non-recursive)
    let canvas = sqlx::query_as::<_, DrawingCanvasDb>(
        "SELECT * FROM drawing_canvases WHERE id = ?"
    )
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
           WHERE id = ?"#
    )
    .bind(objects_json)
    .bind(background)
    .bind(canvas_id)
    .execute(pool)
    .await?;
    Ok(())
}

// ═══════════════════ GTSM Geofences ═══════════════════

use crate::db::models::GtsmGeofence;

pub async fn list_geofences(pool: &SqlitePool) -> ZenResult<Vec<GtsmGeofence>> {
    let geofences = sqlx::query_as::<_, GtsmGeofence>(
        "SELECT * FROM gtsm_geofences ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await?;
    Ok(geofences)
}

pub async fn save_geofence(pool: &SqlitePool, geofence: &GtsmGeofence) -> ZenResult<()> {
    sqlx::query(
        r#"INSERT INTO gtsm_geofences 
           (id, name, geofence_type, center_lat, center_lon, radius_km, polygon_coords, 
            box_north, box_south, box_east, box_west, alert_enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, geofence_type = excluded.geofence_type,
           center_lat = excluded.center_lat, center_lon = excluded.center_lon,
           radius_km = excluded.radius_km, polygon_coords = excluded.polygon_coords,
           box_north = excluded.box_north, box_south = excluded.box_south,
           box_east = excluded.box_east, box_west = excluded.box_west,
           alert_enabled = excluded.alert_enabled, updated_at = datetime('now')"#
    )
    .bind(&geofence.id)
    .bind(&geofence.name)
    .bind(&geofence.geofence_type)
    .bind(&geofence.center_lat)
    .bind(&geofence.center_lon)
    .bind(&geofence.radius_km)
    .bind(&geofence.polygon_coords)
    .bind(&geofence.box_north)
    .bind(&geofence.box_south)
    .bind(&geofence.box_east)
    .bind(&geofence.box_west)
    .bind(&geofence.alert_enabled)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_geofence(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM gtsm_geofences WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ═══════════════════ GTSM Markers ═══════════════════

use crate::db::models::GtsmMarker;

pub async fn list_markers(pool: &SqlitePool) -> ZenResult<Vec<GtsmMarker>> {
    let markers = sqlx::query_as::<_, GtsmMarker>(
        "SELECT * FROM gtsm_markers ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await?;
    Ok(markers)
}

pub async fn save_marker(pool: &SqlitePool, marker: &GtsmMarker) -> ZenResult<()> {
    sqlx::query(
        r#"INSERT INTO gtsm_markers 
           (id, name, marker_type, lat, lon, alt, color, icon, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, marker_type = excluded.marker_type,
           lat = excluded.lat, lon = excluded.lon, alt = excluded.alt,
           color = excluded.color, icon = excluded.icon, metadata = excluded.metadata"#
    )
    .bind(&marker.id)
    .bind(&marker.name)
    .bind(&marker.marker_type)
    .bind(&marker.lat)
    .bind(&marker.lon)
    .bind(&marker.alt)
    .bind(&marker.color)
    .bind(&marker.icon)
    .bind(&marker.metadata)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_marker(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM gtsm_markers WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ═══════════════════ Chat Session Management (Phase 1) ═══════════════════

use crate::db::models::{ChatFolder, SearchResult};

pub async fn create_chat_folder(
    pool: &SqlitePool,
    name: &str,
    color: Option<&str>,
    icon: Option<&str>,
) -> ZenResult<ChatFolder> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO chat_folders (id, name, color, icon) VALUES (?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(name)
    .bind(color)
    .bind(icon)
    .execute(pool)
    .await?;

    let folder = sqlx::query_as::<_, ChatFolder>("SELECT * FROM chat_folders WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await?;
    Ok(folder)
}

pub async fn update_chat_folder(
    pool: &SqlitePool,
    folder_id: &str,
    name: Option<&str>,
    color: Option<&str>,
) -> ZenResult<()> {
    if let Some(n) = name {
        sqlx::query("UPDATE chat_folders SET name = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(n)
            .bind(folder_id)
            .execute(pool)
            .await?;
    }
    if let Some(c) = color {
        sqlx::query("UPDATE chat_folders SET color = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(c)
            .bind(folder_id)
            .execute(pool)
            .await?;
    }
    Ok(())
}

pub async fn delete_chat_folder(pool: &SqlitePool, folder_id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM chat_folders WHERE id = ?")
        .bind(folder_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_chat_folders(pool: &SqlitePool) -> ZenResult<Vec<ChatFolder>> {
    let folders = sqlx::query_as::<_, ChatFolder>("SELECT * FROM chat_folders ORDER BY sort_order ASC, name ASC")
        .fetch_all(pool)
        .await?;
    Ok(folders)
}

pub async fn move_chat_to_folder(pool: &SqlitePool, chat_id: &str, folder_id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM chat_folder_members WHERE chat_id = ?")
        .bind(chat_id)
        .execute(pool)
        .await?;

    sqlx::query("INSERT INTO chat_folder_members (folder_id, chat_id) VALUES (?, ?)")
        .bind(folder_id)
        .bind(chat_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn remove_chat_from_folder(pool: &SqlitePool, chat_id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM chat_folder_members WHERE chat_id = ?")
        .bind(chat_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn archive_chat(pool: &SqlitePool, chat_id: &str) -> ZenResult<()> {
    sqlx::query("UPDATE chats SET is_archived = 1, archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
        .bind(chat_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn unarchive_chat(pool: &SqlitePool, chat_id: &str) -> ZenResult<()> {
    sqlx::query("UPDATE chats SET is_archived = 0, archived_at = NULL, updated_at = datetime('now') WHERE id = ?")
        .bind(chat_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_archived_chats(pool: &SqlitePool) -> ZenResult<Vec<Chat>> {
    let chats = sqlx::query_as::<_, Chat>("SELECT * FROM chats WHERE is_archived = 1 ORDER BY archived_at DESC")
        .fetch_all(pool)
        .await?;
    Ok(chats)
}

pub async fn search_chats(pool: &SqlitePool, query: &str, limit: Option<i64>) -> ZenResult<Vec<SearchResult>> {
    let limit_val = limit.unwrap_or(20);
    // Escape standard FTS quote character
    let fts_query = format!("\"{}\"", query.replace("\"", "\"\"")); 
    
    let results = sqlx::query_as::<_, SearchResult>(
        r#"
        SELECT 
            c.id AS chat_id, 
            c.title AS chat_title, 
            m.id AS message_id, 
            snippet(messages_fts, 0, '<mark>', '</mark>', '...', 20) AS message_content,
            m.role,
            m.created_at AS timestamp,
            bm25(messages_fts) AS rank
        FROM messages_fts f
        JOIN messages m ON f.rowid = m.rowid
        JOIN chats c ON m.chat_id = c.id
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT ?
        "#
    )
    .bind(&fts_query)
    .bind(limit_val)
    .fetch_all(pool)
    .await?;

    Ok(results)
}

pub async fn create_chat_template(
    pool: &SqlitePool,
    name: &str,
    description: Option<&str>,
    system_prompt: Option<&str>,
    default_model: Option<&str>,
) -> ZenResult<crate::db::models::ChatTemplate> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO chat_templates (id, name, description, system_prompt, default_model) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(name)
    .bind(description)
    .bind(system_prompt)
    .bind(default_model)
    .execute(pool)
    .await?;

    let template = sqlx::query_as::<_, crate::db::models::ChatTemplate>("SELECT * FROM chat_templates WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await?;
    Ok(template)
}

pub async fn list_chat_templates(pool: &SqlitePool) -> ZenResult<Vec<crate::db::models::ChatTemplate>> {
    let templates = sqlx::query_as::<_, crate::db::models::ChatTemplate>("SELECT * FROM chat_templates ORDER BY name ASC")
        .fetch_all(pool)
        .await?;
    Ok(templates)
}

pub async fn delete_chat_template(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM chat_templates WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn bulk_delete_chats(pool: &SqlitePool, ids: &[String]) -> ZenResult<()> {
    if ids.is_empty() { return Ok(()); }
    let mut tx = pool.begin().await?;
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!("DELETE FROM chats WHERE id IN ({})", placeholders);
    let mut q = sqlx::query(&query);
    for id in ids {
        q = q.bind(id);
    }
    q.execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn bulk_archive_chats(pool: &SqlitePool, ids: &[String]) -> ZenResult<()> {
    if ids.is_empty() { return Ok(()); }
    let mut tx = pool.begin().await?;
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!("UPDATE chats SET is_archived = 1, archived_at = datetime('now'), updated_at = datetime('now') WHERE id IN ({})", placeholders);
    let mut q = sqlx::query(&query);
    for id in ids {
        q = q.bind(id);
    }
    q.execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn fork_chat(pool: &SqlitePool, chat_id: &str, up_to_message_id: &str) -> ZenResult<Chat> {
    let old_chat = get_chat(pool, chat_id).await?;
    let new_id = Uuid::new_v4().to_string();
    let new_title = format!("{} (Fork)", old_chat.title);
    
    // Create new chat
    sqlx::query("INSERT INTO chats (id, title, model, pinned) VALUES (?, ?, ?, 0)")
        .bind(&new_id)
        .bind(&new_title)
        .bind(&old_chat.model)
        .execute(pool)
        .await?;

    // Copy messages
    sqlx::query(
        r#"INSERT INTO messages (id, chat_id, role, content, model, is_complete, tool_calls, tool_call_id, images, attachments, tokens_in, tokens_out, created_at)
           SELECT lower(hex(randomblob(16))), ?, role, content, model, is_complete, tool_calls, tool_call_id, images, attachments, tokens_in, tokens_out, created_at
           FROM messages 
           WHERE chat_id = ? AND created_at <= (SELECT created_at FROM messages WHERE id = ?)
           ORDER BY created_at ASC"#
    )
    .bind(&new_id)
    .bind(chat_id)
    .bind(up_to_message_id)
    .execute(pool)
    .await?;

    get_chat(pool, &new_id).await
}pub async fn add_chat_tag(pool: &SqlitePool, chat_id: &str, tag_name: &str, color: Option<String>) -> ZenResult<()> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO chat_tags (id, chat_id, name, color) VALUES (?, ?, ?, ?)
         ON CONFLICT(chat_id, name) DO UPDATE SET color = excluded.color"
    )
    .bind(id)
    .bind(chat_id)
    .bind(tag_name)
    .bind(color)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn remove_chat_tag(pool: &SqlitePool, chat_id: &str, tag_name: &str) -> ZenResult<()> {
    sqlx::query("DELETE FROM chat_tags WHERE chat_id = ? AND name = ?")
        .bind(chat_id)
        .bind(tag_name)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_chat_tags(pool: &SqlitePool, chat_id: &str) -> ZenResult<Vec<crate::db::models::ChatTag>> {
    let tags = sqlx::query_as::<_, crate::db::models::ChatTag>("SELECT * FROM chat_tags WHERE chat_id = ? ORDER BY name ASC")
        .bind(chat_id)
        .fetch_all(pool)
        .await?;
    Ok(tags)
}

pub async fn list_all_chat_tags(pool: &SqlitePool) -> ZenResult<Vec<crate::db::models::ChatTag>> {
    let tags = sqlx::query_as::<_, crate::db::models::ChatTag>("SELECT * FROM chat_tags ORDER BY chat_id, name ASC")
        .fetch_all(pool)
        .await?;
    Ok(tags)
}

pub async fn list_unique_tag_names(pool: &SqlitePool) -> ZenResult<Vec<String>> {
    let tags = sqlx::query_scalar::<_, String>("SELECT DISTINCT name FROM chat_tags ORDER BY name ASC")
        .fetch_all(pool)
        .await?;
    Ok(tags)
}


// ─── Orchestration ───

pub async fn save_orchestration_plan(pool: &SqlitePool, plan: &OrchestrationPlan) -> ZenResult<()> {
    sqlx::query(
        r#"
        INSERT INTO orchestration_plans (id, chat_id, goal, complexity, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            updated_at = datetime('now')
        "#,
    )
    .bind(&plan.id)
    .bind(&plan.chat_id)
    .bind(&plan.goal)
    .bind(&plan.complexity)
    .bind(&plan.status)
    .bind(&plan.created_at)
    .bind(&plan.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn save_orchestration_task(pool: &SqlitePool, task: &OrchestrationTask) -> ZenResult<()> {
    sqlx::query(
        r#"
        INSERT INTO orchestration_tasks (id, plan_id, description, agent_id, priority, status, dependencies, result, retry_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            result = excluded.result,
            retry_count = excluded.retry_count,
            updated_at = datetime('now')
        "#,
    )
    .bind(&task.id)
    .bind(&task.plan_id)
    .bind(&task.description)
    .bind(&task.agent_id)
    .bind(task.priority)
    .bind(&task.status)
    .bind(&task.dependencies)
    .bind(&task.result)
    .bind(task.retry_count)
    .bind(&task.created_at)
    .bind(&task.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_orchestration_plan(pool: &SqlitePool, plan_id: &str) -> ZenResult<OrchestrationPlan> {
    let plan = sqlx::query_as::<_, OrchestrationPlan>("SELECT * FROM orchestration_plans WHERE id = ?")
        .bind(plan_id)
        .fetch_one(pool)
        .await?;
    Ok(plan)
}

pub async fn get_orchestration_tasks(pool: &SqlitePool, plan_id: &str) -> ZenResult<Vec<OrchestrationTask>> {
    let tasks = sqlx::query_as::<_, OrchestrationTask>("SELECT * FROM orchestration_tasks WHERE plan_id = ? ORDER BY priority DESC, created_at ASC")
        .bind(plan_id)
        .fetch_all(pool)
        .await?;
    Ok(tasks)
}

pub async fn get_orchestration_plans_by_chat(pool: &SqlitePool, chat_id: &str) -> ZenResult<Vec<OrchestrationPlan>> {
    let plans = sqlx::query_as::<_, OrchestrationPlan>("SELECT * FROM orchestration_plans WHERE chat_id = ? ORDER BY created_at DESC")
        .bind(chat_id)
        .fetch_all(pool)
        .await?;
    Ok(plans)
}

pub async fn update_orchestration_task_status(pool: &SqlitePool, task_id: &str, status: &str, result: Option<&str>) -> ZenResult<()> {
    sqlx::query("UPDATE orchestration_tasks SET status = ?, result = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(status)
        .bind(result)
        .bind(task_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn update_orchestration_plan_status(pool: &SqlitePool, plan_id: &str, status: &str) -> ZenResult<()> {
    sqlx::query("UPDATE orchestration_plans SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(status)
        .bind(plan_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ─── Skills, Hooks & Commands ───

use crate::db::models::{Skill, Hook, HookLogEntry, ZenCommand};

pub async fn list_skills(pool: &SqlitePool) -> ZenResult<Vec<Skill>> {
    let skills = sqlx::query_as::<_, Skill>(
        "SELECT id, name, '' as description, '' as invocation_syntax, enabled FROM tools"
    )
    .fetch_all(pool)
    .await?;
    Ok(skills)
}

pub async fn set_skill_enabled(pool: &SqlitePool, skill_id: &str, enabled: bool) -> ZenResult<()> {
    sqlx::query("UPDATE tools SET enabled = ? WHERE id = ?")
        .bind(enabled as i32)
        .bind(skill_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_hooks(pool: &SqlitePool) -> ZenResult<Vec<Hook>> {
    let hooks = sqlx::query_as::<_, Hook>("SELECT * FROM hooks ORDER BY name ASC")
        .fetch_all(pool)
        .await?;
    Ok(hooks)
}

pub async fn set_hook_enabled(pool: &SqlitePool, hook_id: &str, enabled: bool) -> ZenResult<()> {
    sqlx::query("UPDATE hooks SET enabled = ? WHERE id = ?")
        .bind(enabled as i32)
        .bind(hook_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_commands(pool: &SqlitePool) -> ZenResult<Vec<ZenCommand>> {
    let commands = sqlx::query_as::<_, ZenCommand>("SELECT * FROM zen_commands ORDER BY name ASC")
        .fetch_all(pool)
        .await?;
    Ok(commands)
}

pub async fn toggle_command(pool: &SqlitePool, id: &str) -> ZenResult<()> {
    sqlx::query("UPDATE zen_commands SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_hook_logs(pool: &SqlitePool, limit: i64) -> ZenResult<Vec<HookLogEntry>> {
    let logs = sqlx::query_as::<_, HookLogEntry>(
        "SELECT * FROM hook_logs ORDER BY timestamp DESC LIMIT ?"
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(logs)
}

pub async fn add_hook_log(pool: &SqlitePool, log: &HookLogEntry) -> ZenResult<()> {
    sqlx::query(
        "INSERT INTO hook_logs (timestamp, hook_id, hook_name, trigger, result, message) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(log.timestamp)
    .bind(&log.hook_id)
    .bind(&log.hook_name)
    .bind(&log.trigger)
    .bind(&log.result)
    .bind(&log.message)
    .execute(pool)
    .await?;
    Ok(())
}


