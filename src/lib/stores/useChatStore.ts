import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ArtifactData, Message } from '../../atlas/components/chat/types';
import { useUIStore } from './useUIStore';

const EMPTY_ARRAY: Message[] = [];

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

  // Derived getters kept for active-chat compatibility.
  isStreaming: boolean;
  messages: Message[];

  setStreamingForChat: (chatId: string, streaming: boolean) => void;
  getSessionMessages: (chatId: string) => Message[];
  setSessionMessages: (chatId: string, messages: Message[] | ((prev: Message[]) => Message[])) => void;
  clearSessionMessages: (chatId: string) => void;
  clearSessionRuntime: (chatId: string) => void;

  // Backward-compatible setters that delegate to the active session.
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setIsStreaming: (isStreaming: boolean) => void;

  setActiveSession: (id: string | null) => void;

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

      isSearchOpen: false,
      searchQuery: '',

      artifacts: [],
      activeArtifactId: null,
      globalArtifacts: [],

      streamingChats: {},
      sessionMessages: {},

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
        return {
          streamingChats: { ...state.streamingChats, [chatId]: streaming },
        };
      }),

      getSessionMessages: (chatId) => get().sessionMessages[chatId] ?? EMPTY_ARRAY,

      setSessionMessages: (chatId, messages) => set((state) => ({
        sessionMessages: {
          ...state.sessionMessages,
          [chatId]: typeof messages === 'function'
            ? messages(state.sessionMessages[chatId] ?? EMPTY_ARRAY)
            : messages,
        },
      })),

      clearSessionMessages: (chatId) => set((state) => {
        const sessionMessages = { ...state.sessionMessages };
        delete sessionMessages[chatId];
        return { sessionMessages };
      }),

      clearSessionRuntime: (chatId) => set((state) => {
        const sessionMessages = { ...state.sessionMessages };
        const streamingChats = { ...state.streamingChats };
        delete sessionMessages[chatId];
        delete streamingChats[chatId];
        return {
          sessionMessages,
          streamingChats,
          activeSessionId: state.activeSessionId === chatId ? null : state.activeSessionId,
        };
      }),

      setMessages: (messages) => {
        const { activeSessionId } = get();
        if (!activeSessionId) return;
        set((state) => ({
          sessionMessages: {
            ...state.sessionMessages,
            [activeSessionId]: typeof messages === 'function'
              ? messages(state.sessionMessages[activeSessionId] ?? EMPTY_ARRAY)
              : messages,
          },
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

      setActiveSession: (activeSessionId) => set({ activeSessionId }),

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
