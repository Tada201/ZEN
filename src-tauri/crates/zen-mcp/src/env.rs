//! `${env:VAR}` / `$VAR` reference expansion for `.mcp.json` values.
//!
//! MCP servers commonly need secrets (API tokens) passed via `env`. Storing
//! them literally in `.mcp.json` leaks them into the repo. Instead, config
//! values may reference host environment variables which are resolved at
//! spawn time and never written back to disk.
//!
//! Supported syntaxes (matches Claude Code / Codex):
//! - `${env:NAME}` — explicit form, preferred.
//! - `$NAME` — bare form (NAME = ASCII alnum/underscore, not starting with a digit).
//!
//! Unknown references are left literal so a typo surfaces to the server rather
//! than silently becoming an empty string.

/// Expand `${env:VAR}` and `$VAR` references in `input` from the host
/// environment. Unresolved references are preserved verbatim.
pub fn expand_env_refs(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'$' {
            // Copy the byte through; UTF-8 continuation bytes are >= 0x80 and
            // never equal '$', so byte-wise copy is safe.
            out.push(bytes[i] as char);
            i += 1;
            continue;
        }
        // `${env:NAME}` form.
        if input[i..].starts_with("${env:") {
            if let Some(end) = input[i + 6..].find('}') {
                let name = &input[i + 6..i + 6 + end];
                push_var(&mut out, name, &input[i..i + 6 + end + 1]);
                i += 6 + end + 1;
                continue;
            }
        }
        // `$NAME` bare form.
        let rest = &bytes[i + 1..];
        let mut j = 0;
        while j < rest.len() && (rest[j] == b'_' || rest[j].is_ascii_alphanumeric()) {
            // First char must not be a digit.
            if j == 0 && rest[j].is_ascii_digit() {
                break;
            }
            j += 1;
        }
        if j > 0 {
            let name = &input[i + 1..i + 1 + j];
            push_var(&mut out, name, &input[i..i + 1 + j]);
            i += 1 + j;
            continue;
        }
        // Lone `$` with no valid reference — copy literally.
        out.push('$');
        i += 1;
    }
    out
}

/// Resolve `${secret:KEY}` references through the OS keyring-backed
/// secret store (the app's `SecretStore` port impl). Missing values stay
/// literal so an absent credential is visible to the server as an
/// authentication failure rather than silently becoming an empty string.
pub async fn expand_secret_refs(input: &str, secrets: &dyn zen_core::SecretStore) -> String {
    let mut output = String::with_capacity(input.len());
    let mut cursor = 0;
    while let Some(relative_start) = input[cursor..].find("${secret:") {
        let start = cursor + relative_start;
        output.push_str(&input[cursor..start]);
        let name_start = start + "${secret:".len();
        let Some(relative_end) = input[name_start..].find('}') else {
            output.push_str(&input[start..]);
            cursor = input.len();
            break;
        };
        let end = name_start + relative_end;
        let name = &input[name_start..end];
        let valid_name = !name.is_empty()
            && name.len() <= 128
            && name.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.')
            });
        if !valid_name {
            output.push_str(&input[start..end + 1]);
        } else {
            match secrets.get_secret(name).await {
                Ok(Some(value)) => output.push_str(&value),
                Ok(None) | Err(_) => output.push_str(&input[start..end + 1]),
            }
        }
        cursor = end + 1;
    }
    if cursor < input.len() {
        output.push_str(&input[cursor..]);
    }
    output
}

/// Push the resolved value of `name`, or the original `literal` reference
/// when the variable is unset.
fn push_var(out: &mut String, name: &str, literal: &str) {
    match std::env::var(name) {
        Ok(val) => out.push_str(&val),
        Err(_) => out.push_str(literal),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// In-memory fake of the `zen-core::SecretStore` port for tests.
    struct FakeSecrets;
    #[async_trait::async_trait]
    impl zen_core::SecretStore for FakeSecrets {
        async fn get_secret(&self, _key: &str) -> zen_core::ZenResult<Option<String>> {
            Ok(None)
        }
        async fn set_secret(&self, _key: String, _value: String) -> zen_core::ZenResult<()> {
            Ok(())
        }
        async fn delete_secret(&self, _key: &str) -> zen_core::ZenResult<()> {
            Ok(())
        }
    }

    #[test]
    fn expands_known_and_preserves_unknown() {
        std::env::set_var("ZEN_MCP_TEST_TOKEN", "secret123");
        assert_eq!(
            expand_env_refs("Bearer ${env:ZEN_MCP_TEST_TOKEN}"),
            "Bearer secret123"
        );
        assert_eq!(expand_env_refs("$ZEN_MCP_TEST_TOKEN"), "secret123");
        // Unknown refs stay literal (both forms).
        assert_eq!(
            expand_env_refs("${env:ZEN_MCP_MISSING}"),
            "${env:ZEN_MCP_MISSING}"
        );
        assert_eq!(expand_env_refs("$ZEN_MCP_MISSING"), "$ZEN_MCP_MISSING");
        // Lone `$` and non-refs pass through.
        assert_eq!(expand_env_refs("price is $5"), "price is $5");
        assert_eq!(expand_env_refs("no refs here"), "no refs here");
        std::env::remove_var("ZEN_MCP_TEST_TOKEN");
    }

    #[tokio::test]
    async fn preserves_secret_reference_when_keyring_value_is_unavailable() {
        let expanded =
            expand_secret_refs("Bearer ${secret:missing-mcp-token}", &FakeSecrets).await;
        assert_eq!(expanded, "Bearer ${secret:missing-mcp-token}");
    }
}
