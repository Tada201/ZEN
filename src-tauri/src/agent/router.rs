/// Complexity Router for Multi-Agent Task Classification
///
/// Analyzes user prompts and classifies them into tiers:
/// - Tier 1: Simple single-agent tasks (quick response)
/// - Tier 2: Moderate tasks requiring multiple steps
/// - Tier 3: Complex multi-agent workflows (requires battle-plan preview)
use crate::agent::types::ModelTier;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Keywords that indicate simple transforms eligible for Agent Booster
const BOOSTER_SIMPLE_KEYWORDS: &[&str] = &[
    // Text transformations
    "uppercase",
    "lowercase",
    "capitalize",
    "title case",
    "reverse",
    "sort",
    "trim",
    "strip",
    "remove whitespace",
    "compress",
    // Format conversions
    "convert to json",
    "convert to xml",
    "convert to csv",
    "to json",
    "to xml",
    "to csv",
    "format as",
    "pretty print",
    "prettify",
    // Simple extractions
    "extract emails",
    "extract urls",
    "extract phone",
    "extract numbers",
    "get first",
    "get last",
    "first n",
    "last n",
    // Simple calculations
    "count",
    "sum",
    "average",
    "min",
    "max",
    "total",
    // Simple replacements
    "replace",
    "remove",
    "delete all",
    "strip html",
    "decode",
    "encode",
    "base64",
    "url encode",
    "html escape",
];

const BOOSTER_PATTERNS: &[&str] = &[
    r"^\d+\s*[\+\-\*/]\s*\d+$",               // Simple math: 2+2, 5*3
    r"^[a-zA-Z0-9_\-\.]+@[a-zA-Z0-9_\-\.]+$", // Email validation
    r"^\d{3,4}$",                             // Short number patterns
    r"^https?://",                            // URL detection
];

/// Result of model routing analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRoutingResult {
    /// Numeric complexity score (0-100)
    pub complexity_score: u8,
    /// Recommended model tier
    pub recommended_tier: ModelTier,
    /// Whether Agent Booster can handle this task
    pub agent_booster_eligible: bool,
    /// Reason why Agent Booster eligible/ineligible
    pub booster_reason: Option<String>,
}

/// Task complexity tier
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskTier {
    /// Simple task - single agent, quick response
    /// Examples: "What's the weather?", "Summarize this document"
    Tier1,
    /// Moderate task - may need multiple tool calls
    /// Examples: "Research this topic and write a summary", "Analyze this data"
    Tier2,
    /// Complex task - requires multiple agents, significant token budget
    /// Examples: "Build a complete web app", "Do a full security audit"
    Tier3,
}

/// Battle plan for Tier 3 tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BattlePlan {
    /// Estimated number of agents involved
    pub agents_needed: Vec<String>,
    /// Estimated token budget
    pub estimated_tokens: usize,
    /// Estimated cost in USD (based on cloud provider rates)
    pub estimated_cost_usd: f64,
    /// Estimated time in seconds
    pub estimated_time_secs: usize,
    /// Step-by-step plan
    pub steps: Vec<String>,
    /// Risk level (for tool permissions)
    pub risk_level: String,
}

/// Router result after analyzing a prompt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouterResult {
    /// Classified tier
    pub tier: TaskTier,
    /// Confidence score (0.0 - 1.0)
    pub confidence: f32,
    /// Optional battle plan for Tier 3
    pub battle_plan: Option<BattlePlan>,
    /// Recommended agent to start with
    pub recommended_agent: String,
    /// Keywords that influenced the decision
    pub keywords_found: Vec<String>,
}

