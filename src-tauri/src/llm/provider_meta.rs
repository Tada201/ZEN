pub struct ProviderMeta {
    pub name: &'static str,
    pub default_base_url: &'static str,
    pub api_key_key: Option<&'static str>,
    pub http_referer: Option<&'static str>,
    pub extra_headers: &'static [(&'static str, &'static str)],
}

pub static PROVIDER_CATALOG: &[ProviderMeta] = &[
    ProviderMeta {
        name: "ollama",
        default_base_url: "http://localhost:11434",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "openai",
        default_base_url: "https://api.openai.com/v1",
        api_key_key: Some("openai_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "openrouter",
        default_base_url: "https://openrouter.ai/api/v1",
        api_key_key: Some("openrouter_api_key"),
        http_referer: None,
        extra_headers: &[("HTTP-Referer", "https://zen.local"), ("X-Title", "Zen AI")],
    },
    ProviderMeta {
        name: "anthropic",
        default_base_url: "https://api.anthropic.com",
        api_key_key: Some("anthropic_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "groq",
        default_base_url: "https://api.groq.com/openai/v1",
        api_key_key: Some("groq_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "together",
        default_base_url: "https://api.together.xyz/v1",
        api_key_key: Some("together_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "mistral",
        default_base_url: "https://api.mistral.ai/v1",
        api_key_key: Some("mistral_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "perplexity",
        default_base_url: "https://api.perplexity.ai",
        api_key_key: Some("perplexity_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "nvidia",
        default_base_url: "https://integrate.api.nvidia.com/v1",
        api_key_key: Some("nvidia_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "lmstudio",
        default_base_url: "http://localhost:1234",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "nine_router",
        default_base_url: "http://localhost:20128/v1",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "vx",
        default_base_url: "http://localhost:20128/v1",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "opencode",
        default_base_url: "https://opencode.ai/zen/v1",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "mimo",
        default_base_url: "https://api.xiaomimimo.com/api/free-ai/openai/chat",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "opencode_free",
        default_base_url: "https://opencode.ai/zen/v1",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "aihubmix",
        default_base_url: "https://aihubmix.com/v1",
        api_key_key: Some("aihubmix_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "google",
        default_base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        api_key_key: Some("gemini_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "gemini",
        default_base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        api_key_key: Some("gemini_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "deepseek",
        default_base_url: "https://api.deepseek.com",
        api_key_key: Some("deepseek_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "qwen",
        default_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key_key: Some("qwen_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "xai",
        default_base_url: "https://api.x.ai/v1",
        api_key_key: Some("xai_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "kilocode",
        default_base_url: "https://api.kilo.ai/api/gateway",
        api_key_key: Some("kilocode_api_key"),
        http_referer: Some("https://kilo.ai"),
        extra_headers: &[
            ("X-Title", "Kilo AI"),
            ("X-KILOCODE-EDITORNAME", "Zen Workbench"),
        ],
    },
    ProviderMeta {
        name: "kilo",
        default_base_url: "https://api.kilo.ai/api/gateway",
        api_key_key: Some("kilocode_api_key"),
        http_referer: Some("https://kilo.ai"),
        extra_headers: &[
            ("X-Title", "Kilo AI"),
            ("X-KILOCODE-EDITORNAME", "Zen Workbench"),
        ],
    },
    ProviderMeta {
        name: "kilo.ai",
        default_base_url: "https://api.kilo.ai/api/gateway",
        api_key_key: Some("kilocode_api_key"),
        http_referer: Some("https://kilo.ai"),
        extra_headers: &[
            ("X-Title", "Kilo AI"),
            ("X-KILOCODE-EDITORNAME", "Zen Workbench"),
        ],
    },
];

/// Runtime consumers should enumerate this catalog instead of maintaining a
/// second hardcoded provider list. Aliases remain available for compatibility
/// with older saved configurations and router names.
pub fn catalog_names() -> impl Iterator<Item = &'static str> {
    PROVIDER_CATALOG
        .iter()
        .filter(|provider| !matches!(provider.name, "gemini" | "kilo" | "kilo.ai" | "opencode_free"))
        .map(|provider| provider.name)
}

#[cfg(test)]
mod tests {
    use super::{catalog_names, PROVIDER_CATALOG};

    #[test]
    fn canonical_catalog_excludes_compatibility_aliases() {
        let names: Vec<_> = catalog_names().collect();
        assert!(names.contains(&"openai"));
        assert!(names.contains(&"opencode"));
        assert!(!names.contains(&"gemini"));
        assert!(!names.contains(&"kilo"));
        assert!(!names.contains(&"kilo.ai"));
        assert!(!names.contains(&"opencode_free"));
    }

    #[test]
    fn cloud_credentials_are_declared_in_the_runtime_catalog() {
        for provider in [
            "openai",
            "anthropic",
            "openrouter",
            "deepseek",
            "qwen",
            "xai",
            "aihubmix",
        ] {
            let meta = PROVIDER_CATALOG
                .iter()
                .find(|candidate| candidate.name == provider)
                .expect("provider should be in the runtime catalog");
            assert!(meta.api_key_key.is_some(), "{provider} must require a key");
        }
    }
}
