import { useState, useMemo, useCallback, useEffect, type ComponentType } from "react";import { Settings2, Key, BrainCircuit, Shield,
  Save, Loader2,
  Sparkles, MessageSquare,
  Monitor,
  Eye, Headphones, Bot, Terminal, FolderOpen, Search,
  Cpu, Download, Zap, Link2, RefreshCw, Code, BookOpen, Map
} from "lucide-react";
import {
  Dialog, DialogContent,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import {
  storeToSettingsRecord,
  coerceBridgeValue,
} from "@/lib/stores/settings/settingsBridge";
import { ProvidersSettings } from "@/components/settings/Tabs/ProvidersSettings";
import { ModelsSettings } from "@/components/settings/Tabs/ModelsSettings";
import { SkillsSettingsContent } from "./SkillsSettingsContent";
import { FolderBrowser } from "./FolderBrowser";
import { useZenTheme } from "../providers/ZenThemeProvider";
import { AudioSettings } from "@/components/settings/Tabs/AudioSettings";
import { ChatSettings } from "@/components/settings/Tabs/ChatSettings";
import { GUISettings } from "@/components/settings/Tabs/GUISettings";
import { IntelligenceSettings } from "@/components/settings/Tabs/IntelligenceSettings";
import { SystemSettings } from "@/components/settings/Tabs/SystemSettings";
import { TerminalSettings } from "@/components/settings/Tabs/TerminalSettings";
import { WorkspaceSettings } from "@/components/settings/Tabs/WorkspaceSettings";
import { AgentsSettings } from "@/components/settings/Tabs/AgentsSettings";
import { RawSettings } from "@/components/settings/Tabs/system/RawSettings";
import { ToolsSettings } from "@/components/settings/Tabs/ToolsSettings";
import { MCPSettings } from "@/components/settings/Tabs/plugins/MCPSettings";
import { EmbeddingModelDownloader } from "@/components/settings/Tabs/intelligence/EmbeddingModelDownloader";
import { CommandsSettings } from "@/components/settings/Tabs/plugins/CommandsSettings";
import { HooksSettings } from "@/components/settings/Tabs/plugins/HooksSettings";
import { UpdatesSettings } from "@/components/settings/Tabs/system/UpdatesSettings";
import { SkillRegistry } from "@/components/settings/Tabs/skills/SkillRegistry";
import { MapConfiguration } from "@/components/GTSM/MapConfiguration";

export type TabId = "general" | "appearance" | "chat" | "ai-config" | "providers" | "capabilities" | "intelligence" | "agents" | "skills" | "audio" | "terminal" | "workspace" | "tools" | "system" | "raw" | "mcp" | "embedding-models" | "commands" | "hooks" | "updates" | "map-config";

interface SettingsTabGroup {
  label: string;
  tabs: SettingsTab[];
}

interface SettingsTab {
  id: TabId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
}

const TAB_GROUPS: SettingsTabGroup[] = [
  {
    label: "General",
    tabs: [
      { id: "general", label: "General", icon: Settings2, description: "Workspace & UI" },
      { id: "appearance", label: "Appearance", icon: Eye, description: "Theme & layout" },
    ],
  },
  {
    label: "AI & Chat",
    tabs: [
      { id: "chat", label: "Chat", icon: MessageSquare, description: "Conversation settings" },
      { id: "ai-config", label: "Models", icon: BrainCircuit, description: "Model selection" },
      { id: "providers", label: "Providers", icon: Key, description: "API keys" },
      { id: "capabilities", label: "Capabilities", icon: Sparkles, description: "Agent skills" },
      { id: "intelligence", label: "Intelligence", icon: Search, description: "RAG & memory" },
      { id: "agents", label: "Agents", icon: Bot, description: "Sub-agent config" },
      { id: "commands", label: "Commands", icon: Zap, description: "Slash commands" },
      { id: "hooks", label: "Hooks", icon: Link2, description: "Event hooks" },
      { id: "mcp", label: "MCP", icon: Cpu, description: "MCP servers" },
      { id: "embedding-models", label: "Embedding Models", icon: Download, description: "Download embedding models" },
    ],
  },
  {
    label: "Interface",
    tabs: [
      { id: "audio", label: "Audio", icon: Headphones, description: "Sound & voice" },
      { id: "terminal", label: "Terminal", icon: Terminal, description: "Shell & safety" },
      { id: "workspace", label: "Workspace", icon: FolderOpen, description: "Directories & Git" },
      { id: "skills", label: "Skills", icon: BookOpen, description: "Tactical modules" },
      { id: "map-config", label: "Map Config", icon: Map, description: "GTSM operational layers" },
    ],
  },
  {
    label: "System",
    tabs: [
      { id: "tools", label: "Tools", icon: Shield, description: "Tool permissions & safety" },
      { id: "system", label: "System", icon: Monitor, description: "Performance & maintenance" },
      { id: "raw", label: "Raw Config", icon: Code, description: "Raw settings editor" },
      { id: "updates", label: "Updates", icon: RefreshCw, description: "Update & version info" },
    ],
  },
];

export function SettingsModal({
  open,
  onOpenChange,
  initialTab = "general",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: TabId;
  models?: any[];
  selectedModelId?: string;
  onSelectModel?: (id: string, provider: string) => void;
  fetchModels?: () => void;
  modelsLoading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden bg-background border-border/60 shadow-2xl flex flex-col md:flex-row h-full max-h-[85vh] md:h-[580px] w-[92vw] focus:outline-none focus-visible:outline-none">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Configure application preferences.</DialogDescription>
        <SettingsContent
          initialTab={initialTab}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function SettingsContent({
  initialTab = "general",
  onClose = () => {},
}: {
  initialTab?: TabId;
  onClose?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Sync activeTab when initialTab changes (user clicks different settings button)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Zustand store ───────────────────────────────────────────────
  const isHydrated = useSettingsStore(s => s.isHydrated);
  const isSyncing = useSettingsStore(s => s.isSyncing);
  const store = useSettingsStore(); // Still needed for actions, but we'll use it sparingly

  // Derive the flat Record<string, string> from the typed store state
  // Using useMemo with a more granular dependency to avoid recalculating on every store update
  const reducedMotion = useSettingsStore(s => s.reducedMotion);
  const settings = useMemo(() => {
    const record = storeToSettingsRecord(store);
    record["ui.animations"] = reducedMotion ? "false" : "true";
    return record;
  }, [store.isDirty, reducedMotion, store.isSyncing]); // Recalculate on dirty status or motion change

  // ── Theme context ────────────────────────────────────────────────

  const theme = useZenTheme();

  // ── Update handler ──────────────────────────────────────────────

  const handleUpdate = useCallback(
    (key: string, value: string) => {
      // Special case: ui.animations maps to reducedMotion (inverted)
      if (key === "ui.animations") {
        const enabled = value === "true";
        store.updateSetting("reducedMotion", !enabled);
        theme.setMotionEnabled(enabled);
        return;
      }
      const coerced = coerceBridgeValue(key, value);
      store.updateSetting(key as keyof typeof store, coerced as never);
    },
    [store, theme]
  );

  // ── SkillsSettingsContent uses full-object update ───────────────

  const setStoreSettings = useCallback(
    (newSettings: Record<string, string>) => {
      for (const [key, value] of Object.entries(newSettings)) {
        const coerced = coerceBridgeValue(key, value);
        store.updateSetting(key as keyof typeof store, coerced as never);
      }
    },
    [store]
  );

  // ── Save / Cancel ───────────────────────────────────────────────

  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const toastId = toast.loading("Saving settings…");
    try {
      const { syncFailed } = await store.applyChanges();
      if (syncFailed) {
        toast.warning("Settings saved locally, but some changes failed to sync to the backend", {
          id: toastId,
          duration: 5000,
        });
      } else {
        toast.success("Settings saved", { id: toastId });
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Failed to save settings", { id: toastId });
    } finally {
      setSaving(false);
    }
  }, [store, onClose]);

  const handleCancel = useCallback(() => {
    store.discardChanges();
    onClose();
  }, [store, onClose]);

  // ── Loading state (wait for hydration) ──────────────────────────

  if (!isHydrated) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col md:flex-row h-full w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-full md:w-56 bg-[#050506] border-b md:border-b-0 md:border-r border-white/[0.06] flex flex-col shrink-0">
        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="font-bold text-sm flex items-center gap-2 tracking-tight text-zinc-100">
            <Settings2 className="h-4 w-4 text-primary" />
            Settings
          </h2>
        </div>

        <ScrollArea className="flex-1 py-2">
          {TAB_GROUPS.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="px-3 py-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-600">
                  {group.label}
                </span>
              </div>
              <div className="flex md:flex-col gap-0.5 px-2">
                {group.tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          "relative w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all text-left group",
                          isActive
                            ? "bg-muted text-primary font-bold"
                            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {isActive && <div className="nav-rail-indicator" />}
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "opacity-40 group-hover:opacity-100")} />
                        <span className="text-[12.5px] tracking-tight truncate">{tab.label}</span>
                      </button>
                    );
                })}
              </div>
            </div>
          ))}
        </ScrollArea>

        <div className="hidden md:block p-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-primary">Zen Engine</span>
          </div>
          <p className="text-[9px] text-zinc-600">v1.0 Stable Build</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <ScrollArea className="flex-1">
          <div className="max-w-2xl mx-auto p-6 md:p-8 space-y-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -5 }}
                transition={{ duration: 0.15 }}
                className="space-y-8"
              >
                {activeTab === "general" && (
                  <section className="space-y-6">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold tracking-tight text-zinc-100">General</h3>
                      <p className="text-[13px] text-zinc-500">Manage workspace and UI preferences.</p>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[13px] font-bold text-zinc-300">Workspace Root</Label>
                        <FolderBrowser
                          value={settings["workspace.root"] || ""}
                          onChange={(path) => handleUpdate("workspace.root", path)}
                        />
                        <p className="text-[10px] text-zinc-600">
                          File tools (read, list, bash) are scoped to this folder.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                          <Label className="text-[13px] font-medium text-zinc-300">Interface Theme</Label>
                          <Select
                            value={settings["ui.theme"] || "dark"}
                            onValueChange={(v) => handleUpdate("ui.theme", v)}
                          >
                            <SelectTrigger className="w-[100px] h-8 text-xs bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="light">Light</SelectItem>
                              <SelectItem value="dark">Dark</SelectItem>
                              <SelectItem value="system">System</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                          <div className="space-y-0.5">
                            <Label className="text-[13px] font-medium text-zinc-300">Interface Animations</Label>
                            <p className="text-[10px] text-zinc-500">Shimmer, pulses and transitions</p>
                          </div>
                          <Switch
                            checked={settings["ui.animations"] !== "false"}
                            onCheckedChange={(v) => handleUpdate("ui.animations", String(v))}
                            className="scale-90"
                          />
                        </div>

                         <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                           <Label className="text-[13px] font-medium text-zinc-300">Compact Mode</Label>
                           <Switch
                             checked={settings["ui.compact-mode"] === "true"}
                             onCheckedChange={(v) => handleUpdate("ui.compact-mode", String(v))}
                             className="scale-90"
                           />
                         </div>
                      </div>
                    </div>
                  </section>
                )}

                {activeTab === "appearance" && (
                  <GUISettings settings={settings} onUpdate={handleUpdate} />
                )}

                {activeTab === "chat" && (
                  <ChatSettings settings={settings} onUpdate={handleUpdate} />
                )}

                {activeTab === "ai-config" && (
                  <ModelsSettings settings={settings} onUpdate={handleUpdate} />
                )}

                {activeTab === "providers" && (
                  <ProvidersSettings />
                )}

                {activeTab === "capabilities" && (
                  <div className="space-y-8">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold tracking-tight text-zinc-100">Capabilities</h3>
                      <p className="text-[13px] text-zinc-500">Configure agent skills and advanced behavior.</p>
                    </div>
                    <SkillsSettingsContent settings={settings} onUpdate={setStoreSettings} />
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <span className="text-[11px] font-bold text-zinc-500">Show advanced agent behavior</span>
                      <Switch checked={showAdvanced} onCheckedChange={setShowAdvanced} className="scale-75" />
                    </div>

                    {showAdvanced && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pt-2">
                         <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                            <Label className="text-[13px] font-medium text-zinc-300">Max Reasoning Steps</Label>
                            <Input
                              type="number" className="w-16 h-8 text-xs text-center bg-background"
                              value={settings["chat.reasoning-budget"] || "5"}
                              onChange={(e) => handleUpdate("chat.reasoning-budget", e.target.value)}
                            />
                         </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {activeTab === "intelligence" && (
                  <IntelligenceSettings settings={settings} onUpdate={handleUpdate} />
                )}

                {activeTab === "agents" && (
                  <AgentsSettings settings={settings} onUpdate={handleUpdate} />
                )}

                {activeTab === "audio" && (
                  <AudioSettings settings={settings} onUpdate={handleUpdate} />
                )}

                {activeTab === "terminal" && (
                  <TerminalSettings settings={settings} onUpdate={handleUpdate} />
                )}

                {activeTab === "workspace" && (
                  <WorkspaceSettings settings={settings} onUpdate={handleUpdate} />
                )}

                {activeTab === "tools" && (
                  <ToolsSettings settings={settings} onUpdate={handleUpdate} />
                )}

                {activeTab === "system" && (
                  <SystemSettings settings={settings} onUpdate={handleUpdate} />
                )}

                {activeTab === "raw" && (
                  <RawSettings />
                )}

                {activeTab === "mcp" && (
                  <MCPSettings />
                )}

                {activeTab === "embedding-models" && (
                  <EmbeddingModelDownloader provider="ollama" />
                )}

                {activeTab === "commands" && (
                  <CommandsSettings />
                )}

                {activeTab === "hooks" && (
                  <HooksSettings />
                )}

                {activeTab === "updates" && (
                  <UpdatesSettings />
                )}
                {activeTab === "map-config" && (
                  <MapConfiguration />
                )}
                {activeTab === "skills" && (
                  <SkillRegistry skills={[]} loading={false} onToggle={() => {}} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="p-3 border-t border-border/40 flex justify-end gap-2 bg-background/50 backdrop-blur-sm">
          <Button variant="ghost" className="h-8 text-[11px] px-3 text-muted-foreground hover:text-foreground" onClick={handleCancel}>
            Cancel
          </Button>
          <Button className="h-8 text-[11px] px-5 font-bold shadow-md shadow-primary/10" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                {isSyncing ? "Syncing…" : "Saving…"}
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 mr-1" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
