//! Mode x risk permission matrix suite for `policy.rs`.
//! Moved out of policy.rs during the Phase 12 file-size sweep; declared via
//! `#[path]` so module-relative paths resolve exactly as before.

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
