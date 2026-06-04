//! Tool Permission System — Zed-inspired Layered Permission Architecture
//!
//! 6-layer precedence chain:
//! 1. Hardcoded security rules (unbypassable)
//! 2. always_deny patterns (user-configured)
//! 3. always_confirm patterns (user-configured)
//! 4. always_allow patterns (user-configured)
//! 5. Tool-specific default
//! 6. Global default

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

// ========== RISK LEVELS ==========

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    /// Read-only, safe operations (e.g., system metrics, time)
    Low,
    /// File reads, non-destructive operations
    Medium,
    /// File writes, network requests
    High,
    /// Terminal commands, deletions
    Critical,
}

impl RiskLevel {
    pub fn description(&self) -> &'static str {
        match self {
            RiskLevel::Low => "Safe read-only operation",
            RiskLevel::Medium => "Non-destructive operation",
            RiskLevel::High => "Potentially destructive operation",
            RiskLevel::Critical => "High-risk system operation",
        }
    }
}

// ========== PERMISSION DECISION ==========

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[serde(tag = "type", content = "data")]
pub enum PermissionDecision {
    /// Tool execution is approved
    Allow,
    /// Tool execution is blocked
    Deny { reason: String },
    /// User confirmation required
    Confirm { context: PermissionContext },
}

/// Context provided when requesting user confirmation
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PermissionContext {
    pub tool_name: String,
    pub description: String,
    pub arguments_preview: String,
    pub risk_level: RiskLevel,
    /// Suggested patterns for "Always allow..." buttons
    pub suggested_patterns: Vec<String>,
}

// ========== CORE DECISION LOGIC (Zed-style 6-layer precedence) ==========

impl PermissionDecision {
    /// The main entry point: determine permission for a tool call.
    ///
    /// Precedence (first match wins):
    /// 1. Hardcoded security rules → Deny
    /// 2. Tool-specific always_deny patterns → Deny
    /// 3. Tool-specific always_confirm patterns → Confirm
    /// 4. Tool-specific always_allow patterns → Allow
    /// 5. Tool-specific default → Allow/Deny/Confirm
    /// 6. Global default → Allow/Deny/Confirm
    pub fn from_input(
        tool_name: &str,
        args: &serde_json::Value,
        risk_level: RiskLevel,
        settings: &ToolPermissions,
    ) -> Self {
        let args_str = serde_json::to_string(args).unwrap_or_default();

        // --- Layer 1: Hardcoded security rules (unbypassable) ---
        if let Some(reason) = HARDCODED_SECURITY_RULES.check_all(tool_name, &args_str) {
            return PermissionDecision::Deny { reason };
        }

        // --- Layer 1.5: YOLO Mode (Bypasses confirmation/overrides, but respects Hardcoded Deny) ---
        if settings.yolo_mode {
            return PermissionDecision::Allow;
        }

        // --- Layer 1.6: Auto-Approve Low Risk ---
        if settings.auto_approve_low_risk && risk_level == RiskLevel::Low {
            return PermissionDecision::Allow;
        }

        // --- Layers 2-5: Tool-specific rules ---
        if let Some(rules) = settings.tool_overrides.get(tool_name) {
            // Layer 2: always_deny patterns
            if settings.cache.matches_any(&args_str, &rules.always_deny) {
                return PermissionDecision::Deny {
                    reason: format!("Matches deny pattern for '{}'", tool_name),
                };
            }

            // Layer 3: always_confirm patterns
            if settings.cache.matches_any(&args_str, &rules.always_confirm) {
                return PermissionDecision::Confirm {
                    context: build_context(tool_name, args, risk_level),
                };
            }

            // Layer 4: always_allow patterns
            if settings.cache.matches_any(&args_str, &rules.always_allow) {
                return PermissionDecision::Allow;
            }

            // Layer 5: Tool-specific default
            if let Some(default) = &rules.default {
                return apply_default(default, tool_name, args, risk_level);
            }
        }

        // --- Layer 6: Global default ---
        apply_default(&settings.global_default, tool_name, args, risk_level)
    }
}

fn apply_default(
    default: &PermissionDefault,
    tool_name: &str,
    args: &serde_json::Value,
    risk_level: RiskLevel,
) -> PermissionDecision {
    match default {
        PermissionDefault::AlwaysAllow => PermissionDecision::Allow,
        PermissionDefault::AlwaysDeny => PermissionDecision::Deny {
            reason: format!("Tool '{}' is disabled by default setting", tool_name),
        },
        PermissionDefault::Confirm => PermissionDecision::Confirm {
            context: build_context(tool_name, args, risk_level),
        },
    }
}

