use crate::error::{ZenError, ZenResult};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, SqlitePool};
use std::collections::HashSet;

pub const EXECUTION_TRACE_VERSION: i64 = 2;
pub const MAX_TRACE_EVENTS: usize = 2_048;
pub const MAX_TRACE_EVENT_BYTES: usize = 128 * 1024;
pub const MAX_TRACES_PER_CHAT: i64 = 200;

const TRACE_STATUS_VALUES: [&str; 6] = [
    "running",
    "completed",
    "cancelled",
    "failed",
    "interrupted",
    "checkpoint",
];

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionTraceRecord {
    pub trace_id: String,
    pub chat_id: String,
    pub message_id: String,
    pub trace_version: i64,
    pub status: String,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub updated_at: String,
    pub event_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionTraceEventRecord {
    pub id: String,
    pub trace_id: String,
    pub node_id: String,
    pub run_id: Option<String>,
    pub sequence: i64,
    pub parent_id: Option<String>,
    pub kind: String,
    pub phase: Option<String>,
    pub summary: String,
    pub target: Option<String>,
    pub result_summary: Option<String>,
    pub output_preview: Option<String>,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub safe_details_json: Option<String>,
    pub payload_json: String,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub duration_ms: Option<i64>,
    pub retry_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionTraceNodeSnapshot {
    pub id: String,
    pub trace_id: String,
    pub run_id: String,
    pub message_id: String,
    pub parent_id: Option<String>,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub sequence: i64,
    pub kind: String,
    pub phase: Option<String>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub duration_ms: Option<i64>,
    pub summary: String,
    pub target: Option<String>,
    pub result_summary: Option<String>,
    pub output_preview: Option<String>,
    pub safe_details: Value,
    pub retry_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionTraceSnapshot {
    pub trace_id: String,
    pub chat_id: String,
    pub message_id: String,
    pub trace_version: i64,
    pub status: String,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub updated_at: String,
    pub event_count: i64,
    pub nodes: Vec<ExecutionTraceNodeSnapshot>,
    /// Compatibility projection for legacy clients during the v2 rollout.
    pub steps: Vec<Value>,
}

fn normalized_status(status: Option<&str>) -> &str {
    status
        .filter(|candidate| TRACE_STATUS_VALUES.contains(candidate))
        .unwrap_or("checkpoint")
}

fn compact_text(value: Option<&Value>, max: usize) -> Option<String> {
    let text = value.and_then(Value::as_str)?.trim();
    if text.is_empty() {
        return None;
    }
    let compacted = text.split_whitespace().collect::<Vec<_>>().join(" ");
    Some(if compacted.chars().count() <= max {
        compacted
    } else {
        format!("{}…", compacted.chars().take(max.saturating_sub(1)).collect::<String>())
    })
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(result) = compact_text(value.get(*key), 512) {
            return Some(result);
        }
    }
    None
}

fn number_field(value: &Value, keys: &[&str]) -> Option<i64> {
    for key in keys {
        if let Some(number) = value.get(*key).and_then(Value::as_i64) {
            return Some(number);
        }
        if let Some(number) = value.get(*key).and_then(Value::as_f64) {
            return Some(number as i64);
        }
    }
    None
}

fn tool_call(value: &Value) -> Option<&Value> {
    value.get("toolCall").filter(|candidate| candidate.is_object())
}

fn monotonic_sequence(requested: i64, last: &mut i64) -> i64 {
    let sequence = requested.max(0).max(last.saturating_add(1));
    *last = sequence;
    sequence
}

fn step_kind(value: &Value) -> String {
    if let Some(kind) = value.get("type").and_then(Value::as_str) {
        return kind.to_string();
    }
    "unknown".to_string()
}

fn step_phase(value: &Value) -> Option<String> {
    tool_call(value)
        .and_then(|tool| string_field(tool, &["phase"]))
        .or_else(|| string_field(value, &["phase"]))
        .or_else(|| value.get("metadata").and_then(|meta| string_field(meta, &["phase"])))
}

fn step_string_field(value: &Value, keys: &[&str]) -> Option<String> {
    tool_call(value)
        .and_then(|tool| string_field(tool, keys))
        .or_else(|| string_field(value, keys))
        .or_else(|| value.get("metadata").and_then(|meta| string_field(meta, keys)))
}

fn safe_details_json(value: &Value) -> String {
    let tool = tool_call(value);
    let safe = json!({
        "toolName": tool.and_then(|item| string_field(item, &["name"])),
        "executionId": step_string_field(value, &["executionId"]),
        "batchId": step_string_field(value, &["batchId", "toolBatchId"]),
        "toolBatchId": step_string_field(value, &["toolBatchId"]),
        "task": value.get("subagent").and_then(|agent| string_field(agent, &["task"])),
    });
    serde_json::to_string(&safe).unwrap_or_else(|_| "{}".to_string())
}

fn nodes_from_events(events: &[ExecutionTraceEventRecord], message_id: &str) -> Vec<ExecutionTraceNodeSnapshot> {
    events.iter().map(|event| ExecutionTraceNodeSnapshot {
        id: event.node_id.clone(),
        trace_id: event.trace_id.clone(),
        run_id: event.run_id.clone().unwrap_or_else(|| event.trace_id.clone()),
        message_id: message_id.to_string(),
        parent_id: event.parent_id.clone(),
        agent_id: event.agent_id.clone(),
        agent_name: event.agent_name.clone(),
        sequence: event.sequence,
        kind: event.kind.clone(),
        phase: event.phase.clone(),
        started_at: event.started_at,
        completed_at: event.completed_at,
        duration_ms: event.duration_ms,
        summary: event.summary.clone(),
        target: event.target.clone(),
        result_summary: event.result_summary.clone(),
        output_preview: event.output_preview.clone(),
        safe_details: event.safe_details_json.as_deref()
            .and_then(|value| serde_json::from_str(value).ok())
            .unwrap_or_else(|| json!({})),
        retry_count: event.retry_count,
    }).collect()
}

fn step_node_id(value: &Value, index: usize) -> String {
    tool_call(value)
        .and_then(|tool| string_field(tool, &["id"]))
        .or_else(|| value.get("subagent").and_then(|agent| string_field(agent, &["spawnId"])))
        .or_else(|| string_field(value, &["eventId"]))
        .unwrap_or_else(|| format!("step-{}", index))
}

fn step_parent_id(value: &Value) -> Option<String> {
    tool_call(value)
        .and_then(|tool| string_field(tool, &["parentToolCallId", "parentAgentId"]))
        .or_else(|| value.get("subagent").and_then(|agent| string_field(agent, &["parentToolCallId"])))
        .or_else(|| value.get("metadata").and_then(|meta| string_field(meta, &["parentToolCallId", "parentAgentId"])))
}

fn step_summary(value: &Value) -> String {
    let kind = step_kind(value);
    let status = value
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("running");
    let name = tool_call(value)
        .and_then(|tool| string_field(tool, &["name"]))
        .or_else(|| value.get("subagent").and_then(|agent| string_field(agent, &["agentName"])))
        .or_else(|| string_field(value, &["content"]))
        .or_else(|| value.get("metadata").and_then(|meta| string_field(meta, &["message", "resultSummary"])))
        .unwrap_or_else(|| kind.clone());
    format!("{} · {}", name, status)
}

fn safe_payload(value: &Value) -> String {
    let serialized = serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string());
    if serialized.len() <= MAX_TRACE_EVENT_BYTES {
        return serialized;
    }
    serde_json::to_string(&json!({
        "type": "action",
        "kind": "trace_compacted",
        "status": "completed",
        "content": "This execution event was compacted because its detail exceeded the storage bound.",
    }))
    .unwrap_or_else(|_| "{}".to_string())
}

fn parse_steps(trace_json: &str) -> ZenResult<Vec<Value>> {
    let value: Value = serde_json::from_str(trace_json)
        .map_err(|_| ZenError::Custom("Execution trace must be valid JSON".to_string()))?;
    let steps = match value {
        Value::Array(steps) => steps,
        Value::Object(object) => object
            .get("steps")
            .and_then(Value::as_array)
            .cloned()
            .ok_or_else(|| ZenError::Custom("Execution trace must contain a steps array".to_string()))?,
        _ => return Err(ZenError::Custom("Execution trace must contain a steps array".to_string())),
    };
    if steps.len() > MAX_TRACE_EVENTS {
        Ok(steps[steps.len() - MAX_TRACE_EVENTS..].to_vec())
    } else {
        Ok(steps)
    }
}

pub fn validate_trace_payload(trace_json: &str) -> ZenResult<()> {
    if trace_json.len() > 2 * 1024 * 1024 {
        return Err(ZenError::Custom("Execution trace exceeds maximum allowed size (2 MB)".to_string()));
    }
    let _ = parse_steps(trace_json)?;
    Ok(())
}

pub async fn upsert_execution_trace(
    pool: &SqlitePool,
    chat_id: &str,
    message_id: &str,
    trace_json: &str,
    status: Option<&str>,
) -> ZenResult<ExecutionTraceSnapshot> {
    validate_trace_payload(trace_json)?;

    let role: Option<String> = sqlx::query_scalar("SELECT role FROM messages WHERE id = ? AND chat_id = ?")
        .bind(message_id)
        .bind(chat_id)
        .fetch_optional(pool)
        .await?;
    if role.as_deref() != Some("assistant") {
        return Err(ZenError::Custom("No assistant message found for execution trace".to_string()));
    }

    let trace_id = format!("trace:{}", message_id);
    let status = normalized_status(status);
    let steps = parse_steps(trace_json)?;
    let now = chrono::Utc::now().to_rfc3339();
    let started_at = steps.iter().filter_map(|step| number_field(step, &["timestamp", "startTime"])).min();
    let completed_at = steps.iter().filter_map(|step| number_field(step, &["completedAt"])).max();

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO execution_traces (trace_id, chat_id, message_id, trace_version, status, started_at, completed_at, updated_at, event_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(trace_id) DO UPDATE SET status = excluded.status, trace_version = excluded.trace_version, started_at = excluded.started_at, completed_at = excluded.completed_at, updated_at = excluded.updated_at, event_count = excluded.event_count",
    )
    .bind(&trace_id)
    .bind(chat_id)
    .bind(message_id)
    .bind(EXECUTION_TRACE_VERSION)
    .bind(status)
    .bind(started_at)
    .bind(completed_at)
    .bind(&now)
    .bind(steps.len() as i64)
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM execution_trace_events WHERE trace_id = ?")
        .bind(&trace_id)
        .execute(&mut *tx)
        .await?;

    let mut used_node_ids = HashSet::new();
    let mut last_sequence: i64 = -1;
    for (index, step) in steps.iter().enumerate() {
        let base_node_id = step_node_id(step, index);
        let mut node_id = base_node_id.clone();
        let mut suffix = 1;
        while !used_node_ids.insert(node_id.clone()) {
            node_id = format!("{}:{}", base_node_id, suffix);
            suffix += 1;
        }
        let payload_json = safe_payload(step);
        let requested_sequence = number_field(step, &["sequence"])
            .or_else(|| tool_call(step).and_then(|tool| number_field(tool, &["sequence"])))
            .unwrap_or(index as i64);
        // The frontend timeline is already source ordered. Keep explicit
        // backend sequence values when valid, but repair duplicates or
        // regressions into a strictly increasing sequence so SQLite reloads
        // and the frontend projection cannot reorder equal-sequence rows by
        // lexical node id.
        let sequence = monotonic_sequence(requested_sequence, &mut last_sequence);
        let started = number_field(step, &["timestamp", "startTime"])
            .or_else(|| tool_call(step).and_then(|tool| number_field(tool, &["startTime"])));
        let completed = number_field(step, &["completedAt"])
            .or_else(|| tool_call(step).and_then(|tool| number_field(tool, &["completedAt"])));
        let duration = number_field(step, &["durationMs"])
            .or_else(|| tool_call(step).and_then(|tool| number_field(tool, &["durationMs"])));
        let retries = tool_call(step).and_then(|tool| number_field(tool, &["retries"]));
        let target = tool_call(step).and_then(|tool| {
            tool.get("input").and_then(|input| {
                if let Some(text) = input.as_str() {
                    Some(text.chars().take(512).collect::<String>())
                } else {
                    ["path", "filePath", "command", "query", "url"]
                        .iter()
                        .find_map(|key| input.get(*key).and_then(Value::as_str).map(|text| text.chars().take(512).collect()))
                }
            })
        });

        let run_id = step_string_field(step, &["runId", "traceId"]);
        let agent_id = step_string_field(step, &["agentId"]);
        let agent_name = step_string_field(step, &["agentName"]);
        let safe_details = safe_details_json(step);

        sqlx::query(
            "INSERT INTO execution_trace_events (id, trace_id, node_id, run_id, sequence, parent_id, kind, phase, summary, target, result_summary, output_preview, agent_id, agent_name, safe_details_json, payload_json, started_at, completed_at, duration_ms, retry_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(format!("{}:{}", trace_id, node_id))
        .bind(&trace_id)
        .bind(&node_id)
        .bind(run_id)
        .bind(sequence)
        .bind(step_parent_id(step))
        .bind(step_kind(step))
        .bind(step_phase(step))
        .bind(step_summary(step))
        .bind(target)
        .bind(compact_text(step.get("content"), 512).or_else(|| compact_text(step.get("resultSummary"), 512)))
        .bind(tool_call(step).and_then(|tool| compact_text(tool.get("outputPreview").or_else(|| tool.get("output")), 480)))
        .bind(agent_id)
        .bind(agent_name)
        .bind(safe_details)
        .bind(payload_json)
        .bind(started)
        .bind(completed)
        .bind(duration)
        .bind(retries)
        .execute(&mut *tx)
        .await?;
    }

    // Keep recent traces queryable while bounding long-lived chats.
    sqlx::query(
        "DELETE FROM execution_traces WHERE chat_id = ? AND trace_id NOT IN (SELECT trace_id FROM execution_traces WHERE chat_id = ? ORDER BY updated_at DESC LIMIT ?)",
    )
    .bind(chat_id)
    .bind(chat_id)
    .bind(MAX_TRACES_PER_CHAT)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    get_execution_trace(pool, chat_id, message_id)
        .await?
        .ok_or_else(|| ZenError::Custom("Execution trace was not available after persistence".to_string()))
}

pub async fn get_execution_trace(
    pool: &SqlitePool,
    chat_id: &str,
    message_id: &str,
) -> ZenResult<Option<ExecutionTraceSnapshot>> {
    let record = sqlx::query_as::<_, ExecutionTraceRecord>(
        "SELECT trace_id, chat_id, message_id, trace_version, status, started_at, completed_at, updated_at, event_count FROM execution_traces WHERE chat_id = ? AND message_id = ?",
    )
    .bind(chat_id)
    .bind(message_id)
    .fetch_optional(pool)
    .await?;
    let Some(record) = record else { return Ok(None); };
    let events = sqlx::query_as::<_, ExecutionTraceEventRecord>(
        "SELECT id, trace_id, node_id, run_id, sequence, parent_id, kind, phase, summary, target, result_summary, output_preview, agent_id, agent_name, safe_details_json, payload_json, started_at, completed_at, duration_ms, retry_count FROM execution_trace_events WHERE trace_id = ? ORDER BY sequence ASC, rowid ASC",
    )
    .bind(&record.trace_id)
    .fetch_all(pool)
    .await?;
    let nodes = nodes_from_events(&events, &record.message_id);
    let steps = events
        .iter()
        .filter_map(|event| serde_json::from_str::<Value>(&event.payload_json).ok())
        .collect();
    Ok(Some(ExecutionTraceSnapshot {
        trace_id: record.trace_id,
        chat_id: record.chat_id,
        message_id: record.message_id,
        trace_version: record.trace_version,
        status: record.status,
        started_at: record.started_at,
        completed_at: record.completed_at,
        updated_at: record.updated_at,
        event_count: record.event_count,
        nodes,
        steps,
    }))
}

pub async fn list_execution_traces(
    pool: &SqlitePool,
    chat_id: &str,
) -> ZenResult<Vec<ExecutionTraceSnapshot>> {
    let records = sqlx::query_as::<_, ExecutionTraceRecord>(
        "SELECT trace_id, chat_id, message_id, trace_version, status, started_at, completed_at, updated_at, event_count FROM execution_traces WHERE chat_id = ? ORDER BY updated_at ASC",
    )
    .bind(chat_id)
    .fetch_all(pool)
    .await?;
    let mut snapshots = Vec::with_capacity(records.len());
    for record in records {
        let events = sqlx::query_as::<_, ExecutionTraceEventRecord>(
            "SELECT id, trace_id, node_id, run_id, sequence, parent_id, kind, phase, summary, target, result_summary, output_preview, agent_id, agent_name, safe_details_json, payload_json, started_at, completed_at, duration_ms, retry_count FROM execution_trace_events WHERE trace_id = ? ORDER BY sequence ASC, rowid ASC",
        )
        .bind(&record.trace_id)
        .fetch_all(pool)
        .await?;
        let nodes = nodes_from_events(&events, &record.message_id);
        let steps = events
            .iter()
            .filter_map(|event| serde_json::from_str::<Value>(&event.payload_json).ok())
            .collect();
        snapshots.push(ExecutionTraceSnapshot {
            trace_id: record.trace_id,
            chat_id: record.chat_id,
            message_id: record.message_id,
            trace_version: record.trace_version,
            status: record.status,
            started_at: record.started_at,
            completed_at: record.completed_at,
            updated_at: record.updated_at,
            event_count: record.event_count,
            nodes,
            steps,
        });
    }
    Ok(snapshots)
}

pub async fn migrate_legacy_trace_rows(pool: &SqlitePool) -> ZenResult<()> {
    // The legacy column remains as a compatibility fallback. This idempotent
    // migration registers each existing envelope as a normalized trace; the
    // next frontend checkpoint replaces the legacy projection with per-event
    // records through upsert_execution_trace.
    sqlx::query(
        "INSERT OR IGNORE INTO execution_traces (trace_id, chat_id, message_id, trace_version, status, updated_at, event_count) SELECT 'trace:' || id, chat_id, id, 1, COALESCE(json_extract(steps_json, '$.trace_status'), 'checkpoint'), COALESCE(json_extract(steps_json, '$.saved_at'), datetime('now')), 0 FROM messages WHERE role = 'assistant' AND steps_json IS NOT NULL AND json_valid(steps_json)",
    )
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_array_and_versioned_envelopes() {
        assert_eq!(parse_steps("[]").unwrap().len(), 0);
        assert_eq!(parse_steps(r#"{"steps":[{"type":"text"}]}"#).unwrap().len(), 1);
    }

    #[test]
    fn rejects_invalid_trace_payloads() {
        assert!(parse_steps("not json").is_err());
        assert!(parse_steps(r#"{"status":"running"}"#).is_err());
    }

    #[test]
    fn monotonic_sequence_preserves_order_for_duplicate_or_regressed_values() {
        let mut last = -1;
        assert_eq!(monotonic_sequence(4, &mut last), 4);
        assert_eq!(monotonic_sequence(4, &mut last), 5);
        assert_eq!(monotonic_sequence(2, &mut last), 6);
        assert_eq!(monotonic_sequence(-10, &mut last), 7);
    }

    #[test]
    fn caps_event_count_and_payload_size() {
        let steps = (0..MAX_TRACE_EVENTS + 10)
            .map(|index| json!({ "type": "action", "eventId": index.to_string() }))
            .collect::<Vec<_>>();
        let parsed = parse_steps(&serde_json::to_string(&steps).unwrap()).unwrap();
        assert_eq!(parsed.len(), MAX_TRACE_EVENTS);
        let large = json!({ "type": "text", "content": "x".repeat(MAX_TRACE_EVENT_BYTES + 1) });
        assert!(safe_payload(&large).len() < MAX_TRACE_EVENT_BYTES);
    }
}
