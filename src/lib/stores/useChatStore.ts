import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ArtifactData, Session, ChatFolder, Message } from '../../atlas/components/chat/types';

const EMPTY_ARRAY: Message[] = [];

interface ChatState {
  // Sessions
  sessions: Session[];
  archivedSessions: Session[];
  folders: ChatFolder[];
  activeSessionId: string | null;

  // Search
  isSearchOpen: boolean;
  searchQuery: string;
  searchResults: Session[];

  // Artifacts
  artifacts: ArtifactData[];
  activeArtifactId: string | null;
  globalArtifacts: ArtifactData[];

  // Per-session streaming state (replaces global isStreaming)
  streamingChats: Record<string, boolean>;

  // Per-session message buffers (replaces global messages)
  sessionMessages: Record<string, Message[]>;

  // ── Derived getters (backward compat) ──
  /** Returns true if the ACTIVE session is streaming */
  isStreaming: boolean;
  /** Returns messages for the ACTIVE session */
  messages: Message[];

  // Actions — Per-session streaming
  setStreamingForChat: (chatId: string, streaming: boolean) => void;
  getSessionMessages: (chatId: string) => Message[];
  setSessionMessages: (chatId: string, messages: Message[] | ((prev: Message[]) => Message[])) => void;
  clearSessionMessages: (chatId: string) => void;

  // Actions — Backward-compatible setters that delegate to per-session
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setIsStreaming: (isStreaming: boolean) => void;

  // Actions — Sessions
  setSessions: (sessions: Session[]) => void;
  setActiveSession: (id: string | null) => void;
  addSession: (session: Session) => void;
  deleteSession: (id: string) => void;
  updateSession: (id: string, data: Partial<Session>) => void;
  archiveSession: (id: string) => void;
  unarchiveSession: (id: string) => void;
  loadArchivedSessions: () => void;
  pinSession: (id: string) => void;

  // Actions — Folders
  setFolders: (folders: ChatFolder[]) => void;
  addFolder: (folder: ChatFolder) => void;
  deleteFolder: (id: string) => void;
  moveChatToFolder: (chatId: string, folderId: string | null) => void;
  removeChatFromFolder: (chatId: string) => void;
  loadFolders: () => void;

  // Actions — Search
  toggleSearch: () => void;
  setSearchQuery: (query: string) => void;
  searchChats: (query: string) => void;
  setSearchResults: (results: Session[]) => void;

  // Actions — Artifacts
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
      // ── Initial State ──
      sessions: [],
      archivedSessions: [],
      folders: [],
      activeSessionId: null,

      isSearchOpen: false,
      searchQuery: '',
      searchResults: [],

      artifacts: [],
      activeArtifactId: null,
      globalArtifacts: [],

      // Per-session state (replaces global singletons)
      streamingChats: {},
      sessionMessages: {},

      // ── Derived getters ──
      // These are computed via Zustand's get() — they read from per-session maps
      // using the activeSessionId as the key. This maintains backward compatibility
      // with all existing components that read `isStreaming` and `messages`.
      get isStreaming() {
        const state = get();
        return state.streamingChats[state.activeSessionId ?? ''] ?? false;
      },
      get messages() {
        const state = get();
        return state.sessionMessages[state.activeSessionId ?? ''] ?? EMPTY_ARRAY;
      },

      // ── Per-session streaming actions ──
      setStreamingForChat: (chatId, streaming) => set((state) => ({
        streamingChats: { ...state.streamingChats, [chatId]: streaming }
      })),

      getSessionMessages: (chatId) => {
        return get().sessionMessages[chatId] ?? EMPTY_ARRAY;
      },

      setSessionMessages: (chatId, messages) => {
        if (typeof messages === 'function') {
          set((state) => ({
            sessionMessages: {
              ...state.sessionMessages,
              [chatId]: messages(state.sessionMessages[chatId] ?? EMPTY_ARRAY)
            }
          }));
        } else {
          set((state) => ({
            sessionMessages: {
              ...state.sessionMessages,
              [chatId]: messages
            }
          }));
        }
      },

      clearSessionMessages: (chatId) => set((state) => {
        const next = { ...state.sessionMessages };
        delete next[chatId];
        return { sessionMessages: next };
      }),

      // ── Backward-compatible message/streaming actions ──
      // These delegate to the per-session versions using activeSessionId
      setMessages: (messages) => {
        const { activeSessionId } = get();
        if (!activeSessionId) return;
        if (typeof messages === 'function') {
          set((state) => ({
            sessionMessages: {
              ...state.sessionMessages,
              [activeSessionId]: messages(state.sessionMessages[activeSessionId] ?? EMPTY_ARRAY)
            }
          }));
        } else {
          set((state) => ({
            sessionMessages: {
              ...state.sessionMessages,
              [activeSessionId]: messages
            }
          }));
        }
      },

      setIsStreaming: (isStreaming) => {
        const { activeSessionId } = get();
        if (!activeSessionId) return;
        set((state) => ({
          streamingChats: { ...state.streamingChats, [activeSessionId]: isStreaming }
        }));
      },

