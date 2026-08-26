use zen_db::queries::{self, ProviderUsageSnapshot};
use zen_core::error::ZenResult;

#[derive(Clone, Default)]
pub struct UsageService;

impl UsageService {
    pub async fn provider_snapshot(
        &self,
        db: &sqlx::SqlitePool,
        model_ids: &[String],
        period_days: Option<u16>,
    ) -> ZenResult<ProviderUsageSnapshot> {
        queries::get_provider_usage(db, model_ids, period_days).await
    }
}
