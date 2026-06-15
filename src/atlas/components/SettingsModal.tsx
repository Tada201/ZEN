import React, { useState, useMemo, useCallback, useEffect } from "react";
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
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import {
  storeToSettingsRecord,
  coerceBridgeValue,
  dotKeyToStoreField,
} from "@/lib/stores/settings/settingsBridge";
import { useZenTheme } from "../providers/ZenThemeProvider";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { SettingsSidebar } from "./SettingsSidebar";
import { normalizeSettingsTab, type TabId } from "./settingsNavigation";

export type { TabId } from "./settingsNavigation";

const ProvidersSettings = React.lazy(() => import("@/components/settings/Tabs/ProvidersSettings").then(m => ({ default: m.ProvidersSettings })));
const SkillsSettingsContent = React.lazy(() => import("./SkillsSettingsContent").then(m => ({ default: m.SkillsSettingsContent })));
const FolderBrowser = React.lazy(() => import("./FolderBrowser").then(m => ({ default: m.FolderBrowser })));
const VoiceSettings = React.lazy(() => import("@/components/settings/Tabs/VoiceSettings").then(m => ({ default: m.VoiceSettings })));
const AudioSettings = React.lazy(() => import("@/components/settings/Tabs/AudioSettings").then(m => ({ default: m.AudioSettings })));
const ChatSettings = React.lazy(() => import("@/components/settings/Tabs/ChatSettings").then(m => ({ default: m.ChatSettings })));
const GUISettings = React.lazy(() => import("@/components/settings/Tabs/GUISettings").then(m => ({ default: m.GUISettings })));
const IntelligenceSettings = React.lazy(() => import("@/components/settings/Tabs/IntelligenceSettings").then(m => ({ default: m.IntelligenceSettings })));
const SystemSettings = React.lazy(() => import("@/components/settings/Tabs/SystemSettings").then(m => ({ default: m.SystemSettings })));
const TerminalSettings = React.lazy(() => import("@/components/settings/Tabs/TerminalSettings").then(m => ({ default: m.TerminalSettings })));
const WorkspaceSettings = React.lazy(() => import("@/components/settings/Tabs/WorkspaceSettings").then(m => ({ default: m.WorkspaceSettings })));
const AgentsSettings = React.lazy(() => import("@/components/settings/Tabs/AgentsSettings").then(m => ({ default: m.AgentsSettings })));
const UpdatesSettings = React.lazy(() => import("@/components/settings/Tabs/system/UpdatesSettings").then(m => ({ default: m.UpdatesSettings })));
const SkillRegistry = React.lazy(() => import("@/components/settings/Tabs/skills/SkillRegistry").then(m => ({ default: m.SkillRegistry })));
const MapConfiguration = React.lazy(() => import("@/components/GTSM/MapConfiguration").then(m => ({ default: m.MapConfiguration })));
const ToolsSettings = React.lazy(() => import("@/components/settings/Tabs/ToolsSettings").then(m => ({ default: m.ToolsSettings })));
const MCPSettings = React.lazy(() => import("@/components/settings/Tabs/plugins/MCPSettings").then(m => ({ default: m.MCPSettings })));
const EmbeddingModelDownloader = React.lazy(() => import("@/components/settings/Tabs/intelligence/EmbeddingModelDownloader").then(m => ({ default: m.EmbeddingModelDownloader })));
const CommandsSettings = React.lazy(() => import("@/components/settings/Tabs/plugins/CommandsSettings").then(m => ({ default: m.CommandsSettings })));
const HooksSettings = React.lazy(() => import("@/components/settings/Tabs/plugins/HooksSettings").then(m => ({ default: m.HooksSettings })));

function SettingsTabFallback() {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <WorkbenchIcon name="lucide:loader-2" className="h-5 w-5 animate-spin text-primary" />
    </div>
  );
}

export function preloadSettingsTab(tab: TabId) {
  if (tab === "providers") {
    void import("@/components/settings/Tabs/ProvidersSettings");
  }
}