      // Server-owned chat collections are intentionally runtime-only here.
      // React Query owns durable sessions/folders and backend synchronization.
      setSessions: (sessions) => set({ sessions }),

      setActiveSession: (activeSessionId) => set({ activeSessionId }),

      addSession: (session) => set((state) => ({
        sessions: [session, ...state.sessions]
      })),

      deleteSession: (id) => set((state) => {
        const next: Partial<ChatState> = {
          sessions: state.sessions.filter(s => s.id !== id),
          activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        };
        // Clean up per-session data
        const sm = { ...state.sessionMessages };
        delete sm[id];
        const sc = { ...state.streamingChats };
        delete sc[id];
        return { ...next, sessionMessages: sm, streamingChats: sc } as Partial<ChatState>;
      }),

      updateSession: (id, data) => set((state) => ({
        sessions: state.sessions.map(s => s.id === id ? { ...s, ...data, updatedAt: Date.now() } : s)
      })),

      archiveSession: (id) => set((state) => {
        const session = state.sessions.find(s => s.id === id);
        if (!session) return state;
        return {
          sessions: state.sessions.filter(s => s.id !== id),
          archivedSessions: [{ ...session, archived: true }, ...state.archivedSessions],
          activeSessionId: state.activeSessionId === id ? null : state.activeSessionId
        };
      }),

      unarchiveSession: (id) => set((state) => {
        const session = state.archivedSessions.find(s => s.id === id);
        if (!session) return state;
        return {
          archivedSessions: state.archivedSessions.filter(s => s.id !== id),
          sessions: [{ ...session, archived: false }, ...state.sessions]
        };
      }),

      loadArchivedSessions: () => set({ archivedSessions: [] }),

      pinSession: (id) => set((state) => ({
        sessions: state.sessions.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s)
      })),

      // ── Folder Actions ──
      setFolders: (folders) => set({ folders }),

      addFolder: (folder) => set((state) => ({
        folders: [folder, ...state.folders]
      })),

      deleteFolder: (id) => set((state) => ({
        folders: state.folders.filter(f => f.id !== id),
        // Remove folder assignment from sessions
        sessions: state.sessions.map(s => s.folderId === id ? { ...s, folderId: null } : s)
      })),

      moveChatToFolder: (chatId, folderId) => set((state) => ({
        sessions: state.sessions.map(s => s.id === chatId ? { ...s, folderId } : s)
      })),

      removeChatFromFolder: (chatId) => set((state) => ({
        sessions: state.sessions.map(s => s.id === chatId ? { ...s, folderId: null } : s)
      })),

      loadFolders: () => set({ folders: [] }),

      // ── Search Actions ──
      toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),

      setSearchQuery: (searchQuery) => set({ searchQuery }),

      searchChats: (query) => {
        if (!query.trim()) {
          set({ searchResults: [] });
          return;
        }
        const lower = query.toLowerCase();
        const results = get().sessions.filter(s =>
          s.title.toLowerCase().includes(lower) ||
          (s.systemPrompt?.toLowerCase().includes(lower) ?? false)
        );
        set({ searchResults: results });
      },

      setSearchResults: (searchResults) => set({ searchResults }),

      // ── Artifact Actions ──
      setArtifacts: (artifacts) => set({ artifacts }),

      setActiveArtifact: (activeArtifactId) => set({ activeArtifactId }),

      addArtifact: (artifact) => set((state) => ({
        artifacts: [artifact, ...state.artifacts.filter(a => a.id !== artifact.id)]
      })),

      removeArtifact: (id) => set((state) => ({
        artifacts: state.artifacts.filter(a => a.id !== id),
        activeArtifactId: state.activeArtifactId === id ? null : state.activeArtifactId
      })),

      updateArtifact: (id, data) => set((state) => ({
        artifacts: state.artifacts.map(a => a.id === id ? { ...a, ...data, updatedAt: Date.now() } : a)
      })),

      setGlobalArtifacts: (globalArtifacts) => set({ globalArtifacts }),

      loadAllArtifacts: () => {
        set({ globalArtifacts: get().artifacts });
      },
    }),
    {
      name: 'zen-chat-storage',
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<ChatState>) || {};
        const durableState = { ...persisted } as Partial<ChatState> & {
          isStreaming?: unknown;
          messages?: unknown;
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
          sessions: [],
          archivedSessions: [],
          folders: [],
          searchResults: [],
          streamingChats: {},
          sessionMessages: {},
        } as ChatState;
      },
      partialize: (state) => ({
        // Persist only local UI/runtime state. React Query owns durable server
        // state: sessions, archived sessions, folders, search results, and
        // fetched messages.
        activeSessionId: state.activeSessionId,
        isSearchOpen: state.isSearchOpen,
        searchQuery: state.searchQuery,
        artifacts: state.artifacts,
        activeArtifactId: state.activeArtifactId,
        globalArtifacts: state.globalArtifacts,
        // NOTE: sessionMessages and streamingChats are NOT persisted.
        // On reload, messages are re-fetched from SQLite via React Query.
        // This prevents localStorage bloat and stale streaming state.
      }),
    }
  )
);
