//! Background tasks: compaction, embedding, and recall-cache refresh.
//! These run fire-and-forget via `tokio::spawn` after the LLM responds.

use super::helpers::{estimate_conversation_tokens, estimate_tokens};
use super::Runner;
use zen_db::models::ChatMessage;
use zen_db::queries;
use zen_llm::LlmProvider;
use anyhow::Result;
use sqlx::SqlitePool;
use tokio_util::sync::CancellationToken;

// ─── Trigger methods (on Runner) ─────────────────────────────────────────────

impl Runner {
    /// Fire-and-forget: summarize old messages and compact the conversation.
    ///
    /// `summarization_model` is the per-run setting already loaded from SQLite in
    /// `run()`. It is passed explicitly so the background task uses the same
    /// value rather than falling back to the stale `self.config` snapshot.
    pub(super) fn trigger_background_compaction(
        &self,
        chat_id: &str,
        model: &str,
        summarization_model: Option<String>,
    ) {
        if let Some(ref db) = self.db_pool {
            let db_clone = db.clone();
            let chat_id_clone = chat_id.to_string();
            let model_clone = model.to_string();
            let ctx_clone = self.ctx.clone();
            let compaction_threshold = self.config.compaction_threshold;
            let compaction_token_threshold = self.config.compaction_token_threshold;
            let summarization_token_budget = self.config.summarization_token_budget;

            tokio::spawn(async move {
                if let Err(e) = perform_background_compaction(CompactionParams {
                    ctx: ctx_clone,
                    db: db_clone,
                    chat_id: chat_id_clone,
                    active_model: model_clone,
                    summarization_model,
                    compaction_threshold,
                    compaction_token_threshold,
                    summarization_token_budget,
                    force: false,
                    instructions: None,
                })
                .await
                {
                    tracing::error!("Background conversation compaction failed: {:?}", e);
                }
            });
        }
    }

    /// Fire-and-forget: embed new user messages and store vectors in LanceDB.
    pub(super) fn trigger_background_embedding(&self, chat_id: &str) {
        if let Some(ref db) = self.db_pool {
            let db_clone = db.clone();
            let chat_id_clone = chat_id.to_string();
            let ctx_clone = self.ctx.clone();

            tokio::spawn(async move {
                if let Err(e) =
                    perform_background_embedding(ctx_clone, db_clone, chat_id_clone).await
                {
                    tracing::error!("Background semantic embedding failed: {:?}", e);
                }
            });
        }
    }

    /// Spawns a background task that embeds the latest user message, searches
    /// LanceDB for relevant past conversations, and stores the resulting recall
    /// block in `AppState.recall_cache` so the NEXT turn can inject it instantly
    /// without blocking the LLM call.
    pub(super) fn trigger_background_recall_cache(
        &self,
        chat_id: &str,
        max_recalled_messages: usize,
        semantic_recall_enabled: bool,
    ) {
        if !semantic_recall_enabled {
            return;
        }
        let ctx_clone = self.ctx.clone();
        let chat_id_clone = chat_id.to_string();
        let db_clone = self.db_pool.clone();

        tokio::spawn(async move {
            // Fetch the latest user message text from DB
            let latest_user_text: Option<String> = if let Some(ref db) = db_clone {
                queries::get_active_messages(db, &chat_id_clone)
                    .await
                    .ok()
                    .and_then(|msgs| {
                        msgs.into_iter()
                            .rev()
                            .find(|m| m.role == "user")
                            .map(|m| m.content)
                    })
            } else {
                None
            };

            let user_text = match latest_user_text {
                Some(t) if !t.is_empty() => t,
                _ => return,
            };

            // Phase 6 seam: the context shares the same Arc handles AppState
            // owns, so there is no "missing state" path to guard anymore.
            let ctx = ctx_clone;

            // Compute embedding for the user message
            let mut query_vector: Option<Vec<f32>> = None;
            if let Some(ref emb_model) = *ctx.embedding_model.read().await {
                if let Ok(vec) = emb_model.encode(&user_text).await {
                    query_vector = Some(vec);
                }
            }
            if query_vector.is_none() {
                if let Ok(provider) = ctx.provider().await {
                    let model_name = if let Some(ref db) = db_clone {
                        queries::get_setting(db, "embedding_model")
                            .await
                            .unwrap_or_default()
                            .unwrap_or_else(|| "nomic-embed-text".to_string())
                    } else {
                        "nomic-embed-text".to_string()
                    };
                    if let Ok(vec) = provider.embed(&model_name, &user_text).await {
                        query_vector = Some(vec);
                    }
                }
            }

            let vec = match query_vector {
                Some(v) => v,
                None => return,
            };

            let store = match ctx.conversation_store.get().await {
                Ok(s) => s,
                Err(_) => return,
            };

            let results = match store.search(vec, 15).await {
                Ok(r) => r,
                Err(_) => return,
            };

            let mut recalled_memories = Vec::new();
            let mut recalled_tokens = 0usize;
            for res in results {
                if res.score < 1.0 && res.entry.chat_id != chat_id_clone {
                    let memory_str = format!(
                        "- Past User Message: \"{}\" (Session: {})\n",
                        res.entry.text.trim(),
                        res.entry.chat_id
                    );
                    let est_tok = estimate_tokens(&memory_str);
                    if recalled_tokens + est_tok > 1500 {
                        break;
                    }
                    recalled_tokens += est_tok;
                    recalled_memories.push(memory_str);
                    if recalled_memories.len() >= max_recalled_messages {
                        break;
                    }
                }
            }

            let mut recall_block = String::new();
            if !recalled_memories.is_empty() {
                recall_block.push_str("\n\n## Relevant Past Conversations (Semantic Recall)\nHere are some relevant messages you discussed in other sessions to help you maintain consistency:\n");
                for memory in recalled_memories {
                    recall_block.push_str(&memory);
                }
            }

            let mut cache = ctx.recall_cache.lock().await;
            cache.insert(chat_id_clone.clone(), (recall_block, user_text));
            tracing::debug!(chat_id = %chat_id_clone, "Background recall cache refreshed");
        });
    }

