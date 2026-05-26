use std::sync::Arc;
use std::collections::HashMap;
use tauri::AppHandle;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use sqlx::SqlitePool;
use tracing::info;

use crate::error::ZenResult;
use crate::db::models::ChatMessage;
use crate::db::queries;
use crate::llm::{ChatRequestConfig, ProviderRegistry};
use crate::services::SettingsService;
use crate::tools::GlobalToolRegistry;
use crate::tools::manager::ToolManager;
use crate::agent::runner::Runner;
use crate::agent::types::{Agent, AgentRegistry};
use crate::agent::hooks::HookRegistry;
use crate::agent::orchestrator::Orchestrator;

#[derive(Debug, Clone, serde::Deserialize)]
pub struct ThinkingConfig {
    pub enabled: bool,
    pub effort: Option<String>,
    pub budget_tokens: Option<i64>,
}

pub struct ChatService {
    app: AppHandle,
    provider_registry: Arc<ProviderRegistry>,
    settings_manager: Arc<SettingsService>,
    chat_cancellation_tokens: Arc<tokio::sync::Mutex<HashMap<String, CancellationToken>>>,
    tool_manager: Arc<ToolManager>,
    orchestrator: Option<Arc<Orchestrator>>,
    tool_registry_v1: Arc<RwLock<crate::agent::tools::ToolRegistry>>,
    agent_registry: Arc<AgentRegistry>,
    hook_registry: Arc<HookRegistry>,
    tools: GlobalToolRegistry,
}

