//! Reasoning capability resolver — the SSOT that turns raw provider metadata
//! into a product-level [`ReasoningCapability`].
//!
//! Detection order (first authoritative wins; incomplete metadata → `unknown`,
//! never `unsupported`):
//!   1. Authoritative API metadata (`supported_parameters`, OpenRouter's
//!      per-model `reasoning` object).
//!   2. Provider endpoint metadata (LM Studio `allowed_options`).
//!   3. Version-aware [`registry`](super::registry).
//!   4. Scoped family heuristics (confidence = probable).
//!   5. `unknown`.

use super::{
    registry, ControlAvailability, ReasoningCapability, ReasoningConfidence, ReasoningProtocol,
    ReasoningSource, ReasoningSupport, ReasoningVisibility,
};

/// Raw, provider-neutral metadata the resolver can consume. Providers fill in
/// whatever they actually know; everything is optional.
#[derive(Debug, Default, Clone)]
pub struct RawReasoningMetadata<'a> {
    /// OpenAI-compatible `supported_parameters` array from the model listing.
    pub supported_parameters: Option<&'a [String]>,
    /// LM Studio `capabilities.reasoning.allowed_options` (e.g. on/low/medium/high).
    pub allowed_options: Option<&'a [String]>,
    /// True when the provider is an aggregator whose per-model metadata should
    /// be trusted over any provider-wide default (e.g. OpenRouter).
    pub is_aggregator: bool,
}

/// Resolve the capability for `(provider, model_id)` from raw metadata.
pub fn resolve(
    provider: &str,
    model_id: &str,
    meta: &RawReasoningMetadata<'_>,
) -> ReasoningCapability {
    // 1. Authoritative API metadata.
    if let Some(params) = meta.supported_parameters {
        if let Some(cap) = from_supported_parameters(params) {
            return cap.normalized();
        }
    }

    // 2. Provider endpoint metadata (LM Studio).
    if let Some(opts) = meta.allowed_options {
        if let Some(cap) = from_lmstudio_allowed_options(opts) {
            return cap.normalized();
        }
    }

    // 3. Version-aware registry.
    if let Some(cap) = registry::lookup(provider, model_id) {
        return cap;
    }

    // 4. Scoped family heuristics.
    if let Some(cap) = heuristic(provider, model_id) {
        return cap.normalized();
    }

    // 5. Unknown — hidden in the UI, no params sent.
    ReasoningCapability::unknown()
}

/// Interpret an OpenAI-compatible `supported_parameters` array.
///
/// Note: `include_reasoning` describes *output visibility*, not control — it
/// must not imply always-on. On its own it yields an `unknown` support state
/// carrying only the visibility signal.
fn from_supported_parameters(params: &[String]) -> Option<ReasoningCapability> {
    let has = |name: &str| params.iter().any(|p| p.eq_ignore_ascii_case(name));

    if has("reasoning_effort") {
        return Some(ReasoningCapability {
            support: ReasoningSupport::Tunable,
            protocol: ReasoningProtocol::OpenaiEffort,
            control_availability: ControlAvailability::Zen,
            levels: Some(
                ["minimal", "low", "medium", "high"]
                    .iter()
                    .map(|s| s.to_string())
                    .collect(),
            ),
            default_level: Some("medium".to_string()),
            can_disable: true,
            reasoning_visibility: ReasoningVisibility::Summary,
            source: ReasoningSource::ApiMetadata,
            confidence: ReasoningConfidence::Authoritative,
            ..ReasoningCapability::unknown()
        });
    }

    // OpenRouter-style `reasoning` object → budget-controllable.
    if has("reasoning") {
        return Some(ReasoningCapability {
            support: ReasoningSupport::Tunable,
            protocol: ReasoningProtocol::OpenaiEffort,
            control_availability: ControlAvailability::Zen,
            min_budget: Some(1024),
            max_budget: Some(32768),
            step_budget: Some(1024),
            default_budget: Some(4096),
            can_disable: true,
            reasoning_visibility: ReasoningVisibility::Summary,
            source: ReasoningSource::ApiMetadata,
            confidence: ReasoningConfidence::Authoritative,
            ..ReasoningCapability::unknown()
        });
    }

    // Only reasoning-output visibility is advertised — capability itself is
    // undetermined. Return unknown carrying the visibility signal.
    if has("include_reasoning") {
        return Some(ReasoningCapability {
            reasoning_visibility: ReasoningVisibility::Summary,
            source: ReasoningSource::ApiMetadata,
            ..ReasoningCapability::unknown()
        });
    }

    // Metadata present but says nothing about reasoning → authoritatively
    // unsupported.
    Some(ReasoningCapability::unsupported(ReasoningSource::ApiMetadata))
}

