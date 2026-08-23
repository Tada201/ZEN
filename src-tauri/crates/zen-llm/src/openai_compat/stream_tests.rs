//! Wiremock suite for the openai_compat streaming/list-models paths.
//! Moved out of stream.rs during the Phase 7 crate extraction; declared via
//! `#[path]` so module-relative paths resolve exactly as before.

    use super::*;
    use zen_core::ChatMessage;
    use crate::LlmChunk;
    use crate::LlmProvider;
    use std::sync::{Arc, Mutex};
    use wiremock::{
        matchers::{method, path},
        Mock, MockServer, ResponseTemplate,
    };

    async fn mock_provider() -> (OpenAiCompatProvider, MockServer) {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "test-key-123", "openai");
        (provider, server)
    }

    fn user_message(content: &str) -> ChatMessage {
        ChatMessage {
            role: "user".to_string(),
            content: content.to_string(),
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        }
    }

    /// Build a resolved reasoning request carrying the given protocol + effort.
    fn resolved_effort(
        protocol: crate::reasoning::ReasoningProtocol,
        effort: &str,
    ) -> crate::ResolvedReasoningRequest {
        resolved_effort_budget(protocol, Some(effort), None)
    }

    /// Build a resolved reasoning request with an explicit protocol + optional
    /// effort/budget, mirroring what the resolver hands the encoders.
    fn resolved_effort_budget(
        protocol: crate::reasoning::ReasoningProtocol,
        effort: Option<&str>,
        budget_tokens: Option<i64>,
    ) -> crate::ResolvedReasoningRequest {
        use crate::reasoning::{ControlAvailability, ReasoningCapability, ReasoningSupport};
        let capability = ReasoningCapability {
            support: ReasoningSupport::Tunable,
            protocol,
            control_availability: ControlAvailability::Zen,
            can_disable: true,
            ..ReasoningCapability::unknown()
        };
        crate::ResolvedReasoningRequest {
            capability,
            enabled: true,
            effort: effort.map(|e| e.to_string()),
            budget_tokens,
        }
    }

    const OPENAI_MODELS_RESPONSE: &str = r#"{
        "data": [
            {
                "id": "gpt-4o",
                "name": "GPT-4o",
                "description": "High-intelligence multimodal model",
                "context_length": 128000,
                "owned_by": "openai",
                "created": 1715368132
            },
            {
                "id": "gpt-4o-mini",
                "name": "GPT-4o Mini",
                "context_length": 128000,
                "owned_by": "openai",
                "created": 1715368132
            },
            {
                "id": "text-embedding-3-small",
                "context_length": 8192,
                "owned_by": "openai",
                "created": 1715368132
            },
            {
                "id": "claude-3-5-sonnet-20241022",
                "owned_by": "anthropic"
            },
            {
                "id": "gemini-1.5-flash"
            }
        ]
    }"#;

    #[tokio::test]
    async fn test_openai_compat_list_models_parses_all_fields() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                OPENAI_MODELS_RESPONSE.as_bytes().to_vec(),
                "application/json",
            ))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert_eq!(models.len(), 5);

        // list_models sorts by model id (ModelInfo.name carries the id):
        // [claude-3-5-sonnet, gemini-1.5-flash, gpt-4o, gpt-4o-mini,
        //  text-embedding-3-small]
        // gpt-4o — full fields
        assert_eq!(models[2].id, "gpt-4o");
        assert_eq!(models[2].name, "gpt-4o");
        assert_eq!(models[2].display_name.as_deref(), Some("GPT-4o"));
        assert_eq!(
            models[2].description.as_deref(),
            Some("High-intelligence multimodal model")
        );
        assert_eq!(models[2].max_context_length, Some(128000));
        assert_eq!(models[2].provider.as_deref(), Some("openai"));
        assert!(models[2].modified_at.is_some());
        // gpt-4 family -> vision & tools supported
        assert_eq!(models[2].supports_vision, Some(true));
        assert_eq!(models[2].supports_tools, Some(true));

        // text-embedding-3-small — minimal fields
        assert_eq!(models[4].id, "text-embedding-3-small");
        assert_eq!(
            models[4].display_name.as_deref(),
            Some("text-embedding-3-small")
        ); // falls back to id
        assert_eq!(models[4].max_context_length, Some(8192));

        // gemini-1.5-flash — no owned_by; window comes from
        // infer_context_window (id heuristics), so it is populated.
        assert_eq!(models[1].id, "gemini-1.5-flash");
        assert_eq!(models[1].provider.as_deref(), Some("openai")); // falls back to provider_name
        assert!(models[1].max_context_length.is_some());
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_list_models_infers_capabilities() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": [
                    {"id": "gpt-4-vision-preview"},
                    {"id": "llama-3.2-11b-vision-instruct"},
                    {"id": "claude-3-haiku-20240307"},
                    {"id": "llama-3.3-70b-versatile"},
                    {"id": "pixtral-large"}
                ]
            })))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;

        // gpt-4-vision-preview — "vision" in name
        assert_eq!(models[0].supports_vision, Some(true));

        // llama-3.2-11b-vision-instruct — "vision" in name
        assert_eq!(models[1].supports_vision, Some(true));

        // claude-3-haiku — claude-3 family
        assert_eq!(models[2].supports_vision, Some(true));

        // llama-3.3-70b-versatile — no keywords
        assert_eq!(models[3].supports_vision, Some(false));

        // pixtral-large — known multimodal
        assert_eq!(models[4].supports_vision, Some(true));
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_list_models_empty_response() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"data": []})))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert!(models.is_empty());
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_list_models_unauthorized() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(401).set_body_json(serde_json::json!({
                "error": {
                    "message": "Incorrect API key",
                    "type": "authentication_error"
                }
            })))
            .mount(&server)
            .await;

        let result = provider.list_models().await;
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("401")
                || err.contains("unauthorized")
                || err.contains("Incorrect")
                || err.contains("openai")
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_list_models_sends_auth_header() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .and(wiremock::matchers::header(
                "authorization",
                "Bearer test-key-123",
            ))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"data": [{"id": "gpt-4o"}]})),
            )
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert_eq!(models.len(), 1);
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_list_models_sends_extra_headers() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::with_headers(
            &server.uri(),
            "test-key",
            "openrouter",
            vec![
                ("HTTP-Referer".to_string(), "https://zen.local".to_string()),
                ("X-Title".to_string(), "Zen AI".to_string()),
            ],
        );

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .and(wiremock::matchers::header(
                "http-referer",
                "https://zen.local",
            ))
            .and(wiremock::matchers::header("x-title", "Zen AI"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"data": [{"id": "openai/gpt-4o"}]})),
            )
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert_eq!(models.len(), 1);
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_caches_capabilities() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": [
                    {"id": "gpt-4o"},
                    {"id": "davinci-002"}
                ]
            })))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert_eq!(models.len(), 2);

        // After list_models, the cache should be populated
        // gpt-4o should support tools
        assert!(provider.supports_tools("gpt-4o"));
        // davinci-002 should also support tools (OpenAI provider)
        assert!(provider.supports_tools("davinci-002"));
        Ok(())
    }

    #[tokio::test]
    async fn test_openrouter_capabilities_come_from_supported_parameters() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "test-key", "openrouter");

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": [
                    {
                        "id": "anthropic/claude-sonnet-4",
                        "supported_parameters": ["tools", "tool_choice", "reasoning"]
                    },
                    {
                        "id": "openai/gpt-4o-mini",
                        "supported_parameters": ["temperature", "max_tokens"]
                    },
                    {
                        "id": "deepseek/deepseek-r1",
                        "supported_parameters": ["include_reasoning"]
                    }
                ]
            })))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        let claude = models
            .iter()
            .find(|model| model.id == "anthropic/claude-sonnet-4")
            .unwrap();
        assert_eq!(claude.supports_tools, Some(true));
        // `reasoning` supported_parameter → tunable (budget-capable) via API metadata.
        let claude_cap = claude.reasoning.as_ref().unwrap();
        assert_eq!(
            claude_cap.support,
            crate::reasoning::ReasoningSupport::Tunable
        );

        let gpt = models
            .iter()
            .find(|model| model.id == "openai/gpt-4o-mini")
            .unwrap();
        assert_eq!(gpt.supports_tools, Some(false));
        // Metadata present but no reasoning params → authoritatively unsupported.
        assert_eq!(
            gpt.reasoning.as_ref().unwrap().support,
            crate::reasoning::ReasoningSupport::Unsupported
        );

        let r1 = models
            .iter()
            .find(|model| model.id == "deepseek/deepseek-r1")
            .unwrap();
        // `include_reasoning` is visibility-only; support stays unknown.
        let r1_cap = r1.reasoning.as_ref().unwrap();
        assert_eq!(
            r1_cap.support,
            crate::reasoning::ReasoningSupport::Unknown
        );
        assert_eq!(
            r1_cap.reasoning_visibility,
            crate::reasoning::ReasoningVisibility::Summary
        );

        assert!(provider.supports_tools("anthropic/claude-sonnet-4"));
        assert!(!provider.supports_tools("openai/gpt-4o-mini"));
        Ok(())
    }

    #[tokio::test]
    async fn test_mixed_router_without_metadata_stays_conservative() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "test-key", "openrouter");

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": [{"id": "unknown/router-model"}]
            })))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert_eq!(models[0].supports_tools, Some(false));
        // No metadata + not in registry → unknown.
        assert_eq!(
            models[0].reasoning.as_ref().unwrap().support,
            crate::reasoning::ReasoningSupport::Unknown
        );
        assert!(!provider.supports_tools("unknown/router-model"));
        Ok(())
    }

    #[tokio::test]
    async fn test_nine_router_without_metadata_defaults_to_tools() -> ZenResult<()> {
        // 9router is treated as a tool-capable cloud router: with no per-model
        // `supported_parameters` metadata it defaults to tools-on, both at
        // list time and via the cold-cache provider policy.
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "", "nine_router");

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": [{"id": "nvidia/parakeet-ctc-1.1b-asr"}]
            })))
            .mount(&server)
            .await;

        let models = provider.list_models().await?;
        assert_eq!(models[0].supports_tools, Some(true));
        assert_eq!(
            models[0].reasoning.as_ref().unwrap().support,
            crate::reasoning::ReasoningSupport::Unknown
        );
        assert!(provider.supports_tools("nvidia/parakeet-ctc-1.1b-asr"));
        // Cold-cache path (unknown model) still resolves to true for 9router.
        assert!(provider.supports_tools("some/unlisted-model"));
        Ok(())
    }

    #[tokio::test]
    async fn test_nine_router_omits_reasoning_without_model_metadata() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "", "nine_router");

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n",
                "text/event-stream",
            ))
            .mount(&server)
            .await;

        provider
            .chat_stream(
                "unknown/routed-model",
                vec![user_message("hello")],
                None,
                crate::ChatRequestConfig {
                    resolved_reasoning: Some(resolved_effort(
                        crate::reasoning::ReasoningProtocol::OpenaiEffort,
                        "high",
                    )),
                    ..crate::ChatRequestConfig::default()
                },
                Box::new(|_| {}),
                tokio_util::sync::CancellationToken::new(),
            )
            .await?;

        let requests = server.received_requests().await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&requests[0].body)?;
        assert!(body.get("reasoning_effort").is_none());
        Ok(())
    }

    #[test]
    fn test_stream_usage_option_is_guarded_by_provider() {
        let openai = OpenAiCompatProvider::new("https://api.openai.com", "key", "openai");
        let openrouter =
            OpenAiCompatProvider::new("https://openrouter.ai/api", "key", "openrouter");
        let google =
            OpenAiCompatProvider::new("https://generativelanguage.googleapis.com", "key", "google");
        let custom = OpenAiCompatProvider::new("https://example.test", "key", "custom");

        assert!(openai.should_request_stream_usage());
        assert!(openrouter.should_request_stream_usage());
        assert!(!google.should_request_stream_usage());
        assert!(!custom.should_request_stream_usage());
    }

    #[tokio::test]
    async fn test_openrouter_sends_top_level_reasoning_object() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "test-key", "openrouter");

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n",
                "text/event-stream",
            ))
            .mount(&server)
            .await;

        provider
            .chat_stream(
                "anthropic/claude-sonnet-4",
                vec![user_message("think")],
                None,
                crate::ChatRequestConfig {
                    resolved_reasoning: Some(resolved_effort_budget(
                        crate::reasoning::ReasoningProtocol::OpenaiEffort,
                        Some("high"),
                        Some(4096),
                    )),
                    ..crate::ChatRequestConfig::default()
                },
                Box::new(|_| {}),
                tokio_util::sync::CancellationToken::new(),
            )
            .await?;

        let requests = server.received_requests().await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&requests[0].body)?;
        assert_eq!(body["reasoning"]["effort"], "high");
        assert_eq!(body["reasoning"]["max_tokens"], 4096);
        assert!(body.get("reasoning_effort").is_none());
        Ok(())
    }

    #[tokio::test]
    async fn test_gemini_sends_include_thoughts_extra_body() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "test-key", "google");

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n",
                "text/event-stream",
            ))
            .mount(&server)
            .await;

        provider
            .chat_stream(
                "gemini-2.5-pro",
                vec![user_message("think")],
                None,
                crate::ChatRequestConfig {
                    resolved_reasoning: Some(resolved_effort_budget(
                        crate::reasoning::ReasoningProtocol::GeminiBudget,
                        None,
                        Some(2048),
                    )),
                    ..crate::ChatRequestConfig::default()
                },
                Box::new(|_| {}),
                tokio_util::sync::CancellationToken::new(),
            )
            .await?;

        let requests = server.received_requests().await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&requests[0].body)?;
        assert_eq!(
            body["extra_body"]["google"]["thinking_config"]["include_thoughts"],
            true
        );
        assert_eq!(
            body["extra_body"]["google"]["thinking_config"]["thinking_budget"],
            2048
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_gemini_3_sends_thinking_level_not_budget() -> ZenResult<()> {
        let server = MockServer::start().await;
        let provider = OpenAiCompatProvider::new(&server.uri(), "test-key", "google");

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n",
                "text/event-stream",
            ))
            .mount(&server)
            .await;

        provider
            .chat_stream(
                "gemini-3-pro-preview",
                vec![user_message("think")],
                None,
                crate::ChatRequestConfig {
                    resolved_reasoning: Some(resolved_effort_budget(
                        crate::reasoning::ReasoningProtocol::GeminiLevel,
                        Some("high"),
                        None,
                    )),
                    ..crate::ChatRequestConfig::default()
                },
                Box::new(|_| {}),
                tokio_util::sync::CancellationToken::new(),
            )
            .await?;

        let requests = server.received_requests().await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&requests[0].body)?;
        assert_eq!(
            body["extra_body"]["google"]["thinking_config"]["thinking_level"],
            "high"
        );
        assert!(body["extra_body"]["google"]["thinking_config"]
            .get("thinking_budget")
            .is_none());
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_streams_reasoning_fields_as_thoughts() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;
        let sse = concat!(
            "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"deepseek \",\"content\":\"\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"reasoning\":\"generic \",\"content\":\"\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"thinking\":\"gemini \",\"content\":\"\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"lookup\",\"arguments\":\"{\\\"q\\\":\"}}]}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"zen\\\"}\"}}]}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"answer\"}}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":5}}\n\n",
            "data: [DONE]\n\n",
        );

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(sse, "text/event-stream"))
            .mount(&server)
            .await;

        let chunks = Arc::new(Mutex::new(Vec::new()));
        let chunks_for_callback = chunks.clone();
        let response = provider
            .chat_stream(
                "reasoning-model",
                vec![user_message("think")],
                None,
                crate::ChatRequestConfig::default(),
                Box::new(move |chunk| {
                    chunks_for_callback.lock().unwrap().push(chunk);
                }),
                tokio_util::sync::CancellationToken::new(),
            )
            .await?;

        assert_eq!(response.content, "answer");
        assert_eq!(response.tokens_in, Some(3));
        assert_eq!(response.tokens_out, Some(5));
        let reasoning_details = response
            .reasoning_details
            .as_ref()
            .expect("reasoning details should be preserved");
        assert_eq!(reasoning_details.len(), 3);
        assert_eq!(reasoning_details[0].block_type, "reasoning_content");
        assert_eq!(reasoning_details[0].text.as_deref(), Some("deepseek "));
        let tool_calls = response.tool_calls.expect("tool call should be preserved");
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "call_1");
        assert_eq!(tool_calls[0].name, "lookup");
        assert_eq!(tool_calls[0].args, serde_json::json!({"q": "zen"}));

        let chunks = chunks.lock().unwrap();
        assert_eq!(
            chunks
                .iter()
                .filter_map(|chunk| match chunk {
                    LlmChunk::Thought(text) => Some(text.as_str()),
                    LlmChunk::Text(_) => None,
                    LlmChunk::ToolCallDelta { .. } => None,
                    LlmChunk::ToolCallReady { .. } => None,
                })
                .collect::<Vec<_>>(),
            vec!["deepseek ", "generic ", "gemini "]
        );
        assert!(matches!(chunks.last(), Some(LlmChunk::Text(text)) if text == "answer"));
        Ok(())
    }

    #[tokio::test]
    async fn test_openai_compat_streams_final_message_reasoning() -> ZenResult<()> {
        let (provider, server) = mock_provider().await;
        let sse = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"answer\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{},\"message\":{\"reasoning_content\":\"final reasoning\"}}]}\n\n",
            "data: [DONE]\n\n",
        );

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(sse, "text/event-stream"))
            .mount(&server)
            .await;

        let chunks = Arc::new(Mutex::new(Vec::new()));
        let chunks_for_callback = chunks.clone();
        let response = provider
            .chat_stream(
                "reasoning-model",
                vec![user_message("think")],
                None,
                crate::ChatRequestConfig::default(),
                Box::new(move |chunk| {
                    chunks_for_callback.lock().unwrap().push(chunk);
                }),
                tokio_util::sync::CancellationToken::new(),
            )
            .await?;

        assert_eq!(response.content, "answer");
        assert_eq!(
            response
                .reasoning_details
                .as_ref()
                .and_then(|blocks| blocks.first())
                .and_then(|block| block.text.as_deref()),
            Some("final reasoning")
        );
        let chunks = chunks.lock().unwrap();
        assert!(chunks
            .iter()
            .any(|chunk| matches!(chunk, LlmChunk::Thought(text) if text == "final reasoning")));
        Ok(())
    }