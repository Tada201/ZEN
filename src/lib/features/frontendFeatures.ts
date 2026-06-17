import type { ComponentType } from "react";
import {
  Activity,
  Bot,
  Box,
  Cpu,
  Headphones,
  Info,
  Layers,
  Map as MapIcon,
  MessageSquare,
  Paintbrush,
  Search,
  Settings,
  Sparkles,
  Sun,
  Terminal,
  User,
  Zap,
} from "lucide-react";

export type FeatureMaturity = "prototype" | "preview" | "partial" | "production";
export type FeatureSurface = "settings" | "commandPalette" | "rightRail" | "workspaceMode" | "sidebar";
export type FeatureRisk = "none" | "privileged" | "secrets" | "untrusted-content" | "heavy-runtime";

export type SettingsTabId =
  | "general"
  | "appearance"
  | "chat"
  | "providers"
  | "capabilities"
  | "intelligence"
  | "agents"
  | "skills"
  | "voice"
  | "audio"
  | "terminal"
  | "workspace"
  | "tools"
  | "dependencies"
  | "system"
  | "mcp"
  | "embedding-models"
  | "commands"
  | "hooks"
  | "updates"
  | "map-config";

export type RightPanelTabId =
  | "metrics"
  | "analytics"
  | "agents"
  | "workflows"
  | "space"
  | "drawing"
  | "artifacts"
  | "terminal"
  | "map"
  | "memory";

export type WorkspaceModeId = "chat" | "openui";

export interface FrontendFeature {
  id: string;
  label: string;
  description?: string;
  maturity: FeatureMaturity;
  surfaces: FeatureSurface[];
  defaultVisible: boolean;
  labsOnly?: boolean;
  advancedOnly?: boolean;
  requiresBackend?: string[];
  requiresSecurityReview?: boolean;
  risk: FeatureRisk;
  settingsTabId?: SettingsTabId;
  rightPanelTabId?: RightPanelTabId;
  workspaceModeId?: WorkspaceModeId;
  commandId?: string;
  icon?: ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
}

