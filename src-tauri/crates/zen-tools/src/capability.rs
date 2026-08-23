//! Static capability/status metadata for the tool catalog (moved verbatim
//! from src/tools/capability.rs, Phase 5). Pure data: no tauri, no state.

#[derive(Clone, Copy)]
pub struct ToolStatusInfo {
    pub status: &'static str,
    pub detail: &'static str,
    pub agent_visible: bool,
    pub user_configurable: bool,
}

pub fn tool_status(id: &str) -> ToolStatusInfo {
    match id {
        "draw" => ToolStatusInfo {
            status: "partial",
            detail: "Canvas drawing is retained, but its agent-to-canvas event bridge remains partial.",
            agent_visible: true,
            user_configurable: true,
        },
        // Legacy map adapters remain in source only as future-feature code.
        // They are intentionally unavailable to agents until one unified world
        // map tool and its frontend event contract are ready.
        "activate_2d_operational_map" | "activate_3d_globe" => ToolStatusInfo {
            status: "disabled_future",
            detail: "Disabled until the 2D and 3D map tools are replaced by one unified world-map tool.",
            agent_visible: false,
            user_configurable: false,
        },
        // Retired adapters remain classified here so settings/audit callers
        // can explain why an old id is unavailable without re-exposing it.
        "vector_search"
        | "guidance"
        | "write_to_memory"
        | "search_session_memory"
        | "get_memory_stats" => ToolStatusInfo {
            status: "disabled_future",
            detail: "Retired from the agent tool surface; revisit after the deterministic document and session-memory redesign.",
            agent_visible: false,
            user_configurable: false,
        },
        "calculate_route"
        | "geocode_search"
        | "reverse_geocode"
        | "get_earthquakes"
        | "get_military_aircraft" => ToolStatusInfo {
            status: "disabled_future",
            detail: "Retired until the separate map and OSINT adapters are replaced by one unified world-map tool.",
            agent_visible: false,
            user_configurable: false,
        },
        "web_search" | "web_fetch" => ToolStatusInfo {
            status: "external",
            detail: "Requires network access or an external provider/service.",
            agent_visible: true,
            user_configurable: true,
        },
        "tool_list" | "tool_info" | "tool_exec" | "tools_search" | "list_tools" => {
            ToolStatusInfo {
                status: "internal",
                detail: "Internal discovery/execution protocol tool.",
                agent_visible: false,
                user_configurable: false,
            }
        }
        "generate_image" => ToolStatusInfo {
            status: "external",
            detail: "Generates images via 9Router. Requires a configured 9Router endpoint and image model.",
            agent_visible: true,
            user_configurable: true,
        },
        "browser" => ToolStatusInfo {
            status: "external",
            detail: "Drives the embedded WebView2 preview (navigate/click/type/read/screenshot/console). Windows only.",
            agent_visible: true,
            user_configurable: true,
        },
        _ => ToolStatusInfo {
            status: "ready",
            detail: "Registered with an executable backend implementation.",
            agent_visible: true,
            user_configurable: true,
        },
    }
}

pub fn tool_aliases(id: &str) -> &'static [&'static str] {
    match id {
        "run_command" => &[
            "terminal",
            "shell",
            "bash",
            "powershell",
            "command",
            "script",
        ],
        "web_search" => &[
            "internet", "news", "current", "latest", "lookup", "tavily", "exa",
        ],
        "web_fetch" => &["url", "page", "website", "open link", "fetch"],
        "list_documents" => &["library", "uploads", "uploaded files", "ingested documents"],
        "list_directory" => &["files", "directory", "folder", "ls", "dir", "tree", "browse files"],
        "read_document_content" => &["read file", "open file", "content viewer"],
        "grep_documents" => &["search uploads", "search ingested documents", "knowledge base search"],
        "search_files" => &["grep", "find text", "search files", "ripgrep", "code search", "content search", "regex search"],
        "write_file" => &["create file", "save file"],
        "edit_file" => &["modify file", "patch file", "replace text"],
        "apply_patch" => &["modify file", "patch file", "replace text", "edit files"],
        "manage_board" => &[
            "voice board",
            "blackboard",
            "display",
            "visualize",
            "widget",
        ],
        "spawn_agent" => &["delegate", "subagent", "background agent", "task agent"],
        "write_todos" => &["todo", "plan", "task list", "checklist"],
        "graph_session" => &["math", "plot", "equation", "graph"],
        "browser" => &["preview", "web page", "webview", "dev server", "click", "screenshot", "dom"],
        "get_system_metrics" => &["hardware", "cpu", "ram", "gpu", "system"],
        "calculator" => &[
            "math",
            "calc",
            "compute",
            "arithmetic",
            "statistics",
            "stats",
            "mean",
            "median",
            "standard deviation",
            "percentage",
        ],
        "generate_image" => &[
            "draw",
            "paint",
            "create image",
            "image generation",
            "illustration",
            "artwork",
            "picture",
            "render image",
            "sketch",
            "dalle",
            "flux",
        ],
        _ => &[],
    }
}
