//! Rules-engine regression suite for `policy.rs` (hardcoded blocks, layer
//! precedence, plan-mode path attacks). Moved out of policy.rs during the
//! Phase 12 file-size sweep; declared via `#[path]` so module-relative paths
//! resolve exactly as before.

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
            "expected Allow for path inside plans_root, got {decision:?}"
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
            plans_root: Some(plans),
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
            "expected Deny for {evil:?}, got {decision:?}"
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
            "expected Deny for {traversal:#?}, got {decision:?}"
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
            "expected Deny for relative path with absolute plans_root, got {decision:?}"
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
