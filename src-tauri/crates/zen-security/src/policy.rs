//! Rules engine (from tools/permission.rs, Phase 4): the 6-layer
//! precedence chain, user-configured pattern rules, regex cache,
//! hardcoded security rules, and the secure plan-mode path check.
//!
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
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, RwLock};

// Re-export the merged-module surface the old tools/permission.rs had, so
// `zen_security::policy::{PermissionDecision, RiskLevel}` (and the app
// shim path `tools::permission::`) resolve for every historical importer.
pub use crate::approval::PermissionDecision;
pub use crate::risk::RiskLevel;

use crate::approval::build_context;

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

        // --- Layers 2-4: Tool-specific user overrides (deny > confirm > allow).
        // These take precedence over the global permission_mode cascade so that
        // user-saved per-tool rules are always honored, even in YOLO mode (deny only).
        if let Some(rules) = settings.tool_overrides.get(tool_name) {
            if !rules.always_deny.is_empty()
                && settings.cache.matches_any(&args_str, &rules.always_deny)
            {
                return PermissionDecision::Deny {
                    reason: format!("Blocked by per-tool always_deny pattern for '{}'", tool_name),
                };
            }
            if !rules.always_confirm.is_empty()
                && settings.cache.matches_any(&args_str, &rules.always_confirm)
            {
                return PermissionDecision::Confirm {
                    context: build_context(tool_name, args, risk_level),
                };
            }
            if !rules.always_allow.is_empty()
                && settings.cache.matches_any(&args_str, &rules.always_allow)
            {
                return PermissionDecision::Allow;
            }
            // Layer 5: per-tool default (overrides global mode)
            if let Some(default) = &rules.default {
                return match default {
                    PermissionDefault::AlwaysDeny => PermissionDecision::Deny {
                        reason: format!("Blocked by per-tool default deny for '{}'", tool_name),
                    },
                    PermissionDefault::AlwaysAllow => PermissionDecision::Allow,
                    PermissionDefault::Confirm => PermissionDecision::Confirm {
                        context: build_context(tool_name, args, risk_level),
                    },
                };
            }
        }

        // Determine effective mode based on settings or the permission_mode string
        let mode = if settings.yolo_mode || settings.permission_mode == "yolo" {
            "yolo"
        } else {
            settings.permission_mode.as_str()
        };

        match mode {
            "yolo" => PermissionDecision::Allow,
            "plan_mode" => {
                // Read-only Plan Mode: only Low and Medium risk tools run automatically.
                // High risk (file writes) and Critical (shell/bash) are blocked immediately.
                if risk_level == RiskLevel::Low || risk_level == RiskLevel::Medium {
                    PermissionDecision::Allow
                } else if risk_level == RiskLevel::High {
                    // Plan Mode Exception: allow writing plan markdown files.
                    // Security: only allow paths that resolve *inside* the
                    // configured plans_root (workspace_folder.join("plans")).
                    // The legacy substring check below was trivially bypassable
                    // (`/tmp/plans_evil/foo.txt` matched "/plans/") and is
                    // retained only as a fallback when no plans_root is
                    // configured (e.g. unit tests using ToolPermissions::default).
                    //
                    // File-target contract: single-target write/edit tools use
                    // `file_path` (preferred) or `path` (legacy). `apply_patch`
                    // carries a `{ "patch": "..." }` blob whose file targets
                    // live inside the embedded patch text — we have to PARSE
                    // the patch to evaluate the exception. ALL hunk targets
                    // must resolve inside plans_root; a single out-of-root
                    // target denies the whole patch.
                    let is_plan = plan_mode_targets_inside_root(
                        tool_name,
                        args,
                        settings.plans_root.as_deref(),
                    );
                    if is_plan {
                        PermissionDecision::Allow
                    } else {
                        PermissionDecision::Deny {
                            reason: format!(
                                "File modification on '{}' blocked by Plan Mode (read-only)",
                                tool_name
                            ),
                        }
                    }
                } else {
                    PermissionDecision::Deny {
                        reason: format!(
                            "High-risk command execution '{}' blocked by Plan Mode (read-only)",
                            tool_name
                        ),
                    }
                }
            }
            "auto_edit" => {
                // Edit Automatically: file edits (`Low` risk reads and
                // `Medium` risk non-destructive operations) run without
                // prompts. `High` risk file write / patch operations and
                // `Critical` terminal/shell operations BOTH require an
                // explicit use confirmation so the safety-mode wording
                // ("ask for high-impact changes") matches the actual
                // matrix. The previous behaviour auto-allowed all High
                // risk tools — including file writes — and was a
                // contradiction with the UI copy that described file
                // edits as the silent-allow surface.
                //
                // Note: this is the documented contract for `auto_edit`.
                // Tools advertising this mode in the Chat tab MUST keep
                // their risk-level declarations honest; under-classifying
                // a write tool as Medium to bypass `Confirm` is not
                // sanctioned by this layer.
                if risk_level == RiskLevel::Low || risk_level == RiskLevel::Medium {
                    PermissionDecision::Allow
                } else {
                    PermissionDecision::Confirm {
                        context: build_context(tool_name, args, risk_level),
                    }
                }
            }
            _ => {
                // Ask Before Changes (default standard safety):
                // Low risk runs automatically. Medium, High, and Critical trigger confirmation.
                if risk_level == RiskLevel::Low {
                    PermissionDecision::Allow
                } else {
                    PermissionDecision::Confirm {
                        context: build_context(tool_name, args, risk_level),
                    }
                }
            }
        }
    }
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
    /// Active permission mode (plan_mode | ask | auto_edit | yolo)
    #[serde(default = "default_permission_mode")]
    pub permission_mode: String,
    /// Lazily compiled regex cache — not serialized, shared via Arc across clones
    #[serde(skip)]
    #[serde(default = "RegexCache::default")]
    pub cache: RegexCache,
    /// Resolved plans directory for secure Plan-Mode writes.
    /// Set at runtime from `AppState.workspace_folder.join("plans")` so
    /// the plan-mode exception cannot be triggered via path-string tricks
    /// (substring lookalikes, `..` traversal). When `None`, the legacy
    /// heuristic is used — preserves test compatibility.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plans_root: Option<PathBuf>,
}

