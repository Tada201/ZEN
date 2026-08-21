//! Version-aware reasoning capability registry.
//!
//! A data table the [`super::resolver`] reads — NOT a parallel detection layer.
//! Provider modules pass a raw `(provider, model_id)` and get a capability back
//! when the family/version is known. Unknown families return `None` so the
//! resolver can fall through to heuristics or `unknown`.
//!
//! Version rules encode real provider behavior:
//!   * Anthropic Claude 3.7 → manual budget thinking.
//!   * Anthropic Claude 4.5 / 4.6 / 4.7 (incl. opus-4-7) → adaptive thinking
//!     with effort; manual `budget_tokens` is deprecated/rejected there, so a
//!     legacy budget combo must never be sent to these models.
//!   * OpenAI o-series / gpt-5 → effort levels.
//!   * Gemini 3 → thinking level; Gemini 2.5 → thinking budget.
//!   * DeepSeek R1 / reasoner → always-on, no Zen control.

use super::{
    ControlAvailability, ReasoningCapability, ReasoningConfidence, ReasoningProtocol,
    ReasoningSource, ReasoningSupport, ReasoningVisibility,
};

const EFFORT_LMH: &[&str] = &["low", "medium", "high"];
const OPENAI_EFFORT: &[&str] = &["minimal", "low", "medium", "high"];
const GEMINI_LEVELS: &[&str] = &["low", "high"];

fn levels(v: &[&str]) -> Option<Vec<String>> {
    Some(v.iter().map(|s| s.to_string()).collect())
}

/// Anthropic adaptive-thinking capability (Claude 4.5+).
fn anthropic_adaptive() -> ReasoningCapability {
    ReasoningCapability {
        support: ReasoningSupport::Tunable,
        protocol: ReasoningProtocol::AnthropicAdaptive,
        control_availability: ControlAvailability::Zen,
        levels: levels(EFFORT_LMH),
        default_level: Some("high".to_string()),
        can_disable: true,
        reasoning_visibility: ReasoningVisibility::Summary,
        source: ReasoningSource::Registry,
        confidence: ReasoningConfidence::Authoritative,
        ..ReasoningCapability::unknown()
    }
}

/// Anthropic manual-budget capability (Claude 3.7).
fn anthropic_budget() -> ReasoningCapability {
    ReasoningCapability {
        support: ReasoningSupport::Tunable,
        protocol: ReasoningProtocol::AnthropicBudget,
        control_availability: ControlAvailability::Zen,
        min_budget: Some(1024),
        max_budget: Some(32768),
        step_budget: Some(1024),
        default_budget: Some(4096),
        can_disable: true,
        reasoning_visibility: ReasoningVisibility::Summary,
        source: ReasoningSource::Registry,
        confidence: ReasoningConfidence::Authoritative,
        ..ReasoningCapability::unknown()
    }
}

fn openai_effort() -> ReasoningCapability {
    ReasoningCapability {
        support: ReasoningSupport::Tunable,
        protocol: ReasoningProtocol::OpenaiEffort,
        control_availability: ControlAvailability::Zen,
        levels: levels(OPENAI_EFFORT),
        default_level: Some("medium".to_string()),
        can_disable: true,
        reasoning_visibility: ReasoningVisibility::Summary,
        source: ReasoningSource::Registry,
        confidence: ReasoningConfidence::Authoritative,
        ..ReasoningCapability::unknown()
    }
}

fn gemini_level() -> ReasoningCapability {
    ReasoningCapability {
        support: ReasoningSupport::Tunable,
        protocol: ReasoningProtocol::GeminiLevel,
        control_availability: ControlAvailability::Zen,
        levels: levels(GEMINI_LEVELS),
        default_level: Some("high".to_string()),
        can_disable: true,
        reasoning_visibility: ReasoningVisibility::Summary,
        source: ReasoningSource::Registry,
        confidence: ReasoningConfidence::Authoritative,
        ..ReasoningCapability::unknown()
    }
}

fn gemini_budget() -> ReasoningCapability {
    ReasoningCapability {
        support: ReasoningSupport::Tunable,
        protocol: ReasoningProtocol::GeminiBudget,
        control_availability: ControlAvailability::Zen,
        min_budget: Some(1024),
        max_budget: Some(32768),
        step_budget: Some(1024),
        default_budget: Some(4096),
        can_disable: true,
        reasoning_visibility: ReasoningVisibility::Summary,
        source: ReasoningSource::Registry,
        confidence: ReasoningConfidence::Authoritative,
        ..ReasoningCapability::unknown()
    }
}

/// Always-on native reasoning with no Zen-facing control (e.g. DeepSeek R1).
fn always_on_native() -> ReasoningCapability {
    ReasoningCapability {
        support: ReasoningSupport::AlwaysOn,
        protocol: ReasoningProtocol::None,
        control_availability: ControlAvailability::None,
        can_disable: false,
        reasoning_visibility: ReasoningVisibility::Trace,
        source: ReasoningSource::Registry,
        confidence: ReasoningConfidence::Authoritative,
        ..ReasoningCapability::unknown()
    }
}

