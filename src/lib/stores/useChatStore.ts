import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ArtifactData, Message } from '../../atlas/components/chat/types';
import { useUIStore } from './useUIStore';

const EMPTY_ARRAY: Message[] = [];

// LRU eviction for sessionMessages to prevent unbounded memory growth.
// Tracks access order; evicts the oldest entry when the cap is exceeded.
const LRU_SESSION_CAP = 10;
const sessionAccessOrder: string[] = [];

// Session-scoped persistence for `activeAssistantByChat`. The Zustand `persist`
// middleware strips this field during merge (see `merge` below), so we keep a
// parallel sessionStorage snapshot so a page refresh mid-stream can still
// route incoming `chat:*` events to the right optimistic assistant id.
const ACTIVE_ASSISTANTS_STORAGE_KEY = "zen-active-assistants";

function readActiveAssistantsFromSession(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_ASSISTANTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [chatId, assistantId] of Object.entries(parsed)) {
      if (typeof chatId === "string" && typeof assistantId === "string" && assistantId.length > 0) {
        result[chatId] = assistantId;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeActiveAssistantsToSession(map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ACTIVE_ASSISTANTS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable (quota, private mode, SSR) — degrade silently; the
    // in-memory map remains the source of truth for the current session.
  }
}

function touchSessionLru(chatId: string) {
  const idx = sessionAccessOrder.indexOf(chatId);
  if (idx !== -1) sessionAccessOrder.splice(idx, 1);
  sessionAccessOrder.push(chatId);
}

function evictStaleSessions(sessionMessages: Record<string, Message[]>): Record<string, Message[]> {
  if (sessionAccessOrder.length <= LRU_SESSION_CAP) return sessionMessages;
  let next = sessionMessages;
  while (sessionAccessOrder.length > LRU_SESSION_CAP) {
    const evictId = sessionAccessOrder.shift()!;
    if (next[evictId]) {
      next = { ...next };
      delete next[evictId];
    }
  }
  return next;
}

interface ChatState {
  activeSessionId: string | null;

  // Search UI state only. Search results are server state owned by React Query.
  isSearchOpen: boolean;
  searchQuery: string;

  // Artifacts
  artifacts: ArtifactData[];
  activeArtifactId: string | null;
  globalArtifacts: ArtifactData[];

  // Per-session streaming state and live message buffers.
  streamingChats: Record<string, boolean>;
  sessionMessages: Record<string, Message[]>;
  /** Optimistic assistant id currently receiving stream events for each chat. */
  activeAssistantByChat: Record<string, string>;

  // Derived getters kept for active-chat compatibility.
  isStreaming: boolean;
  messages: Message[];

  setStreamingForChat: (chatId: string, streaming: boolean) => void;
  setActiveAssistantForChat: (chatId: string, assistantId: string | null) => void;
  getActiveAssistantForChat: (chatId: string) => string | null;
  getSessionMessages: (chatId: string) => Message[];
  setSessionMessages: (chatId: string, messages: Message[] | ((prev: Message[]) => Message[])) => void;
  clearSessionMessages: (chatId: string) => void;
  clearSessionRuntime: (chatId: string) => void;

  // Backward-compatible setters that delegate to the active session.
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setIsStreaming: (isStreaming: boolean) => void;

  setActiveSession: (id: string | null) => void;
  startNewChat: () => void;
  isNewChatDraft: boolean;

  toggleSearch: () => void;
  setSearchQuery: (query: string) => void;

  setArtifacts: (artifacts: ArtifactData[]) => void;
  setActiveArtifact: (id: string | null) => void;
  addArtifact: (artifact: ArtifactData) => void;
  removeArtifact: (id: string) => void;
  updateArtifact: (id: string, data: Partial<ArtifactData>) => void;
  setGlobalArtifacts: (artifacts: ArtifactData[]) => void;
  loadAllArtifacts: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      activeSessionId: null,
      isNewChatDraft: false,

      isSearchOpen: false,
      searchQuery: '',

      artifacts: [],
      activeArtifactId: null,
      globalArtifacts: [],

      streamingChats: {},
      sessionMessages: {},
      activeAssistantByChat: readActiveAssistantsFromSession(),

      get isStreaming() {
        const state = get();
        return state.streamingChats[state.activeSessionId ?? ''] ?? false;
      },

      get messages() {
        const state = get();
        return state.sessionMessages[state.activeSessionId ?? ''] ?? EMPTY_ARRAY;
      },

      setStreamingForChat: (chatId, streaming) => set((state) => {
        if (state.streamingChats[chatId] === streaming) return state;
        if (streaming) {
          useUIStore.getState().setAgentsPanelDismissed(false);
        }
        const nextStreamingChats = { ...state.streamingChats, [chatId]: streaming };
        const nextActiveAssistantByChat = { ...state.activeAssistantByChat };
        if (!streaming) {
          delete nextActiveAssistantByChat[chatId];
        }
        writeActiveAssistantsToSession(nextActiveAssistantByChat);
        return {
          streamingChats: nextStreamingChats,
          activeAssistantByChat: nextActiveAssistantByChat,
        };
      }),

      setActiveAssistantForChat: (chatId, assistantId) => set((state) => {
        const nextActiveAssistantByChat = { ...state.activeAssistantByChat };
        if (assistantId) {
          nextActiveAssistantByChat[chatId] = assistantId;
        } else {
          delete nextActiveAssistantByChat[chatId];
        }
        writeActiveAssistantsToSession(nextActiveAssistantByChat);
        return { activeAssistantByChat: nextActiveAssistantByChat };
      }),

      getActiveAssistantForChat: (chatId) => get().activeAssistantByChat[chatId] ?? null,

      getSessionMessages: (chatId) => get().sessionMessages[chatId] ?? EMPTY_ARRAY,

      setSessionMessages: (chatId, messages) => set((state) => {
        touchSessionLru(chatId);
        const next = {
          ...state.sessionMessages,
          [chatId]: typeof messages === 'function'
            ? messages(state.sessionMessages[chatId] ?? EMPTY_ARRAY)
            : messages,
        };
        return { sessionMessages: evictStaleSessions(next) };
      }),

      clearSessionMessages: (chatId) => set((state) => {
        const lruIdx = sessionAccessOrder.indexOf(chatId);
        if (lruIdx !== -1) sessionAccessOrder.splice(lruIdx, 1);
        const sessionMessages = { ...state.sessionMessages };
        delete sessionMessages[chatId];
        return { sessionMessages };
      }),

      clearSessionRuntime: (chatId) => set((state) => {
        const lruIdx = sessionAccessOrder.indexOf(chatId);
        if (lruIdx !== -1) sessionAccessOrder.splice(lruIdx, 1);
        const sessionMessages = { ...state.sessionMessages };
        const streamingChats = { ...state.streamingChats };
        const activeAssistantByChat = { ...state.activeAssistantByChat };
        delete sessionMessages[chatId];
        delete streamingChats[chatId];
        delete activeAssistantByChat[chatId];
        writeActiveAssistantsToSession(activeAssistantByChat);
        return {
          sessionMessages,
          streamingChats,
          activeAssistantByChat,
          activeSessionId: state.activeSessionId === chatId ? null : state.activeSessionId,
        };
      }),

      setMessages: (messages) => {
        const { activeSessionId } = get();
        if (!activeSessionId) return;
        touchSessionLru(activeSessionId);
        set((state) => ({
          sessionMessages: evictStaleSessions({
            ...state.sessionMessages,
            [activeSessionId]: typeof messages === 'function'
              ? messages(state.sessionMessages[activeSessionId] ?? EMPTY_ARRAY)
              : messages,
          }),
        }));
      },

      setIsStreaming: (isStreaming) => {
        const { activeSessionId } = get();
        if (!activeSessionId) return;
        set((state) => {
          if (state.streamingChats[activeSessionId] === isStreaming) return state;
          if (isStreaming) {
            useUIStore.getState().setAgentsPanelDismissed(false);
          }
          return {
            streamingChats: { ...state.streamingChats, [activeSessionId]: isStreaming },
          };
        });
      },

      setActiveSession: (activeSessionId) => set({ activeSessionId, isNewChatDraft: false }),

      startNewChat: () => set({ activeSessionId: null, isNewChatDraft: true }),

      toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
      setSearchQuery: (searchQuery) => set({ searchQuery }),

      setArtifacts: (artifacts) => set({ artifacts }),
      setActiveArtifact: (activeArtifactId) => set({ activeArtifactId }),

      addArtifact: (artifact) => set((state) => ({
        artifacts: [artifact, ...state.artifacts.filter((a) => a.id !== artifact.id)],
      })),

      removeArtifact: (id) => set((state) => ({
        artifacts: state.artifacts.filter((a) => a.id !== id),
        activeArtifactId: state.activeArtifactId === id ? null : state.activeArtifactId,
      })),

      updateArtifact: (id, data) => set((state) => ({
        artifacts: state.artifacts.map((a) => (
          a.id === id ? { ...a, ...data, updatedAt: Date.now() } : a
        )),
      })),

      setGlobalArtifacts: (globalArtifacts) => set({ globalArtifacts }),
      loadAllArtifacts: () => set({ globalArtifacts: get().artifacts }),
    }),
    {
      name: 'zen-chat-storage',
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<ChatState>) || {};
        const durableState = { ...persisted } as Partial<ChatState> & {
          isStreaming?: unknown;
          messages?: unknown;
          sessions?: unknown;
          archivedSessions?: unknown;
          folders?: unknown;
          searchResults?: unknown;
        };

        delete durableState.streamingChats;
        delete durableState.sessionMessages;
        delete durableState.activeAssistantByChat;
        delete durableState.sessions;
        delete durableState.archivedSessions;
        delete durableState.folders;
        delete durableState.searchResults;
        delete durableState.isStreaming;
        delete durableState.messages;

        return {
          ...currentState,
          ...durableState,
          streamingChats: {},
          sessionMessages: {},
          activeAssistantByChat: {},
        } as ChatState;
      },
      partialize: (state) => ({
        activeSessionId: state.activeSessionId,
        isSearchOpen: state.isSearchOpen,
        searchQuery: state.searchQuery,
        artifacts: state.artifacts,
        activeArtifactId: state.activeArtifactId,
        globalArtifacts: state.globalArtifacts,
      }),
    }
  )
);
