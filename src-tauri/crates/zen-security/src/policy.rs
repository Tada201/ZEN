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

// ========== MODE × RISK MATRIX TESTS ==========
//
// The `PermissionDecision::from_input` policy lives behind a 6-layer
// precedence chain and is the single point at which Zen wires the
// user-visible "safety mode" to actual runtime behaviour. A drift
// between the documented mode and the matrix below is a security
// regression — the Chat tab and any 3rd-party agent both rely on
// these contracts to decide which calls to gate.
//
// The matrix below pins every (mode, risk) cell. If you change one of
// these branches, ALL the matrix cells must be updated in lockstep
// with the runtime code AND with the matching UI copy in
// `src/components/settings/Tabs/ToolsSettings.tsx`.
#[cfg(test)]
mod mode_risk_matrix {
    use super::*;

    /// Convenience: build a `ToolPermissions` whose only relevant
    /// field is the permission mode. Plans-root is the legacy
    /// substring fallback by default so a `plan_mode` High-risk test
    /// that just checks the substring heuristic works without
    /// touching disk.
    fn settings_for(mode: &str) -> ToolPermissions {
        ToolPermissions {
            permission_mode: mode.to_string(),
            ..ToolPermissions::default()
        }
    }

    /// Stable wrapper so matrix failure messages name the cell.
    fn assert_decision(
        mode: &str,
        risk: RiskLevel,
        actual: PermissionDecision,
        expected: &str,
        matcher: impl Fn(&PermissionDecision) -> bool,
    ) {
        assert!(
            matcher(&actual),
            "[{} × {:?}] expected {}, got {:?}",
            mode,
            risk,
            expected,
            actual,
        );
    }

    // ── yolo ──────────────────────────────────────────────────────────
    // YOLO bypasses user confirmation entirely. Hardcoded security
    // rules still apply (tested separately under
    // `tests for hardcoded rules`).
    #[test]
    fn matrix_yolo_allows_low() {
        let s = settings_for("yolo");
        let d = PermissionDecision::from_input(
            "any",
            &serde_json::json!({}),
            RiskLevel::Low,
            &s,
        );
        assert_decision("yolo", RiskLevel::Low, d, "Allow", |d| {
            matches!(d, PermissionDecision::Allow)
        });
    }

    #[test]
    fn matrix_yolo_allows_medium() {
        let s = settings_for("yolo");
        let d = PermissionDecision::from_input(
            "any",
            &serde_json::json!({}),
            RiskLevel::Medium,
            &s,
        );
        assert_decision("yolo", RiskLevel::Medium, d, "Allow", |d| {
            matches!(d, PermissionDecision::Allow)
        });
    }

    #[test]
    fn matrix_yolo_allows_high() {
        let s = settings_for("yolo");
        let d = PermissionDecision::from_input(
            "any",
            &serde_json::json!({}),
            RiskLevel::High,
            &s,
        );
        assert_decision("yolo", RiskLevel::High, d, "Allow", |d| {
            matches!(d, PermissionDecision::Allow)
        });
    }

    #[test]
    fn matrix_yolo_allows_critical() {
        let s = settings_for("yolo");
        let d = PermissionDecision::from_input(
            "any",
            &serde_json::json!({}),
            RiskLevel::Critical,
            &s,
        );
        assert_decision("yolo", RiskLevel::Critical, d, "Allow", |d| {
            matches!(d, PermissionDecision::Allow)
        });
    }

    // ── plan_mode ─────────────────────────────────────────────────────
    // Read-only. Low + Medium run automatically. High is `Deny`
    // unless the target lives inside the plans_root exception. Critical
    // (terminal / shell) is always `Deny` so a plan-stage can't run
    // arbitrary commands.
    #[test]
    fn matrix_plan_mode_allows_low() {
        let s = settings_for("plan_mode");
        let d = PermissionDecision::from_input(
            "any",
            &serde_json::json!({}),
            RiskLevel::Low,
            &s,
        );
        assert_decision("plan_mode", RiskLevel::Low, d, "Allow", |d| {
            matches!(d, PermissionDecision::Allow)
        });
    }