/// Complexity keywords that indicate task difficulty
const TIER3_KEYWORDS: &[&str] = &[
    // Development/Engineering
    "full-stack",
    "backend",
    "frontend",
    "api",
    "database",
    "deploy",
    "production",
    // Analysis/Research
    "comprehensive",
    "complete",
    "full",
    "thorough",
    "deep",
    "extensive",
    "audit",
    "analysis",
    "investigation",
    "research",
    "study",
    "evaluate",
    "assess",
    "review",
    // Multi-step operations
    "pipeline",
    "workflow",
    "process",
    "sequence",
    "chain",
    "series",
    "multiple",
    // Complex outputs
    "report",
    "documentation",
    "proposal",
    "plan",
    "strategy",
    "architecture",
    "design",
    // Data operations
    "migrate",
    "transform",
    "etl",
    "process",
    "analyze",
    "visualize",
    "dashboard",
    // Multi-agent orchestration indicators
    "multiple agents",
    "parallel",
    "coordinate",
    "delegate",
    "sub-agent",
    "spawn",
    "handoff",
    "orchestrate",
    "swarm",
    "team",
    "specialists",
    "expert",
    // DevOps/Infra
    "devops",
    "ci/cd",
    "pipeline",
    "docker",
    "kubernetes",
    "container",
    "terraform",
    "infrastructure",
    "deployment",
    // Code quality
    "refactor",
    "migrate",
    "optimize",
    "performance",
    "debug",
    "troubleshoot",
    // Testing
    "testing",
    "test suite",
    "integration test",
    "unit test",
    "pytest",
    "jest",
    // Security
    "security",
    "vulnerability",
    "penetration",
    "audit",
    "auth",
    "authentication",
    "authorization",
    // Algorithms
    "algorithm",
    "data structure",
    "optimization",
];

const TIER2_KEYWORDS: &[&str] = &[
    // Moderate tasks
    "write",
    "draft",
    "compose",
    "generate",
    "summarize",
    "explain",
    "compare",
    "contrast",
    "list",
    "find",
    "search",
    "gather",
    "collect",
    // Some complexity
    "many",
    "different",
    "various",
    "many",
    "build",
    "create",
    "develop",
    "implement",
    "code",
    "program",
    "application",
    "app",
    "website",
];

/// Keywords that indicate specific agent needs
const AGENT_KEYWORDS: &[(&str, &str)] = &[
    ("security", "ZEN-TAC"),
    ("operational", "ZEN-TAC"),
    ("military", "ZEN-TAC"),
    ("geofence", "ZEN-TAC"),
    ("flight", "ZEN-TAC"),
    ("aircraft", "ZEN-TAC"),
    ("tracking", "ZEN-TAC"),
    ("map", "ZEN-TAC"),
    ("geolocation", "ZEN-TAC"),
    ("weather", "ZEN-TAC"),
    ("earthquake", "ZEN-TAC"),
    ("radar", "ZEN-TAC"),
    ("sonar", "ZEN-TAC"),
    ("surveillance", "ZEN-TAC"),
    ("coordinates", "ZEN-TAC"),
    ("location", "ZEN-TAC"),
    ("route", "ZEN-TAC"),
    ("navy", "ZEN-TAC"),
    ("vessel", "ZEN-TAC"),
    ("ship", "ZEN-TAC"),
    ("port", "ZEN-TAC"),
    ("boundary", "ZEN-TAC"),
    ("zone", "ZEN-TAC"),
    ("document", "ZEN-DOCS"),
    ("research", "ZEN-DOCS"),
    ("search", "ZEN-DOCS"),
    ("knowledge base", "ZEN-DOCS"),
    ("vector", "ZEN-DOCS"),
    ("embedding", "ZEN-DOCS"),
    ("analyze", "ZEN-DOCS"),
    ("information", "ZEN-DOCS"),
    ("facts", "ZEN-DOCS"),
    ("sources", "ZEN-DOCS"),
    ("reference", "ZEN-DOCS"),
    ("citation", "ZEN-DOCS"),
    ("space", "ZEN-COSMOS"),
    ("astronomy", "ZEN-COSMOS"),
    ("star", "ZEN-COSMOS"),
    ("planet", "ZEN-COSMOS"),
    ("satellite", "ZEN-COSMOS"),
    ("iss", "ZEN-COSMOS"),
    ("orbit", "ZEN-COSMOS"),
    ("constellation", "ZEN-COSMOS"),
    ("telescope", "ZEN-COSMOS"),
    ("galaxy", "ZEN-COSMOS"),
    ("nebula", "ZEN-COSMOS"),
    ("moon", "ZEN-COSMOS"),
    ("mars", "ZEN-COSMOS"),
    ("solar", "ZEN-COSMOS"),
    ("eclipse", "ZEN-COSMOS"),
    ("asteroid", "ZEN-COSMOS"),
    ("comet", "ZEN-COSMOS"),
    ("meteor", "ZEN-COSMOS"),
    ("code", "ZEN"),
    ("program", "ZEN"),
    ("general", "ZEN"),
];