fn default_permission_mode() -> String {
    "ask".to_string()
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
            permission_mode: "ask".to_string(),
            cache: RegexCache::default(),
            plans_root: None,
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

// ========== SECURE PLAN-MODE PATH CHECK ==========

/// Plan-Mode target evaluation. For single-target tools this returns
/// `true` iff the file target resolves inside `plans_root`. For
/// `apply_patch` it parses the embedded patch and returns `true` iff
/// every hunk's declared path resolves inside `plans_root`. A patch that
/// mixes plan-mode and non-plan-mode targets is denied atomically — the
/// contract is "each target lands inside plans_root" with no partial
/// approval.
fn plan_mode_targets_inside_root(
    tool_name: &str,
    args: &serde_json::Value,
    plans_root: Option<&Path>,
) -> bool {
    if tool_name == "apply_patch" {
        let patch_text = args.get("patch").and_then(|p| p.as_str());
        match (patch_text, plans_root) {
            (Some(text), Some(plan_root)) => {
                crate::patch_parser::parse_patches(text)
                    .map(|hunks| {
                        !hunks.is_empty()
                            && hunks.iter().all(|h| {
                                let decl = match h {
                                    crate::patch_parser::PatchHunk::AddFile { path, .. }
                                    | crate::patch_parser::PatchHunk::DeleteFile { path }
                                    | crate::patch_parser::PatchHunk::UpdateFile {
                                        path, ..
                                    } => path,
                                };
                                is_within_plans_root(&decl.to_string_lossy(), plan_root)
                            })
                    })
                    .unwrap_or(false)
            }
            (Some(text), None) => {
                // Fallback: substring heuristic (NOT secure). Matches the
                // legacy pre-`plans_root` behaviour so unit tests using
                // `ToolPermissions::default` keep passing.
                text.contains("/plans/") || text.contains(".zen/plans/")
            }
            (None, _) => false,
        }
    } else {
        let path_str = extract_file_target(args);
        match (path_str.as_deref(), plans_root) {
            (Some(p), Some(plan_root)) => is_within_plans_root(p, plan_root),
            (Some(p), None) => p.contains("/plans/") || p.contains(".zen/plans/"),
            (None, _) => false,
        }
    }
}

// ========== UNIFIED FILE-TARGET CONTRACT ==========

/// Single source of truth for "which file is this tool touching?".
///
/// Reads both the modern `file_path` field (the contract used by the
/// app's write/edit tools in fs_tools and the patch tool's
/// per-hunk resolution) and the legacy `path` field used by older
/// readers / config-style callers. `target_path` is also recognized so
/// any future write tool that wants to rename the field can do so
/// without breaking the plan-mode exception.
///
/// Returns `None` when no recognizable file target is present
/// (e.g. terminal commands, network tools, the unparsed `apply_patch`
/// payload where the path lives inside the embedded patch text — that
/// case is handled separately in `fs_tools/patch.rs`).
pub fn extract_file_target(args: &serde_json::Value) -> Option<String> {
    args.get("file_path")
        .or_else(|| args.get("path"))
        .or_else(|| args.get("target_path"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Returns true iff `user_path` resolves inside `plans_root`.
///
/// Defeats the two classes of attack that the legacy substring check
/// missed:
///   1. Substring lookalikes — `/tmp/plans_evil/foo.txt` matched `/plans/`
///      under the old check. The new check resolves the path lexically
///      (or canonically when the file exists) and tests `starts_with`
///      against `plans_root`.
///   2. `..` traversal — `/workspace/plans/../etc/passwd` resolved to
///      `/workspace/etc/passwd`. The canonicalize path collapses `..`
///      against the real filesystem; the lexical fallback collapses it
///      against the path components themselves.
///
/// For paths that do not exist on disk (newly-created plan files), we
/// try canonicalize first; on failure we lexically normalize the
/// remaining path components. Symlink evasion requires the file to
/// exist, so a symlink at `/workspace/plans/foo -> /etc/` only escapes
/// at write time if the symlink target directory itself lives inside
/// `plans_root` — which it won't, since the attacker does not control
/// filesystem layout. Failures from canonicalize that leave no path
/// component existing are treated as deny.
pub fn is_within_plans_root(user_path: &str, plans_root: &Path) -> bool {
    let raw = Path::new(user_path);

    // Case 1: file exists on disk → canonicalize resolves symlinks + `..`.
    if let Ok(canonical) = raw.canonicalize() {
        return canonical.starts_with(plans_root);
    }

    // Case 2: file does not exist (newly-created plan). Lexically normalize
    // components: handle `..`, drop `.`, then compare prefix.
    let mut normalized = PathBuf::new();
    for component in raw.components() {
        match component {
            std::path::Component::ParentDir => {
                if !normalized.pop() && raw.is_absolute() {
                    // Attempted escape above absolute root.
                    return false;
                }
            }
            std::path::Component::CurDir => {}
            std::path::Component::Normal(name) => normalized.push(name),
            std::path::Component::RootDir => normalized.push(component),
            std::path::Component::Prefix(_) => normalized.push(component),
        }
    }

    // If the user path was relative, we cannot resolve it without the
    // workspace root in scope. Fail closed — the security exception does
    // not apply.
    if !normalized.has_root() && !raw.is_absolute() {
        return false;
    }

    normalized.starts_with(plans_root)
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

// ========== TEST MODULES ==========
//
// The security-regression suites for this policy engine live in sibling files
// declared through `#[path]` (openai_compat/stream_tests.rs precedent) so the
// rules engine itself stays under the file-size gate while the tests keep
// module-relative access to the private helpers they pin.

#[path = "policy_mode_risk_tests.rs"]
#[cfg(test)]
mod mode_risk_matrix;

#[path = "policy_tests.rs"]
#[cfg(test)]
mod tests;