/// Look up a capability by provider + model id. `None` means "not in the
/// registry" — the resolver then tries heuristics or returns `unknown`.
pub fn lookup(provider: &str, model_id: &str) -> Option<ReasoningCapability> {
    let provider = provider.to_lowercase();
    let id = model_id.to_lowercase();

    let cap = match provider.as_str() {
        "anthropic" => anthropic_lookup(&id)?,
        "openai" => openai_lookup(&id)?,
        "google" | "gemini" => gemini_lookup(&id)?,
        "deepseek" => deepseek_lookup(&id)?,
        _ => return None,
    };
    Some(cap.normalized())
}

fn anthropic_lookup(id: &str) -> Option<ReasoningCapability> {
    // Adaptive-era families first (4.5 / 4.6 / 4.7, incl. opus-4-7 spellings).
    if id.contains("opus-4-7")
        || id.contains("4-7-opus")
        || id.contains("-4-7")
        || id.contains("4-7-")
        || id.contains("-4-6")
        || id.contains("4-6-")
        || id.contains("-4-5")
        || id.contains("4-5-")
        || id.contains("sonnet-4-5")
        || id.contains("claude-4-5")
    {
        return Some(anthropic_adaptive());
    }
    // Claude 3.7 → manual budget thinking.
    if id.contains("3-7") || id.contains("claude-3.7") {
        return Some(anthropic_budget());
    }
    // Broad Claude 4 fallback → adaptive (newer default).
    if id.contains("claude-4") || id.contains("-4-") {
        return Some(anthropic_adaptive());
    }
    // Older Claude 3 / 3.5 do not expose configurable reasoning.
    if id.contains("claude-3") {
        return Some(ReasoningCapability::unsupported(ReasoningSource::Registry));
    }
    None
}

fn openai_lookup(id: &str) -> Option<ReasoningCapability> {
    if id.starts_with("o1") || id.starts_with("o3") || id.starts_with("o4") {
        return Some(openai_effort());
    }
    if id.starts_with("gpt-5") {
        return Some(openai_effort());
    }
    if id.starts_with("gpt-4") || id.starts_with("gpt-3") {
        return Some(ReasoningCapability::unsupported(ReasoningSource::Registry));
    }
    None
}

fn gemini_lookup(id: &str) -> Option<ReasoningCapability> {
    if id.contains("gemini-3") {
        return Some(gemini_level());
    }
    if id.contains("gemini-2.5") {
        return Some(gemini_budget());
    }
    if id.contains("gemini-2.0") || id.contains("gemini-1.5") {
        return Some(ReasoningCapability::unsupported(ReasoningSource::Registry));
    }
    None
}

fn deepseek_lookup(id: &str) -> Option<ReasoningCapability> {
    if id.contains("reasoner") || id.contains("r1") {
        return Some(always_on_native());
    }
    if id.contains("chat") || id.contains("v3") || id.contains("coder") {
        return Some(ReasoningCapability::unsupported(ReasoningSource::Registry));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_37_is_manual_budget() {
        let cap = lookup("anthropic", "claude-3-7-sonnet-20250219").unwrap();
        assert_eq!(cap.protocol, ReasoningProtocol::AnthropicBudget);
        assert_eq!(cap.support, ReasoningSupport::Tunable);
        assert!(cap.min_budget.is_some());
    }

    #[test]
    fn claude_45_46_47_are_adaptive() {
        for id in [
            "claude-sonnet-4-5-20250101",
            "claude-4-6-opus",
            "claude-opus-4-7",
            "claude-4-7-sonnet",
        ] {
            let cap = lookup("anthropic", id).unwrap();
            assert_eq!(
                cap.protocol,
                ReasoningProtocol::AnthropicAdaptive,
                "id {id} should be adaptive"
            );
            // Adaptive models must never carry a manual budget range.
            assert!(cap.min_budget.is_none(), "id {id} must not send budget");
        }
    }

    #[test]
    fn gemini_25_budget_vs_3_level() {
        assert_eq!(
            lookup("google", "gemini-2.5-pro").unwrap().protocol,
            ReasoningProtocol::GeminiBudget
        );
        assert_eq!(
            lookup("google", "gemini-3-pro-preview").unwrap().protocol,
            ReasoningProtocol::GeminiLevel
        );
    }

    #[test]
    fn openai_effort_levels_include_minimal_and_high() {
        let cap = lookup("openai", "gpt-5.2").unwrap();
        assert_eq!(cap.protocol, ReasoningProtocol::OpenaiEffort);
        let levels = cap.levels.unwrap();
        assert!(levels.contains(&"minimal".to_string()));
        assert!(levels.contains(&"high".to_string()));
    }

    #[test]
    fn deepseek_r1_always_on_no_control() {
        let cap = lookup("deepseek", "deepseek-reasoner").unwrap();
        assert_eq!(cap.support, ReasoningSupport::AlwaysOn);
        assert!(!cap.can_disable);
        assert_eq!(cap.control_availability, ControlAvailability::None);
    }

    #[test]
    fn unknown_family_returns_none() {
        assert!(lookup("anthropic", "some-future-model").is_none());
        assert!(lookup("someprovider", "whatever").is_none());
    }
}