    #[test]
    fn matrix_plan_mode_allows_medium() {
        let s = settings_for("plan_mode");
        let d = PermissionDecision::from_input(
            "any",
            &serde_json::json!({}),
            RiskLevel::Medium,
            &s,
        );
        assert_decision("plan_mode", RiskLevel::Medium, d, "Allow", |d| {
            matches!(d, PermissionDecision::Allow)
        });
    }

    #[test]
    fn matrix_plan_mode_high_denies_outside_plans_root() {
        // Without a plans_root configured, the legacy substring
        // heuristic kicks in. A path that does NOT contain
        // `/plans/` or `.zen/plans/` must be denied.
        let s = settings_for("plan_mode");
        let d = PermissionDecision::from_input(
            "write_file",
            &serde_json::json!({ "file_path": "/tmp/example/foo.txt" }),
            RiskLevel::High,
            &s,
        );
        assert_decision("plan_mode", RiskLevel::High, d, "Deny", |d| {
            matches!(d, PermissionDecision::Deny { .. })
        });
    }

    #[test]
    fn matrix_plan_mode_high_denies_critical() {
        let s = settings_for("plan_mode");
        let d = PermissionDecision::from_input(
            "terminal",
            &serde_json::json!({ "command": "ls" }),
            RiskLevel::Critical,
            &s,
        );
        assert_decision("plan_mode", RiskLevel::Critical, d, "Deny", |d| {
            matches!(d, PermissionDecision::Deny { .. })
        });
    }

    // ── ask ───────────────────────────────────────────────────────────
    // The default. Low risk runs automatically; Medium, High, and
    // Critical ALWAYS trigger a Confirm prompt.
    #[test]
    fn matrix_ask_allows_low() {
        let s = settings_for("ask");
        let d = PermissionDecision::from_input(
            "any",
            &serde_json::json!({}),
            RiskLevel::Low,
            &s,
        );
        assert_decision("ask", RiskLevel::Low, d, "Allow", |d| {
            matches!(d, PermissionDecision::Allow)
        });
    }

    #[test]
    fn matrix_ask_confirms_medium() {
        let s = settings_for("ask");
        let d = PermissionDecision::from_input(
            "any",
            &serde_json::json!({}),
            RiskLevel::Medium,
            &s,
        );
        assert_decision("ask", RiskLevel::Medium, d, "Confirm", |d| {
            matches!(d, PermissionDecision::Confirm { .. })
        });
    }

    #[test]
    fn matrix_ask_confirms_high() {
        let s = settings_for("ask");
        let d = PermissionDecision::from_input(
            "write_file",
            &serde_json::json!({ "file_path": "/x" }),
            RiskLevel::High,
            &s,
        );
        assert_decision("ask", RiskLevel::High, d, "Confirm", |d| {
            matches!(d, PermissionDecision::Confirm { .. })
        });
    }

    #[test]
    fn matrix_ask_confirms_critical() {
        let s = settings_for("ask");
        let d = PermissionDecision::from_input(
            "terminal",
            &serde_json::json!({ "command": "ls" }),
            RiskLevel::Critical,
            &s,
        );
        assert_decision("ask", RiskLevel::Critical, d, "Confirm", |d| {
            matches!(d, PermissionDecision::Confirm { .. })
        });
    }

    // ── auto_edit ─────────────────────────────────────────────────────
    // "Edit files automatically; ask before high-impact changes."
    // Low + Medium run automatically; BOTH `High` (file writes) and
    // `Critical` (terminal/shell) trigger Confirm. The High step is
    // the key fix: the previous code silently allowed file writes in
    // this mode, contradicting the safety-mode wording.
    #[test]
    fn matrix_auto_edit_allows_low() {
        let s = settings_for("auto_edit");
        let d = PermissionDecision::from_input(
            "any",
            &serde_json::json!({}),
            RiskLevel::Low,
            &s,
        );
        assert_decision("auto_edit", RiskLevel::Low, d, "Allow", |d| {
            matches!(d, PermissionDecision::Allow)
        });
    }