export function SettingsModal({
  open,
  onOpenChange,
  initialTab = "general",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: TabId;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[94vh] max-h-[820px] w-[96vw] max-w-[1180px] gap-0 overflow-hidden border-border/60 bg-background p-0 shadow-2xl focus:outline-none focus-visible:outline-none">
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
  const [activeTab, setActiveTab] = useState<TabId>(() => normalizeSettingsTab(initialTab));

  // Sync activeTab when initialTab changes (user clicks different settings button)
  useEffect(() => {
    setActiveTab(normalizeSettingsTab(initialTab));
  }, [initialTab]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Zustand store ───────────────────────────────────────────────
  const isHydrated = useSettingsStore(s => s.isHydrated);
  const isSyncing = useSettingsStore(s => s.isSyncing);
  const updateSetting = useSettingsStore(s => s.updateSetting);
  const applyChanges = useSettingsStore(s => s.applyChanges);
  const discardChanges = useSettingsStore(s => s.discardChanges);
  const reducedMotion = useSettingsStore(s => s.reducedMotion);
  const pendingChangeCount = useSettingsStore(s => Object.keys(s.activeSettings).length);

  const settingsRecord = useSettingsStore(useShallow(storeToSettingsRecord));
  const settings = useMemo(() => {
    const record = { ...settingsRecord };
    record["ui.animations"] = reducedMotion ? "false" : "true";
    return record;
  }, [settingsRecord, reducedMotion]);

  // ── Theme context ────────────────────────────────────────────────

  const theme = useZenTheme();

/**
 * Parse a "tools.permission.toolId.subKey" dot-key and
 * return the toolId and subKey (or null if not a permission key).
 */
function parseToolPermissionKey(key: string): { toolId: string; subKey: string } | null {
  const match = key.match(/^tools\.permission\.([^.]+)\.(.+)$/);
  if (!match) return null;
  return { toolId: match[1], subKey: match[2] };
}

  const handleUpdate = useCallback(
    (key: string, value: string) => {
      // Special case: ui.animations maps to reducedMotion (inverted)
      if (key === "ui.animations") {
        const enabled = value === "true";
        updateSetting("reducedMotion", !enabled);
        theme.setMotionEnabled(enabled);
        return;
      }

      // Dynamic tool permission keys → store in toolSettings
      const toolPerm = parseToolPermissionKey(key);
      if (toolPerm) {
        const current = useSettingsStore.getState().toolSettings || {};
        updateSetting("toolSettings", {
          ...current,
          [key]: value,
        });
        return;
      }

      const storeField = dotKeyToStoreField(key);
      const coerced = coerceBridgeValue(key, value);
      updateSetting(storeField, coerced as never);
    },
    [updateSetting, theme]
  );

  // ── Save / Cancel ───────────────────────────────────────────────

  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const toastId = toast.loading("Saving settings…");
    try {
      const { syncFailed } = await applyChanges();
      if (syncFailed) {
        toast.warning("Settings saved locally, but some changes failed to sync to the backend", {
          id: toastId,
          duration: 5000,
        });
      } else {
        toast.success("Settings saved", { id: toastId });
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to save settings", { id: toastId });
    } finally {
      setSaving(false);
    }
  }, [applyChanges]);

  const handleCancel = useCallback(() => {
    discardChanges();
    onClose();
  }, [discardChanges, onClose]);

  // ── Loading state (wait for hydration) ──────────────────────────

  if (!isHydrated) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 bg-background">
        <WorkbenchIcon name="lucide:loader-2" className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background md:flex-row">
      <SettingsSidebar activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <ScrollArea className="flex-1">
          <div className="mx-auto w-full max-w-3xl space-y-6 p-5 md:p-8 lg:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -5 }}
                transition={{ duration: 0.15 }}
                className="space-y-8"
              >
                <React.Suspense fallback={<SettingsTabFallback />}>
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
                          File tools apply this folder after settings are saved.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-2 pt-2 lg:grid-cols-2">
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

                {activeTab === "providers" && (
                  <ProvidersSettings />
                )}

                {activeTab === "capabilities" && (
                  <div className="space-y-8">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold tracking-tight text-zinc-100">Capabilities</h3>
                      <p className="text-[13px] text-zinc-500">Configure agent skills and advanced behavior.</p>
                    </div>
                    <SkillsSettingsContent settings={settings} onUpdate={handleUpdate} />
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
                  <AgentsSettings />
                )}

                {activeTab === "voice" && (
                  <VoiceSettings />
                )}

                {activeTab === "audio" && (
                  <AudioSettings />
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
                </React.Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="flex min-h-14 items-center justify-between gap-3 border-t border-border/60 bg-background px-4 py-3 md:px-6">
          <div className="min-w-0 text-xs text-muted-foreground" aria-live="polite">
            {pendingChangeCount > 0
              ? `${pendingChangeCount} unsaved ${pendingChangeCount === 1 ? "change" : "changes"}`
              : "All changes saved"}
          </div>
          <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" className="h-8 text-[11px] px-3 text-muted-foreground hover:text-foreground" onClick={handleCancel}>
            {pendingChangeCount > 0 ? "Discard" : "Close"}
          </Button>
          <Button className="h-8 px-5 text-xs font-semibold" onClick={handleSave} disabled={saving || pendingChangeCount === 0}>
            {saving ? (
              <>
                <WorkbenchIcon name="lucide:loader-2" size={12} className="animate-spin mr-1" />
                {isSyncing ? "Syncing…" : "Saving…"}
              </>
            ) : (
              <>
                <WorkbenchIcon name="lucide:save" size={14} className="mr-1" />
                Save changes
              </>
            )}
          </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
