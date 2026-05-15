import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';

// ─── Types ───

export interface Task {
  id: string;
  description: string;
  assignedTo: string; // "ZEN", "ZEN-TAC", "ZEN-DOCS", "ZEN-COSMOS"
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progress: number; // 0-100
  error?: string;
  chatId: string;
  createdAt: number;
  updatedAt: number;
}

export interface TaskState {
  // State
  tasks: Map<string, Task>;
  activeChatId: string | null;
  isVisible: boolean;

  // Actions
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  removeTask: (taskId: string) => void;
  clearTasksForChat: (chatId: string) => void;
  setActiveChatId: (chatId: string | null) => void;
  toggleVisibility: () => void;
  setVisibility: (visible: boolean) => void;

  // Selectors
  getTasksByStatus: (status: Task['status']) => Task[];
  getTasksForChat: (chatId: string) => Task[];
  getPendingTasks: () => Task[];
  getInProgressTasks: () => Task[];
  getCompletedTasks: () => Task[];
  getFailedTasks: () => Task[];
  getTotalProgress: () => number;
}

// ─── Store ───

export const useTaskStore = create<TaskState>((set, get) => {
  // Initialize event listeners
  if (typeof window !== 'undefined') {
    // Listen for task creation
    listen('task:created', (event: any) => {
      const task = event.payload as Task;
      task.createdAt = Date.now();
      task.updatedAt = Date.now();
      get().addTask(task);
    });

    // Listen for task updates
    listen('task:updated', (event: any) => {
      const { taskId, updates } = event.payload;
      get().updateTask(taskId, updates);
    });

    // Listen for task completion
    listen('task:completed', (event: any) => {
      const { taskId, result } = event.payload;
      get().updateTask(taskId, {
        status: result?.is_error ? 'failed' : 'completed',
        progress: 100,
        error: result?.is_error ? result.content : undefined,
        updatedAt: Date.now(),
      });
    });

    // Listen for orchestrator start - show task board
    listen('orchestrator:start', () => {
      get().setVisibility(true);
    });

    // Listen for complexity analysis
    listen('task:complexity_analyzed', (event: any) => {
      const { chat_id, tier, battle_plan } = event.payload;

      // For Tier 3 tasks, create initial planning tasks
      if (tier === 'Tier3' && battle_plan) {
        const steps = battle_plan.steps || [];
        steps.forEach((step: string, index: number) => {
          const task: Task = {
            id: `${chat_id}_step_${index}`,
            description: step,
            assignedTo: battle_plan.agents_needed?.[0] || 'ZEN',
            status: index === 0 ? 'in-progress' : 'pending',
            progress: index === 0 ? 10 : 0,
            chatId: chat_id,
            createdAt: Date.now() + index,
            updatedAt: Date.now(),
          };
          get().addTask(task);
        });
      }
    });
  }

  return {
    // Initial state
    tasks: new Map(),
    activeChatId: null,
    isVisible: false,

    // Actions
    addTask: (task: Task) => {
      set((state) => {
        const newTasks = new Map(state.tasks);
        newTasks.set(task.id, task);
        return { tasks: newTasks };
      });
    },

    updateTask: (taskId: string, updates: Partial<Task>) => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        const updatedTask = {
          ...task,
          ...updates,
          updatedAt: Date.now(),
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);
        return { tasks: newTasks };
      });
    },

    removeTask: (taskId: string) => {
      set((state) => {
        const newTasks = new Map(state.tasks);
        newTasks.delete(taskId);
        return { tasks: newTasks };
      });
    },

    clearTasksForChat: (chatId: string) => {
      set((state) => {
        const newTasks = new Map(state.tasks);
        for (const [id, task] of newTasks.entries()) {
          if (task.chatId === chatId) {
            newTasks.delete(id);
          }
        }
        return { tasks: newTasks };
      });
    },

    setActiveChatId: (chatId: string | null) => {
      set({ activeChatId: chatId });
    },

    toggleVisibility: () => {
      set((state) => ({ isVisible: !state.isVisible }));
    },

    setVisibility: (visible: boolean) => {
      set({ isVisible: visible });
    },

    // Selectors
    getTasksByStatus: (status: Task['status']) => {
      return Array.from(get().tasks.values()).filter(
        (task) => task.status === status
      );
    },

    getTasksForChat: (chatId: string) => {
      return Array.from(get().tasks.values()).filter(
        (task) => task.chatId === chatId
      );
    },

    getPendingTasks: () => {
      return get().getTasksByStatus('pending');
    },

    getInProgressTasks: () => {
      return get().getTasksByStatus('in-progress');
    },

    getCompletedTasks: () => {
      return get().getTasksByStatus('completed');
    },

    getFailedTasks: () => {
      return get().getTasksByStatus('failed');
    },

    getTotalProgress: () => {
      const tasks = Array.from(get().tasks.values());
      if (tasks.length === 0) return 0;

      const total = tasks.reduce((sum, task) => sum + task.progress, 0);
      return Math.round(total / tasks.length);
    },
  };
});