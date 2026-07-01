import { callCommand } from "./tauriClient";

export interface McpStatus {
  name: string;
  version: string;
  state: "running" | "stopped" | "starting" | "stopping";
  initialized: boolean;
  stdio_enabled: boolean;
  http_enabled: boolean;
  http_bind_host: string;
  http_port: number;
  http_auth_required?: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  parameters?: unknown;
  risk_level?: string;
  /** True if the non-interactive MCP path will honor this tool. */
  mcp_exposable?: boolean;
  /** Human-readable reason the tool is not callable over JSON-RPC. */
  unavailability_reason?: string;
}

export type McpConfig = Record<string, unknown>;

export const mcpApi = {
  getStatus: () => callCommand<McpStatus>("mcp_get_status"),
  listTools: () => callCommand<McpTool[]>("mcp_list_tools"),
  getConfig: () => callCommand<McpConfig>("mcp_get_config"),
  startServer: () => callCommand<void>("mcp_start_server"),
  stopServer: () => callCommand<void>("mcp_stop_server"),
  saveConfig: (config: McpConfig) => callCommand<void>("mcp_save_config", { config }),
};
