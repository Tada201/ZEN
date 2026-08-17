//! Thread-goal workflow service (`/goal`).
//!
//! Owns the goal lifecycle rules and the `goal:updated` event contract so
//! Tauri commands and the `update_goal` agent tool stay thin adapters:
//!
//! - `set_goal` — a new objective always restarts the run (status `active`,
//!   continuation counter reset).
//! - `pause` / `resume` / `clear` — user-controlled only.
//! - `complete` / `blocked` — terminal states reachable from the model via
//!   the `update_goal` tool or from the user.
//!
//! Every mutation emits `goal:updated { chat_id, goal }` (goal = null on
//! clear) so the frontend `goalStore` mirrors the DB without polling.

use serde_json::json;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};

use crate::db::models::ThreadGoal;
use crate::db::queries;
use crate::error::{ZenError, ZenResult};

pub const GOAL_STATUS_ACTIVE: &str = "active";
pub const GOAL_STATUS_PAUSED: &str = "paused";
pub const GOAL_STATUS_COMPLETE: &str = "complete";
pub const GOAL_STATUS_BLOCKED: &str = "blocked";

const OBJECTIVE_MIN_CHARS: usize = 3;
const OBJECTIVE_MAX_CHARS: usize = 2000;

fn emit_goal_updated(app: &AppHandle, chat_id: &str, goal: Option<&ThreadGoal>) {
    let payload = match goal {
        Some(g) => json!({ "chat_id": chat_id, "goal": g }),
        None => json!({ "chat_id": chat_id, "goal": null }),
    };
    let _ = app.emit("goal:updated", payload);
}

pub async fn get_goal(pool: &SqlitePool, chat_id: &str) -> ZenResult<Option<ThreadGoal>> {
    queries::get_thread_goal(pool, chat_id).await
}

pub async fn set_goal(
    app: &AppHandle,
    pool: &SqlitePool,
    chat_id: &str,
    objective: &str,
) -> ZenResult<ThreadGoal> {
    let objective = objective.trim();
    if objective.len() < OBJECTIVE_MIN_CHARS {
        return Err(ZenError::Custom(
            "Goal objective is too short — describe what the agent should achieve.".to_string(),
        ));
    }
    if objective.len() > OBJECTIVE_MAX_CHARS {
        return Err(ZenError::Custom(format!(
            "Goal objective is too long (max {OBJECTIVE_MAX_CHARS} characters)."
        )));
    }
    let goal = queries::upsert_thread_goal(pool, chat_id, objective).await?;
    emit_goal_updated(app, chat_id, Some(&goal));
    Ok(goal)
}

pub async fn update_status(
    app: &AppHandle,
    pool: &SqlitePool,
    chat_id: &str,
    status: &str,
) -> ZenResult<Option<ThreadGoal>> {
    let normalized = match status.trim().to_ascii_lowercase().as_str() {
        "active" | "resume" | "resumed" => GOAL_STATUS_ACTIVE,
        "paused" | "pause" => GOAL_STATUS_PAUSED,
        "complete" | "completed" => GOAL_STATUS_COMPLETE,
        "blocked" => GOAL_STATUS_BLOCKED,
        other => {
            return Err(ZenError::Custom(format!(
                "Unknown goal status '{other}'. Use active, paused, complete, or blocked."
            )));
        }
    };
    let goal = queries::set_thread_goal_status(pool, chat_id, normalized).await?;
    if let Some(ref g) = goal {
        emit_goal_updated(app, chat_id, Some(g));
    }
    Ok(goal)
}

pub async fn clear_goal(app: &AppHandle, pool: &SqlitePool, chat_id: &str) -> ZenResult<()> {
    queries::delete_thread_goal(pool, chat_id).await?;
    emit_goal_updated(app, chat_id, None);
    Ok(())
}

/// Record that the frontend started an automatic goal-continuation turn so
/// the counter bounds runaway loops.
pub async fn note_continuation_turn(pool: &SqlitePool, chat_id: &str) -> ZenResult<()> {
    queries::increment_thread_goal_turns(pool, chat_id).await
}

/// The system-prompt block injected into every turn of a chat with an active
/// goal. Mirrors Codex's continuation discipline: persist the full objective,
/// never shrink it, complete only with evidence.
pub fn goal_system_block(goal: &ThreadGoal) -> String {
    format!(
        "\n\n## Active Thread Goal\n\
The user has set a persistent goal for this session:\n\
\"{objective}\"\n\
\
Rules for working toward the goal:\n\
- Every turn should make concrete progress toward this objective. Do not weaken, shrink, or reinterpret the objective.\n\
- The `update_goal` tool is available. Call it with status \"complete\" ONLY when the goal is verifiably achieved, citing the evidence in `evidence`. Call it with status \"blocked\" only when the same blocker has persisted across consecutive attempts and you cannot proceed without the user.\n\
- Do not mark the goal complete merely because a single step finished; the whole objective must be met.\n\
- If you are uncertain whether the goal is met, state what specifically remains and continue working.\n\
(Goal turns so far: {turns})",
        objective = goal.objective,
        turns = goal.turns_count
    )
}