    #[test]
    fn matrix_auto_edit_allows_medium() {
        let s = settings_for("auto_edit");
        let d = PermissionDecision::from_input(
            "any",
            &serde_json::json!({}),
            RiskLevel::Medium,
            &s,
        );
        assert_decision("auto_edit", RiskLevel::Medium, d, "Allow", |d| {
            matches!(d, PermissionDecision::Allow)
        });
    }

    #[test]
    fn matrix_auto_edit_confirms_high_file_write() {
        let s = settings_for("auto_edit");
        let d = PermissionDecision::from_input(
            "write_file",
            &serde_json::json!({ "file_path": "/workspace/x.rs" }),
            RiskLevel::High,
            &s,
        );
        assert_decision("auto_edit", RiskLevel::High, d, "Confirm", |d| {
            matches!(d, PermissionDecision::Confirm { .. })
        });
    }

    #[test]
    fn matrix_auto_edit_confirms_high_apply_patch() {
        let s = settings_for("auto_edit");
        let d = PermissionDecision::from_input(
            "apply_patch",
            &serde_json::json!({ "patch": "*** Update File: x.rs\n" }),
            RiskLevel::High,
            &s,
        );
        assert_decision("auto_edit", RiskLevel::High, d, "Confirm", |d| {
            matches!(d, PermissionDecision::Confirm { .. })
        });
    }

    #[test]
    fn matrix_auto_edit_confirms_critical_terminal() {
        let s = settings_for("auto_edit");
        let d = PermissionDecision::from_input(
            "terminal",
            &serde_json::json!({ "command": "ls" }),
            RiskLevel::Critical,
            &s,
        );
        assert_decision("auto_edit", RiskLevel::Critical, d, "Confirm", |d| {
            matches!(d, PermissionDecision::Confirm { .. })
        });
    }
}

// ========== TESTS ==========

#[cfg(test)]
mod tests {
    use super::*;
    use crate::approval::PermissionContext;

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

    // ─── Plan-mode secure path check (A1 fix) ────────────────────────
    //
    // Uses a real tempdir on disk so `canonicalize` succeeds for the
    // happy path. The bypass and traversal cases do not require disk
    // state — the substring attack fails at canonicalize; the `..`
    // attack is caught by lexical normalization.