pub struct ComplexityRouter;

impl ComplexityRouter {
    /// Analyze a user prompt and classify its complexity
    pub fn classify(prompt: &str) -> RouterResult {
        let prompt_lower = prompt.to_lowercase();

        // Tokenize into words for whole-word matching (split on non-alphanumeric)
        let tokens: HashSet<String> = prompt_lower
            .split(|c: char| !c.is_alphanumeric())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();

        // Count keyword matches
        let mut tier3_matches = 0;
        let mut tier2_matches = 0;
        let mut keywords_found = Vec::new();
        let mut agents_needed = Vec::new();

        // Check for Tier 3 keywords (handle both single-word and multi-word)
        for keyword in TIER3_KEYWORDS {
            let is_multi_word = keyword.contains(' ') || keyword.contains('-');
            let matched = if is_multi_word {
                // Multi-word: substring search in prompt
                prompt_lower.contains(keyword)
            } else {
                // Single-word: whole-word match via tokens
                tokens.contains(&keyword.to_string())
            };
            if matched {
                tier3_matches += 1;
                keywords_found.push(keyword.to_string());
            }
        }

        // Check for Tier 2 keywords (handle both single-word and multi-word)
        for keyword in TIER2_KEYWORDS {
            let is_multi_word = keyword.contains(' ') || keyword.contains('-');
            let matched = if is_multi_word {
                prompt_lower.contains(keyword)
            } else {
                tokens.contains(&keyword.to_string())
            };
            if matched && !keywords_found.contains(&keyword.to_string()) {
                tier2_matches += 1;
                keywords_found.push(keyword.to_string());
            }
        }

        // Determine which agents might be needed (handle both single-word and multi-word)
        let mut recommended_agent = "ZEN".to_string();
        for (keyword, agent) in AGENT_KEYWORDS {
            let is_multi_word = keyword.contains(' ') || keyword.contains('-');
            let matched = if is_multi_word {
                prompt_lower.contains(keyword)
            } else {
                tokens.contains(&keyword.to_string())
            };
            if matched {
                if !agents_needed.contains(&agent.to_string()) {
                    agents_needed.push(agent.to_string());
                }
                if *agent != "ZEN" {
                    recommended_agent = agent.to_string();
                }
            }
        }

        // If no specific agents, default to ZEN
        if agents_needed.is_empty() {
            agents_needed.push("ZEN".to_string());
        }

        let (tier, confidence) =
            if tier3_matches >= 3 || (tier3_matches >= 2 && prompt_lower.len() > 200) {
                (TaskTier::Tier3, 0.85)
            } else if tier3_matches >= 1 || tier2_matches >= 2 {
                (TaskTier::Tier2, 0.75)
            } else if tier2_matches >= 1 {
                (TaskTier::Tier2, 0.65)
            } else {
                (TaskTier::Tier1, 0.90)
            };

        // Generate battle plan for Tier 3
        let battle_plan = if tier == TaskTier::Tier3 {
            Some(generate_battle_plan(
                &prompt_lower,
                &agents_needed,
                tier3_matches,
            ))
        } else {
            None
        };

        RouterResult {
            tier,
            confidence,
            battle_plan,
            recommended_agent,
            keywords_found,
        }
    }

