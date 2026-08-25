use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Default)]
pub struct ToolAllowlist {
    pub agent_tool_ids: HashSet<String>,
    pub session_allowed: HashSet<String>,
    pub yolo: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AllowlistDecision {
    Allow,
    Deny { reason: String },
}

pub fn enforce_tool_allowlist(
    list: &ToolAllowlist,
    requested_tool: &str,
    caller: &str,
) -> AllowlistDecision {
    if list.yolo && !is_critical_floor(requested_tool) {
        return AllowlistDecision::Allow;
    }
    if list.agent_tool_ids.contains(requested_tool) || list.session_allowed.contains(requested_tool)
    {
        return AllowlistDecision::Allow;
    }
    AllowlistDecision::Deny {
        reason: format!(
            "Tool '{requested_tool}' is not in the {caller} allowlist"
        ),
    }
}

pub fn is_critical_floor(tool: &str) -> bool {
    matches!(tool, "run_command" | "terminal" | "format" | "delete_file")
}

pub fn new_shared_allowlist() -> Arc<RwLock<ToolAllowlist>> {
    Arc::new(RwLock::new(ToolAllowlist::default()))
}

pub fn from_agent_tool_ids(tool_ids: &[String]) -> ToolAllowlist {
    ToolAllowlist {
        agent_tool_ids: tool_ids.iter().cloned().collect(),
        session_allowed: HashSet::new(),
        yolo: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_tool_in_agent_allowlist() {
        let list = from_agent_tool_ids(&["web_search".to_string(), "read_file".to_string()]);
        match enforce_tool_allowlist(&list, "web_search", "agent") {
            AllowlistDecision::Allow => {}
            other => panic!("expected Allow, got {other:?}"),
        }
    }

    #[test]
    fn denies_tool_not_in_allowlist() {
        let list = from_agent_tool_ids(&["web_search".to_string()]);
        match enforce_tool_allowlist(&list, "run_command", "agent") {
            AllowlistDecision::Deny { reason } => {
                assert!(reason.contains("run_command"));
                assert!(reason.contains("agent"));
            }
            other => panic!("expected Deny, got {other:?}"),
        }
    }

    #[test]
    fn yolo_allows_non_critical_tools() {
        let list = ToolAllowlist {
            yolo: true,
            ..from_agent_tool_ids(&[])
        };
        match enforce_tool_allowlist(&list, "web_search", "agent") {
            AllowlistDecision::Allow => {}
            other => panic!("expected Allow under YOLO, got {other:?}"),
        }
    }

    #[test]
    fn yolo_does_not_override_critical_floor() {
        let list = ToolAllowlist {
            yolo: true,
            ..from_agent_tool_ids(&[])
        };
        match enforce_tool_allowlist(&list, "run_command", "agent") {
            AllowlistDecision::Deny { reason } => {
                assert!(reason.contains("run_command"));
            }
            other => panic!(
                "expected Deny for critical floor under YOLO, got {other:?}"
            ),
        }
    }

    #[test]
    fn session_grant_allows_tool_not_in_agent_list() {
        let mut list = from_agent_tool_ids(&["web_search".to_string()]);
        list.session_allowed.insert("write_file".to_string());
        match enforce_tool_allowlist(&list, "write_file", "session") {
            AllowlistDecision::Allow => {}
            other => panic!("expected Allow via session grant, got {other:?}"),
        }
    }
}
