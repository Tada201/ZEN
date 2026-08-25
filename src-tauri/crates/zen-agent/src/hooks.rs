use crate::types::{ToolCall, ToolResult};
use serde_json::Value;
use std::sync::Arc;

#[derive(Debug)]
pub enum HookDecision {
    Allow,
    Deny { reason: String },
    Modify { new_args: Value },
}

pub trait ToolHook: Send + Sync {
    fn pre_tool_use(&self, call: &ToolCall) -> HookDecision;
    fn post_tool_use(&self, call: &ToolCall, result: &ToolResult) {
        let _ = (call, result);
    }
}

#[derive(Clone)]
pub struct HookRegistry {
    hooks: Vec<Arc<dyn ToolHook>>,
}

impl HookRegistry {
    pub fn new() -> Self {
        Self { hooks: vec![] }
    }
    pub fn with_defaults() -> Self {
        Self {
            hooks: vec![Arc::new(SecurityHook)],
        }
    }
    pub fn register(&mut self, hook: Arc<dyn ToolHook>) {
        self.hooks.push(hook);
    }
    pub fn pre_tool_use(&self, call: &ToolCall) -> HookDecision {
        for hook in &self.hooks {
            match hook.pre_tool_use(call) {
                HookDecision::Allow => continue,
                decision => return decision,
            }
        }
        HookDecision::Allow
    }
    pub fn post_tool_use(&self, call: &ToolCall, result: &ToolResult) {
        for hook in &self.hooks {
            hook.post_tool_use(call, result);
        }
    }
}

impl Default for HookRegistry {
    fn default() -> Self {
        Self::new()
    }
}

struct SecurityHook;

impl ToolHook for SecurityHook {
    fn pre_tool_use(&self, call: &ToolCall) -> HookDecision {
        if call.name == "run_command" || call.name == "execute_shell" {
            if let Some(cmd) = call.args.get("command").and_then(|v| v.as_str()) {
                let dangerous = [
                    "rm -rf /",
                    "rm -rf ~",
                    "rm -rf ",
                    "rm -r ",
                    "rm -f ",
                    "del /f /s /q",
                    "rmdir /s /q",
                    "format",
                    "mkfs.",
                    "dd if=/dev/zero",
                    "dd of=/dev/",
                    "> /dev/",
                    ":(){ :|:& };:",
                    "fork();",
                    "chmod -R 777 /",
                    "chmod 777",
                    "chown -R",
                    "chown root:",
                    "chmod +s",
                    "shutdown",
                    "reboot",
                    "init 0",
                    "init 6",
                    "systemctl poweroff",
                    "halt",
                    "curl | sh",
                    "wget | sh",
                    "nc -e",
                    "/dev/tcp/",
                    "sudo su",
                    "su -",
                    "sudo -i",
                    "chmod 000",
                ];
                for p in &dangerous {
                    if cmd.contains(p) {
                        return HookDecision::Deny {
                            reason: format!("Blocked: {p}"),
                        };
                    }
                }
                let lower = cmd.to_lowercase();
                if (lower.contains("rm -rf") || lower.contains("rmdir"))
                    && (lower.contains("/home") || lower.contains("$home") || lower.contains("~"))
                {
                    return HookDecision::Deny {
                        reason: "Blocked: recursive deletion of home".to_string(),
                    };
                }
            }
        }
        if call.name == "delete_file" || call.name == "write_file" || call.name == "edit_file" {
            if let Some(path) = call.args.get("path").and_then(|v| v.as_str()) {
                // Resolve tilde to home directory for Unix paths
                let home_dir = dirs::home_dir().map(|p| p.to_string_lossy().to_string());
                let mut protected_unix = vec![
                    "/etc/".to_string(),
                    "/usr/bin/".to_string(),
                    "/usr/sbin/".to_string(),
                    "/bin/".to_string(),
                    "/sbin/".to_string(),
                    "/lib/".to_string(),
                    "/boot/".to_string(),
                    "/sys/".to_string(),
                    "/proc/".to_string(),
                    "/dev/".to_string(),
                ];
                // Add resolved tilde paths
                if let Some(ref home) = home_dir {
                    protected_unix.push(format!("{home}/.ssh/"));
                    protected_unix.push(format!("{home}/.config/"));
                    protected_unix.push(format!("{home}/.gnupg/"));
                }

                // Windows: specific sensitive paths instead of broad C:/Users
                let user_profile = std::env::var("USERPROFILE").ok();
                let mut protected_win = vec![
                    "C:/Windows".to_string(),
                    "C:/Program Files".to_string(),
                    "C:/ProgramData".to_string(),
                    "C:/AppData".to_string(),
                ];
                // Add specific sensitive user paths
                if let Some(ref profile) = user_profile {
                    protected_win
                        .push(format!("{profile}/AppData/Roaming/Microsoft/Credentials"));
                    protected_win.push(format!(
                        "{profile}/AppData/Roaming/Microsoft/Windows/Network Shortcuts"
                    ));
                    protected_win.push(format!("{profile}/.ssh"));
                }

                let path_lower = path.to_lowercase();
                for p in &protected_unix {
                    if path_lower.starts_with(&p.to_lowercase()) {
                        return HookDecision::Deny {
                            reason: format!("Protected: {path}"),
                        };
                    }
                }
                for p in &protected_win {
                    if path_lower.starts_with(&p.to_lowercase()) {
                        return HookDecision::Deny {
                            reason: format!("Protected: {path}"),
                        };
                    }
                }
            }
        }
        HookDecision::Allow
    }
    fn post_tool_use(&self, call: &ToolCall, result: &ToolResult) {
        if result.is_error {
            tracing::debug!(tool = %call.name, "error");
        }
    }
}
