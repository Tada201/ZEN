import { create } from 'zustand';

export interface AgentActivity {
    id: string;
    type: 'spawn' | 'handoff' | 'tool_call' | 'tool_result' | 'status' | 'error' | 'commentary';
    agentId: string;
    agentName: string;
    timestamp: number;
    duration?: number;
    status?: 'success' | 'error' | 'running' | 'completed';
    metadata?: Record<string, any>;
    message?: string;
    chatId?: string;
}

export interface ActiveAgentTask {
    id: string;
    agentId: string;
    agentName: string;
    task: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    startedAt: number;
    completedAt?: number;
    durationMs?: number;
    parentAgentId?: string;
    chatId: string;
    progress: number;
    result?: any;
    error?: string;
}

export interface OrchestratorPlan {
    chatId: string;
    mode: string;
    battlePlan: {
        agentsNeeded: string[];
        steps: string[];
        estimatedTokens: number;
        riskLevel: string;
    } | null;
}

export interface AgentActivityState {
    activities: AgentActivity[];
    maxActivities: number;
    addActivity: (activity: Omit<AgentActivity, 'id'> & { timestamp?: number }) => void;
    clearActivities: () => void;
    getActivitiesByTask: (chatId: string, agentId: string) => AgentActivity[];
    
    activeTasks: ActiveAgentTask[];
    selectedTaskId: string | null;
    addTask: (task: Omit<ActiveAgentTask, 'startedAt' | 'progress'> & { startedAt?: number }) => void;
    updateTask: (id: string, update: Partial<ActiveAgentTask>) => void;
    completeTask: (id: string, status: 'completed' | 'failed', result?: any, error?: string, completedAt?: number) => void;
    setSelectedTaskId: (id: string | null) => void;
    clearTasks: () => void;
    removeTask: (id: string) => void;
    cancelTask: (id: string) => Promise<void>;

    pendingPlan: OrchestratorPlan | null;
    setPendingPlan: (plan: OrchestratorPlan | null) => void;
}

export const useAgentActivityStore = create<AgentActivityState>()(
    (set, get) => ({
        activities: [],
        maxActivities: 200,

        addActivity: (activity) => {
            const newActivity: AgentActivity = {
                ...activity,
                id: `${activity.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: activity.timestamp || Date.now(),
            };

            set((state) => {
                const updated = [...state.activities, newActivity];
                if (updated.length > state.maxActivities) {
                    return { activities: updated.slice(updated.length - state.maxActivities) };
                }
                return { activities: updated };
            });
        },

        clearActivities: () => set({ activities: [] }),

        getActivitiesByTask: (chatId, agentId) => {
            return get().activities.filter(a => a.chatId === chatId && (a.agentId === agentId || a.agentName === agentId));
        },

        activeTasks: [],
        selectedTaskId: null,

        addTask: (task) => {
            set((state) => ({
                activeTasks: [
                    { ...task, startedAt: task.startedAt || Date.now(), progress: 0 },
                    ...state.activeTasks
                ].slice(0, 50)
            }));
        },

        updateTask: (id, update) => {
            set((state) => ({
                activeTasks: state.activeTasks.map(t => t.id === id ? { ...t, ...update } : t)
            }));
        },

        completeTask: (id, status, result, error, completedAt) => {
            const now = completedAt || Date.now();
            set((state) => ({
                activeTasks: state.activeTasks.map(t => {
                    if (t.id === id) {
                        return { 
                            ...t, 
                            status, 
                            result, 
                            error, 
                            progress: 100, 
                            completedAt: now,
                            durationMs: t.startedAt ? now - t.startedAt : undefined
                        };
                    }
                    return t;
                })
            }));
        },

        setSelectedTaskId: (id) => set({ selectedTaskId: id }),

        clearTasks: () => set({ activeTasks: [], selectedTaskId: null }),
        
        removeTask: (id) => set((state) => ({
            activeTasks: state.activeTasks.filter(t => t.id !== id),
            selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId
        })),
        
        cancelTask: async (id) => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('cancel_subagent', { spawnId: id });
            } catch (err) {
                console.error('Failed to cancel subagent:', err);
            }
        },

        pendingPlan: null,
        setPendingPlan: (plan) => set({ pendingPlan: plan }),
    })
);