impl ChatService {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        app: AppHandle,
        provider_registry: Arc<ProviderRegistry>,
        settings_manager: Arc<SettingsService>,
        chat_cancellation_tokens: Arc<tokio::sync::Mutex<HashMap<String, CancellationToken>>>,
        tool_manager: Arc<ToolManager>,
        orchestrator: Option<Arc<Orchestrator>>,
        tool_registry_v1: Arc<RwLock<crate::agent::tools::ToolRegistry>>,
        agent_registry: Arc<AgentRegistry>,
        hook_registry: Arc<HookRegistry>,
        tools: GlobalToolRegistry,
    ) -> Self {
        Self {
            app,
            provider_registry,
            settings_manager,
            chat_cancellation_tokens,
            tool_manager,
            orchestrator,
            tool_registry_v1,
            agent_registry,
            hook_registry,
            tools,
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn send_message(
        &self,
        db: SqlitePool,
        chat_id: String,
        content: String,
        model: Option<String>,
        provider: Option<String>,
        web_search: Option<bool>,
        deep_research: Option<bool>,
        temperature: Option<f64>,
        max_tokens: Option<i64>,
        top_p: Option<f64>,
        top_k: Option<i64>,
        presence_penalty: Option<f64>,
        frequency_penalty: Option<f64>,
        repeat_penalty: Option<f64>,
        seed: Option<i64>,
        stop: Option<Vec<String>>,
        thinking: Option<ThinkingConfig>,
        generative_ui: Option<bool>,
        tools: Option<Vec<String>>,
        _attachments: Option<Vec<crate::db::models::Attachment>>,
        system_prompt: Option<String>,
    ) -> ZenResult<()> {
        info!(
            chat_id = %chat_id,
            content_len = %content.len(),
            model = ?model,
            provider = ?provider,
            web_search = ?web_search,
            deep_research = ?deep_research,
            "Received send_message command"
        );

        queries::add_message(
            &db,
            &chat_id,
            None,
            "user",
            &content,
            model.as_deref(),
            true,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        ).await?;

        let resolved_provider_name = match provider.as_deref() {
            Some(p) if !p.is_empty() => p.to_string(),
            _ => {
                let active_setting = queries::get_setting(&db, "active_provider")
                    .await
                    .unwrap_or_default();
                active_setting.unwrap_or_else(|| "ollama".to_string())
            }
        };
        let active_model = model.ok_or_else(|| crate::error::ZenError::Custom(
            "No model selected. Open Settings → Models to choose a model.".to_string()
        ))?;

        info!(
            chat_id = %chat_id,
            resolved_provider_name = %resolved_provider_name,
            active_model = %active_model,
            "Fetching provider, history, and settings in parallel"
        );
        let (llm_provider, history, tools_enabled_str, custom_prompt_setting) = tokio::try_join!(
            self.provider_registry.create(&resolved_provider_name),
            queries::get_messages(&db, &chat_id),
            self.settings_manager.get("tools_enabled"),
            async { queries::get_setting(&db, "system_prompt").await },
        )?;
        info!(
            chat_id = %chat_id,
            history_count = %history.len(),
            resolved_provider = %resolved_provider_name,
            "Retrieved provider, chat history, and settings in parallel"
        );

        let mut config = ChatRequestConfig::default();
        config.temperature = temperature;
        config.max_tokens = max_tokens;
        config.top_p = top_p;
        config.top_k = top_k;
        config.presence_penalty = presence_penalty;
        config.frequency_penalty = frequency_penalty;
        config.repeat_penalty = repeat_penalty;
        config.seed = seed;
        config.stop = stop;

        if let Some(t) = thinking {
            if t.enabled {
                config.reasoning_effort = t.effort;
                config.thinking_budget = t.budget_tokens;
            }
        }

        let token = CancellationToken::new();

        let cancel_tokens = self.chat_cancellation_tokens.clone();
        {
            let mut tokens = cancel_tokens.lock().await;
            tokens.insert(chat_id.clone(), token.clone());
        }

        let chat_messages: Vec<ChatMessage> = history.into_iter().map(|m| ChatMessage {
            role: m.role,
            content: m.content,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        }).collect();

        let mut tool_ids = vec![];
        if web_search.unwrap_or(false) {
            tool_ids.push("web_search".to_string());
        }

        if let Some(requested_tools) = tools {
            tool_ids.extend(requested_tools);
        } else {
            let tools_enabled = tools_enabled_str
                .map(|s| s.trim() == "true")
                .unwrap_or(true);

            if tools_enabled && llm_provider.supports_tools(&active_model) {
                tool_ids.extend(vec![
                    "write_todos".to_string(),
                    "read_document_content".to_string(),
                    "list_documents".to_string(),
                    "run_command".to_string(),
                ]);
            }
        }

        let default_instructions = "You are Zen, a powerful agentic AI assistant. Keep responses direct, short, and highly concise. Avoid redundant conversational fluff.

## 🌟 Rich Content Markdown Support
Always use these specialized code blocks for visual scenarios:
1. 📊 CHARTS: Use ```chart with JSON schema: {\"type\":\"bar|line|area|pie\",\"title\":\"...\",\"xAxis\":\"x_key\",\"keys\":[\"y_key\"],\"data\":[{\"x_key\":\"val\",\"y_key\":num}]}.
2. 📐 ARCHITECTURE: Use ```mermaid code blocks for flowcharts, sequences, or component relationships.
3. 📁 STRUCTURE: Use ```tree with indentations to describe folder trees or directory structures.
4. 🧪 CANVAS (openui): Use ```openui containing layout primitive tags to render live interactive canvas widgets (when Gen UI is enabled).
5. 📢 ALERTS: Wrap callouts in standard blockquotes with headers (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]).

## 🚫 Critical Limitations & Strict Syntax Constraints
- Do not render raw HTML/React tags directly in plain text. All designs must be enclosed in the structural markdown blocks listed above.
- **CHART BLOCKS**: The content of ```chart MUST be RAW, VALID, PARSABLE JSON ONLY. Do NOT write markdown fences like ` ``` ` or the word `chart` INSIDE the block itself. Never double-escape characters or introduce control characters (like raw newlines, tabs, or backslashes inside string properties) that violate JSON standards.
- **MERMAID BLOCKS**: The content of ```mermaid MUST be strictly valid Mermaid syntax. Double check all bracket matchups, parentheses, arrow combinations, and diagram definitions (e.g. use standard flowcharts, sequence diagrams). Do NOT invent invalid keywords like `graph0]}}` or bad punctuation inside node definitions.
- **NEVER** write prefix markdown or metadata tags inside the code blocks. The code block opening tag (e.g. ```chart) must be immediately followed by the content (JSON/Mermaid code) and nothing else.".to_string();

        let mut instructions = match system_prompt {
            Some(p) if !p.trim().is_empty() => p,
            _ => match custom_prompt_setting {
                Some(p) if !p.trim().is_empty() => p,
                _ => default_instructions,
            }
        };

        if generative_ui.unwrap_or(false) {
            instructions.push_str("\n\n[SYSTEM STATE WARNING]\nIMPORTANT: The Generative UI feature is currently ENABLED for this message turn. You MUST generate any visual mockups, dashboards, grids, stacks, or styled templates inside ```openui ... ``` code blocks using the specified DSL catalog.");
        } else {
            instructions.push_str("\n\n[SYSTEM STATE WARNING]\nIMPORTANT: The Generative UI feature is currently DISABLED for this message turn. Do NOT generate any 'openui' or visual sandbox layout blocks. Provide all responses in plain, standard markdown or text.");
        }

        let agent = Agent {
            id: "zen_assistant".to_string(),
            name: "Zen".to_string(),
            instructions,
            tool_ids,
            model_override: None,
            max_iterations: Some(20),
            description: Some("Customized assistant".to_string()),
            model_tier: crate::agent::types::ModelTier::Local,
        };

        let chat_id_clone = chat_id.clone();

        if deep_research.unwrap_or(false) {
            let chat_id_inner = chat_id.clone();
            let active_model_inner = active_model.clone();
            let content_inner = content.clone();
            let provider_clone = llm_provider.clone();
            let cancel_tokens_clone = cancel_tokens.clone();
            let db_clone = db.clone();
            let app_clone = self.app.clone();

            info!(chat_id = %chat_id, "Routing request to Deep Research Orchestrator");
            tokio::spawn(async move {
                crate::agent::deep_research::run_deep_research(
                    app_clone,
                    db_clone,
                    &*provider_clone,
                    chat_id_inner.clone(),
                    active_model_inner,
                    content_inner,
                    config,
                    token,
                ).await;

                let mut tokens = cancel_tokens_clone.lock().await;
                tokens.remove(&chat_id_inner);
            });
            return Ok(());
        }

        let use_orchestrator = web_search.unwrap_or(false) || (content.len() > 3000 && has_complexity_markers(&content));

        if use_orchestrator {
            if let Some(ref orchestrator) = self.orchestrator {
                let provider_clone = llm_provider.clone();
                let chat_id_inner = chat_id.clone();
                let content_inner = content.clone();
                let model_inner = active_model.clone();
                let config_clone = config.clone();
                let token_clone = token.clone();
                let orchestrator_clone = orchestrator.clone();

                info!(chat_id = %chat_id, "Routing request to Orchestrator (multi-agent loop)");
                let cancel_tokens_clone = cancel_tokens.clone();
                tokio::spawn(async move {
                    let result = orchestrator_clone.run_orchestrator_loop(
                        provider_clone,
                        &model_inner,
                        chat_messages,
                        &chat_id_inner,
                        &content_inner,
                        config_clone,
                        token_clone,
                        None,
                    ).await;
                    let mut tokens = cancel_tokens_clone.lock().await;
                    tokens.remove(&chat_id_inner);
                    if let Err(e) = &result {
                        tracing::error!("Orchestrator error: {:?}", e);
                    }
                });
                return Ok(());
            } else {
                tracing::warn!("Orchestrator not available. Falling back to Runner.");
            }
        }

        info!(chat_id = %chat_id_clone, "Routing request to standard Agent Chat Runner");
        let runner = Runner::new(
            self.app.clone(),
            self.tool_registry_v1.clone(),
            self.agent_registry.clone(),
            self.hook_registry.clone(),
            self.tools.clone(),
            self.tool_manager.clone(),
        ).with_db_pool(db.clone());

        let cancel_tokens_runner = cancel_tokens.clone();
        tokio::spawn(async move {
            let result = runner.run(
                &*llm_provider,
                chat_id_clone.clone(),
                active_model,
                chat_messages,
                agent,
                config,
                token,
            ).await;
            let mut tokens = cancel_tokens_runner.lock().await;
            tokens.remove(&chat_id_clone);
            if let Err(e) = result {
                tracing::error!("Error in chat runner: {:?}", e);
            }
        });

        Ok(())
    }
}

fn has_complexity_markers(content: &str) -> bool {
    let code_block_count = content.matches("```").count() / 2;
    if code_block_count >= 3 {
        return true;
    }

    let complex_keywords = [
        "refactor", "architect", "database schema", "system design",
        "class diagram", "design pattern", "multi-agent", "orchestrate",
        "performance optimization", "memory leak", "race condition"
    ];
    let lower_content = content.to_lowercase();
    for keyword in complex_keywords.iter() {
        if lower_content.contains(keyword) {
            return true;
        }
    }

    false
}
