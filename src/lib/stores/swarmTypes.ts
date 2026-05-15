// Swarm & Workflow Store Types

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