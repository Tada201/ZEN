// Moved verbatim from services/tool.rs during the Phase 12 split.

    use super::*;
    use crate::tools::permission::{PermissionDefault, RiskLevel, ToolPermissions};
    use sqlx::SqlitePool;

    async fn service_with_audit(permissions: ToolPermissions) -> (ToolService, SqlitePool) {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        zen_db::queries::init_audit_events(&pool).await.unwrap();

        let security = Arc::new(SecurityService::new());
        security.set_db_pool(pool.clone()).await;

        let mut registry = crate::tools::ToolRegistry::with_permissions(permissions);
        registry.register_known_tool("safe_tool", RiskLevel::Low);
        registry.register_known_tool("web_fetch", RiskLevel::High);

        let service = ToolService::new(
            Arc::new(tokio::sync::RwLock::new(registry)),
            security,
            Arc::new(Mutex::new(HashMap::new())),
        );

        (service, pool)
    }

    #[tokio::test]
    async fn check_permission_allows_low_risk_tool_and_records_audit() {
        let permissions = ToolPermissions {
            auto_approve_low_risk: true,
            ..ToolPermissions::default()
        };
        let (service, pool) = service_with_audit(permissions).await;

        let decision = service
            .check_permission(
                "unit-test",
                &ToolCall {
                    id: "call-1".to_string(),
                    name: "safe_tool".to_string(),
                    arguments: serde_json::json!({}),
                },
            )
            .await
            .unwrap();

        assert!(matches!(
            decision,
            crate::tools::permission::PermissionDecision::Allow
        ));

        let events = zen_db::queries::list_audit_events(&pool, 10)
            .await
            .unwrap();
        assert_eq!(events.len(), 2);
        assert!(
            events
                .iter()
                .any(|event| event.decision == "allow"
                    && event.target.as_deref() == Some("safe_tool"))
        );
    }

    #[tokio::test]
    async fn check_permission_denies_hardcoded_blocked_web_fetch_and_records_audit() {
        let permissions = ToolPermissions {
            global_default: PermissionDefault::AlwaysAllow,
            ..ToolPermissions::default()
        };
        let (service, pool) = service_with_audit(permissions).await;

        let decision = service
            .check_permission(
                "unit-test",
                &ToolCall {
                    id: "call-2".to_string(),
                    name: "web_fetch".to_string(),
                    arguments: serde_json::json!({
                        "url": "http://127.0.0.1:8989/secrets"
                    }),
                },
            )
            .await
            .unwrap();

        assert!(matches!(
            decision,
            crate::tools::permission::PermissionDecision::Deny { .. }
        ));

        let events = zen_db::queries::list_audit_events(&pool, 10)
            .await
            .unwrap();
        assert!(events
            .iter()
            .any(|event| event.decision == "deny" && event.target.as_deref() == Some("web_fetch")));
    }
