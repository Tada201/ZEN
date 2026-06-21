#[path = "../../src/services/secret_policy.rs"]
pub mod secret_policy;

#[path = "../../src/tools/permission.rs"]
pub mod permission;

#[path = "../../src/tools/url_safety.rs"]
pub mod url_safety;

#[path = "../../src/services/runtime_resource.rs"]
pub mod runtime_resource;

#[cfg(test)]
mod tests {
    use super::permission::{PermissionDecision, PermissionDefault, RiskLevel, ToolPermissions};
    use super::runtime_resource::RuntimeResources;
    use super::secret_policy::{
        is_secret_key, is_secret_placeholder_write, redact_if_secret, SECRET_PRESENT_SENTINEL,
    };
    use super::url_safety;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDirs {
        root: PathBuf,
        app_data: PathBuf,
    }

    impl TestDirs {
        fn new(name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after UNIX_EPOCH")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "zen-policy-runtime-resource-{name}-{}-{unique}",
                std::process::id()
            ));
            let app_data = root.join("app-data");

            fs::create_dir_all(&app_data).expect("create test app data dir");

            Self { root, app_data }
        }

        fn runtime_resources(&self) -> RuntimeResources {
            RuntimeResources::new(&self.app_data, &self.root)
        }
    }

    impl Drop for TestDirs {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn secret_policy_detects_and_redacts_secret_keys() {
        assert!(is_secret_key("openai_api_key"));
        assert!(is_secret_key("auth_token"));
        assert!(is_secret_key("service_credential"));
        assert!(!is_secret_key("theme"));

        assert_eq!(
            redact_if_secret("openai_api_key", "sk-test"),
            SECRET_PRESENT_SENTINEL
        );
        assert_eq!(redact_if_secret("theme", "dark"), "dark");
    }

    #[test]
    fn secret_policy_treats_sentinel_as_metadata_only() {
        assert!(is_secret_placeholder_write(
            "openai_api_key",
            SECRET_PRESENT_SENTINEL
        ));
        assert!(!is_secret_placeholder_write("openai_api_key", "sk-new"));
        assert!(!is_secret_placeholder_write(
            "theme",
            SECRET_PRESENT_SENTINEL
        ));
    }

    #[test]
    fn url_safety_rejects_local_and_private_targets() {
        assert!(url_safety::validate_public_http_url("http://localhost:8080").is_err());
        assert!(url_safety::validate_public_http_url("http://127.0.0.1:8080").is_err());
        assert!(url_safety::validate_public_http_url("http://192.168.1.10/").is_err());
        assert!(url_safety::validate_public_http_url("http://10.0.0.1/").is_err());
        assert!(url_safety::validate_public_http_url("http://172.16.0.1/").is_err());
        assert!(url_safety::validate_public_http_url("http://169.254.169.254/latest").is_err());
        assert!(url_safety::validate_public_http_url("http://[::1]/").is_err());
    }

    #[test]
    fn url_safety_accepts_public_http_targets() {
        assert!(url_safety::validate_public_http_url("https://example.com/path").is_ok());
    }

    #[test]
    fn url_safety_rejects_non_http_schemes() {
        assert!(url_safety::validate_public_http_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn url_safety_rejects_redirects_to_local_targets() {
        let current = url_safety::validate_public_http_url("https://example.com/start").unwrap();
        assert!(url_safety::resolve_redirect_url(&current, "http://127.0.0.1/admin").is_err());
    }

    #[test]
    fn tool_policy_allows_low_risk_when_auto_approve_is_enabled() {
        let permissions = ToolPermissions {
            auto_approve_low_risk: true,
            ..ToolPermissions::default()
        };

        let decision = PermissionDecision::from_input(
            "safe_tool",
            &serde_json::json!({}),
            RiskLevel::Low,
            &permissions,
        );

        assert!(matches!(decision, PermissionDecision::Allow));
    }

    #[test]
    fn tool_policy_hardcoded_deny_overrides_global_allow_for_localhost_fetch() {
        let permissions = ToolPermissions {
            global_default: PermissionDefault::AlwaysAllow,
            ..ToolPermissions::default()
        };

        let decision = PermissionDecision::from_input(
            "web_fetch",
            &serde_json::json!({ "url": "http://127.0.0.1:8989/secrets" }),
            RiskLevel::High,
            &permissions,
        );

        assert!(matches!(decision, PermissionDecision::Deny { .. }));
    }

    #[test]
    fn runtime_resources_resolve_model_roots_in_lightweight_gate() {
        let dirs = TestDirs::new("model-paths");
        let resources = dirs.runtime_resources();

        assert_eq!(resources.app_data_dir(), dirs.app_data.as_path());
        assert_eq!(
            resources.downloaded_model_path("ggml-base.bin"),
            dirs.app_data.join("models").join("ggml-base.bin")
        );
        assert_eq!(
            resources.temp_file_path("capture.wav"),
            dirs.app_data.join("capture.wav")
        );
    }

    #[test]
    fn runtime_resources_fall_back_to_downloaded_whisper_model_path() {
        let dirs = TestDirs::new("whisper-downloaded");
        let resources = dirs.runtime_resources();

        assert_eq!(
            resources.whisper_model_path("tiny.en.bin"),
            resources.downloaded_model_path("tiny.en.bin")
        );
    }

    #[test]
    fn runtime_resources_atomic_write_replaces_file_and_cleans_part() {
        let dirs = TestDirs::new("atomic-write");
        let resources = dirs.runtime_resources();
        let target = dirs.app_data.join("voice.onnx");
        let part = target.with_extension("onnx.part");

        fs::write(&target, b"old").expect("write existing target");
        resources
            .atomic_write(&target, b"model-bytes")
            .expect("atomic write should replace existing file");

        assert_eq!(fs::read(&target).expect("read target"), b"model-bytes");
        assert!(!part.exists(), "temporary part file should be renamed away");
    }

    #[test]
    fn runtime_resources_atomic_write_cleans_part_file_on_finalize_failure() {
        let dirs = TestDirs::new("atomic-cleanup");
        let resources = dirs.runtime_resources();
        let target = dirs.app_data.join("blocked.onnx");
        let part = target.with_extension("onnx.part");

        fs::create_dir(&target).expect("create directory at target path");
        let error = resources
            .atomic_write(&target, b"cannot-finalize")
            .expect_err("finalize should fail when target is a directory");

        assert!(error.contains("Failed to finalize file"));
        assert!(!part.exists(), "temporary part file should be cleaned up");
        assert!(target.is_dir(), "existing target directory should remain");
    }
}