fn build_context(
    tool_name: &str,
    args: &serde_json::Value,
    risk_level: RiskLevel,
) -> PermissionContext {
    let preview = serde_json::to_string_pretty(&redacted_arguments_for_display(args))
        .unwrap_or_else(|_| "{}".to_string());

    // Generate suggested always-allow patterns
    let mut suggested = Vec::new();
    // Suggest: always allow this exact tool
    suggested.push(format!("tool:{}", tool_name));
    // If args contain a path, suggest the parent directory pattern
    if let Some(path) = args.get("path").and_then(|p| p.as_str()) {
        if let Some(parent) = std::path::Path::new(path).parent() {
            suggested.push(format!("{}/*", parent.display()));
        }
    }

    PermissionContext {
        tool_name: tool_name.to_string(),
        description: format!("Execute '{}' ({})", tool_name, risk_level.description()),
        arguments_preview: preview,
        risk_level,
        suggested_patterns: suggested,
    }
}

pub fn redacted_arguments_for_display(args: &serde_json::Value) -> serde_json::Value {
    fn should_redact_key(key: &str) -> bool {
        let key = key.to_ascii_lowercase();
        [
            "api_key",
            "apikey",
            "authorization",
            "bearer",
            "credential",
            "password",
            "secret",
            "token",
        ]
        .iter()
        .any(|marker| key.contains(marker))
    }

    fn should_redact_string(value: &str) -> bool {
        let value = value.to_ascii_lowercase();
        [
            "api_key",
            "apikey",
            "authorization",
            "bearer",
            "credential",
            "password",
            "secret",
            "token",
        ]
        .iter()
        .any(|marker| value.contains(marker))
    }

    fn redact(value: &serde_json::Value, depth: usize) -> serde_json::Value {
        const MAX_DEPTH: usize = 6;
        const MAX_ITEMS: usize = 24;
        const MAX_STRING_CHARS: usize = 2_000;

        if depth > MAX_DEPTH {
            return serde_json::json!("[truncated]");
        }

        match value {
            serde_json::Value::String(s) => {
                if should_redact_string(s) {
                    serde_json::json!("[redacted]")
                } else if s.chars().count() > MAX_STRING_CHARS {
                    let mut out: String = s.chars().take(MAX_STRING_CHARS).collect();
                    out.push_str("...");
                    serde_json::Value::String(out)
                } else {
                    serde_json::Value::String(s.clone())
                }
            }
            serde_json::Value::Array(items) => serde_json::Value::Array(
                items
                    .iter()
                    .take(MAX_ITEMS)
                    .map(|item| redact(item, depth + 1))
                    .collect(),
            ),
            serde_json::Value::Object(map) => {
                let mut next = serde_json::Map::new();
                for (key, value) in map.iter().take(MAX_ITEMS) {
                    next.insert(
                        key.clone(),
                        if should_redact_key(key) {
                            serde_json::json!("[redacted]")
                        } else {
                            redact(value, depth + 1)
                        },
                    );
                }
                serde_json::Value::Object(next)
            }
            other => other.clone(),
        }
    }

    redact(args, 0)
}

// ========== USER PERMISSION SETTINGS ==========

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolPermissions {
    /// Global default for tools without specific rules
    pub global_default: PermissionDefault,
    /// Per-tool permission overrides
    #[serde(default)]
    pub tool_overrides: HashMap<String, ToolPermissionRules>,
    /// YOLO Mode: Bypasses confirmation for all tools (except hardcoded denies)
    #[serde(default)]
    pub yolo_mode: bool,
    /// Auto-Approve Low Risk: Automatically allow Low risk tools
    #[serde(default)]
    pub auto_approve_low_risk: bool,
    /// Lazily compiled regex cache — not serialized, shared via Arc across clones
    #[serde(skip)]
    #[serde(default = "RegexCache::default")]
    pub cache: RegexCache,
}

