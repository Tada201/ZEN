pub const SECRET_PRESENT_SENTINEL: &str = "__ZEN_SECRET_PRESENT__";

pub fn redact_if_secret(key: &str, value: &str) -> String {
    if value.is_empty() || !is_secret_key(key) {
        return value.to_string();
    }

    SECRET_PRESENT_SENTINEL.to_string()
}

pub fn is_secret_placeholder_write(key: &str, value: &str) -> bool {
    is_secret_key(key) && value == SECRET_PRESENT_SENTINEL
}

pub fn is_secret_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    key.contains("api_key")
        || key.contains("apikey")
        || key.contains("token")
        || key.contains("secret")
        || key.contains("credential")
        || key.contains("password")
}
