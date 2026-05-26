use crate::canvas::protocol::{generate_feedback, SessionFeedback};
use crate::canvas::{
    auto_fix_layout, compile_anchor_command, generate_canvas_summary, generate_plot,
    validate_layout, AnchorDrawCommand, AnchorResolver, AnchorType, CanvasSummary, GeometryContext,
    GraphSession, LayoutConstraints, PlotRequest,
};
use crate::commands::AppState;
use crate::error::ZenError;
use serde_json::json;
use tauri::State;

// ─── Canvas Commands ───

#[tauri::command]
pub async fn get_canvas_summary(canvas_json: String) -> Result<CanvasSummary, ZenError> {
    let canvas: serde_json::Value = serde_json::from_str(&canvas_json)
        .map_err(|e| ZenError::Custom(format!("Invalid canvas JSON: {}", e)))?;

    let width = canvas
        .get("width")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| ZenError::Custom("Missing or invalid width".into()))? as u32;

    let height = canvas
        .get("height")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| ZenError::Custom("Missing or invalid height".into()))?
        as u32;

    let ops = canvas
        .get("ops")
        .and_then(|v| v.as_array())
        .ok_or_else(|| ZenError::Custom("Missing or invalid ops array".into()))?;

    let background = canvas
        .get("backgroundColor")
        .and_then(|v| v.as_str())
        .unwrap_or("#1a1a2e");

    Ok(generate_canvas_summary(
        width, height, ops, background, None,
    ))
}

#[tauri::command]
pub async fn get_canvas_screenshot_base64(canvas_data_url: String) -> Result<String, ZenError> {
    if let Some(base64_part) = canvas_data_url.strip_prefix("data:image/png;base64,") {
        Ok(base64_part.to_string())
    } else if let Some(base64_part) = canvas_data_url.strip_prefix("data:image/jpeg;base64,") {
        Ok(base64_part.to_string())
    } else {
        Err(ZenError::Custom(
            "Invalid data URL format. Expected 'data:image/png;base64,...' or 'data:image/jpeg;base64,...'".into(),
        ))
    }
}

#[tauri::command]
pub async fn validate_canvas_layout(
    objects_json: String,
    canvas_width: u32,
    canvas_height: u32,
) -> Result<serde_json::Value, ZenError> {
    let objects: Vec<(String, [f64; 4])> = serde_json::from_str(&objects_json)
        .map_err(|e| ZenError::Custom(format!("Invalid objects JSON: {}", e)))?;

    let constraints = LayoutConstraints {
        margin: 10.0,
        no_overlap: true,
        keep_center_clear: false,
        max_objects: Some(100),
    };

    let result = validate_layout(&objects, [canvas_width, canvas_height], Some(constraints));

    Ok(serde_json::to_value(result).unwrap_or_else(|_| json!({"error": "serialization failed"})))
}

#[tauri::command]
pub async fn auto_fix_canvas_layout(
    objects_json: String,
    canvas_width: u32,
    canvas_height: u32,
) -> Result<serde_json::Value, ZenError> {
    let mut objects: Vec<(String, [f64; 4])> = serde_json::from_str(&objects_json)
        .map_err(|e| ZenError::Custom(format!("Invalid objects JSON: {}", e)))?;

    let fixes = auto_fix_layout(&mut objects, [canvas_width, canvas_height]);

    Ok(json!({
        "objects": objects,
        "fixes_applied": fixes,
        "fix_count": fixes.len(),
    }))
}

#[tauri::command]
pub async fn get_geometry_context(
    objects_json: String,
    canvas_width: u32,
    canvas_height: u32,
) -> Result<serde_json::Value, ZenError> {
    let objects: Vec<(String, [f64; 4])> = serde_json::from_str(&objects_json)
        .map_err(|e| ZenError::Custom(format!("Invalid objects JSON: {}", e)))?;

    let mut ctx = GeometryContext::new(canvas_width as f64, canvas_height as f64);
    ctx.objects = objects;

    Ok(crate::canvas::geometry::context_to_json(&ctx))
}

// ─── Anchor System Commands ───

