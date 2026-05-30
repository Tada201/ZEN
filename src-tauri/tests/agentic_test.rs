use async_trait::async_trait;
use tauri::Manager;
use tokio_util::sync::CancellationToken;

use tauri_app_lib::agent::runner::Runner;
use tauri_app_lib::agent::types::{Agent, ModelTier};
use tauri_app_lib::commands::AppState;
use tauri_app_lib::db::models::{ChatMessage, ChatResponse, ModelInfo};
use tauri_app_lib::error::ZenResult;
use tauri_app_lib::llm::{ChatRequestConfig, LlmChunk, LlmProvider};

struct MockProvider;

#[async_trait]
impl LlmProvider for MockProvider {
    async fn list_models(&self) -> ZenResult<Vec<ModelInfo>> {
        Ok(vec![])
    }

    async fn chat_stream(
        &self,
        _model: &str,
        _messages: Vec<ChatMessage>,
        _tools: Option<Vec<tauri_app_lib::tools::ToolInfo>>,
        _config: ChatRequestConfig,
        _on_chunk: Box<dyn Fn(LlmChunk) + Send>,
        _token: CancellationToken,
    ) -> ZenResult<ChatResponse> {
        Ok(ChatResponse {
            content: "Mocked response content".to_string(),
            model: "mock-model".to_string(),
            reasoning_details: None,
            tool_calls: None,
            tokens_in: Some(5),
            tokens_out: Some(10),
            done: true,
        })
    }

    async fn embed(&self, _model: &str, _text: &str) -> ZenResult<Vec<f32>> {
        Ok(vec![0.0; 128])
    }

    async fn health_check(&self) -> bool {
        true
    }
}

#[tokio::test]
async fn test_agentic_loop_execution() {
    let app = tauri::Builder::default()
        .manage(AppState::new())
        .build(tauri::generate_context!("tauri.conf.json"))
        .expect("failed to build tauri app");

    let app_handle = app.handle().clone();
    let state = app_handle.state::<AppState>();

    let runner = Runner::new(
        app_handle.clone(),
        state.tool_registry_v1.clone(),
        state.agent_registry.clone(),
        state.hook_registry.clone(),
        state.tools.clone(),
        state.tool_manager.clone(),
    );

    let provider = MockProvider;
    let chat_id = "test-session".to_string();
    let model = "mock-model".to_string();
    let messages = vec![];

    let agent = Agent {
        id: "test-agent".to_string(),
        name: "Test Agent".to_string(),
        instructions: "Always respond with mock text.".to_string(),
        tool_ids: vec![],
        model_override: None,
        max_iterations: Some(3),
        description: None,
        model_tier: ModelTier::Local,
    };

    let config = ChatRequestConfig::default();
    let token = CancellationToken::new();

    let result = runner
        .run(&provider, chat_id, model, messages, agent, config, token)
        .await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.content.unwrap(), "Mocked response content");
}