/// LM Studio exposes reasoning via `/api/v1/chat` and `/v1/responses`, but Zen
/// drives `/v1/chat/completions`, which ignores per-request reasoning fields.
/// So we detect capability but mark it provider-managed with no wire protocol.
fn from_lmstudio_allowed_options(opts: &[String]) -> Option<ReasoningCapability> {
    let has_active = opts
        .iter()
        .any(|o| matches!(o.to_lowercase().as_str(), "on" | "low" | "medium" | "high"));
    if !has_active {
        return None;
    }
    let levels: Vec<String> = opts
        .iter()
        .filter(|o| matches!(o.to_lowercase().as_str(), "low" | "medium" | "high"))
        .map(|o| o.to_lowercase())
        .collect();
    let support = if levels.is_empty() {
        // Only on/off advertised.
        ReasoningSupport::Toggleable
    } else {
        ReasoningSupport::Tunable
    };
    Some(ReasoningCapability {
        support,
        protocol: ReasoningProtocol::None,
        control_availability: ControlAvailability::ProviderManaged,
        levels: (!levels.is_empty()).then_some(levels),
        can_disable: false,
        reasoning_visibility: ReasoningVisibility::Trace,
        source: ReasoningSource::ProviderEndpoint,
        confidence: ReasoningConfidence::Probable,
        ..ReasoningCapability::unknown()
    })
}