impl ToolPermissions {
    /// Check if a tool should appear in `tool_list` based on current permission settings.
    /// YOLO mode shows all tools regardless of defaults.
    /// Otherwise, tools with `AlwaysDeny` at the global or per-tool level are hidden.
    pub fn is_visible_in_list(&self, tool_id: &str) -> bool {
        if self.yolo_mode {
            return true;
        }

        // Check per-tool override first (takes precedence over global)
        if let Some(rules) = self.tool_overrides.get(tool_id) {
            if let Some(default) = &rules.default {
                return matches!(
                    default,
                    PermissionDefault::AlwaysAllow | PermissionDefault::Confirm
                );
            }
        }

        // Fall back to global default
        !matches!(self.global_default, PermissionDefault::AlwaysDeny)
    }
}

impl Default for ToolPermissions {
    fn default() -> Self {
        Self {
            global_default: PermissionDefault::Confirm,
            tool_overrides: HashMap::new(),
            yolo_mode: false,
            auto_approve_low_risk: false,
            cache: RegexCache::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionDefault {
    AlwaysAllow,
    AlwaysDeny,
    Confirm,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ToolPermissionRules {
    /// Override the global default for this tool
    pub default: Option<PermissionDefault>,
    /// Regex patterns that always allow
    #[serde(default)]
    pub always_allow: Vec<String>,
    /// Regex patterns that always deny
    #[serde(default)]
    pub always_deny: Vec<String>,
    /// Regex patterns that require confirmation
    #[serde(default)]
    pub always_confirm: Vec<String>,
}

// ========== COMPILED REGEX HELPER ==========

#[derive(Debug, Clone)]
pub struct CompiledRegex {
    pattern: regex::Regex,
    original: String,
}

impl CompiledRegex {
    pub fn new(pattern: &str, case_sensitive: bool) -> Result<Self, regex::Error> {
        let regex = if case_sensitive {
            regex::Regex::new(pattern)?
        } else {
            regex::RegexBuilder::new(pattern)
                .case_insensitive(true)
                .build()?
        };

        Ok(Self {
            pattern: regex,
            original: pattern.to_string(),
        })
    }

    pub fn is_match(&self, text: &str) -> bool {
        self.pattern.is_match(text)
    }

    pub fn pattern(&self) -> &str {
        &self.original
    }
}

// ========== REGEX CACHE (LAZY COMPILATION FOR USER-CONFIGURED PATTERNS) ==========

/// Thread-safe lazy cache for compiled regex patterns.
/// Avoids recompiling the same patterns on every permission check.
/// Uses interior mutability so it can be shared behind read locks.
#[derive(Clone)]
pub struct RegexCache {
    cache: Arc<RwLock<HashMap<String, regex::Regex>>>,
}

impl std::fmt::Debug for RegexCache {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let entries = self.cache.read().ok().map(|c| c.len()).unwrap_or(0);
        f.debug_struct("RegexCache")
            .field("cached_patterns", &entries)
            .finish()
    }
}

impl Default for RegexCache {
    fn default() -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

impl RegexCache {
    /// Get a compiled regex for the given pattern, compiling and caching on first access.
    /// Returns None if the pattern is invalid.
    pub fn get_or_compile(&self, pattern: &str) -> Option<regex::Regex> {
        // Fast path: check cache with read lock
        if let Ok(cache) = self.cache.read() {
            if let Some(re) = cache.get(pattern) {
                return Some(re.clone());
            }
        }

        // Slow path: compile and insert with write lock
        let re = regex::Regex::new(pattern).ok()?;
        if let Ok(mut cache) = self.cache.write() {
            // Another thread may have inserted while we were compiling;
            // entry API avoids double-insert but we keep it simple.
            cache
                .entry(pattern.to_string())
                .or_insert_with(|| re.clone());
        }
        Some(re)
    }

    /// Check if input matches any of the given patterns, using cached compiled regexes.
    pub fn matches_any(&self, input: &str, patterns: &[String]) -> bool {
        patterns.iter().any(|p| {
            self.get_or_compile(p)
                .map(|re| re.is_match(input))
                .unwrap_or(false)
        })
    }
}

// ========== HARDCODED SECURITY RULES (CANNOT BE BYPASSED) ==========

pub struct HardcodedSecurityRules {
    /// Terminal commands that are always blocked
    pub terminal_deny: Vec<CompiledRegex>,
    /// Web fetch URLs that are always blocked (SSRF protection)
    pub web_fetch_deny: Vec<CompiledRegex>,
}

impl HardcodedSecurityRules {
    /// Check all hardcoded rules against a tool call.
    /// Returns Some(reason) if blocked.
    pub fn check_all(&self, tool_name: &str, args_str: &str) -> Option<String> {
        if tool_name == "web_fetch" {
            for pattern in &self.web_fetch_deny {
                if pattern.is_match(args_str) {
                    return Some(format!(
                        "Blocked by built-in security rule (SSRF protection: {})",
                        pattern.pattern()
                    ));
                }
            }
        }

        // Check terminal-specific patterns against full args string
        if let Some(command) = command_from_args(args_str) {
            if let Some(reason) = self.check_terminal_command(&command) {
                return Some(reason);
            }
        }
        self.check_terminal_command(args_str)
    }

    pub fn check_terminal_command(&self, command: &str) -> Option<String> {
        for pattern in &self.terminal_deny {
            if pattern.is_match(command) {
                return Some(format!(
                    "Blocked by built-in security rule (pattern: {})",
                    pattern.pattern()
                ));
            }
        }
        None
    }
}

fn command_from_args(args_str: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(args_str)
        .ok()
        .and_then(|value| {
            value
                .get("command")
                .or_else(|| value.get("cmd"))
                .and_then(|command| command.as_str())
                .map(ToString::to_string)
        })
}

pub static HARDCODED_SECURITY_RULES: LazyLock<HardcodedSecurityRules> = LazyLock::new(|| {
    let flags = r"(?:-[a-zA-Z]+\s+)*";
    let trailing_flags = r"(?:\s+-[a-zA-Z]+)*\s*";

    let terminal_deny = vec![
        // rm -rf / or rm -rf /*
        CompiledRegex::new(
            &format!(r"\brm\s+{}(?:--\s+)?/\*?{}$", flags, trailing_flags),
            false,
        )
        .expect("Hardcoded regex should compile"),
        // rm -rf ~ or rm -rf ~/
        CompiledRegex::new(
            &format!(r"\brm\s+{}(?:--\s+)?~/?\*?{}$", flags, trailing_flags),
            false,
        )
        .expect("Hardcoded regex should compile"),
        // rm -rf $HOME or rm -rf ${HOME}
        CompiledRegex::new(
            &format!(
                r"\brm\s+{}(?:--\s+)?(?:\$HOME|\$\{{HOME\}})/?\*?{}$",
                flags, trailing_flags
            ),
            false,
        )
        .expect("Hardcoded regex should compile"),
        // rm -rf . or rm -rf ./
        CompiledRegex::new(
            &format!(r"\brm\s+{}(?:--\s+)?\.(?:/?\*)?{}$", flags, trailing_flags),
            false,
        )
        .expect("Hardcoded regex should compile"),
        // rm -rf .. or rm -rf ../
        CompiledRegex::new(
            &format!(
                r"\brm\s+{}(?:--\s+)?\.\.(?:/?\*)?{}$",
                flags, trailing_flags
            ),
            false,
        )
        .expect("Hardcoded regex should compile"),
        // Format C: / format disk (Windows)
        CompiledRegex::new(r"\bformat\s+[A-Za-z]:", false).expect("Hardcoded regex should compile"),
    ];

    let web_fetch_deny = vec![
        // Block localhost/127.loopback
        CompiledRegex::new(
            r"https?://(?:localhost|127\.\d+\.\d+\.\d+|::1)(?::\d+)?(?:/|$)",
            true,
        )
        .expect("Hardcoded regex should compile"),
        // Block AWS/GCP metadata endpoint
        CompiledRegex::new(r"https?://169\.254\.169\.254", true)
            .expect("Hardcoded regex should compile"),
        // ✅ FIX: Block RFC 1918 private ranges (10.0.0.0/8)
        CompiledRegex::new(r"https?://10\.\d+\.\d+\.\d+(?::\d+)?(?:/|$)", true)
            .expect("Hardcoded regex should compile"),
        // ✅ FIX: Block RFC 1918 private ranges (172.16.0.0/12)
        CompiledRegex::new(
            r"https?://172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(?::\d+)?(?:/|$)",
            true,
        )
        .expect("Hardcoded regex should compile"),
        // ✅ FIX: Block RFC 1918 private ranges (192.168.0.0/16)
        CompiledRegex::new(r"https?://192\.168\.\d+\.\d+(?::\d+)?(?:/|$)", true)
            .expect("Hardcoded regex should compile"),
        // ✅ FIX: Block IPv6 private ranges (fc00::/7)
        CompiledRegex::new(
            r"https?://\[?[fF][cCdDeEfF][0-9a-fA-F:]+\]?(?::\d+)?(?:/|$)",
            true,
        )
        .expect("Hardcoded regex should compile"),
        // ✅ FIX: Block 0.0.0.0 (current network)
        CompiledRegex::new(r"https?://0\.0\.0\.0(?::\d+)?(?:/|$)", true)
            .expect("Hardcoded regex should compile"),
    ];

    HardcodedSecurityRules {
        terminal_deny,
        web_fetch_deny,
    }
});

// ========== SHELL COMMAND UTILITIES ==========

/// Parse shell command to extract sub-commands (prevents injection)
pub fn extract_shell_commands(input: &str) -> Vec<String> {
    let operators = ["&&", "||", ";", "|", "\n"];
    let mut commands = vec![input.to_string()];

    for op in &operators {
        let mut new_commands = Vec::new();
        for cmd in commands {
            for part in cmd.split(op) {
                let trimmed = part.trim();
                if !trimmed.is_empty() {
                    new_commands.push(trimmed.to_string());
                }
            }
        }
        commands = new_commands;
    }

    commands
}

// ========== TESTS ==========

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hardcoded_blocks_rm_rf_root() {
        let rules = &*HARDCODED_SECURITY_RULES;
        assert!(rules.check_terminal_command("rm -rf /").is_some());
        assert!(rules.check_terminal_command("rm -fr /").is_some());
        assert!(rules.check_terminal_command("rm -rfv /").is_some());
        assert!(rules.check_terminal_command("rm -rf /*").is_some());
        assert!(rules.check_terminal_command("sudo rm -rf /").is_some());
    }

    #[test]
    fn test_hardcoded_blocks_rm_rf_home() {
        let rules = &*HARDCODED_SECURITY_RULES;
        assert!(rules.check_terminal_command("rm -rf ~").is_some());
        assert!(rules.check_terminal_command("rm -rf ~/").is_some());
        assert!(rules.check_terminal_command("rm -rf $HOME").is_some());
        assert!(rules.check_terminal_command("rm -rf ${HOME}").is_some());
        assert!(rules.check_terminal_command("rm -rf ~/*").is_some());
    }

    #[test]
    fn test_hardcoded_allows_safe_rm() {
        let rules = &*HARDCODED_SECURITY_RULES;
        assert!(rules.check_terminal_command("rm -rf ./build").is_none());
        assert!(rules.check_terminal_command("rm -rf /tmp/test").is_none());
        assert!(rules.check_terminal_command("rm file.txt").is_none());
    }

    #[test]
    fn test_from_input_layer1_hardcoded_deny() {
        let settings = ToolPermissions::default();
        let args = serde_json::json!({ "command": "rm -rf /" });
        let decision =
            PermissionDecision::from_input("terminal", &args, RiskLevel::Critical, &settings);
        assert!(matches!(decision, PermissionDecision::Deny { .. }));
    }

    #[test]
    fn test_from_input_layer2_user_deny() {
        let mut settings = ToolPermissions::default();
        settings.tool_overrides.insert(
            "file_read".to_string(),
            ToolPermissionRules {
                always_deny: vec![r"\.env".to_string()],
                ..Default::default()
            },
        );

        let args = serde_json::json!({ "path": ".env" });
        let decision =
            PermissionDecision::from_input("file_read", &args, RiskLevel::Medium, &settings);
        assert!(matches!(decision, PermissionDecision::Deny { .. }));
    }

    #[test]
    fn test_from_input_layer4_user_allow() {
        let mut settings = ToolPermissions::default();
        settings.tool_overrides.insert(
            "get_system_metrics".to_string(),
            ToolPermissionRules {
                always_allow: vec![r".*".to_string()],
                ..Default::default()
            },
        );

        let args = serde_json::json!({});
        let decision =
            PermissionDecision::from_input("get_system_metrics", &args, RiskLevel::Low, &settings);
        assert!(matches!(decision, PermissionDecision::Allow));
    }

    #[test]
    fn test_from_input_layer5_tool_default() {
        let mut settings = ToolPermissions::default();
        settings.tool_overrides.insert(
            "get_system_metrics".to_string(),
            ToolPermissionRules {
                default: Some(PermissionDefault::AlwaysAllow),
                ..Default::default()
            },
        );

        let args = serde_json::json!({});
        let decision =
            PermissionDecision::from_input("get_system_metrics", &args, RiskLevel::Low, &settings);
        assert!(matches!(decision, PermissionDecision::Allow));
    }

    #[test]
    fn test_from_input_layer6_global_default_confirm() {
        let settings = ToolPermissions::default(); // global = Confirm
        let args = serde_json::json!({});
        let decision =
            PermissionDecision::from_input("some_tool", &args, RiskLevel::Medium, &settings);
        assert!(matches!(decision, PermissionDecision::Confirm { .. }));
    }

    #[test]
    fn test_from_input_deny_overrides_allow() {
        // Deny patterns take precedence over allow patterns
        let mut settings = ToolPermissions::default();
        settings.tool_overrides.insert(
            "file_read".to_string(),
            ToolPermissionRules {
                always_deny: vec![r"secret".to_string()],
                always_allow: vec![r".*".to_string()],
                ..Default::default()
            },
        );

        let args = serde_json::json!({ "path": "secret.key" });
        let decision =
            PermissionDecision::from_input("file_read", &args, RiskLevel::Medium, &settings);
        assert!(matches!(decision, PermissionDecision::Deny { .. }));
    }

    #[test]
    fn test_extract_shell_commands() {
        let cmds = extract_shell_commands("ls && rm -rf /");
        assert!(cmds.contains(&"ls".to_string()));
        assert!(cmds.contains(&"rm -rf /".to_string()));

        let cmds = extract_shell_commands("echo hello; cat file");
        assert!(cmds.contains(&"echo hello".to_string()));
        assert!(cmds.contains(&"cat file".to_string()));
    }

    #[test]
    fn test_permission_context_serialization() {
        let decision = PermissionDecision::Confirm {
            context: PermissionContext {
                tool_name: "test".to_string(),
                description: "Test tool".to_string(),
                arguments_preview: "{}".to_string(),
                risk_level: RiskLevel::Medium,
                suggested_patterns: vec!["^test$".to_string()],
            },
        };

        let json = serde_json::to_string(&decision).unwrap();
        assert!(json.contains("confirm"));
    }

    #[test]
    fn test_regex_cache_basic() {
        let cache = RegexCache::default();
        let patterns = vec![r"\.env".to_string(), r"\.key".to_string()];

        // First call compiles and caches
        assert!(cache.matches_any(".env", &patterns));
        assert!(cache.matches_any(".key", &patterns));
        assert!(!cache.matches_any("safe.txt", &patterns));

        // Second call uses cached regexes (same result, no recompilation)
        assert!(cache.matches_any(".env", &patterns));
        assert!(!cache.matches_any("safe.txt", &patterns));

        // Cache should have entries
        let cached = cache.cache.read().unwrap();
        assert_eq!(cached.len(), 2);
    }

    #[test]
    fn test_regex_cache_invalid_pattern() {
        let cache = RegexCache::default();
        let patterns = vec![r"[invalid".to_string()]; // unclosed bracket

        // Should not panic, just return false for invalid patterns
        assert!(!cache.matches_any("anything", &patterns));
    }

    #[test]
    fn test_regex_cache_shared_across_permission_checks() {
        // Verify that ToolPermissions with cache works in from_input
        let mut settings = ToolPermissions::default();
        settings.tool_overrides.insert(
            "file_read".to_string(),
            ToolPermissionRules {
                always_deny: vec![r"\.env".to_string()],
                always_allow: vec![r"\.txt".to_string()],
                ..Default::default()
            },
        );

        // First check — compiles patterns
        let args_env = serde_json::json!({ "path": ".env" });
        let decision1 =
            PermissionDecision::from_input("file_read", &args_env, RiskLevel::Medium, &settings);
        assert!(matches!(decision1, PermissionDecision::Deny { .. }));

        // Second check — reuses cached patterns
        let args_txt = serde_json::json!({ "path": "readme.txt" });
        let decision2 =
            PermissionDecision::from_input("file_read", &args_txt, RiskLevel::Medium, &settings);
        assert!(matches!(decision2, PermissionDecision::Allow));

        // Third check — same deny pattern, cached
        let args_env2 = serde_json::json!({ "path": "secrets/.env" });
        let decision3 =
            PermissionDecision::from_input("file_read", &args_env2, RiskLevel::Medium, &settings);
        assert!(matches!(decision3, PermissionDecision::Deny { .. }));
    }
}
