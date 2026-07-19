import { callCommand } from "./tauriClient";

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  tool_count: number;
  model_override?: string;
  max_iterations?: number;
}

export const agentsApi = {
  listAgents: () => callCommand<AgentInfo[]>("list_agents"),
  spawnAgent: (agentId: string, message: string, options: Record<string, unknown> = {}) =>
    callCommand<string>("spawn_agent", { agentId, message, options }),
};