#[tauri::command]
pub async fn resolve_anchor(
    anchor_str: String,
    objects_json: String,
    canvas_width: u32,
    canvas_height: u32,
    offset: Option<[f64; 2]>,
) -> Result<[f64; 2], ZenError> {
    let objects: Vec<(String, [f64; 4])> = serde_json::from_str(&objects_json)
        .map_err(|e| ZenError::Custom(format!("Invalid objects JSON: {}", e)))?;

    let mut resolver = AnchorResolver::new(canvas_width as f64, canvas_height as f64);
    for (id, bbox) in objects {
        resolver.register_object(id, bbox);
    }

    let anchor = AnchorType::parse(&anchor_str).map_err(|e| ZenError::Custom(e.to_string()))?;

    let pos = resolver
        .resolve_with_offset(&anchor, offset)
        .map_err(|e| ZenError::Custom(e.to_string()))?;

    Ok(pos)
}

#[tauri::command]
pub async fn compile_anchor_draw_command(
    command_json: String,
    objects_json: String,
    canvas_width: u32,
    canvas_height: u32,
) -> Result<serde_json::Value, ZenError> {
    let cmd: AnchorDrawCommand = serde_json::from_str(&command_json)
        .map_err(|e| ZenError::Custom(format!("Invalid command JSON: {}", e)))?;

    let objects: Vec<(String, [f64; 4])> = serde_json::from_str(&objects_json)
        .map_err(|e| ZenError::Custom(format!("Invalid objects JSON: {}", e)))?;

    let mut resolver = AnchorResolver::new(canvas_width as f64, canvas_height as f64);
    for (id, bbox) in objects {
        resolver.register_object(id, bbox);
    }

    let result =
        compile_anchor_command(&cmd, &resolver).map_err(|e| ZenError::Custom(e.to_string()))?;

    Ok(result)
}

// ─── Math Plot Engine Commands ───

#[tauri::command]
pub async fn plot_mathematical(request_json: String) -> Result<serde_json::Value, ZenError> {
    let request: PlotRequest = serde_json::from_str(&request_json)
        .map_err(|e| ZenError::Custom(format!("Invalid plot request JSON: {}", e)))?;

    let output = generate_plot(&request).map_err(|e| ZenError::Custom(e.to_string()))?;

    Ok(serde_json::to_value(output).unwrap_or_else(|_| json!({"error": "serialization failed"})))
}

// ─── Graph Session Commands (MathPlot Mode) ───

/// Create a new graph session, returns the session ID
#[tauri::command]
pub async fn create_graph_session(
    state: State<'_, AppState>,
    name: String,
) -> Result<String, ZenError> {
    let id = uuid::Uuid::new_v4().to_string();
    let session = GraphSession::new(id.clone(), name.clone());
    let mut sessions = state.graph_sessions.lock().await;
    sessions.insert(id.clone(), session);

    // Persist to database
    let _ =
        crate::db::queries::get_or_create_graph_session(&state.db().await?, &id, "default", &name)
            .await;

    Ok(id)
}

/// Apply an action to an existing session, returns feedback
#[tauri::command]
pub async fn apply_session_action(
    state: State<'_, AppState>,
    session_id: String,
    action: serde_json::Value,
) -> Result<SessionFeedback, ZenError> {
    let mut sessions = state.graph_sessions.lock().await;
    let session = sessions
        .entry(session_id.clone())
        .or_insert_with(|| GraphSession::new(session_id.clone(), "Auto Session".to_string()));

    let parsed = crate::canvas::protocol::parse_session_action(action.clone())
        .map_err(|e| ZenError::Custom(e.to_string()))?;

    let summary = format!(
        "Action: {}",
        action
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
    );

    session
        .apply_action(parsed, "user")
        .map_err(|e| ZenError::Custom(e.to_string()))?;

    // Persist to database after each action
    let expressions_json =
        serde_json::to_string(&session.expressions).unwrap_or_else(|_| "[]".to_string());
    let variables_json =
        serde_json::to_string(&session.variables).unwrap_or_else(|_| "{}".to_string());
    let history_json = serde_json::to_string(&session.history).unwrap_or_else(|_| "[]".to_string());

    let _ = crate::db::queries::save_graph_session(
        &state.db().await?,
        &session_id,
        &expressions_json,
        &variables_json,
        session.viewport.x_min,
        session.viewport.x_max,
        session.viewport.y_min,
        session.viewport.y_max,
        session.current_version as i64,
        &history_json,
    )
    .await;

    Ok(generate_feedback(session, summary))
}

/// Get the current state of a session
#[tauri::command]
pub async fn get_session_state(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<serde_json::Value, ZenError> {
    let sessions = state.graph_sessions.lock().await;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| ZenError::Custom(format!("Session '{}' not found", session_id)))?;
    Ok(session.export_state())
}