    /// LLM-based summarization (used by compaction).
    ///
    /// `instructions` carries the optional focus text the user supplied with
    /// a manual `/compact <instructions>`; when present it is appended to
    /// the summary prompt as a clearly separated priority section.
    pub async fn summarize_messages(
        messages: &[ChatMessage],
        provider: &dyn LlmProvider,
        model: &str,
        max_tokens: usize,
        instructions: Option<&str>,
    ) -> Result<String> {
        let mut text = String::new();
        for m in messages {
            if m.role == "system" {
                continue;
            }
            let name_part = m
                .tool_call_id
                .as_ref()
                .map(|id| format!(" (tool: {})", id))
                .unwrap_or_default();
            text.push_str(&format!("{}{} : {}\n", m.role, name_part, m.content));
        }

        let mut prompt = format!(
            "Please provide a concise, high-level summary of the following conversation history. \
             Focus on the user's intent, the key questions asked, decisions made, and important details. \
             Do not include details about specific file tools used unless crucial. \
             Keep the summary brief and under 3-4 sentences.\n\nConversation:\n{}",
            text
        );
        if let Some(focus) = instructions.map(str::trim).filter(|s| !s.is_empty()) {
            prompt.push_str(&format!(
                "\n\nThe user requested this compaction with the following focus instructions — prioritize preserving these aspects:\n{}",
                focus
            ));
        }

        let prompt_message = ChatMessage {
            role: "user".to_string(),
            content: prompt,
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        };

        let config = zen_llm::ChatRequestConfig {
            temperature: Some(0.3),
            max_tokens: Some(max_tokens as i64),
            ..Default::default()
        };

        let res = provider
            .chat_stream(
                model,
                vec![prompt_message],
                None,
                config,
                Box::new(|_| {}),
                CancellationToken::new(),
            )
            .await?;

        Ok(res.content)
    }

    /// Manual (`/compact`) compaction entry point used by
    /// `services::compact`. Runs the same machinery as the automatic
    /// post-turn compaction but bypasses the threshold gate and threads
    /// the user's optional focus instructions into the summary prompt.
    /// The `config` bundle mirrors the values `trigger_background_compaction`
    /// sources from the runner's run config.
    ///
    /// Returns `(messages_summarized, messages_kept)`; `(0, n)` means the
    /// active window did not exceed the keep window and nothing was
    /// summarized (the caller decides how to report that).
    pub async fn compact_conversation_now(
        ctx: crate::context::AgentContext,
        db: SqlitePool,
        chat_id: String,
        active_model: String,
        config: super::config::RunConfig,
        instructions: Option<String>,
    ) -> Result<(usize, usize)> {
        let outcome = perform_background_compaction(CompactionParams {
            ctx,
            db,
            chat_id,
            active_model,
            summarization_model: config.summarization_model,
            compaction_threshold: config.compaction_threshold,
            compaction_token_threshold: config.compaction_token_threshold,
            summarization_token_budget: config.summarization_token_budget,
            force: true,
            instructions,
        })
        .await?;
        Ok((outcome.messages_summarized, outcome.messages_kept))
    }
}

// ─── Async worker functions ────────────────────────────────────────────────────

/// Summarize old messages and mark them as compacted in SQLite.
struct CompactionParams {
    ctx: crate::context::AgentContext,
    db: SqlitePool,
    chat_id: String,
    active_model: String,
    summarization_model: Option<String>,
    compaction_threshold: usize,
    compaction_token_threshold: usize,
    summarization_token_budget: usize,
    /// Manual (`/compact`) path: compact even when under the thresholds.
    force: bool,
    /// Optional user focus instructions threaded into the summary prompt.
    instructions: Option<String>,
}

/// What one compaction pass actually did. `messages_summarized == 0` means
/// the gate (or the keep window) skipped summarization entirely.
struct CompactionOutcome {
    messages_summarized: usize,
    messages_kept: usize,
}

