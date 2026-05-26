#[path = "../../src/services/secret_policy.rs"]
pub mod secret_policy;

#[path = "../../src/tools/permission.rs"]
pub mod permission;

#[path = "../../src/tools/url_safety.rs"]
pub mod url_safety;

#[cfg(test)]
mod tests {
    use super::secret_policy::{
        is_secret_key, is_secret_placeholder_write, redact_if_secret, SECRET_PRESENT_SENTINEL,
    };
    use super::url_safety;

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
        assert!(!is_secret_placeholder_write("theme", SECRET_PRESENT_SENTINEL));
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
}
