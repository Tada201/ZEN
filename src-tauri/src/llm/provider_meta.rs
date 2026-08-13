pub struct ProviderMeta {
    pub name: &'static str,
    pub display_name: &'static str,
    pub description: &'static str,
    pub category: &'static str,
    pub default_base_url: &'static str,
    pub api_key_key: Option<&'static str>,
    pub http_referer: Option<&'static str>,
    pub extra_headers: &'static [(&'static str, &'static str)],
}

pub static PROVIDER_CATALOG: &[ProviderMeta] = &[
    ProviderMeta {
        name: "ollama",
        display_name: "Ollama",
        description: "Run large language models locally on your hardware.",
        category: "local",
        default_base_url: "http://localhost:11434",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "openai",
        display_name: "OpenAI",
        description: "Industry-standard OpenAI models through the compatible API.",
        category: "cloud",
        default_base_url: "https://api.openai.com/v1",
        api_key_key: Some("openai_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "openrouter",
        display_name: "OpenRouter",
        description: "Unified access to models from many providers.",
        category: "cloud",
        default_base_url: "https://openrouter.ai/api/v1",
        api_key_key: Some("openrouter_api_key"),
        http_referer: None,
        extra_headers: &[("HTTP-Referer", "https://zen.local"), ("X-Title", "Zen AI")],
    },
    ProviderMeta {
        name: "anthropic",
        display_name: "Anthropic",
        description: "Claude models for reasoning, coding, and multimodal work.",
        category: "cloud",
        default_base_url: "https://api.anthropic.com",
        api_key_key: Some("anthropic_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "groq",
        display_name: "Groq",
        description: "Low-latency hosted inference for open models.",
        category: "cloud",
        default_base_url: "https://api.groq.com/openai/v1",
        api_key_key: Some("groq_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "together",
        display_name: "Together AI",
        description: "Hosted open-source and open-weight models.",
        category: "cloud",
        default_base_url: "https://api.together.xyz/v1",
        api_key_key: Some("together_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "mistral",
        display_name: "Mistral AI",
        description: "Mistral models for general and code generation.",
        category: "cloud",
        default_base_url: "https://api.mistral.ai/v1",
        api_key_key: Some("mistral_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "perplexity",
        display_name: "Perplexity",
        description: "Online models optimized for search-oriented answers.",
        category: "cloud",
        default_base_url: "https://api.perplexity.ai",
        api_key_key: Some("perplexity_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "nvidia",
        display_name: "NVIDIA NIM",
        description: "NVIDIA-hosted inference for open models.",
        category: "cloud",
        default_base_url: "https://integrate.api.nvidia.com/v1",
        api_key_key: Some("nvidia_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "lmstudio",
        display_name: "LM Studio",
        description: "Local inference engine with an OpenAI-compatible API.",
        category: "local",
        default_base_url: "http://localhost:1234",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "nine_router",
        display_name: "9Router",
        description: "Local coding proxy and model orchestration gateway.",
        category: "local",
        default_base_url: "http://localhost:20128/v1",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "vx",
        display_name: "VX Gateway",
        description: "Compatibility route for the local gateway.",
        category: "local",
        default_base_url: "http://localhost:20128/v1",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "opencode",
        display_name: "OpenCode Free",
        description: "Direct OpenCode Zen free-model endpoint.",
        category: "cloud",
        default_base_url: "https://opencode.ai/zen/v1",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "mimo",
        display_name: "MiMo Code Free",
        description: "Direct MiMo free coding endpoint.",
        category: "cloud",
        default_base_url: "https://api.xiaomimimo.com/api/free-ai/openai/chat",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "opencode_free",
        display_name: "OpenCode Free",
        description: "Compatibility alias for the OpenCode free endpoint.",
        category: "cloud",
        default_base_url: "https://opencode.ai/zen/v1",
        api_key_key: None,
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "aihubmix",
        display_name: "AIHubMix",
        description: "OpenAI-compatible gateway for multiple model providers.",
        category: "cloud",
        default_base_url: "https://aihubmix.com/v1",
        api_key_key: Some("aihubmix_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "google",
        display_name: "Google Gemini",
        description: "Google multimodal models through the compatible API.",
        category: "cloud",
        default_base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        api_key_key: Some("gemini_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "gemini",
        display_name: "Google Gemini",
        description: "Compatibility alias for the Google Gemini endpoint.",
        category: "cloud",
        default_base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        api_key_key: Some("gemini_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "deepseek",
        display_name: "DeepSeek",
        description: "DeepSeek models for reasoning and code generation.",
        category: "cloud",
        default_base_url: "https://api.deepseek.com",
        api_key_key: Some("deepseek_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "qwen",
        display_name: "Qwen",
        description: "Qwen models through the compatible API.",
        category: "cloud",
        default_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key_key: Some("qwen_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "xai",
        display_name: "xAI (Grok)",
        description: "Grok models for general and reasoning workloads.",
        category: "cloud",
        default_base_url: "https://api.x.ai/v1",
        api_key_key: Some("xai_api_key"),
        http_referer: None,
        extra_headers: &[],
    },
    ProviderMeta {
        name: "kilocode",
        display_name: "Kilo Code",
        description: "Kilo Code gateway for coding models.",
        category: "cloud",
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
        display_name: "Kilo Code",
        description: "Compatibility alias for the Kilo Code gateway.",
        category: "cloud",
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
        display_name: "Kilo Code",
        description: "Compatibility alias for the Kilo Code gateway.",
        category: "cloud",
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
        .filter(|provider| !matches!(provider.name, "gemini" | "kilo" | "kilo.ai" | "opencode_free" | "vx"))
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
