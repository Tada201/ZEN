import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ArtifactData, Session, ChatFolder } from '../../atlas/components/chat/types';

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

      // ── Session Actions ──
      setSessions: (sessions) => set({ sessions }),

      setActiveSession: (activeSessionId) => set({ activeSessionId }),

      addSession: (session) => set((state) => ({
        sessions: [session, ...state.sessions]
      })),

      deleteSession: (id) => set((state) => ({
        sessions: state.sessions.filter(s => s.id !== id),
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId
      })),

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

      loadArchivedSessions: () => {
        const raw = localStorage.getItem('zen-chat-storage');
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const archived = parsed.state?.archivedSessions ?? [];
            set({ archivedSessions: archived });
          } catch { /* ignore */ }
        }
      },

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

      loadFolders: () => {
        const raw = localStorage.getItem('zen-chat-storage');
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const folders = parsed.state?.folders ?? [];
            set({ folders });
          } catch { /* ignore */ }
        }
      },

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
    }
  )
);