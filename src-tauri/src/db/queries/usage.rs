use serde::Serialize;
use sqlx::{FromRow, QueryBuilder, Sqlite, SqlitePool};

use crate::error::ZenResult;

const MAX_MODELS: usize = 256;
const MAX_HISTORY_ITEMS: i64 = 24;
const MAX_PERIOD_DAYS: u16 = 365;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsageSummary {
    pub model: String,
    pub requests: i64,
    pub tokens_in: i64,
    pub tokens_out: i64,
    pub last_used_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsageHistoryItem {
    pub id: String,
    pub model: String,
    pub tokens_in: i64,
    pub tokens_out: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UsageDay {
    pub day: String,
    pub requests: i64,
    pub tokens_in: i64,
    pub tokens_out: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsageSnapshot {
    pub total_requests: i64,
    pub total_tokens_in: i64,
    pub total_tokens_out: i64,
    pub models: Vec<ModelUsageSummary>,
    pub history: Vec<ModelUsageHistoryItem>,
    pub daily: Vec<UsageDay>,
}

fn apply_completed_assistant_filter<'a>(
    builder: &mut QueryBuilder<'a, Sqlite>,
    model_ids: &[String],
    period_days: Option<u16>,
) {
    builder.push(" WHERE role = 'assistant' AND is_complete = 1");
    builder.push(" AND model IS NOT NULL AND model <> ''");
    builder.push(" AND (tokens_in IS NOT NULL OR tokens_out IS NOT NULL)");
    builder.push(" AND model IN (");
    let mut separated = builder.separated(", ");
    for model in model_ids.iter().take(MAX_MODELS) {
        // QueryBuilder retains bound values for the duration of the query, so
        // own the identifier rather than borrowing the request slice.
        separated.push_bind(model.clone());
    }
    separated.push_unseparated(")");
    if let Some(days) = period_days {
        builder.push(" AND created_at >= datetime('now', '-' || ");
        builder.push_bind(days.to_string());
        builder.push(" || ' days')");
    }
}

pub async fn get_provider_usage(
    pool: &SqlitePool,
    model_ids: &[String],
    period_days: Option<u16>,
) -> ZenResult<ProviderUsageSnapshot> {
    let period_days = period_days.map(|days| days.clamp(1, MAX_PERIOD_DAYS));
    if model_ids.is_empty() {
        return Ok(ProviderUsageSnapshot {
            total_requests: 0,
            total_tokens_in: 0,
            total_tokens_out: 0,
            models: Vec::new(),
            history: Vec::new(),
            daily: Vec::new(),
        });
    }

    let mut summaries_query = QueryBuilder::<Sqlite>::new(
        "SELECT model, COUNT(*) AS requests, COALESCE(SUM(tokens_in), 0) AS tokens_in, \
         COALESCE(SUM(tokens_out), 0) AS tokens_out, MAX(created_at) AS last_used_at FROM messages",
    );
    apply_completed_assistant_filter(&mut summaries_query, model_ids, period_days);
    summaries_query.push(" GROUP BY model ORDER BY last_used_at DESC, model ASC");
    let models = summaries_query
        .build_query_as::<ModelUsageSummary>()
        .fetch_all(pool)
        .await.map_err(crate::error::db_err)?;

    let total_requests = models.iter().map(|item| item.requests).sum();
    let total_tokens_in = models.iter().map(|item| item.tokens_in).sum();
    let total_tokens_out = models.iter().map(|item| item.tokens_out).sum();

    let mut history_query = QueryBuilder::<Sqlite>::new(
        "SELECT id, model, COALESCE(tokens_in, 0) AS tokens_in, \
         COALESCE(tokens_out, 0) AS tokens_out, created_at FROM messages",
    );
    apply_completed_assistant_filter(&mut history_query, model_ids, period_days);
    history_query.push(" ORDER BY created_at DESC, id DESC LIMIT ");
    history_query.push_bind(MAX_HISTORY_ITEMS);
    let history = history_query
        .build_query_as::<ModelUsageHistoryItem>()
        .fetch_all(pool)
        .await.map_err(crate::error::db_err)?;

    let mut daily_query = QueryBuilder::<Sqlite>::new(
        "SELECT strftime('%Y-%m-%d', created_at) AS day, COUNT(*) AS requests, \
         COALESCE(SUM(tokens_in), 0) AS tokens_in, COALESCE(SUM(tokens_out), 0) AS tokens_out \
         FROM messages",
    );
    apply_completed_assistant_filter(&mut daily_query, model_ids, period_days);
    daily_query.push(" GROUP BY day ORDER BY day ASC");
    let daily = daily_query
        .build_query_as::<UsageDay>()
        .fetch_all(pool)
        .await.map_err(crate::error::db_err)?;

    Ok(ProviderUsageSnapshot {
        total_requests,
        total_tokens_in,
        total_tokens_out,
        models,
        history,
        daily,
    })
}
