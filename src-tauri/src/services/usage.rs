use crate::db::queries::{self, ProviderUsageSnapshot};
use crate::error::ZenResult;

#[derive(Clone, Default)]
pub struct UsageService;

impl UsageService {
    pub async fn provider_snapshot(
        &self,
        db: &sqlx::SqlitePool,
        model_ids: &[String],
    ) -> ZenResult<ProviderUsageSnapshot> {
        queries::get_provider_usage(db, model_ids).await
    }
}