    /// Check if user approval is needed before proceeding
    pub fn needs_approval(tier: &TaskTier) -> bool {
        matches!(tier, TaskTier::Tier3)
    }

    /// Estimate tokens for a given text
    pub fn estimate_tokens(text: &str) -> usize {
        // Rough estimation: 1 token ≈ 4 characters in English
        text.len() / 4
    }

    /// Calculate numeric complexity score (0-100)
    /// - 0-30: Simple (Agent Booster eligible)
    /// - 31-74: Moderate (Local model OK)
    /// - 75-100: Complex (Cloud model recommended)
    pub fn calculate_complexity_score(prompt: &str) -> u8 {
        let prompt_lower = prompt.to_lowercase();
        let mut score: u16 = 0;

        for keyword in TIER3_KEYWORDS {
            if prompt_lower.contains(keyword) {
                score += 15;
            }
        }

        for keyword in TIER2_KEYWORDS {
            if prompt_lower.contains(keyword) {
                score += 8;
            }
        }

        let length_factor = (prompt.len() / 50).min(20) as u16;
        score += length_factor;

        if prompt_lower.contains("?") {
            score = score.saturating_sub(10);
        }

        score.min(100) as u8
    }

    /// Detect if task can be handled by Agent Booster (no LLM needed)
    /// Returns (eligible, reason)
    pub fn detect_agent_booster(prompt: &str) -> (bool, Option<String>) {
        let prompt_lower = prompt.to_lowercase();

        for keyword in BOOSTER_SIMPLE_KEYWORDS {
            if prompt_lower.contains(keyword) {
                return (
                    true,
                    Some(format!("Detected simple transform keyword: '{}'", keyword)),
                );
            }
        }

        for pattern in BOOSTER_PATTERNS {
            if let Ok(re) = regex::Regex::new(pattern) {
                if re.is_match(prompt) {
                    return (true, Some(format!("Detected pattern match: {}", pattern)));
                }
            }
        }

        if Self::calculate_complexity_score(prompt) <= 30 {
            let simple_phrases = [
                "what is", "what's", "tell me", "show me", "list", "get", "find",
            ];
            for phrase in simple_phrases {
                if prompt_lower.starts_with(phrase)
                    || prompt_lower.contains(&format!(" {} ", phrase))
                {
                    return (
                        true,
                        Some(format!("Simple query pattern detected: '{}'", phrase)),
                    );
                }
            }
        }

        if prompt.len() < 50 {
            let has_no_reasoning = !prompt_lower.contains("why")
                && !prompt_lower.contains("how")
                && !prompt_lower.contains("explain")
                && !prompt_lower.contains("think")
                && !prompt_lower.contains("reason");
            if has_no_reasoning {
                return (
                    true,
                    Some("Short prompt without reasoning indicators".to_string()),
                );
            }
        }

        (
            false,
            Some("Task requires LLM reasoning capabilities".to_string()),
        )
    }

    /// Suggest model based on complexity score and available providers
    /// Takes available model info from providers to find best match
    pub fn suggest_model(
        complexity_score: u8,
        available_models: &[crate::db::models::ModelInfo],
    ) -> ModelRoutingResult {
        let has_local = available_models.iter().any(|m| {
            m.provider
                .as_ref()
                .map(|p| p.contains("ollama") || p.contains("lmstudio"))
                .unwrap_or(false)
        });
        // has_cloud: detect non-local (cloud) providers only
        let has_cloud = available_models.iter().any(|m| {
            m.provider
                .as_ref()
                .map(|p| !p.contains("ollama") && !p.contains("lmstudio"))
                .unwrap_or(false)
        });

        let (mut recommended_tier, booster_reason) = if complexity_score <= 30 {
            (ModelTier::Simple, None)
        } else if complexity_score <= 74 {
            (ModelTier::Local, None)
        } else {
            (ModelTier::Cloud, None)
        };

        if recommended_tier == ModelTier::Local && !has_local {
            recommended_tier = if has_cloud {
                ModelTier::Cloud
            } else {
                ModelTier::Simple
            };
        } else if recommended_tier == ModelTier::Cloud && !has_cloud {
            recommended_tier = if has_local {
                ModelTier::Local
            } else {
                ModelTier::Simple
            };
        }

        let (agent_booster_eligible, booster_reason) = if complexity_score <= 30 {
            (true, booster_reason)
        } else {
            (false, booster_reason)
        };

        ModelRoutingResult {
            complexity_score,
            recommended_tier,
            agent_booster_eligible,
            booster_reason,
        }
    }

