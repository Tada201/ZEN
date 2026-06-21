#[derive(Clone, Copy)]
pub(crate) struct ToolStatusInfo {
    pub(crate) status: &'static str,
    pub(crate) detail: &'static str,
    pub(crate) agent_visible: bool,
    pub(crate) user_configurable: bool,
}

pub(crate) fn tool_status(id: &str) -> ToolStatusInfo {
    match id {
        "draw" => ToolStatusInfo {
            status: "frontend_missing",
            detail: "Executor exists, but the drawing:ops frontend listener is not wired.",
            agent_visible: false,
            user_configurable: false,
        },
        "activate_2d_operational_map" => ToolStatusInfo {
            status: "frontend_missing",
            detail: "Executor exists, but the map:activate-operational listener is not wired.",
            agent_visible: false,
            user_configurable: false,
        },
        "activate_3d_globe" => ToolStatusInfo {
            status: "frontend_missing",
            detail: "Executor exists, but the globe:navigate listener is not wired.",
            agent_visible: false,
            user_configurable: false,
        },
        "calculate_route" => ToolStatusInfo {
            status: "partial",
            detail:
                "Route data works, but route visualization is not currently wired to the frontend.",
            agent_visible: true,
            user_configurable: true,
        },
        "create_geofence" => ToolStatusInfo {
            status: "frontend_missing",
            detail: "Executor exists, but the map:geofence-created listener is not wired.",
            agent_visible: false,
            user_configurable: false,
        },
        "vector_search" => ToolStatusInfo {
            status: "requires_config",
            detail: "Requires indexed documents and a working embedding provider.",
            agent_visible: true,
            user_configurable: true,
        },
        "get_weather"
        | "get_earthquakes"
        | "get_military_aircraft"
        | "geocode_search"
        | "reverse_geocode"
        | "web_search"
        | "web_fetch" => ToolStatusInfo {
            status: "external",
            detail: "Requires network access or an external provider/service.",
            agent_visible: true,
            user_configurable: true,
        },
        "tool_list" | "tool_info" | "tool_exec" | "tools_search" | "guidance" | "list_tools" => {
            ToolStatusInfo {
                status: "internal",
                detail: "Internal discovery/execution protocol tool.",
                agent_visible: false,
                user_configurable: false,
            }
        }
        _ => ToolStatusInfo {
            status: "ready",
            detail: "Registered with an executable backend implementation.",
            agent_visible: true,
            user_configurable: true,
        },
    }
}

pub(crate) fn tool_aliases(id: &str) -> &'static [&'static str] {
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
        "vector_search" => &["rag", "semantic", "knowledge base", "documents"],
        "list_documents" => &["files", "library", "documents", "uploads"],
        "read_document_content" => &["read file", "open file", "content viewer"],
        "grep_documents" => &["grep", "find text", "search files", "ripgrep"],
        "write_file" => &["create file", "save file"],
        "edit_file" => &["modify file", "patch file", "replace text"],
        "manage_board" => &[
            "voice board",
            "blackboard",
            "display",
            "visualize",
            "widget",
        ],
        "spawn_agent" => &["delegate", "subagent", "background agent", "task agent"],
        "handoff_to_agent" => &["switch agent", "transfer agent"],
        "write_todos" => &["todo", "plan", "task list", "checklist"],
        "graph_session" => &["math", "plot", "equation", "graph"],
        "get_system_metrics" => &["hardware", "cpu", "ram", "gpu", "system"],
        "calculate_route" => &["directions", "routing", "map route"],
        "geocode_search" => &["location", "coordinates", "address"],
        "reverse_geocode" => &["coordinates", "address", "location"],
        "get_weather" => &["forecast", "weather"],
        "get_earthquakes" => &["seismic", "earthquake", "quake"],
        "get_military_aircraft" => &["aircraft", "adsb", "radar", "planes"],
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
        _ => &[],
    }
}
