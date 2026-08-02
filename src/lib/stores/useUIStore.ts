import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SettingsTabId, WorkspaceModeId } from '@/lib/features/frontendFeatures';

// Module-level session tracker — avoids circular import with useChatStore.
// Updated by useChatQueries on session switch via setActiveSessionId.
let _lastSessionId: string | null = null;
export function setActiveSessionId(id: string | null) { _lastSessionId = id; }

interface UIState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  activeTab: WorkspaceModeId;
  activeSidebarPanel: string;
  isCommandPaletteOpen: boolean;
  artifactPanelOpen: boolean;
  artifactPanelMode: 'preview' | 'code';
  artifactPanelFullscreen: boolean;
  settingsOpen: boolean;
  chatManagerOpen: boolean;
  aboutModalOpen: boolean;
  activeSettingsTab: SettingsTabId;
  operationalParams: { lat: number; lon: number; label: string; zoom?: number } | null;
  solarMode: boolean;
  activeModel: string;
  activeProvider: string;
  voiceModeOpen: boolean;
  aiSpeaking: boolean;
  /**
   * Identifier of the chat currently active in the workspace. Drives
   * adapters that need chat context (e.g. the right-panel context
   * tab) without taking a prop. Updated by chat-handling code on
   * session switch.
   */
  activeChatId: string | null;
  toggleVoiceMode: () => void;
  theme: 'dark' | 'light' | 'tactical';
  styleMode: 'glass' | 'flat' | 'bordered';
  density: 'normal' | 'compact';
  rightPanelOpen: boolean;
  activeRightTab: string;
  rightPanelCanvasMode: 'draw' | 'mathplot';
  rightTabBySession: Record<string, string>;
  agentsPanelDismissed: boolean;
  
  // Actions
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setActiveTab: (tab: WorkspaceModeId) => void;
  setActiveSidebarPanel: (panel: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setArtifactPanelOpen: (open: boolean) => void;
  setArtifactPanelMode: (mode: 'preview' | 'code') => void;
  setArtifactPanelFullscreen: (full: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setChatManagerOpen: (open: boolean) => void;
  setAboutModalOpen: (open: boolean) => void;
  toggleAboutModal: () => void;
  setActiveSettingsTab: (tab: SettingsTabId) => void;
  toggleSettings: () => void;
  setOperationalParams: (params: { lat: number; lon: number; label: string; zoom?: number } | null) => void;
  setSolarMode: (solar: boolean) => void;
  setActiveModel: (model: string) => void;
  setActiveProvider: (provider: string) => void;
  setVoiceModeOpen: (open: boolean) => void;
  setAiSpeaking: (speaking: boolean) => void;
  setActiveChatId: (chatId: string | null) => void;
  setTheme: (theme: 'dark' | 'light' | 'tactical') => void;
  setStyleMode: (mode: 'glass' | 'flat' | 'bordered') => void;
  setDensity: (density: 'normal' | 'compact') => void;
  setRightPanelOpen: (open: boolean) => void;
  setActiveRightTab: (tab: string) => void;
  setRightPanelCanvasMode: (mode: 'draw' | 'mathplot') => void;
  setAgentsPanelDismissed: (dismissed: boolean) => void;
  restoreRightTabForSession: (sessionId: string | null) => void;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarWidth: 240,
      activeTab: 'chat',
      activeSidebarPanel: 'chat',
      isCommandPaletteOpen: false,
      artifactPanelOpen: false,
      artifactPanelMode: 'preview',
      artifactPanelFullscreen: false,
      settingsOpen: false,
      chatManagerOpen: false,
      aboutModalOpen: false,
      activeSettingsTab: 'general',
      operationalParams: { lat: 10.762622, lon: 106.660172, label: 'Saigon HQ', zoom: 12 },
      solarMode: false,
      activeModel: 'gpt-4o',
      activeProvider: 'openai',
      voiceModeOpen: false,
      aiSpeaking: false,
      activeChatId: null,
      theme: 'dark',
      styleMode: 'glass',
      density: 'normal',
      rightPanelOpen: false,
      activeRightTab: 'metrics',
      rightPanelCanvasMode: 'draw',
      rightTabBySession: {},
      agentsPanelDismissed: false,

      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setActiveSidebarPanel: (activeSidebarPanel) => set({ activeSidebarPanel }),
      setCommandPaletteOpen: (isCommandPaletteOpen) => set({ isCommandPaletteOpen }),
      setArtifactPanelOpen: (artifactPanelOpen) => set({ artifactPanelOpen }),
      setArtifactPanelMode: (artifactPanelMode) => set({ artifactPanelMode }),
      setArtifactPanelFullscreen: (artifactPanelFullscreen) => set({ artifactPanelFullscreen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setChatManagerOpen: (chatManagerOpen) => set({ chatManagerOpen }),
      setAboutModalOpen: (aboutModalOpen) => set({ aboutModalOpen }),
      toggleAboutModal: () => set((state) => ({ aboutModalOpen: !state.aboutModalOpen })),
      setActiveSettingsTab: (activeSettingsTab) => set({ activeSettingsTab }),
      toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
      setOperationalParams: (operationalParams) => set({ operationalParams }),
      setSolarMode: (solarMode) => set({ solarMode }),
      setActiveModel: (activeModel) => set({ activeModel }),
      setActiveProvider: (activeProvider) => set({ activeProvider }),
      setVoiceModeOpen: (voiceModeOpen) => set({ voiceModeOpen }),
      setAiSpeaking: (aiSpeaking) => set({ aiSpeaking }),
      setActiveChatId: (activeChatId) => set({ activeChatId }),
      toggleVoiceMode: () => set((state) => ({ voiceModeOpen: !state.voiceModeOpen })),
      setTheme: (theme) => set({ theme }),
      setStyleMode: (styleMode) => set({ styleMode }),
      setDensity: (density) => set({ density }),
      setRightPanelOpen: (rightPanelOpen) => set((state) => {
        const nextState: Partial<UIState> = { rightPanelOpen };
        if (!rightPanelOpen && state.activeRightTab === 'agents') {
          nextState.agentsPanelDismissed = true;
        }
        return nextState as any;
      }),
      setActiveRightTab: (activeRightTab) => set((state) => {
        const nextState: Partial<UIState> = { activeRightTab };
        if (activeRightTab === 'agents') {
          nextState.agentsPanelDismissed = false;
        } else if (state.activeRightTab === 'agents' && state.rightPanelOpen) {
          nextState.agentsPanelDismissed = true;
        }
        // Remember the selected tab for the current session
        if (_lastSessionId) {
          nextState.rightTabBySession = { ...state.rightTabBySession, [_lastSessionId]: activeRightTab };
        }
        return nextState as any;
      }),
      restoreRightTabForSession: (sessionId) => set((state) => {
        if (!sessionId) return state;
        const remembered = state.rightTabBySession[sessionId];
        if (remembered && remembered !== state.activeRightTab) {
          const nextState: Partial<UIState> = { activeRightTab: remembered };
          if (remembered === 'agents') {
            nextState.agentsPanelDismissed = false;
          } else if (state.activeRightTab === 'agents' && state.rightPanelOpen) {
            nextState.agentsPanelDismissed = true;
          }
          return nextState as any;
        }
        return state;
      }),
      setRightPanelCanvasMode: (rightPanelCanvasMode) => set({ rightPanelCanvasMode }),
      setAgentsPanelDismissed: (agentsPanelDismissed) => set({ agentsPanelDismissed }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
    }),
    {
      name: 'zen-ui-storage',
      partialize: (state) => {
        const {
          settingsOpen,
          isCommandPaletteOpen,
          chatManagerOpen,
          aboutModalOpen,
          voiceModeOpen,
          aiSpeaking,
          agentsPanelDismissed,
          rightTabBySession,
          activeChatId,
          ...rest
        } = state;
        return rest;
      },
    }
  )
);
