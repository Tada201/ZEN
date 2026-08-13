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
  keywords?: string[];
}

const TAB_GROUPS: SettingsTabGroup[] = [
  {
    label: "Basics",
    tabs: [
      { id: "general", label: "General", icon: "lucide:settings-2", description: "Workspace defaults & UI", keywords: ["root", "workspace", "animations", "density", "welcome", "motion"] },
      { id: "appearance", label: "Appearance", icon: "lucide:eye", description: "Theme, wallpaper & motion", keywords: ["wallpaper", "background", "theme", "light", "dark", "motion", "live"] },
      { id: "workspace", label: "Workspace", icon: "lucide:folder-open", description: "Directories, Git & project paths", keywords: ["folder", "directory", "path", "repository", "git", "security"] },
    ],
  },
  {
    label: "AI & conversation",
    tabs: [
      { id: "chat", label: "Chat behavior", icon: "lucide:message-square", description: "Response style, streaming & reasoning", keywords: ["chat", "persona", "prompt", "streaming", "reasoning", "conversation"] },
      { id: "providers", label: "Models & providers", icon: "lucide:server-cog", description: "Connections, keys & models", keywords: ["provider", "API", "key", "endpoint", "model", "connection", "router"] },
      { id: "usage", label: "Usage", icon: "lucide:chart-no-axes-combined", description: "Tokens, requests & latency", keywords: ["stats", "cost", "tokens", "latency", "requests", "activity"] },
      { id: "capabilities", label: "Agent skills", icon: "lucide:sparkles", description: "Skills and agent capabilities", keywords: ["capabilities", "skills", "permissions", "reasoning", "extensions"] },
      { id: "intelligence", label: "Research & knowledge", icon: "lucide:search", description: "Search, retrieval & memory", keywords: ["intelligence", "RAG", "retrieval", "embedding", "search", "web", "citations", "memory"] },
      { id: "deep-research", label: "Deep Research", icon: "lucide:book-open-check", description: "Research agents & sources", keywords: ["research", "sources", "budget"] },
      { id: "agents", label: "Agents", icon: "lucide:bot", description: "Delegation & orchestration", keywords: ["sub-agent", "orchestrator", "delegation", "parallel"] },
    ],
  },
  {
    label: "Audio & input",
    tabs: [
      { id: "voice", label: "Voice", icon: "lucide:audio-lines", description: "Voice mode & speech", keywords: ["speech", "STT", "TTS", "display agent", "input"] },
      { id: "audio", label: "Audio", icon: "lucide:headphones", description: "Microphone, speaker & sounds", keywords: ["microphone", "speaker", "volume", "noise", "VAD", "sound"] },
    ],
  },
  {
    label: "Safety & tools",
    tabs: [
      { id: "tools", label: "Permissions & tools", icon: "lucide:shield", description: "Approvals, sandbox & tool access", keywords: ["permissions", "approval", "dangerous", "tools", "safety"] },
      { id: "mcp", label: "MCP servers", icon: "lucide:cpu", description: "External tools & connections", keywords: ["MCP", "server", "external", "tools", "connection"] },
      { id: "terminal", label: "Terminal & shell", icon: "lucide:terminal", description: "Commands, sandbox & execution", keywords: ["terminal", "shell", "commands", "sandbox", "execution"] },
    ],
  },
  {
    label: "Advanced",
    tabs: [
      { id: "system", label: "Performance & maintenance", icon: "lucide:monitor", description: "GPU, storage & diagnostics", keywords: ["system", "GPU", "hardware", "performance", "backup", "restore", "cleanup", "diagnostics"] },
      { id: "dependencies", label: "Runtime health", icon: "lucide:package-check", description: "Diagnostics & requirements", keywords: ["dependencies", "runtime", "health", "diagnostics", "install"] },
      { id: "commands", label: "Slash commands", icon: "lucide:zap", description: "Command palette & chat commands", keywords: ["commands", "slash", "palette"] },
      { id: "hooks", label: "Automation hooks", icon: "lucide:link-2", description: "Event-driven integrations", keywords: ["hooks", "events", "automation", "integrations"] },
      { id: "embedding-models", label: "Embedding models", icon: "lucide:download", description: "Vector search models", keywords: ["embedding", "vector", "download", "knowledge"] },
      { id: "skills", label: "Skill registry", icon: "lucide:book-open", description: "Installed skill modules", keywords: ["skills", "modules", "extensions", "registry"] },
      { id: "maps", label: "Maps", icon: "lucide:map", description: "Map data & camera sources", keywords: ["map", "camera", "sources", "location"] },
      { id: "updates", label: "Updates", icon: "lucide:refresh-cw", description: "Version and update controls", keywords: ["version", "update", "release"] },
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
