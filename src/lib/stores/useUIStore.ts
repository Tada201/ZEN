import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RightPanelTabId, SettingsTabId, WorkspaceModeId } from '@/lib/features/frontendFeatures';

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
  toggleVoiceMode: () => void;
  theme: 'dark' | 'light' | 'tactical';
  styleMode: 'glass' | 'flat' | 'bordered';
  density: 'normal' | 'compact';
  rightPanelOpen: boolean;
  activeRightTab: RightPanelTabId;
  
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
  setTheme: (theme: 'dark' | 'light' | 'tactical') => void;
  setStyleMode: (mode: 'glass' | 'flat' | 'bordered') => void;
  setDensity: (density: 'normal' | 'compact') => void;
  setRightPanelOpen: (open: boolean) => void;
  setActiveRightTab: (tab: RightPanelTabId) => void;
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
      theme: 'dark',
      styleMode: 'glass',
      density: 'normal',
      rightPanelOpen: false,
      activeRightTab: 'metrics',

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
      toggleVoiceMode: () => set((state) => ({ voiceModeOpen: !state.voiceModeOpen })),
      setTheme: (theme) => set({ theme }),
      setStyleMode: (styleMode) => set({ styleMode }),
      setDensity: (density) => set({ density }),
      setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
      setActiveRightTab: (activeRightTab) => set({ activeRightTab }),
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
          ...rest
        } = state;
        return rest;
      },
    }
  )
);
