use super::lifecycle::Runner;
use crate::agent::tools::child_runner;
use crate::commands::AppState;
use crate::db::models::ChatMessage;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::Manager;
use tokio_util::sync::CancellationToken;

const DISPLAY_AGENT_ID: &str = "voice_display";
const DEFAULT_CONTEXT_TOKENS: usize = 131_072;
const DEFAULT_MAX_TURNS: usize = 20;
const DEFAULT_COMPACT_THRESHOLD: usize = 75;

impl Runner {
    pub(super) fn spawn_voice_display_agent(
        &self,
        chat_id: &str,
        main_model: &str,
        response: &str,
        token: CancellationToken,
    ) {
        if !self.config.voice_mode || response.trim().is_empty() || token.is_cancelled() {
            return;
        }

        let app = self.app.clone();
        let tool_registry = self.tool_registry.clone();
        let agent_registry = self.agent_registry.clone();
        let hook_registry = self.hook_registry.clone();
        let permissions = self.permissions.clone();
        let configured_model = self.config.display_agent_model.clone();
        let main_model = main_model.to_string();
        let source_chat_id = chat_id.to_string();
        let response = response.to_string();
        let depth = self.depth;

        tokio::spawn(async move {
            let state = app.state::<AppState>();
            let context_tokens = read_usize_setting(
                &state,
                "voiceDisplayAgentContextTokens",
                DEFAULT_CONTEXT_TOKENS,
                4_096,
                1_048_576,
            )
            .await;
            let max_turns = read_usize_setting(
                &state,
                "voiceDisplayAgentMaxTurns",
                DEFAULT_MAX_TURNS,
                1,
                50,
            )
            .await;
            let compact_threshold = read_usize_setting(
                &state,
                "voiceDisplayAgentCompactThreshold",
                DEFAULT_COMPACT_THRESHOLD,
                50,
                95,
            )
            .await;
            let auto_compact = read_bool_setting(
                &state,
                "voiceDisplayAgentAutoCompactEnabled",
                true,
            )
            .await;
            let custom_prompt = state
                .settings_manager
                .get("voiceDisplayAgentPrompt")
                .await
                .ok()
                .flatten()
                .filter(|value| !value.trim().is_empty());

            let selected_model = configured_model
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(main_model);
            let resolved = match child_runner::resolve_agent(
                &agent_registry,
                DISPLAY_AGENT_ID,
                Some(&selected_model),
                Some(max_turns as u64),
            ) {
                Ok(resolved) => resolved,
                Err(error) => {
                    tracing::warn!(error = %error, "Voice display agent is unavailable");
                    return;
                }
            };

            let allowed_tools = Arc::new(tokio::sync::Mutex::new(
                HashSet::from(["manage_board".to_string()]),
            ));
            let mut runner = match child_runner::build_child_runner(
                &app,
                tool_registry,
                agent_registry,
                hook_registry,
                permissions,
                depth,
                &resolved,
                Some(allowed_tools),
            ) {
                Ok(runner) => runner
                    .with_max_context_tokens(context_tokens)
                    .with_max_messages_in_memory(max_turns),
                Err(error) => {
                    tracing::warn!(error = %error, "Failed to construct voice display runner");
                    return;
                }
            };
            runner.config.compaction_token_threshold = if auto_compact {
                context_tokens.saturating_mul(compact_threshold) / 100
            } else {
                usize::MAX
            };

            let task = format!(
                "{}\n\nRender the following main-agent response on the voice board. Use manage_board; do not repeat the response as prose.\n\nMAIN AGENT RESPONSE:\n{}",
                custom_prompt.unwrap_or_else(|| {
                    "Use only the supplied response. Do not browse or infer missing facts.".to_string()
                }),
                response
            );
            let messages = vec![ChatMessage {
                role: "user".to_string(),
                content: task,
                reasoning_details: None,
                images: None,
                tool_calls: None,
                tool_call_id: None,
            }];
            let synthetic_chat_id = format!("voice-display:{}", source_chat_id);
            let provider = match state.provider().await {
                Ok(provider) => provider,
                Err(error) => {
                    tracing::warn!(error = %error, "Voice display provider is unavailable");
                    return;
                }
            };

            if let Err(error) = runner
                .run(
                    provider.as_ref(),
                    synthetic_chat_id,
                    selected_model,
                    messages,
                    resolved.agent,
                    crate::llm::ChatRequestConfig::default(),
                    token,
                )
                .await
            {
                tracing::warn!(error = %error, "Voice display agent run failed");
            }
        });
    }
}

async fn read_usize_setting(
    state: &AppState,
    key: &str,
    default: usize,
    min: usize,
    max: usize,
) -> usize {
    state
        .settings_manager
        .get(key)
        .await
        .ok()
        .flatten()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(default)
        .clamp(min, max)
}

async fn read_bool_setting(state: &AppState, key: &str, default: bool) -> bool {
    state
        .settings_manager
        .get(key)
        .await
        .ok()
        .flatten()
        .map(|value| value == "true")
        .unwrap_or(default)
}
