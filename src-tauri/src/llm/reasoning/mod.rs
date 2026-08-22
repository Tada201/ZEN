//! Reasoning capability resolution — the single source of truth for how a
//! model's reasoning support is detected, normalized, and encoded.
//!
//! Ownership boundaries:
//!   * Provider modules extract raw metadata and encode transport only.
//!   * [`resolver`] decides the product-level [`ReasoningCapability`].
//!   * [`registry`] is a version-aware data table the resolver reads.
//!   * Encoders switch on the resolved [`ReasoningProtocol`]; they never
//!     re-derive whether a request means effort, budget, adaptive, etc.
//!
//! The frontend sends generic intent (`enabled` / `effort` / `budgetTokens`);
//! [`ReasoningCapability::normalize_request`] clamps that intent against the
//! resolved capability and yields a [`ResolvedReasoningRequest`] the encoders
//! consume.

pub mod registry;
pub mod resolver;

use serde::{Deserialize, Serialize};

/// Whether — and how — Zen exposes a reasoning control for a model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ReasoningSupport {
    /// Model does not reason; no control shown.
    Unsupported,
    /// Model always reasons and cannot be turned off.
    AlwaysOn,
    /// Reasoning can be turned on/off but not tuned.
    Toggleable,
    /// Reasoning depth is tunable (effort levels or a token budget).
    Tunable,
    /// Capability could not be determined; control hidden, never sent.
    #[default]
    Unknown,
}

/// The wire protocol a provider encoder must speak for this model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ReasoningProtocol {
    /// OpenAI-style top-level `reasoning_effort`.
    OpenaiEffort,
    /// Anthropic adaptive thinking: `thinking:{type:"adaptive"}` + `output_config.effort`.
    AnthropicAdaptive,
    /// Anthropic manual budget: `thinking:{type:"enabled", budget_tokens}`.
    AnthropicBudget,
    /// Gemini 3 `thinking_config.thinking_level`.
    GeminiLevel,
    /// Gemini 2.5 `thinking_config.thinking_budget`.
    GeminiBudget,
    /// Ollama top-level `think` (bool or level).
    OllamaThink,
    /// No per-request reasoning field is sent on the wire.
    #[default]
    None,
}

/// Where Zen can actually change the reasoning setting for this model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ControlAvailability {
    /// No control exists anywhere.
    #[default]
    None,
    /// Zen can control reasoning per request.
    Zen,
    /// The provider controls reasoning outside Zen (e.g. LM Studio's own UI /
    /// endpoints Zen doesn't drive); Zen shows status, not a control.
    ProviderManaged,
}

/// How much of the reasoning the provider returns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ReasoningVisibility {
    /// Nothing is returned.
    #[default]
    None,
    /// A short summary of the reasoning.
    Summary,
    /// Full chain-of-thought trace (must not auto-display in the timeline).
    Trace,
    /// Only reasoning token usage is reported, no content.
    Tokens,
}

/// How confident the resolver is in the detected capability.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ReasoningConfidence {
    /// From provider/API metadata that authoritatively describes the model.
    Authoritative,
    /// From a family/version heuristic — likely but not guaranteed.
    Probable,
    /// Undetermined.
    #[default]
    Unknown,
}

/// Which detection stage produced the capability.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ReasoningSource {
    ApiMetadata,
    ProviderEndpoint,
    Registry,
    Heuristic,
    #[default]
    Unknown,
}

/// The resolved, product-level reasoning capability for one model. This is the
/// SSOT consumed by both the frontend UI and the backend wire encoders.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningCapability {
    pub support: ReasoningSupport,
    pub protocol: ReasoningProtocol,
    pub control_availability: ControlAvailability,
    /// Provider's real effort/level set, preserved verbatim
    /// (`none`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max`, etc.).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub levels: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_level: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_budget: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_budget: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step_budget: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_budget: Option<i64>,
    pub can_disable: bool,
    pub reasoning_visibility: ReasoningVisibility,
    pub source: ReasoningSource,
    pub confidence: ReasoningConfidence,
}

impl Default for ReasoningCapability {
    fn default() -> Self {
        Self::unknown()
    }
}

impl ReasoningCapability {
    /// Capability could not be determined. Never coerced to `unsupported`.
    pub fn unknown() -> Self {
        Self {
            support: ReasoningSupport::Unknown,
            protocol: ReasoningProtocol::None,
            control_availability: ControlAvailability::None,
            levels: None,
            default_level: None,
            min_budget: None,
            max_budget: None,
            step_budget: None,
            default_budget: None,
            can_disable: false,
            reasoning_visibility: ReasoningVisibility::None,
            source: ReasoningSource::Unknown,
            confidence: ReasoningConfidence::Unknown,
        }
    }

    /// Model verifiably does not reason.
    pub fn unsupported(source: ReasoningSource) -> Self {
        Self {
            support: ReasoningSupport::Unsupported,
            protocol: ReasoningProtocol::None,
            control_availability: ControlAvailability::None,
            can_disable: false,
            source,
            confidence: ReasoningConfidence::Authoritative,
            ..Self::unknown()
        }
    }

