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

export const agentsApi = {
  listAgents: () => callCommand<AgentInfo[]>("list_agents"),
  listAgentsWithConfigs: () =>
    callCommand<AgentConfig[]>("list_agents_with_configs"),
  spawnAgent: (agentId: string, message: string, options: Record<string, unknown> = {}) =>
    callCommand<string>("spawn_agent", { agentId, message, options }),
};
