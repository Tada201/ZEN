use anyhow::Result;
use arrow_array::{RecordBatch, RecordBatchIterator};
use arrow_schema::{DataType, Field as ArrowField, Schema as ArrowSchema};
use async_trait::async_trait;
use lancedb::query::{ExecutableQuery, QueryBase};
use std::sync::Arc;

use super::{DocumentChunk, SearchResult, VectorStore};

pub struct LanceDbStore {
    db_uri: String,
    collection_name: String,
    dimension: usize,
}

impl LanceDbStore {
    pub fn new(db_uri: String, collection_name: String, dimension: usize) -> Self {
        Self {
            db_uri,
            collection_name,
            dimension,
        }
    }

    async fn get_connection(&self) -> Result<lancedb::connection::Connection> {
        lancedb::connect(&self.db_uri)
            .execute()
            .await
            .map_err(anyhow::Error::from)
    }
}

#[async_trait]
impl VectorStore for LanceDbStore {
    async fn init(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_connection().await?;

        let existing_tables = conn.table_names().execute().await?;
        if !existing_tables.contains(&self.collection_name) {
            // Define Arrow Schema for our collection
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
                ArrowField::new("source", DataType::Utf8, false),
                ArrowField::new("text", DataType::Utf8, false),
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

    async fn add_chunks(
        &self,
        chunks: Vec<DocumentChunk>,
        embeddings: Vec<Vec<f32>>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if chunks.len() != embeddings.len() {
            return Err("Chunks and embeddings length mismatch".into());
        }
        if chunks.is_empty() {
            return Ok(());
        }

        let conn = self.get_connection().await?;
        let table = conn.open_table(&self.collection_name).execute().await?;

        use arrow_array::{FixedSizeListArray, Float32Array, StringArray};

        let mut ids = Vec::new();
        let mut sources = Vec::new();
        let mut texts = Vec::new();
        let mut metadatas = Vec::new();
        let mut flat_embeddings = Vec::new();

        for (chunk, vector) in chunks.into_iter().zip(embeddings) {
            ids.push(chunk.id);
            sources.push(chunk.source);
            texts.push(chunk.text);
            metadatas.push(chunk.metadata);
            flat_embeddings.extend(vector);
        }

        let id_array = Arc::new(StringArray::from(ids)) as Arc<dyn arrow_array::Array>;
        let source_array = Arc::new(StringArray::from(sources)) as Arc<dyn arrow_array::Array>;
        let text_array = Arc::new(StringArray::from(texts)) as Arc<dyn arrow_array::Array>;
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
            ArrowField::new("source", DataType::Utf8, false),
            ArrowField::new("text", DataType::Utf8, false),
            ArrowField::new("metadata", DataType::Utf8, false),
        ]));

        let batch = RecordBatch::try_new(
            schema.clone(),
            vec![
                id_array,
                vector_array,
                source_array,
                text_array,
                metadata_array,
            ],
        )?;

        let reader = RecordBatchIterator::new(vec![Ok(batch)], schema.clone());
        table.add(Box::new(reader)).execute().await?;

        Ok(())
    }

    async fn search(
        &self,
        query_embedding: Vec<f32>,
        limit: usize,
    ) -> Result<Vec<SearchResult>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_connection().await?;
        let table = conn.open_table(&self.collection_name).execute().await?;

        // Perform nearest neighbor search
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

            // Assuming default lancedb behavior includes _distance
            let distance_col = batch.column_by_name("_distance");

            // The table schema is created by this store (see add()), so these
            // columns are structural invariants — but schema drift must fail
            // the query loudly rather than panic.
            let missing =
                |name: &str| format!("lancedb search result batch missing column '{name}'");
            let id_col = batch
                .column_by_name("id")
                .ok_or_else(|| missing("id"))?
                .as_string::<i32>();
            let source_col = batch
                .column_by_name("source")
                .ok_or_else(|| missing("source"))?
                .as_string::<i32>();
            let text_col = batch
                .column_by_name("text")
                .ok_or_else(|| missing("text"))?
                .as_string::<i32>();
            let metadata_col = batch
                .column_by_name("metadata")
                .ok_or_else(|| missing("metadata"))?
                .as_string::<i32>();

            for i in 0..batch.num_rows() {
                let score = if let Some(dist) = distance_col {
                    dist.as_primitive::<Float32Type>().value(i)
                } else {
                    0.0
                };

                let chunk = DocumentChunk {
                    id: id_col.value(i).to_string(),
                    source: source_col.value(i).to_string(),
                    text: text_col.value(i).to_string(),
                    metadata: metadata_col.value(i).to_string(),
                };

                results.push(SearchResult { chunk, score });
            }
        }

        Ok(results)
    }

    async fn delete_by_source(
        &self,
        source: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_connection().await?;
        let table = conn.open_table(&self.collection_name).execute().await?;
        // Escape single-quotes in the source path to prevent SQL injection
        let escaped = source.replace('\'', "''");
        table.delete(&format!("source = '{escaped}'")).await?;
        Ok(())
    }
}