    #[test]
    fn test_plan_mode_allows_path_inside_configured_plans_root() {
        let dir = std::env::temp_dir().join(format!(
            "zen-plan-mode-allow-{}",
            std::process::id()
        ));
        let workspace = dir.join("ws");
        let plans = workspace.join("plans");
        std::fs::create_dir_all(&plans).unwrap();

        let settings = ToolPermissions {
            permission_mode: "plan_mode".to_string(),
            plans_root: Some(plans.clone()),
            ..ToolPermissions::default()
        };

        let target = plans.join("roadmap.md");
        let args = serde_json::json!({ "path": target.to_string_lossy() });
        let decision = PermissionDecision::from_input(
            "write_file",
            &args,
            RiskLevel::High,
            &settings,
        );
        assert!(
            matches!(decision, PermissionDecision::Allow),
            "expected Allow for path inside plans_root, got {:?}",
            decision
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_plan_mode_rejects_substring_bypass_outside_plans_root() {
        let dir = std::env::temp_dir().join(format!(
            "zen-plan-mode-bypass-{}",
            std::process::id()
        ));
        let workspace = dir.join("ws");
        let plans = workspace.join("plans");
        std::fs::create_dir_all(&plans).unwrap();

        let settings = ToolPermissions {
            permission_mode: "plan_mode".to_string(),
            plans_root: Some(plans.clone()),
            ..ToolPermissions::default()
        };

        // Path outside the plans_root but contains the lookalike string.
        // The legacy substring check would have allowed this.
        let evil = dir.join("plans_evil").join("foo.txt");
        std::fs::create_dir_all(evil.parent().unwrap()).unwrap();
        std::fs::write(&evil, "x").unwrap();

        let args = serde_json::json!({ "path": evil.to_string_lossy() });
        let decision = PermissionDecision::from_input(
            "write_file",
            &args,
            RiskLevel::High,
            &settings,
        );
        assert!(
            matches!(decision, PermissionDecision::Deny { .. }),
            "expected Deny for {:?}, got {:?}",
            evil, decision
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_plan_mode_rejects_dotdot_traversal() {
        let dir = std::env::temp_dir().join(format!(
            "zen-plan-mode-traversal-{}",
            std::process::id()
        ));
        let workspace = dir.join("ws");
        let plans = workspace.join("plans");
        let outside = workspace.join("secrets");
        std::fs::create_dir_all(&plans).unwrap();
        std::fs::create_dir_all(&outside).unwrap();

        let settings = ToolPermissions {
            permission_mode: "plan_mode".to_string(),
            plans_root: Some(plans.canonicalize().unwrap()),
            ..ToolPermissions::default()
        };

        // Attempted ../secrets/key via plans directory.
        let traversal = plans.join("../secrets/key.txt");
        let args = serde_json::json!({ "path": traversal.to_string_lossy() });
        let decision = PermissionDecision::from_input(
            "write_file",
            &args,
            RiskLevel::High,
            &settings,
        );
        assert!(
            matches!(decision, PermissionDecision::Deny { .. }),
            "expected Deny for {:#?}, got {:?}",
            traversal, decision
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_plan_mode_legacy_substring_fallback_when_no_plans_root() {
        // When plans_root is None, preserve the legacy substring match so
        // existing test fixtures don't break. This is documented behavior;
        // production callers should always populate plans_root.
        let settings = ToolPermissions {
            permission_mode: "plan_mode".to_string(),
            ..ToolPermissions::default()
        };
        // plans_root left as None.

        let args = serde_json::json!({ "path": "anywhere/plans/foo.md" });
        let decision = PermissionDecision::from_input(
            "write_file",
            &args,
            RiskLevel::High,
            &settings,
        );
        assert!(matches!(decision, PermissionDecision::Allow));
    }

    #[cfg(unix)]
    #[test]
    fn test_plan_mode_rejects_symlink_evasion() {
        let dir = std::env::temp_dir().join(format!(
            "zen-plan-mode-symlink-{}",
            std::process::id()
        ));
        let workspace = dir.join("ws");
        let plans = workspace.join("plans");
        let secrets = workspace.join("secrets");
        std::fs::create_dir_all(&plans).unwrap();
        std::fs::create_dir_all(&secrets).unwrap();

        let key = secrets.join("key.txt");
        std::fs::write(&key, "x").unwrap();

        // Symlink: ws/plans/leak -> ws/secrets/key.txt. The file exists,
        // so canonicalize() will resolve through the symlink to the secret
        // path, which lives OUTSIDE plans_root. The plan-mode exception
        // must NOT apply.
        let leak = plans.join("leak");
        std::os::unix::fs::symlink(&key, &leak).unwrap();

        let settings = ToolPermissions {
            permission_mode: "plan_mode".to_string(),
            plans_root: Some(plans.canonicalize().unwrap()),
            ..ToolPermissions::default()
        };

        let args = serde_json::json!({ "path": leak.to_string_lossy() });
        let decision = PermissionDecision::from_input(
            "write_file",
            &args,
            RiskLevel::High,
            &settings,
        );
        assert!(
            matches!(decision, PermissionDecision::Deny { .. }),
            "expected Deny for symlink leaking outside plans_root, got {:?}",
            decision
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_plan_mode_rejects_relative_path_with_absolute_plans_root() {
        // plans_root is absolute but user_path is relative. Lexical
        // normalization leaves a relative path; the helper fails closed
        // to prevent the attacker from supplying "plans/roadmap.md" and
        // having it silently bind against the workspace plans_root via
        // server-side resolution that we can't perform here.
        let settings = ToolPermissions {
            permission_mode: "plan_mode".to_string(),
            plans_root: Some(PathBuf::from("/abs/workspace/plans")),
            ..ToolPermissions::default()
        };

        let args = serde_json::json!({ "path": "plans/roadmap.md" });
        let decision = PermissionDecision::from_input(
            "write_file",
            &args,
            RiskLevel::High,
            &settings,
        );
        assert!(
            matches!(decision, PermissionDecision::Deny { .. }),
            "expected Deny for relative path with absolute plans_root, got {:?}",
            decision
        );
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