async fn perform_background_compaction(params: CompactionParams) -> Result<CompactionOutcome> {
    let CompactionParams {
        ctx,
        db,
        chat_id,
        active_model,
        summarization_model,
        compaction_threshold,
        compaction_token_threshold,
        summarization_token_budget,
        force,
        instructions,
    } = params;
    // Phase 6 seam: provider resolution now flows through the shared context.
    let active_msgs = queries::get_active_messages(&db, &chat_id).await?;

    let active_chat_msgs: Vec<ChatMessage> = active_msgs
        .iter()
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
            reasoning_details: None,
            images: None,
            tool_calls: m
                .tool_calls
                .as_ref()
                .and_then(|tc_str| serde_json::from_str(tc_str).ok()),
            tool_call_id: m.tool_call_id.clone(),
        })
        .collect();

    let current_tokens = estimate_conversation_tokens(&active_chat_msgs);

    if force
        || active_msgs.len() > compaction_threshold
        || current_tokens > compaction_token_threshold
    {
        tracing::info!(
            chat_id = %chat_id,
            msg_count = %active_msgs.len(),
            tokens = %current_tokens,
            forced = force,
            "Starting conversation summarization."
        );

        let keep_count = 10;
        if active_msgs.len() > keep_count {
            let split_index = active_msgs.len() - keep_count;
            let (to_summarize, _) = active_chat_msgs.split_at(split_index);
            let (to_summarize_db, _) = active_msgs.split_at(split_index);

            let resolved_provider_name = match queries::get_setting(&db, "active_provider").await {
                Ok(Some(p)) if !p.is_empty() => p,
                _ => "ollama".to_string(),
            };
            let provider = ctx.provider_by_name(&resolved_provider_name, &db).await?;
            let sum_model = summarization_model.unwrap_or(active_model);

            let summary = Runner::summarize_messages(
                to_summarize,
                &*provider,
                &sum_model,
                summarization_token_budget,
                instructions.as_deref(),
            )
            .await?;

            // An empty completion (e.g. a model that emits only thinking
            // tokens) must not stand in for the summarized history.
            if summary.trim().is_empty() {
                anyhow::bail!(
                    "Summarization model returned an empty summary; aborting compaction"
                );
            }

            let message_count = to_summarize.len() as i32;
            let token_count = estimate_conversation_tokens(to_summarize) as i32;

            queries::save_summary(
                &db,
                &chat_id,
                &summary,
                Some(message_count),
                Some(token_count),
            )
            .await?;

            let ids_to_compact: Vec<String> =
                to_summarize_db.iter().map(|m| m.id.clone()).collect();
            queries::mark_messages_compacted_by_ids(&db, &ids_to_compact).await?;
            tracing::info!(
                chat_id = %chat_id,
                compacted_count = %message_count,
                "Marked {} messages as compacted by ID", message_count
            );

            return Ok(CompactionOutcome {
                messages_summarized: to_summarize.len(),
                messages_kept: active_msgs.len() - to_summarize.len(),
            });
        }
    }

    Ok(CompactionOutcome {
        messages_summarized: 0,
        messages_kept: active_msgs.len(),
    })
}

/// Embed new user messages and upsert their vectors into LanceDB.
async fn perform_background_embedding(
    ctx: crate::context::AgentContext,
    db: SqlitePool,
    chat_id: String,
) -> Result<()> {
    let store = match ctx.conversation_store.get().await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("ConversationStore not initialized: {:?}", e);
            return Ok(());
        }
    };

    let active_msgs = queries::get_active_messages(&db, &chat_id).await?;
    let user_msgs: Vec<zen_db::models::Message> = active_msgs
        .into_iter()
        .filter(|m| m.role == "user" && m.content.len() > 50)
        .collect();

    if user_msgs.is_empty() {
        return Ok(());
    }

    let model_name = queries::get_setting(&db, "embedding_model")
        .await
        .unwrap_or_default()
        .unwrap_or_else(|| "nomic-embed-text".to_string());

    for msg in user_msgs {
        let mut vector = None;
        if let Some(ref model) = *ctx.embedding_model.read().await {
            if let Ok(vec) = model.encode(&msg.content).await {
                vector = Some(vec);
            }
        }
        if vector.is_none() {
            if let Ok(provider) = ctx.provider().await {
                if let Ok(vec) = provider.embed(&model_name, &msg.content).await {
                    vector = Some(vec);
                }
            }
        }

        if let Some(vec) = vector {
            let entry = zen_rag::conversation_store::ConversationVector {
                id: uuid::Uuid::new_v4().to_string(),
                chat_id: chat_id.clone(),
                message_id: msg.id.clone(),
                vector: vec,
                text: msg.content.clone(),
                role: msg.role.clone(),
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64,
                metadata: msg.metadata.unwrap_or_default(),
            };
            store.upsert_by_message_id(entry).await?;
            tracing::info!(chat_id = %chat_id, message_id = %msg.id, "Stored conversation vector");
        }
    }

    Ok(())
}
