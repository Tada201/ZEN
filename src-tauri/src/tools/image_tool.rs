use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Manager};
use tokio::fs;

use super::{permission::RiskLevel, Tool, ToolError, ToolOutput};
use crate::commands::AppState;

pub struct ImageGenerationTool;

#[derive(Deserialize)]
struct ImageGenerationArgs {
    prompt: String,
    model: Option<String>,
    size: Option<String>,
}

/// Remap a model string for 9Router compatibility.
/// 9Router determines the image provider from the prefix before the first `/`
/// (e.g. `together/flux-1-schnell` → provider="together").
/// Not all providers have image adapters, so we remap known unsupported
/// prefixes to supported ones.
fn remap_model_for_ninerouter(model: &str) -> String {
    // Providers that 9Router does NOT have image adapters for,
    // mapped to a supported proxy provider.
    const PROVIDER_REMAPS: &[(&str, &str)] = &[
        ("together", "openrouter"),
    ];

    if let Some(slash_pos) = model.find('/') {
        let prefix = &model[..slash_pos];
        for &(from, to) in PROVIDER_REMAPS {
            if prefix.eq_ignore_ascii_case(from) {
                tracing::info!(
                    "Remapping image model provider '{}' → '{}' for 9Router compatibility",
                    from, to
                );
                return format!("{}/{}", to, &model[slash_pos + 1..]);
            }
        }
    }

    model.to_string()
}



async fn download_and_validate_image(url_str: &str) -> Result<Vec<u8>, ToolError> {
    const MAX_IMAGE_SIZE: usize = 10 * 1024 * 1024; // 10MB limit to prevent OOM exhaustion

    let parsed_url = url::Url::parse(url_str).map_err(|e| ToolError::ExecutionFailed {
        message: format!("Invalid download URL: {}", e),
    })?;

    // Perform DNS-resolved address safety validation to prevent SSRF
    crate::tools::url_safety::validate_url_dns_safety(&parsed_url).await.map_err(|e| ToolError::ExecutionFailed {
        message: format!("SSRF safety check failed: {}", e),
    })?;

    // Use the shared, no-redirect HTTP client with explicit timeout
    let client = crate::utils::public_no_redirect_http_client();
    let img_res = client.get(url_str).send().await.map_err(|e| ToolError::ExecutionFailed {
        message: format!("Failed to download image from {}: {}", url_str, e),
    })?;

    if img_res.status().is_redirection() {
        return Err(ToolError::ExecutionFailed {
            message: "SSRF prevention: Redirects are disabled for remote downloads".to_string(),
        });
    }

    if !img_res.status().is_success() {
        return Err(ToolError::ExecutionFailed {
            message: format!("Failed to download image, status: {}", img_res.status()),
        });
    }

    // Enforce content-length limit check
    if let Some(content_length) = img_res.content_length() {
        if content_length > MAX_IMAGE_SIZE as u64 {
            return Err(ToolError::ExecutionFailed {
                message: "Image payload exceeds maximum allowed size (10MB limit).".to_string(),
            });
        }
    }

    let bytes = img_res.bytes().await.map_err(|e| ToolError::ExecutionFailed {
        message: format!("Failed to read image bytes: {}", e),
    })?;

    if bytes.len() > MAX_IMAGE_SIZE {
        return Err(ToolError::ExecutionFailed {
            message: "Image payload exceeds maximum allowed size (10MB limit).".to_string(),
        });
    }

    Ok(bytes.to_vec())
}

#[async_trait]
impl Tool for ImageGenerationTool {
    fn name(&self) -> &str {
        "generate_image"
    }