    /// Enforce the capability invariants, repairing violations in-place so a
    /// malformed registry/heuristic entry can never reach an encoder or the UI.
    ///
    ///   * `always_on`  ⇒ `can_disable = false`
    ///   * `unsupported`⇒ `protocol = none`, no control
    ///   * `tunable`    ⇒ must have levels or a budget range; else demote to
    ///     `toggleable` (if a protocol/control exists) or `unknown`
    pub fn normalized(mut self) -> Self {
        if self.support == ReasoningSupport::AlwaysOn {
            self.can_disable = false;
        }
        if self.support == ReasoningSupport::Unsupported {
            self.protocol = ReasoningProtocol::None;
            self.control_availability = ControlAvailability::None;
            self.levels = None;
            self.min_budget = None;
            self.max_budget = None;
        }
        if self.support == ReasoningSupport::Tunable {
            let has_levels = self.levels.as_ref().is_some_and(|l| !l.is_empty());
            let has_budget = self.min_budget.is_some() || self.max_budget.is_some();
            if !has_levels && !has_budget {
                // A tunable claim with nothing to tune is not tunable.
                self.support = if self.control_availability == ControlAvailability::Zen {
                    ReasoningSupport::Toggleable
                } else {
                    ReasoningSupport::Unknown
                };
            }
        }
        self
    }

    /// Whether the frontend should show any reasoning affordance at all.
    pub fn is_visible(&self) -> bool {
        !matches!(
            self.support,
            ReasoningSupport::Unsupported | ReasoningSupport::Unknown
        )
    }

    /// Clamp a piece of generic frontend intent against this capability and
    /// produce the resolved request the encoders consume. Never emits a
    /// disable for `always_on`; never emits params for `unsupported`/`unknown`.
    pub fn normalize_request(&self, intent: &ReasoningIntent) -> ResolvedReasoningRequest {
        // Models where Zen cannot control reasoning: send nothing.
        if self.control_availability != ControlAvailability::Zen {
            return ResolvedReasoningRequest::inert(self.clone());
        }

        match self.support {
            ReasoningSupport::Unsupported | ReasoningSupport::Unknown => {
                ResolvedReasoningRequest::inert(self.clone())
            }
            ReasoningSupport::AlwaysOn => {
                // Always reasons; ignore any disable, pass through no params.
                ResolvedReasoningRequest {
                    capability: self.clone(),
                    enabled: true,
                    effort: None,
                    budget_tokens: None,
                }
            }
            ReasoningSupport::Toggleable => ResolvedReasoningRequest {
                capability: self.clone(),
                enabled: intent.enabled,
                effort: None,
                budget_tokens: None,
            },
            ReasoningSupport::Tunable => {
                if !intent.enabled {
                    return ResolvedReasoningRequest {
                        capability: self.clone(),
                        enabled: false,
                        effort: None,
                        budget_tokens: None,
                    };
                }
                let effort = intent
                    .effort
                    .as_ref()
                    .map(|e| self.clamp_effort(e))
                    .or_else(|| self.default_level.clone());
                let budget_tokens = intent
                    .budget_tokens
                    .map(|b| self.clamp_budget(b))
                    .or(self.default_budget);
                ResolvedReasoningRequest {
                    capability: self.clone(),
                    enabled: true,
                    effort,
                    budget_tokens,
                }
            }
        }
    }

    fn clamp_effort(&self, requested: &str) -> String {
        match &self.levels {
            Some(levels) if !levels.is_empty() => {
                if levels.iter().any(|l| l.eq_ignore_ascii_case(requested)) {
                    requested.to_string()
                } else {
                    // Fall back to the default level, else the middle of the set.
                    self.default_level
                        .clone()
                        .unwrap_or_else(|| levels[levels.len() / 2].clone())
                }
            }
            _ => requested.to_string(),
        }
    }

    fn clamp_budget(&self, requested: i64) -> i64 {
        let mut b = requested;
        if let Some(min) = self.min_budget {
            b = b.max(min);
        }
        if let Some(max) = self.max_budget {
            b = b.min(max);
        }
        // Align to the advertised granularity so queued/replayed requests carry
        // the same discrete values the UI slider produces. Floor toward `min`
        // so alignment can never push the budget back out of range.
        if let Some(step) = self.step_budget.filter(|step| *step > 1) {
            if let Some(min) = self.min_budget {
                b = min + (b - min) / step * step;
            }
        }
        b
    }
}

/// Generic reasoning intent from the frontend — no provider protocol.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningIntent {
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub budget_tokens: Option<i64>,
}

/// The resolved request an encoder consumes. Carries the capability so the
/// encoder can switch on `capability.protocol` without re-deriving anything.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedReasoningRequest {
    pub capability: ReasoningCapability,
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub budget_tokens: Option<i64>,
}

impl ResolvedReasoningRequest {
    /// No reasoning is sent on the wire.
    pub fn inert(capability: ReasoningCapability) -> Self {
        Self {
            capability,
            enabled: false,
            effort: None,
            budget_tokens: None,
        }
    }
}
