#[path = "../../src/services/secret_policy.rs"]
pub mod secret_policy;

#[path = "../../src/tools/permission.rs"]
pub mod permission;

#[cfg(test)]
mod tests {
    use super::secret_policy::{
        is_secret_key, is_secret_placeholder_write, redact_if_secret, SECRET_PRESENT_SENTINEL,
    };

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
}
