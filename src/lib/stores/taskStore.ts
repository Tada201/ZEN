import { create } from 'zustand';
import { listenAppEvent, type TaskEventPayload } from '@/api/events';
import { normalizeTaskDisplayStatus, normalizeTaskText } from '@/lib/tasks/taskStatus';

// ─── Types ───

export interface Task {
  id: string;
  description: string;
  assignedTo: string; // Agent display name, e.g. "ZEN" or "Explore"
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

function normalizeTask(payload: TaskEventPayload): Task {
  const normalizedStatus = normalizeTaskDisplayStatus(payload.status);
  return {
    id: normalizeTaskText(payload.id || payload.taskId || payload.task_id),
    description: normalizeTaskText(payload.description),
    assignedTo: normalizeTaskText(payload.assignedTo || payload.assigned_to, 'ZEN'),
    // Keep the store's legacy vocabulary for existing consumers while mapping
    // malformed/unknown backend values to a safe pending state.
    status: normalizedStatus === 'running'
      ? 'in-progress'
      : normalizedStatus === 'completed'
        ? 'completed'
        : normalizedStatus === 'error'
          ? 'failed'
          : 'pending',
    progress: typeof payload.progress === 'number' && Number.isFinite(payload.progress)
      ? Math.max(0, Math.min(100, payload.progress))
      : 0,
    error: normalizeTaskText(payload.error) || undefined,
    chatId: normalizeTaskText(payload.chatId || payload.chat_id),
    createdAt: typeof (payload.createdAt || payload.created_at) === 'number'
      ? Number(payload.createdAt || payload.created_at)
      : Date.now(),
    updatedAt: typeof (payload.updatedAt || payload.updated_at) === 'number'
      ? Number(payload.updatedAt || payload.updated_at)
      : Date.now(),
  };
}

// ─── Store ───

export const useTaskStore = create<TaskState>((set, get) => {
  // Initialize event listeners
  if (typeof window !== 'undefined') {
    // Listen for task creation
    listenAppEvent('task:created', (event) => {
      const task = normalizeTask(event.payload);
      if (!task.id) return;
      get().addTask(task);
    });

    // Listen for task updates
    listenAppEvent('task:updated', (event) => {
      const { taskId, updates } = event.payload;
      const id = taskId || event.payload.task_id || event.payload.id;
      if (!id) return;
      get().updateTask(id, updates as Partial<Task>);
    });

    listenAppEvent('task:list_updated', (event) => {
      const { chat_id, tasks } = event.payload;
      if (!chat_id || !Array.isArray(tasks)) return;
      // The checklist tracks the latest write_todos list: a non-empty payload
      // replaces the chat's previous checklist; an empty payload is the
      // backend's explicit clear (write_todos with {"todos": []}) and removes
      // it so the panel disappears. Checklists are never restored on reload,
      // so clearing matches reload behavior.
      if (tasks.length === 0) {
        set((state) => {
          let removed = false;
          const newTasks = new Map(state.tasks);
          for (const [id, task] of newTasks.entries()) {
            if (task.chatId === chat_id && id.includes('_todo_')) {
              newTasks.delete(id);
              removed = true;
            }
          }
          return removed ? { tasks: newTasks } : state;
        });
        return;
      }

      set((state) => {
        const newTasks = new Map(state.tasks);
        for (const [id, task] of newTasks.entries()) {
          if (task.chatId === chat_id && id.includes('_todo_')) {
            newTasks.delete(id);
          }
        }
        for (const task of tasks) {
          const normalizedTask = normalizeTask(task);
          if (!normalizedTask.id) continue;
          newTasks.set(normalizedTask.id, {
            ...normalizedTask,
            createdAt: normalizedTask.createdAt || Date.now(),
            updatedAt: Date.now(),
          });
        }
        // Don't overwrite activeChatId here — useChatQueries owns the sync
        // via setActiveChatId on session switch.
        return { tasks: newTasks, isVisible: true };
      });
    });

    // Listen for orchestrator start - show task board
    listenAppEvent('orchestrator:start', () => {
      get().setVisibility(true);
    });

    // Listen for complexity analysis
    listenAppEvent('task:complexity_analyzed', (event) => {
      const { chat_id, tier, battle_plan } = event.payload;

      // For Tier 3 tasks, create initial planning tasks
      if (tier === 'Tier3' && chat_id && battle_plan) {
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

    // Selectors — scoped to activeChatId when set, otherwise return all tasks.
    getTasksByStatus: (status: Task['status']) => {
      const { activeChatId, tasks } = get();
      return Array.from(tasks.values()).filter(
        (task) => task.status === status && (!activeChatId || task.chatId === activeChatId)
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
      const { activeChatId, tasks } = get();
      const scoped = activeChatId
        ? Array.from(tasks.values()).filter((t) => t.chatId === activeChatId)
        : Array.from(tasks.values());
      if (scoped.length === 0) return 0;

      const total = scoped.reduce((sum, task) => sum + task.progress, 0);
      return Math.round(total / scoped.length);
    },
  };
});
