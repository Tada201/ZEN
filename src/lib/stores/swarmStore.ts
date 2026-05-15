import { create } from 'zustand';

export type SwarmTopologyType = 
  | 'hierarchical'
  | 'mesh'
  | 'hierarchical_mesh'
  | 'star'
  | 'ring'
  | 'adaptive';

export type SwarmStateType = 
  | 'initializing'
  | 'active'
  | 'degraded'
  | 'idle'
  | 'shutting_down';

export type AgentStatusType = 'active' | 'busy' | 'idle' | 'terminated';

export interface SwarmAgent {
  id: string;
  name: string;
  status: AgentStatusType;
  role: 'leader' | 'worker' | 'peer';
  capabilities: string[];
  tasks_completed: number;
  tasks_failed: number;
  success_rate: number;
}

export interface WorkflowTask {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration_ms?: number;
  error?: string;
}

export interface WorkflowExecution {
  workflow_id: string;
  name: string;
  state: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'rolling_back';
  progress: number;
  completed_tasks: number;
  total_tasks: number;
  failed_tasks: number;
  tasks: WorkflowTask[];
}

export interface SwarmState {
  swarmState: SwarmStateType;
  topology: SwarmTopologyType;
  agents: SwarmAgent[];
  selectedAgentId: string | null;
  activeWorkflows: WorkflowExecution[];
  selectedWorkflowId: string | null;
  isSwarmPanelOpen: boolean;
  isWorkflowPanelOpen: boolean;
  isAgentMetricsPanelOpen: boolean;
  isTaskBoardPanelOpen: boolean;
  isSwarmActivityPanelOpen: boolean;

  setSwarmState: (state: SwarmStateType) => void;
  setTopology: (topology: SwarmTopologyType) => void;
  setAgents: (agents: SwarmAgent[] | ((prev: SwarmAgent[]) => SwarmAgent[])) => void;
  updateAgent: (agent: Partial<SwarmAgent> & { id: string }) => void;
  setSelectedAgent: (id: string | null) => void;
  setActiveWorkflows: (workflows: WorkflowExecution[] | ((prev: WorkflowExecution[]) => WorkflowExecution[])) => void;
  updateWorkflow: (workflow: Partial<WorkflowExecution> & { workflow_id: string }) => void;
  setSelectedWorkflowId: (id: string | null) => void;
  setSwarmPanelOpen: (open: boolean) => void;
  setWorkflowPanelOpen: (open: boolean) => void;
  setAgentMetricsPanelOpen: (open: boolean) => void;
  setTaskBoardPanelOpen: (open: boolean) => void;
  setSwarmActivityPanelOpen: (open: boolean) => void;
}

export const useSwarmStore = create<SwarmState>((set) => ({
  swarmState: 'idle',
  topology: 'hierarchical',
  agents: [],
  selectedAgentId: null,
  activeWorkflows: [],
  selectedWorkflowId: null,
  isSwarmPanelOpen: false,
  isWorkflowPanelOpen: false,
  isAgentMetricsPanelOpen: false,
  isTaskBoardPanelOpen: false,
  isSwarmActivityPanelOpen: false,

  setSwarmState: (swarmState) => set({ swarmState }),
  setTopology: (topology) => set({ topology }),
  setAgents: (agents) => set((state) => ({
    agents: typeof agents === 'function' ? agents(state.agents) : agents
  })),

  updateAgent: (agentUpdate) => set((state) => ({
    agents: state.agents.map(a => a.id === agentUpdate.id ? { ...a, ...agentUpdate } : a)
  })),

  setSelectedAgent: (selectedAgentId) => set({ selectedAgentId }),

  setActiveWorkflows: (activeWorkflows) => set((state) => ({
    activeWorkflows: typeof activeWorkflows === 'function' ? activeWorkflows(state.activeWorkflows) : activeWorkflows
  })),

  updateWorkflow: (workflowUpdate) => set((state) => ({
    activeWorkflows: state.activeWorkflows.map(w =>
      w.workflow_id === workflowUpdate.workflow_id ? { ...w, ...workflowUpdate } : w
    )
  })),

  setSelectedWorkflowId: (selectedWorkflowId) => set({ selectedWorkflowId }),
  setSwarmPanelOpen: (isSwarmPanelOpen) => set({ isSwarmPanelOpen }),
  setWorkflowPanelOpen: (isWorkflowPanelOpen) => set({ isWorkflowPanelOpen }),
  setAgentMetricsPanelOpen: (isAgentMetricsPanelOpen) => set({ isAgentMetricsPanelOpen }),
  setTaskBoardPanelOpen: (isTaskBoardPanelOpen) => set({ isTaskBoardPanelOpen }),
  setSwarmActivityPanelOpen: (isSwarmActivityPanelOpen) => set({ isSwarmActivityPanelOpen }),
}));