/// Rollback a session to a previous version
#[tauri::command]
pub async fn rollback_session(
    state: State<'_, AppState>,
    session_id: String,
    version: usize,
) -> Result<SessionFeedback, ZenError> {
    let mut sessions = state.graph_sessions.lock().await;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| ZenError::Custom(format!("Session '{}' not found", session_id)))?;

    session
        .rollback_to_version(version)
        .map_err(|e| ZenError::Custom(e.to_string()))?;

    // Persist rollback to database
    let expressions_json =
        serde_json::to_string(&session.expressions).unwrap_or_else(|_| "[]".to_string());
    let variables_json =
        serde_json::to_string(&session.variables).unwrap_or_else(|_| "{}".to_string());
    let history_json = serde_json::to_string(&session.history).unwrap_or_else(|_| "[]".to_string());

    let _ = crate::db::queries::save_graph_session(
        &state.db().await?,
        &session_id,
        &expressions_json,
        &variables_json,
        session.viewport.x_min,
        session.viewport.x_max,
        session.viewport.y_min,
        session.viewport.y_max,
        session.current_version as i64,
        &history_json,
    )
    .await;

    Ok(generate_feedback(
        session,
        format!("Rolled back to version {}", version),
    ))
}

/// Load graph sessions from database on app init
#[tauri::command]
pub async fn load_graph_sessions_from_db(
    state: State<'_, AppState>,
    chat_id: String,
) -> Result<serde_json::Value, ZenError> {
    use crate::canvas::session::Expression;
    use std::collections::HashMap;

    let db_session =
        crate::db::queries::get_graph_session(&state.db().await?, &format!("chat_{}", chat_id))
            .await
            .map_err(|e| ZenError::Custom(e.to_string()))?;

    if let Some(db_session) = db_session {
        let expressions: Vec<Expression> =
            serde_json::from_str(&db_session.expressions).unwrap_or_default();
        let variables: HashMap<String, f64> =
            serde_json::from_str(&db_session.variables).unwrap_or_default();

        return Ok(serde_json::json!({
            "id": db_session.id,
            "expressions": expressions,
            "variables": variables,
            "viewport": {
                "x_min": db_session.viewport_x_min,
                "x_max": db_session.viewport_x_max,
                "y_min": db_session.viewport_y_min,
                "y_max": db_session.viewport_y_max,
            },
            "version": db_session.current_version,
            "restored": true
        }));
    }

    Ok(serde_json::json!({ "restored": false }))
}

// ═══════════════════ Drawing Canvas Commands ═══════════════════

/// Save drawing canvas to database
#[tauri::command]
pub async fn save_drawing_canvas_to_db(
    state: State<'_, AppState>,
    canvas_id: String,
    chat_id: String,
    name: String,
    objects_json: String,
    background: String,
) -> Result<(), ZenError> {
    let _ = crate::db::queries::get_or_create_drawing_canvas(
        &state.db().await?,
        &canvas_id,
        &chat_id,
        &name,
    )
    .await;

    crate::db::queries::save_drawing_canvas(
        &state.db().await?,
        &canvas_id,
        &objects_json,
        &background,
    )
    .await
    .map_err(|e| ZenError::Custom(e.to_string()))
}

/// Load drawing canvas from database
#[tauri::command]
pub async fn load_drawing_canvas_from_db(
    state: State<'_, AppState>,
    canvas_id: String,
) -> Result<serde_json::Value, ZenError> {
    use crate::canvas::session::Expression;
    use std::collections::HashMap;

    let db_canvas = crate::db::queries::get_graph_session(&state.db().await?, &canvas_id)
        .await
        .map_err(|e| ZenError::Custom(e.to_string()))?;

    if let Some(canvas) = db_canvas {
        return Ok(serde_json::json!({
            "id": canvas.id,
            "name": canvas.name,
            "expressions": serde_json::from_str::<Vec<Expression>>(&canvas.expressions).unwrap_or_default(),
            "variables": serde_json::from_str::<HashMap<String, f64>>(&canvas.variables).unwrap_or_default(),
            "viewport": {
                "x_min": canvas.viewport_x_min,
                "x_max": canvas.viewport_x_max,
                "y_min": canvas.viewport_y_min,
                "y_max": canvas.viewport_y_max,
            },
            "restored": true
        }));
    }

    Ok(serde_json::json!({ "restored": false }))
}
