import { callCommand } from "./tauriClient";

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  tool_count: number;
  model_override?: string;
  max_iterations?: number;
}

export interface AgentConfig {
  agent_id: string;
  agent_name: string;
  model_name: string;
  context_window: number;
  max_messages_in_memory: number;
  max_iterations: number;
  enabled_tools: string[];
  system_prompt_override?: string;
}

export interface AgentConfigFileData {
  agent_id: string;
  model_name: string;
  max_iterations: number;
  context_window: number;
  max_messages_in_memory: number;
  enabled_tools: string[];
  system_prompt_override?: string;
  description?: string;
}

export interface AgentConfigFileInfo {
  agent_id: string;
  has_custom_config: boolean;
}

export interface ToolMetadataItem {
  id: string;
  name: string;
  description: string;
  risk_level: string;
}

export const agentsApi = {
  listAgents: () => callCommand<AgentInfo[]>("list_agents"),
  listAgentsWithConfigs: async (): Promise<AgentConfig[]> => {
    const agents = await callCommand<AgentInfo[]>("list_agents");
    return Promise.all(agents.map(async (agent) => {
      const config = await callCommand<AgentConfigFileData>("get_agent_config_file", {
        agentId: agent.id,
      });
      return {
        ...config,
        agent_name: agent.name,
      };
    }));
  },
  spawnAgent: (agentId: string, message: string, options: Record<string, unknown> = {}) =>
    callCommand<string>("spawn_agent", { agentId, message, options }),

  // Config file management
  getAgentConfigFile: (agentId: string) =>
    callCommand<AgentConfigFileData>("get_agent_config_file", { agentId }),

  saveAgentConfigFile: (agentId: string, config: AgentConfigFileData) =>
    callCommand<void>("save_agent_config_file", { agentId, config }),

  deleteAgentConfigFile: (agentId: string) =>
    callCommand<void>("delete_agent_config_file", { agentId }),

  listAgentConfigFiles: () =>
    callCommand<AgentConfigFileInfo[]>("list_agent_config_files"),

  exportAgentConfigFile: (agentId: string, exportPath: string) =>
    callCommand<void>("export_agent_config_file", { agentId, exportPath }),

  importAgentConfigFile: (importPath: string, targetAgentId?: string) =>
    callCommand<AgentConfigFileData>("import_agent_config_file", { importPath, targetAgentId }),

  listToolsForConfig: () =>
    callCommand<ToolMetadataItem[]>("list_tools_for_config"),
};
