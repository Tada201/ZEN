use crate::error::ZenResult;
use super::OpenAiCompatProvider;
use crate::llm::LlmProvider;
use wiremock::{Mock, MockServer, ResponseTemplate, matchers::{method, path}};

#[tokio::test]
async fn test_openai_compat_list_models_retries_on_rate_limit() -> ZenResult<()> {
    let server = MockServer::start().await;
    let provider = OpenAiCompatProvider::new(&server.uri(), "test-key", "openai");

    // First request gets rate limited
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(429).insert_header("retry-after", "1"))
        .expect(1)
        .mount(&server)
        .await;

    // Second request succeeds
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"data": [{"id": "gpt-4o"}]})))
        .mount(&server)
        .await;

    let models = provider.list_models().await?;
    assert_eq!(models.len(), 1);
    Ok(())
}

#[tokio::test]
async fn test_openai_compat_list_models_exhausts_retries() -> ZenResult<()> {
    let server = MockServer::start().await;
    let provider = OpenAiCompatProvider::new(&server.uri(), "test-key", "openai");

    // All requests fail with 429
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(429).insert_header("retry-after", "1"))
        .expect(3) // default max_attempts is 3 for non-Groq
        .mount(&server)
        .await;

    let result = provider.list_models().await;
    assert!(result.is_err());
    Ok(())
}
