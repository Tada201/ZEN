//! App-side re-export shim for zen-llm (BIG_MIGRATION.md Phase 7).
//!
//! The provider clients, streaming pipelines, reasoning resolver and registry
//! now live in the `zen-llm` workspace crate. Every historical
//! `crate::llm::*` path keeps compiling via these re-exports; Phase 14
//! deletes this shim after rewriting consumers to their deliberate final
//! paths (relocation doctrine, BIG_MIGRATION.md §4.6).

pub use zen_llm::{
    anthropic, default_base_url, default_model_for_provider, lmstudio, make_provider, ollama,
    openai_compat, provider_meta, reasoning, registry, tool_name_codec,
};
pub use zen_llm::{
    ChatRequestConfig, LlmChunk, LlmProvider, ProviderRegistry, ReasoningCapability,
    ReasoningIntent, ResolvedReasoningRequest, ToolNameCodec,
};

pub use zen_llm as api;