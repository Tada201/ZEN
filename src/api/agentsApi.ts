import { callCommand } from "./tauriClient";

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tool_ids: string[];
  tool_count: number;
  model_override?: string | null;
  model_provider?: string | null;
  max_iterations?: number | null;
  context_window?: number | null;
  max_messages_in_memory?: number | null;
  model_tier: string;
  color?: string | null;
  user_invocable: boolean;
  model_invocable: boolean;
  allow_nested_delegation: boolean;
  allowed_agent_ids: string[];
  inject_agents_md: boolean;
  is_builtin: boolean;
  user_editable: boolean;
  config_mode: "full" | "model_only" | "read_only";
  reasoning_effort?: string | null;
}

export interface AgentProfileDraft {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tool_ids: string[];
  model_override?: string | null;
  model_provider?: string | null;
  max_iterations?: number | null;
  context_window?: number | null;
  max_messages_in_memory?: number | null;
  color?: string | null;
  user_invocable: boolean;
  model_invocable: boolean;
  allow_nested_delegation: boolean;
  allowed_agent_ids: string[];
  inject_agents_md: boolean;
}

export const agentsApi = {
  listAgents: () => callCommand<AgentInfo[]>("list_agents"),
  createAgent: (profile: AgentProfileDraft) =>
    callCommand<AgentInfo>("create_agent", { profile }),
  updateAgent: (profile: AgentProfileDraft) =>
    callCommand<AgentInfo>("update_agent", { profile }),
  deleteAgent: (agentId: string) =>
    callCommand<boolean>("delete_agent", { agentId }),
  setVoiceDisplayModel: (model: string | null) =>
    callCommand<void>("set_voice_display_model", { model }),
  setAgentModel: (agentId: string, model: string | null) =>
    callCommand<void>("set_agent_model", { agentId, model }),
  setAgentReasoning: (agentId: string, effort: string | null) =>
    callCommand<void>("set_agent_reasoning", { agentId, effort }),
};
