use std::path::PathBuf;
use crate::error::AppResult;

pub struct DocumentService;

impl DocumentService {
    pub fn new() -> Self {
        Self
    }

    pub async fn ingest(&self, path: PathBuf) -> AppResult<String> {
        // Mock ingestion for now
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        Ok(format!("Successfully ingested {}", path.display()))
    }

    pub async fn list(&self) -> AppResult<Vec<String>> {
        Ok(vec!["Strategic_Analysis_2024.pdf".to_string(), "Field_Report_Alpha.docx".to_string()])
    }
}