/// Narrow, conservative keyword heuristics used only when the registry misses.
/// Anything matched here is `probable`, not authoritative.
fn heuristic(provider: &str, model_id: &str) -> Option<ReasoningCapability> {
    let id = model_id.to_lowercase();
    match provider.to_lowercase().as_str() {
        "ollama" => {
            // Ollama's `think` control applies to reasoning-capable families.
            if id.contains("deepseek-r1")
                || id.contains("qwen3")
                || id.contains("qwq")
                || id.contains("magistral")
                || id.contains("gpt-oss")
            {
                return Some(ReasoningCapability {
                    support: ReasoningSupport::Tunable,
                    protocol: ReasoningProtocol::OllamaThink,
                    control_availability: ControlAvailability::Zen,
                    levels: Some(
                        ["low", "medium", "high"]
                            .iter()
                            .map(|s| s.to_string())
                            .collect(),
                    ),
                    default_level: Some("medium".to_string()),
                    can_disable: true,
                    reasoning_visibility: ReasoningVisibility::Trace,
                    source: ReasoningSource::Heuristic,
                    confidence: ReasoningConfidence::Probable,
                    ..ReasoningCapability::unknown()
                });
            }
            None
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::super::ReasoningIntent;
    use super::*;

    fn params(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn reasoning_effort_metadata_is_tunable_openai() {
        let p = params(&["reasoning_effort", "temperature"]);
        let cap = resolve(
            "openrouter",
            "some/model",
            &RawReasoningMetadata {
                supported_parameters: Some(&p),
                ..Default::default()
            },
        );
        assert_eq!(cap.protocol, ReasoningProtocol::OpenaiEffort);
        assert_eq!(cap.support, ReasoningSupport::Tunable);
        assert_eq!(cap.confidence, ReasoningConfidence::Authoritative);
    }

    #[test]
    fn include_reasoning_is_visibility_not_always_on() {
        let p = params(&["include_reasoning"]);
        let cap = resolve(
            "openrouter",
            "m",
            &RawReasoningMetadata {
                supported_parameters: Some(&p),
                ..Default::default()
            },
        );
        assert_eq!(cap.support, ReasoningSupport::Unknown);
        assert_eq!(cap.reasoning_visibility, ReasoningVisibility::Summary);
    }

    #[test]
    fn empty_metadata_is_unsupported_not_unknown() {
        let p = params(&["temperature", "top_p"]);
        let cap = resolve(
            "openrouter",
            "m",
            &RawReasoningMetadata {
                supported_parameters: Some(&p),
                ..Default::default()
            },
        );
        assert_eq!(cap.support, ReasoningSupport::Unsupported);
    }

    #[test]
    fn no_metadata_anywhere_is_unknown() {
        let cap = resolve("mystery", "model-x", &RawReasoningMetadata::default());
        assert_eq!(cap.support, ReasoningSupport::Unknown);
        assert_eq!(cap.source, ReasoningSource::Unknown);
    }

    #[test]
    fn lmstudio_allowed_options_are_provider_managed() {
        let opts = params(&["off", "low", "medium", "high"]);
        let cap = resolve(
            "lmstudio",
            "some-local-model",
            &RawReasoningMetadata {
                allowed_options: Some(&opts),
                ..Default::default()
            },
        );
        assert_eq!(cap.control_availability, ControlAvailability::ProviderManaged);
        assert_eq!(cap.protocol, ReasoningProtocol::None);
        assert_ne!(cap.support, ReasoningSupport::AlwaysOn);
    }

    #[test]
    fn registry_used_when_no_api_metadata() {
        let cap = resolve("anthropic", "claude-3-7-sonnet", &RawReasoningMetadata::default());
        assert_eq!(cap.protocol, ReasoningProtocol::AnthropicBudget);
        assert_eq!(cap.source, ReasoningSource::Registry);
    }

    #[test]
    fn unknown_sends_no_params() {
        let cap = ReasoningCapability::unknown();
        let req = cap.normalize_request(&ReasoningIntent {
            enabled: true,
            effort: Some("high".to_string()),
            budget_tokens: Some(8000),
        });
        assert!(!req.enabled);
        assert!(req.effort.is_none());
        assert!(req.budget_tokens.is_none());
    }

    #[test]
    fn always_on_never_emits_disable() {
        let cap = registry::lookup("deepseek", "deepseek-reasoner").unwrap();
        let req = cap.normalize_request(&ReasoningIntent {
            enabled: false,
            ..Default::default()
        });
        // Provider-managed / no Zen control → inert, but the capability itself
        // stays always-on so the UI shows the right status.
        assert!(!req.enabled);
        assert_eq!(req.capability.support, ReasoningSupport::AlwaysOn);
    }

    #[test]
    fn effort_is_clamped_into_supported_levels() {
        let cap = registry::lookup("anthropic", "claude-sonnet-4-5").unwrap();
        // "xhigh" is not in Anthropic's LMH set → clamps to default.
        let req = cap.normalize_request(&ReasoningIntent {
            enabled: true,
            effort: Some("xhigh".to_string()),
            budget_tokens: None,
        });
        assert_eq!(req.effort.as_deref(), Some("high"));
    }

    #[test]
    fn budget_is_clamped_into_range() {
        let cap = registry::lookup("anthropic", "claude-3-7-sonnet").unwrap();
        let req = cap.normalize_request(&ReasoningIntent {
            enabled: true,
            effort: None,
            budget_tokens: Some(9_999_999),
        });
        assert_eq!(req.budget_tokens, Some(32768));
    }
}
