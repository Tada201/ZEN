import { callCommand } from "./tauriClient";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type McpConfig = Record<string, unknown>;

export type McpTransport = "http" | "stdio";

export interface McpServerEntry {
  name: string;
  transport: McpTransport;
  /** Set for HTTP-transport entries. */
  url?: string;
  /** Set for stdio-transport entries. */
  command?: string;
  /** Set for stdio-transport entries. */
  args?: string[];
}

export type McpServerStatus = "reconnecting" | "connected" | "failed";

export interface McpServerStatusEvent {
  name: string;
  status: McpServerStatus;
  error?: string;
}

export const mcpApi = {
  getConfig: () => callCommand<McpConfig>("mcp_get_config"),
  saveConfig: (config: McpConfig) => callCommand<void>("mcp_save_config", { config }),
  listServers: () => callCommand<McpServerEntry[]>("mcp_list_servers"),
  addServer: (name: string, url: string) =>
    callCommand<void>("mcp_add_server", { name, url }),
  removeServer: (name: string) =>
    callCommand<boolean>("mcp_remove_server", { name }),
  reconnect: () => callCommand<void>("mcp_reconnect"),
  /**
   * Subscribe to per-row `mcp:server:status` events. The handler
   * receives one event per server row whenever a sync
   * (boot, add, remove, reconnect) progresses. Returns a Tauri
   * unlisten function — call it in a React effect cleanup to
   * detach the listener when the settings tab unmounts.
   */
  subscribeServerStatus: (
    onEvent: (event: McpServerStatusEvent) => void,
  ): Promise<UnlistenFn> =>
    listen<McpServerStatusEvent>("mcp:server:status", (e) => onEvent(e.payload)),
};
