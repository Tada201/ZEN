import { create } from 'zustand';

interface HoveredSetting {
  id: string;
  category: string;
  label: string;
  description?: string;
  value?: string | number | boolean;
}

interface SettingsUIState {
  activeTab: string;
  hoveredSetting: HoveredSetting | null;
  setActiveTab: (tab: string) => void;
  setHoveredSetting: (setting: HoveredSetting | null) => void;
}

export const useSettingsUIStore = create<SettingsUIState>()((set) => ({
  activeTab: 'general',
  hoveredSetting: null,
  setActiveTab: (activeTab) => set({ activeTab }),
  setHoveredSetting: (hoveredSetting) => set({ hoveredSetting }),
}));
