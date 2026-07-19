import { callCommand } from "./tauriClient";

export type McpConfig = Record<string, unknown>;

export const mcpApi = {
  getConfig: () => callCommand<McpConfig>("mcp_get_config"),
  saveConfig: (config: McpConfig) => callCommand<void>("mcp_save_config", { config }),
};
