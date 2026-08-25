use anyhow::Result;
use arrow_array::{
    FixedSizeListArray, Float32Array, Int64Array, RecordBatch, RecordBatchIterator, StringArray,
};
use arrow_schema::{DataType, Field as ArrowField, Schema as ArrowSchema};
use lancedb::query::{ExecutableQuery, QueryBase};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationVector {
    pub id: String,
    pub chat_id: String,
    pub message_id: String,
    pub vector: Vec<f32>,
    pub text: String,
    pub role: String,
    pub timestamp: i64,
    pub metadata: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSearchResult {
    pub entry: ConversationVector,
    pub score: f32, // similarity distance
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationStats {
    pub total_vectors: usize,
}

pub struct ConversationStore {
    db_uri: String,
    collection_name: String,
    dimension: usize,
}

impl ConversationStore {
    pub fn new(db_uri: String, collection_name: String, dimension: usize) -> Self {
        Self {
            db_uri,
            collection_name,
            dimension,
        }
    }

    pub fn dimension(&self) -> usize {
        self.dimension
    }

    async fn get_connection(&self) -> Result<lancedb::connection::Connection> {
        lancedb::connect(&self.db_uri)
            .execute()
            .await
            .map_err(anyhow::Error::from)
    }

    pub async fn init(&self) -> Result<()> {
        let conn = self.get_connection().await?;
        let existing_tables = conn.table_names().execute().await?;
        if !existing_tables.contains(&self.collection_name) {
            // Define Arrow Schema for our conversation collection
            let schema = Arc::new(ArrowSchema::new(vec![
                ArrowField::new("id", DataType::Utf8, false),
                ArrowField::new(
                    "vector",
                    DataType::FixedSizeList(
                        Arc::new(ArrowField::new("item", DataType::Float32, true)),
                        self.dimension as i32,
                    ),
                    false,
                ),
                ArrowField::new("chat_id", DataType::Utf8, false),
                ArrowField::new("message_id", DataType::Utf8, false),
                ArrowField::new("text", DataType::Utf8, false),
                ArrowField::new("role", DataType::Utf8, false),
                ArrowField::new("timestamp", DataType::Int64, false),
                ArrowField::new("metadata", DataType::Utf8, false),
            ]));

            // Create empty table
            let batches = vec![Ok(RecordBatch::new_empty(schema.clone()))];
            let reader = RecordBatchIterator::new(batches, schema.clone());
            conn.create_table(&self.collection_name, Box::new(reader))
                .execute()
                .await?;
        }

        Ok(())
    }

    pub async fn add(&self, entries: Vec<ConversationVector>) -> Result<()> {
        if entries.is_empty() {
            return Ok(());
        }

        let conn = self.get_connection().await?;
        let table = conn.open_table(&self.collection_name).execute().await?;

        let mut ids = Vec::new();
        let mut chat_ids = Vec::new();
        let mut message_ids = Vec::new();
        let mut texts = Vec::new();
        let mut roles = Vec::new();
        let mut timestamps = Vec::new();
        let mut metadatas = Vec::new();
        let mut flat_embeddings = Vec::new();

        for entry in entries {
            if entry.vector.len() != self.dimension {
                tracing::warn!(
                    "Embedding dimension mismatch: entry={}, expected={}",
                    entry.vector.len(),
                    self.dimension
                );
                continue;
            }
            ids.push(entry.id);
            chat_ids.push(entry.chat_id);
            message_ids.push(entry.message_id);
            texts.push(entry.text);
            roles.push(entry.role);
            timestamps.push(entry.timestamp);
            metadatas.push(entry.metadata);
            flat_embeddings.extend(entry.vector);
        }

        if ids.is_empty() {
            return Ok(());
        }

        let id_array = Arc::new(StringArray::from(ids)) as Arc<dyn arrow_array::Array>;
        let chat_id_array = Arc::new(StringArray::from(chat_ids)) as Arc<dyn arrow_array::Array>;
        let message_id_array =
            Arc::new(StringArray::from(message_ids)) as Arc<dyn arrow_array::Array>;
        let text_array = Arc::new(StringArray::from(texts)) as Arc<dyn arrow_array::Array>;
        let role_array = Arc::new(StringArray::from(roles)) as Arc<dyn arrow_array::Array>;
        let timestamp_array = Arc::new(Int64Array::from(timestamps)) as Arc<dyn arrow_array::Array>;
        let metadata_array = Arc::new(StringArray::from(metadatas)) as Arc<dyn arrow_array::Array>;

        let float_array = Arc::new(Float32Array::from(flat_embeddings));
        let vector_array = Arc::new(FixedSizeListArray::new(
            Arc::new(ArrowField::new("item", DataType::Float32, true)),
            self.dimension as i32,
            float_array,
            None,
        )) as Arc<dyn arrow_array::Array>;

        let schema = Arc::new(ArrowSchema::new(vec![
            ArrowField::new("id", DataType::Utf8, false),
            ArrowField::new(
                "vector",
                DataType::FixedSizeList(
                    Arc::new(ArrowField::new("item", DataType::Float32, true)),
                    self.dimension as i32,
                ),
                false,
            ),
            ArrowField::new("chat_id", DataType::Utf8, false),
            ArrowField::new("message_id", DataType::Utf8, false),
            ArrowField::new("text", DataType::Utf8, false),
            ArrowField::new("role", DataType::Utf8, false),
            ArrowField::new("timestamp", DataType::Int64, false),
            ArrowField::new("metadata", DataType::Utf8, false),
        ]));

        let batch = RecordBatch::try_new(
            schema.clone(),
            vec![
                id_array,
                vector_array,
                chat_id_array,
                message_id_array,
                text_array,
                role_array,
                timestamp_array,
                metadata_array,
            ],
        )?;

        let reader = RecordBatchIterator::new(vec![Ok(batch)], schema.clone());
        table.add(Box::new(reader)).execute().await?;

        Ok(())
    }

    pub async fn search(
        &self,
        query_embedding: Vec<f32>,
        limit: usize,
    ) -> Result<Vec<ConversationSearchResult>> {
        let conn = self.get_connection().await?;
        let table = conn.open_table(&self.collection_name).execute().await?;

        let mut stream = table
            .query()
            .nearest_to(query_embedding)?
            .limit(limit)
            .execute()
            .await?;

        let mut results = Vec::new();

        use arrow_array::cast::AsArray;
        use arrow_array::types::Float32Type;
        use futures::StreamExt;

        while let Some(batch) = stream.next().await {
            let batch = batch?;

            let distance_col = batch.column_by_name("_distance");

            let id_col = batch
                .column_by_name("id")
                .ok_or_else(|| anyhow::anyhow!("Missing column: id"))?
                .as_string::<i32>();
            let chat_id_col = batch
                .column_by_name("chat_id")
                .ok_or_else(|| anyhow::anyhow!("Missing column: chat_id"))?
                .as_string::<i32>();
            let message_id_col = batch
                .column_by_name("message_id")
                .ok_or_else(|| anyhow::anyhow!("Missing column: message_id"))?
                .as_string::<i32>();
            let text_col = batch
                .column_by_name("text")
                .ok_or_else(|| anyhow::anyhow!("Missing column: text"))?
                .as_string::<i32>();
            let role_col = batch
                .column_by_name("role")
                .ok_or_else(|| anyhow::anyhow!("Missing column: role"))?
                .as_string::<i32>();
            let timestamp_col = batch
                .column_by_name("timestamp")
                .ok_or_else(|| anyhow::anyhow!("Missing column: timestamp"))?
                .as_primitive::<arrow_array::types::Int64Type>();
            let metadata_col = batch
                .column_by_name("metadata")
                .ok_or_else(|| anyhow::anyhow!("Missing column: metadata"))?
                .as_string::<i32>();

            for i in 0..batch.num_rows() {
                let score = if let Some(dist) = distance_col {
                    dist.as_primitive::<Float32Type>().value(i)
                } else {
                    0.0
                };

                let entry = ConversationVector {
                    id: id_col.value(i).to_string(),
                    chat_id: chat_id_col.value(i).to_string(),
                    message_id: message_id_col.value(i).to_string(),
                    vector: vec![], // we don't need to rebuild the embedding vector for the search result
                    text: text_col.value(i).to_string(),
                    role: role_col.value(i).to_string(),
                    timestamp: timestamp_col.value(i),
                    metadata: metadata_col.value(i).to_string(),
                };

                results.push(ConversationSearchResult { entry, score });
            }
        }

        Ok(results)
    }

    pub async fn delete_by_chat_id(&self, chat_id: &str) -> Result<()> {
        let conn = self.get_connection().await?;
        let table = conn.open_table(&self.collection_name).execute().await?;
        let escaped = escape_sql_string(chat_id);
        table.delete(&format!("chat_id = '{escaped}'")).await?;
        Ok(())
    }

    pub async fn delete_by_message_id(&self, message_id: &str) -> Result<()> {
        let conn = self.get_connection().await?;
        let table = conn.open_table(&self.collection_name).execute().await?;
        let escaped = escape_sql_string(message_id);
        table.delete(&format!("message_id = '{escaped}'")).await?;
        Ok(())
    }

    pub async fn upsert_by_message_id(&self, entry: ConversationVector) -> Result<()> {
        let conn = self.get_connection().await?;
        let table = conn.open_table(&self.collection_name).execute().await?;
        let escaped = escape_sql_string(&entry.message_id);
        table.delete(&format!("message_id = '{escaped}'")).await?;
        self.add(vec![entry]).await
    }

    pub async fn clear_all(&self) -> Result<()> {
        let conn = self.get_connection().await?;
        let table = conn.open_table(&self.collection_name).execute().await?;
        table.delete("true").await?;
        Ok(())
    }

    pub async fn get_stats(&self) -> Result<ConversationStats> {
        let conn = self.get_connection().await?;
        let table = conn.open_table(&self.collection_name).execute().await?;
        let total_rows = table.count_rows(None).await?;
        Ok(ConversationStats {
            total_vectors: total_rows,
        })
    }
}

fn escape_sql_string(s: &str) -> String {
    let mut result = String::with_capacity(s.len() + 8);
    for ch in s.chars() {
        match ch {
            '\\' => result.push_str("\\\\"),
            '\'' => result.push_str("''"),
            '%' => result.push_str("\\%"),
            '_' => result.push_str("\\_"),
            _ => result.push(ch),
        }
    }
    result
}