export const FRONTEND_FEATURES = [
  { id: "settings.general", label: "General", maturity: "production", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "none", settingsTabId: "general", icon: Settings },
  { id: "settings.appearance", label: "Appearance", maturity: "production", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "none", settingsTabId: "appearance", icon: Sun },
  { id: "settings.chat", label: "Chat", maturity: "production", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "none", settingsTabId: "chat", icon: MessageSquare },
  { id: "settings.providers", label: "Providers", maturity: "production", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "secrets", settingsTabId: "providers", icon: Bot },
  { id: "settings.capabilities", label: "Capabilities", maturity: "partial", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "privileged", settingsTabId: "capabilities", icon: Sparkles },
  { id: "settings.intelligence", label: "Intelligence", maturity: "partial", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "heavy-runtime", settingsTabId: "intelligence", icon: Search },
  { id: "settings.agents", label: "Agents", maturity: "partial", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "privileged", settingsTabId: "agents", icon: Bot },
  { id: "settings.voice", label: "Voice", maturity: "partial", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "none", settingsTabId: "voice", icon: Headphones },
  { id: "settings.audio", label: "Audio", maturity: "production", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "none", settingsTabId: "audio", icon: Headphones },
  { id: "settings.terminal", label: "Terminal", maturity: "partial", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "privileged", settingsTabId: "terminal", icon: User },
  { id: "settings.workspace", label: "Workspace", maturity: "production", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "privileged", settingsTabId: "workspace", icon: Layers },
  { id: "settings.tools", label: "Tools", maturity: "production", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "privileged", settingsTabId: "tools", icon: Info },
  { id: "settings.dependencies", label: "Dependencies", maturity: "partial", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "heavy-runtime", settingsTabId: "dependencies", icon: Box },
  { id: "settings.system", label: "System", maturity: "production", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "none", settingsTabId: "system", icon: Info },
  { id: "settings.mcp", label: "MCP", maturity: "partial", surfaces: ["settings", "commandPalette"], defaultVisible: true, risk: "privileged", settingsTabId: "mcp", icon: Cpu },
  { id: "settings.commands", label: "Commands", maturity: "prototype", surfaces: ["settings", "commandPalette"], defaultVisible: false, labsOnly: true, risk: "privileged", settingsTabId: "commands", icon: Zap },
  { id: "settings.hooks", label: "Hooks", maturity: "prototype", surfaces: ["settings", "commandPalette"], defaultVisible: false, labsOnly: true, risk: "privileged", settingsTabId: "hooks", icon: Layers },
  { id: "settings.updates", label: "Updates", maturity: "prototype", surfaces: ["settings", "commandPalette"], defaultVisible: false, labsOnly: true, risk: "none", settingsTabId: "updates", icon: Info },
  { id: "settings.skills", label: "Skills", maturity: "prototype", surfaces: ["settings", "commandPalette"], defaultVisible: false, labsOnly: true, risk: "privileged", settingsTabId: "skills", icon: Layers },
  { id: "settings.embedding-models", label: "Embedding Models", maturity: "prototype", surfaces: ["settings", "commandPalette"], defaultVisible: false, labsOnly: true, risk: "heavy-runtime", settingsTabId: "embedding-models", icon: Search },
  { id: "settings.map-config", label: "Map Config", maturity: "prototype", surfaces: ["settings", "commandPalette"], defaultVisible: false, labsOnly: true, risk: "heavy-runtime", settingsTabId: "map-config", icon: MapIcon },
  { id: "right.metrics", label: "System Metrics", maturity: "production", surfaces: ["rightRail"], defaultVisible: true, risk: "none", rightPanelTabId: "metrics", icon: Activity },
  { id: "right.artifacts", label: "Artifacts", maturity: "production", surfaces: ["rightRail"], defaultVisible: true, risk: "untrusted-content", rightPanelTabId: "artifacts", icon: Box },
  { id: "right.agents", label: "Active Agents", maturity: "partial", surfaces: ["rightRail"], defaultVisible: true, risk: "privileged", rightPanelTabId: "agents", icon: Cpu },
  { id: "right.drawing", label: "Canvas Workspace", maturity: "partial", surfaces: ["rightRail"], defaultVisible: true, risk: "heavy-runtime", rightPanelTabId: "drawing", icon: Paintbrush },
  { id: "right.terminal", label: "Terminal", maturity: "partial", surfaces: ["rightRail"], defaultVisible: true, risk: "privileged", rightPanelTabId: "terminal", icon: Terminal },
  { id: "right.map", label: "Operational Map", maturity: "partial", surfaces: ["rightRail"], defaultVisible: true, risk: "heavy-runtime", rightPanelTabId: "map", icon: MapIcon },
  { id: "workspace.chat", label: "Chat", maturity: "production", surfaces: ["workspaceMode", "sidebar"], defaultVisible: true, risk: "none", workspaceModeId: "chat", icon: MessageSquare },
  { id: "workspace.openui", label: "Canvas", maturity: "prototype", surfaces: ["workspaceMode", "sidebar"], defaultVisible: false, labsOnly: true, requiresSecurityReview: true, risk: "untrusted-content", workspaceModeId: "openui", icon: Paintbrush },
] satisfies FrontendFeature[];

function isVisible(feature: FrontendFeature): boolean {
  return feature.defaultVisible && feature.maturity !== "prototype" && !feature.labsOnly;
}

export function getVisibleSettingsFeatures() {
  return FRONTEND_FEATURES.filter((feature) => feature.settingsTabId && feature.surfaces.includes("settings") && isVisible(feature));
}

export function isSettingsTabVisible(tabId: string): tabId is SettingsTabId {
  return getVisibleSettingsFeatures().some((feature) => feature.settingsTabId === tabId);
}

export function getVisibleRightPanelFeatures() {
  return FRONTEND_FEATURES.filter((feature) => feature.rightPanelTabId && feature.surfaces.includes("rightRail") && isVisible(feature));
}

export function getDefaultRightPanelTab(): RightPanelTabId {
  return getVisibleRightPanelFeatures()[0]?.rightPanelTabId ?? "metrics";
}

export function isRightPanelFeatureVisible(tabId: string): tabId is RightPanelTabId {
  return getVisibleRightPanelFeatures().some((feature) => feature.rightPanelTabId === tabId);
}

export function getRightPanelFeature(tabId: string) {
  return FRONTEND_FEATURES.find((feature) => feature.rightPanelTabId === tabId);
}

export function getVisibleWorkspaceModeFeatures() {
  return FRONTEND_FEATURES.filter((feature) => feature.workspaceModeId && feature.surfaces.includes("workspaceMode") && isVisible(feature));
}

export function isWorkspaceModeVisible(modeId: string): modeId is WorkspaceModeId {
  return getVisibleWorkspaceModeFeatures().some((feature) => feature.workspaceModeId === modeId);
}