    fn description(&self) -> &str {
        "Generates an image from a text prompt using 9Router (supports FLUX, DALL-E, and other providers). \
Returns a local asset:// URI suitable for inline markdown rendering. \
Use for: drawing, painting, creating artwork, illustrations, sketches, photo-realistic renders, concept art, and any visual content generation."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The detailed text description or prompt of the image you want to generate."
                },
                "model": {
                    "type": "string",
                    "description": "Optional model name to use (e.g. together/black-forest-labs/FLUX.1-schnell or similar)."
                },
                "size": {
                    "type": "string",
                    "description": "Optional image size, e.g. 1024x1024, 512x512, etc.",
                    "default": "1024x1024"
                }
            },
            "required": ["prompt"]
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Medium
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    async fn execute(
        &self,
        app: AppHandle,
        _chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let parsed_args: ImageGenerationArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArguments {
                details: format!("Invalid arguments: {}", e),
            })?;

        let state = app.state::<AppState>();

        // Fetch settings
        let nine_router_base_url = state
            .settings_manager
            .get("nine_router_base_url")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "http://localhost:20128/v1".to_string());

        let nine_router_api_key = state
            .secret_manager
            .get_secret("nine_router_api_key")
            .await
            .unwrap_or_default()
            .unwrap_or_default();

        // Parse providerParams to get default image model and provider if none was explicitly passed to the tool
        let mut chosen_model = parsed_args.model.clone();
        let mut chosen_provider = None;
        if let Some(json_str) = state.settings_manager.get("provider_params").await.ok().flatten() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
                if let Some(nine_router_params) = val.get("nine_router") {
                    let image_model = nine_router_params.get("imageGenModel")
                        .or_else(|| nine_router_params.get("imageModel"))
                        .and_then(|v| v.as_str());
                    if let Some(model_str) = image_model {
                        if !model_str.is_empty() && chosen_model.is_none() {
                            chosen_model = Some(model_str.to_string());
                        }
                    }
                    if let Some(prov_str) = nine_router_params.get("imageProvider").and_then(|v| v.as_str()) {
                        if !prov_str.is_empty() {
                            chosen_provider = Some(prov_str.to_string());
                        }
                    }
                }
            }
        }
        let raw_model = match chosen_model {
            Some(m) if !m.trim().is_empty() => m,
            _ => return Err(ToolError::ExecutionFailed {
                message: "No image generation model configured. Please configure an image model under settings -> providers -> 9Router.".to_string(),
            }),
        };
        let model = remap_model_for_ninerouter(&raw_model);

        // Prepare the request body for 9router /v1/images/generations
        let size = parsed_args.size.unwrap_or_else(|| "1024x1024".to_string());
        let mut request_body = json!({
            "prompt": parsed_args.prompt,
            "model": model,
            "size": size,
            "n": 1,
        });

        if let Some(ref prov) = chosen_provider {
            if let Some(obj) = request_body.as_object_mut() {
                obj.insert("provider".to_string(), json!(prov));
                obj.insert("image_provider".to_string(), json!(prov));
            }
        }

        // Build URL
        let base = nine_router_base_url.trim_end_matches('/');
        let endpoint = if base.ends_with("/v1") {
            format!("{}/images/generations", base)
        } else {
            format!("{}/v1/images/generations", base)
        };

        // Validate endpoint security boundary
        // We only allow bearer_auth to local loopback endpoints OR secure HTTPS connections.
        crate::utils::validate_remote_auth_safety(&endpoint, !nine_router_api_key.is_empty()).map_err(|e| ToolError::ExecutionFailed {
            message: e.to_string(),
        })?;

        // Make the HTTP request
        let client = crate::utils::default_http_client();
        let mut request = client.post(&endpoint).json(&request_body);
        if !nine_router_api_key.is_empty() {
            request = request.bearer_auth(&nine_router_api_key);
        }

        let response = request.send().await.map_err(|e| ToolError::ExecutionFailed {
            message: format!("Failed to send request to 9Router: {}", e),
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(ToolError::ExecutionFailed {
                message: format!("9Router returned error status {}: {}", status, err_text),
            });
        }

        // Parse response
        let res_val: serde_json::Value = response.json().await.map_err(|e| ToolError::ExecutionFailed {
            message: format!("Failed to parse response JSON: {}", e),
        })?;

        // Extract image url or base64
        let data_arr = res_val.get("data").and_then(|d| d.as_array()).ok_or_else(|| {
            ToolError::ExecutionFailed {
                message: "No data field in response".to_string(),
            }
        })?;

        if data_arr.is_empty() {
            return Err(ToolError::ExecutionFailed {
                message: "Response data array is empty".to_string(),
            });
        }

        let first_item = &data_arr[0];
        let image_data: Vec<u8>;
        const MAX_IMAGE_SIZE: usize = 10 * 1024 * 1024; // 10MB limit to prevent OOM exhaustion

        if let Some(b64) = first_item.get("b64_json").and_then(|b| b.as_str()) {
            if b64.len() > MAX_IMAGE_SIZE * 4 / 3 {
                return Err(ToolError::ExecutionFailed {
                    message: "Base64 payload exceeds maximum allowed size (10MB limit).".to_string(),
                });
            }
            use base64::{Engine as _, engine::general_purpose};
            image_data = general_purpose::STANDARD.decode(b64).map_err(|e| ToolError::ExecutionFailed {
                message: format!("Failed to decode base64 image: {}", e),
            })?;
        } else if let Some(url_str) = first_item.get("url").and_then(|u| u.as_str()) {
            image_data = download_and_validate_image(url_str).await?;
        } else {
            return Err(ToolError::ExecutionFailed {
                message: "No url or b64_json found in response data".to_string(),
            });
        }

        // Validate that downloaded data matches a safe image magic bytes signature (PNG or JPEG)
        if image_data.len() < 8 {
            return Err(ToolError::ExecutionFailed {
                message: "Invalid image: payload too small".to_string(),
            });
        }

        let is_png = &image_data[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        let is_jpg = &image_data[0..3] == [0xFF, 0xD8, 0xFF];

        if !is_png && !is_jpg {
            return Err(ToolError::ExecutionFailed {
                message: "Invalid image: Payload is not a valid PNG or JPEG image".to_string(),
            });
        }

        // Save the image in the app data directory (persists across workspace switches)
        let app_data_dir = app.path().app_data_dir().map_err(|e| ToolError::ExecutionFailed {
            message: format!("Failed to resolve AppData directory: {}", e),
        })?;
        let images_dir = app_data_dir.join("generated_images");
        fs::create_dir_all(&images_dir).await.map_err(|e| ToolError::ExecutionFailed {
            message: format!("Failed to create AppData generated_images directory: {}", e),
        })?;

        // Collision-resistant unique filename generation using UUID to prevent overwriting
        let uuid_str = uuid::Uuid::new_v4().to_string();
        let filename = format!("image_{}.png", uuid_str);
        let file_path = images_dir.join(&filename);

        fs::write(&file_path, &image_data).await.map_err(|e| ToolError::ExecutionFailed {
            message: format!("Failed to write image file: {}", e),
        })?;

        // Convert to absolute path and construct the trusted asset://localhost/ URI
        let abs_path_str = file_path.to_string_lossy().to_string();
        let normalized_path = abs_path_str.replace('\\', "/");
        let image_uri = format!("asset://localhost/{}", normalized_path);

        Ok(ToolOutput {
            content: json!({
                "status": "success",
                "image_uri": image_uri,
                "message": "Image generated successfully and saved to the workspace."
            }),
            metadata: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::{
        matchers::{method, path},
        Mock, MockServer, ResponseTemplate,
    };

    #[tokio::test]
    async fn test_download_image_below_limit_accepted() {
        let server = MockServer::start().await;
        // 8 bytes of valid PNG signature
        let png_bytes = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        
        Mock::given(method("GET"))
            .and(path("/image.png"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(png_bytes)
                    .insert_header("content-length", "8")
            )
            .mount(&server)
            .await;

        let url = format!("{}/image.png", server.uri());
        let result = download_and_validate_image(&url).await;
        assert!(result.is_ok(), "Should accept image below 10MB limit: {:?}", result.err());
        let bytes = result.unwrap();
        assert_eq!(bytes.len(), 8);
    }
}
