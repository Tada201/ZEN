import {
  getVisibleSettingsFeatures,
  isSettingsTabVisible,
  type SettingsTabId,
} from "@/lib/features/frontendFeatures";

export type TabId = SettingsTabId;

export interface SettingsTabGroup {
  label: string;
  tabs: SettingsTab[];
}

export interface SettingsTab {
  id: TabId;
  label: string;
  icon: string;
  description: string;
}

const TAB_GROUPS: SettingsTabGroup[] = [
  {
    label: "General",
    tabs: [
      { id: "general", label: "General", icon: "lucide:settings-2", description: "Workspace & UI" },
      { id: "appearance", label: "Appearance", icon: "lucide:eye", description: "Theme & layout" },
    ],
  },
  {
    label: "AI & Chat",
    tabs: [
      { id: "chat", label: "Chat", icon: "lucide:message-square", description: "Conversation settings" },
      { id: "providers", label: "Providers", icon: "lucide:server-cog", description: "Connections and models" },
      { id: "capabilities", label: "Capabilities", icon: "lucide:sparkles", description: "Agent skills" },
      { id: "intelligence", label: "Intelligence", icon: "lucide:search", description: "RAG & memory" },
      { id: "agents", label: "Agents", icon: "lucide:bot", description: "Sub-agent config" },
    ],
  },
  {
    label: "Interface",
    tabs: [
      { id: "voice", label: "Voice", icon: "lucide:audio-lines", description: "Voice mode" },
      { id: "audio", label: "Audio", icon: "lucide:headphones", description: "Sound & voice" },
      { id: "terminal", label: "Terminal", icon: "lucide:terminal", description: "Shell & safety" },
      { id: "workspace", label: "Workspace", icon: "lucide:folder-open", description: "Directories & Git" },
    ],
  },
  {
    label: "Advanced",
    tabs: [
      { id: "tools", label: "Tools", icon: "lucide:shield", description: "Tool permissions & safety" },
      { id: "dependencies", label: "Dependencies", icon: "lucide:package-check", description: "Runtime requirements" },
      { id: "commands", label: "Commands", icon: "lucide:zap", description: "Slash commands" },
      { id: "hooks", label: "Hooks", icon: "lucide:link-2", description: "Event hooks" },
      { id: "mcp", label: "MCP", icon: "lucide:cpu", description: "MCP servers" },
      { id: "embedding-models", label: "Embedding Models", icon: "lucide:download", description: "Download embedding models" },
      { id: "skills", label: "Skills", icon: "lucide:book-open", description: "Skill modules" },
      { id: "map-config", label: "Map Configuration", icon: "lucide:map", description: "Operational map layers" },
      { id: "system", label: "System", icon: "lucide:monitor", description: "Performance & maintenance" },
      { id: "updates", label: "Updates", icon: "lucide:refresh-cw", description: "Update & version info" },
    ],
  },
];

const VISIBLE_SETTING_TAB_IDS = new Set(
  getVisibleSettingsFeatures().map((feature) => feature.settingsTabId)
);

export const VISIBLE_TAB_GROUPS = TAB_GROUPS
  .map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => VISIBLE_SETTING_TAB_IDS.has(tab.id)),
  }))
  .filter((group) => group.tabs.length > 0);

export function normalizeSettingsTab(tab: string): TabId {
  return isSettingsTabVisible(tab) ? tab : "general";
}