    /// Full model routing analysis combining all capabilities
    pub fn route_model(
        prompt: &str,
        available_models: &[crate::db::models::ModelInfo],
    ) -> ModelRoutingResult {
        let complexity_score = Self::calculate_complexity_score(prompt);
        let (agent_booster_eligible, booster_reason) = Self::detect_agent_booster(prompt);

        let recommended_tier = if agent_booster_eligible {
            ModelTier::Simple
        } else if complexity_score <= 74 {
            let has_local = available_models.iter().any(|m| {
                m.provider
                    .as_ref()
                    .map(|p| p.contains("ollama") || p.contains("lmstudio"))
                    .unwrap_or(false)
            });
            if has_local {
                ModelTier::Local
            } else {
                ModelTier::Cloud
            }
        } else {
            ModelTier::Cloud
        };

        ModelRoutingResult {
            complexity_score,
            recommended_tier,
            agent_booster_eligible,
            booster_reason: Some(booster_reason.unwrap_or_else(|| {
                if agent_booster_eligible {
                    "Simple task - no LLM needed".to_string()
                } else {
                    "Complex reasoning required".to_string()
                }
            })),
        }
    }
}

/// Generate a battle plan for Tier 3 tasks
fn generate_battle_plan(prompt: &str, agents: &[String], complexity: usize) -> BattlePlan {
    // Estimate based on complexity
    let base_tokens = 2000;
    let complexity_multiplier = 1000 * complexity as usize;
    let agent_multiplier = 500 * agents.len();

    let estimated_tokens = base_tokens + complexity_multiplier + agent_multiplier;

    // Cost estimation (assuming cloud provider rates)
    // Rough average: $0.00002 per token (mix of input/output)
    let estimated_cost_usd = (estimated_tokens as f64) * 0.00002;

    // Time estimation (assuming ~10 tokens/ms for streaming)
    let estimated_time_secs = (estimated_tokens / 10 / 1000).max(30);

    // Generate steps based on detected intent
    let mut steps = Vec::new();

    if prompt.contains("build") || prompt.contains("create") || prompt.contains("develop") {
        steps.push("1. Analyze requirements and gather context".to_string());
        steps.push("2. Design architecture and plan implementation".to_string());
        steps.push("3. Implement core components".to_string());
        steps.push("4. Test and validate functionality".to_string());
        steps.push("5. Document and finalize".to_string());
    } else if prompt.contains("analysis") || prompt.contains("analyze") || prompt.contains("audit")
    {
        steps.push("1. Gather relevant data and context".to_string());
        steps.push("2. Run initial analysis with specialized tools".to_string());
        steps.push("3. Cross-reference findings across sources".to_string());
        steps.push("4. Generate comprehensive report".to_string());
        steps.push("5. Review and validate conclusions".to_string());
    } else if prompt.contains("research") || prompt.contains("research") {
        steps.push("1. Define research scope and questions".to_string());
        steps.push("2. Search and gather information from multiple sources".to_string());
        steps.push("3. Synthesize findings and identify patterns".to_string());
        steps.push("4. Create structured summary with citations".to_string());
        steps.push("5. Validate accuracy and completeness".to_string());
    } else {
        // Generic steps
        steps.push("1. Understand task requirements".to_string());
        steps.push("2. Gather necessary context and data".to_string());
        steps.push("3. Execute multi-step workflow".to_string());
        steps.push("4. Validate intermediate results".to_string());
        steps.push("5. Deliver final output".to_string());
    }

    // Determine risk level
    let risk_level =
        if prompt.contains("delete") || prompt.contains("remove") || prompt.contains("destroy") {
            "high".to_string()
        } else if prompt.contains("write") || prompt.contains("modify") || prompt.contains("update")
        {
            "medium".to_string()
        } else {
            "low".to_string()
        };

    BattlePlan {
        agents_needed: agents.to_vec(),
        estimated_tokens,
        estimated_cost_usd,
        estimated_time_secs,
        steps,
        risk_level,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tier1_classification() {
        let result = ComplexityRouter::classify("What's the weather today?");
        assert_eq!(result.tier, TaskTier::Tier1);
        assert!(result.confidence > 0.8);
    }

    #[test]
    fn test_tier2_classification() {
        let result = ComplexityRouter::classify("Write a summary of this document");
        assert_eq!(result.tier, TaskTier::Tier2);
    }

    #[test]
    fn test_tier3_classification() {
        let result = ComplexityRouter::classify(
            "Build a comprehensive full-stack web application with a deep database architecture and deploy to production pipeline. I need a thorough security audit of the whole system including penetration testing."
        );
        assert_eq!(result.tier, TaskTier::Tier3);
        assert!(result.battle_plan.is_some());
    }

    #[test]
    fn test_agent_detection() {
        let result = ComplexityRouter::classify("Research security vulnerabilities in the system");
        // Should recommend a specialized agent based on keywords
        assert!(result.recommended_agent == "ZEN-TAC" || result.recommended_agent == "ZEN-DOCS");
    }

    #[test]
    fn test_complexity_score_simple() {
        let score = ComplexityRouter::calculate_complexity_score("What's the weather?");
        assert!(
            score <= 30,
            "Simple query should have score <= 30, got {}",
            score
        );
    }

    #[test]
    fn test_complexity_score_moderate() {
        let score = ComplexityRouter::calculate_complexity_score(
            "Write a summary of this document and explain the key points",
        );
        assert!(
            score > 30 && score <= 60,
            "Moderate query should have score 31-60, got {}",
            score
        );
    }

    #[test]
    fn test_complexity_score_complex() {
        let score = ComplexityRouter::calculate_complexity_score(
            "Build a complete web application with database and deploy to production",
        );
        assert!(
            score > 60,
            "Complex query should have score > 60, got {}",
            score
        );
    }

    #[test]
    fn test_agent_booster_simple_transform() {
        let (eligible, reason) =
            ComplexityRouter::detect_agent_booster("convert this to uppercase");
        assert!(eligible, "Should be eligible for simple transform");
        assert!(reason.is_some());
    }

    #[test]
    fn test_agent_booster_simple_query() {
        let (eligible, reason) = ComplexityRouter::detect_agent_booster("what is 2+2");
        assert!(eligible, "Should be eligible for simple math");
        assert!(reason.is_some());
    }

    #[test]
    fn test_agent_booster_complex() {
        let (eligible, _reason) = ComplexityRouter::detect_agent_booster(
            "Explain the philosophical implications of AI consciousness",
        );
        assert!(
            !eligible,
            "Complex reasoning should not be eligible for Agent Booster"
        );
    }

    #[test]
    fn test_model_routing_result() {
        let models = vec![];
        let result = ComplexityRouter::route_model("What's the weather?", &models);
        assert_eq!(result.complexity_score, 0);
        assert_eq!(result.recommended_tier, ModelTier::Simple);
        assert!(result.agent_booster_eligible);
    }

    #[test]
    fn test_model_routing_with_local_provider() {
        let models = vec![crate::db::models::ModelInfo {
            id: "llama2".to_string(),
            name: "llama2".to_string(),
            provider: Some("ollama".to_string()),
            ..Default::default()
        }];
        let result = ComplexityRouter::route_model("Write a summary of this document", &models);
        assert_eq!(result.recommended_tier, ModelTier::Local);
    }
}
