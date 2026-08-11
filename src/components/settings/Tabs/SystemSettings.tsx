import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { backupApi } from "@/api/backupApi";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSwitch } from "../ui/WorkbenchSwitch";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { systemApi, type HardwareInfo } from "@/api";
import { settingsApi } from "@/api/settingsApi";

interface SystemSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function SystemSettings({ settings, onUpdate }: SystemSettingsProps) {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [loadingHardware, setLoadingHardware] = useState(false);
  const [hardwareView, setHardwareView] = useState<"overview" | "gpus">("overview");
  const [cleanupStatus, setCleanupStatus] = useState<{ hasPreviousData: boolean; items: Array<{ category: string; path: string; exists: boolean }> } | null>(null);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"settings" | "all" | null>(null);
  const [cleanupProgress, setCleanupProgress] = useState(0);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreSource, setRestoreSource] = useState<string | null>(null);
  const [restoreInfo, setRestoreInfo] = useState<Awaited<ReturnType<typeof backupApi.inspectBackup>> | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restartPrompt, setRestartPrompt] = useState(false);

  const loadHardware = async () => {
    setLoadingHardware(true);
    setHardwareError(null);
    try {
      setHardware(await systemApi.getHardwareInfo());
    } catch (error) {
      setHardwareError(error instanceof Error ? error.message : "Failed to detect hardware");
    } finally {
      setLoadingHardware(false);
    }
  };

  useEffect(() => {
    void loadHardware();
    void settingsApi.getDataCleanupStatus().then(setCleanupStatus).catch(() => undefined);
  }, []);

  const primaryGpu = hardware?.gpus?.[0];
  const totalDiskGb = useMemo(() => {
    const bytes = hardware?.disks?.reduce((total, disk) => total + (disk.total_space || 0), 0) || 0;
    return bytes > 0 ? bytes / 1024 / 1024 / 1024 : 0;
  }, [hardware?.disks]);

  const runCleanup = async (mode: "settings" | "all") => {
    setCleanupBusy(true);
    setCleanupProgress(20);
    try {
      const result = mode === "all" ? await settingsApi.resetAllZenData() : await settingsApi.resetSettingsAndSecrets();
      setCleanupProgress(100);
      setCleanupMessage(result.message);
      toast.success(result.message);
      if (mode === "all") {
        localStorage.clear();
        toast.info("Restart Zen to finish removing databases and downloaded data.");
        await systemApi.relaunchApp();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cleanup failed");
      setCleanupMessage("Cleanup failed. Close active work and retry.");
    } finally {
      setCleanupBusy(false);
      setConfirmMode(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">System</h3>
        <p className="text-[13px] text-muted-foreground">Hardware resources, performance tuning, and maintenance.</p>
      </div>

      <SettingsSection title="Hardware Resources" icon="lucide:server" description="Detected system capabilities">
        <div className="flex gap-1 border-b border-border px-3 py-2">
          {(["overview", "gpus"] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setHardwareView(view)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium ${hardwareView === view ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              {view === "overview" ? "Overview" : `GPU Devices (${hardware?.gpus.length ?? 0})`}
            </button>
          ))}
        </div>
        {hardwareView === "overview" ? <div className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-2">
          {[
            {
              label: "CPU",
              value: hardware ? `${hardware.cores || "?"}C / ${hardware.threads || "?"}T` : loadingHardware ? "Detecting..." : "Unknown",
              detail: hardware?.cpu,
              icon: "lucide:cpu",
            },
            {
              label: "Memory",
              value: hardware ? `${hardware.memory_gb.toFixed(1)} GB` : loadingHardware ? "Detecting..." : "Unknown",
              detail: totalDiskGb > 0 ? `${totalDiskGb.toFixed(0)} GB disk total` : undefined,
              icon: "lucide:hard-drive",
            },
            {
              label: "GPU",
              value: primaryGpu ? primaryGpu.name : loadingHardware ? "Detecting..." : "Not detected",
              detail: primaryGpu?.vram_mb ? `${(primaryGpu.vram_mb / 1024).toFixed(1)} GB VRAM / ${primaryGpu.vendor}` : primaryGpu?.vendor,
              icon: "lucide:monitor",
            },
            {
              label: "Platform",
              value: hardware?.os || (loadingHardware ? "Detecting..." : "Unknown"),
              detail: hardware?.hostname,
              icon: "lucide:wifi",
            },
          ].map(item => {
            return (
              <div key={item.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40 border border-border">
                <WorkbenchIcon name={item.icon} size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground">{item.label}</p>
                  <p className="truncate text-[13px] font-bold text-foreground">{item.value}</p>
                  {item.detail && <p className="truncate text-[10px] text-muted-foreground/70">{item.detail}</p>}
                </div>
              </div>
            );
          })}
        </div> : (
          <div className="space-y-2 px-3 py-3">
            {(hardware?.gpus ?? []).map((gpu) => (
              <div key={gpu.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-foreground">{gpu.name}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{gpu.vendor} · System #{gpu.system_index} · Backend #{gpu.backend_device_index}</p>
                  <p className="mt-1 truncate font-mono text-[9px] text-muted-foreground/60" title={gpu.id}>{gpu.id}</p>
                </div>
                <div className="text-right text-[10px] text-muted-foreground">
                  <p>{gpu.vram_mb ? `${(gpu.vram_mb / 1024).toFixed(1)} GB VRAM` : "VRAM unknown"}</p>
                  <p>{gpu.driver_version ? `Driver ${gpu.driver_version}` : "Driver unknown"}</p>
                  <p className={gpu.cuda_capable ? "text-success" : "text-muted-foreground"}>{gpu.cuda_capable ? "CUDA capable" : gpu.vendor === "AMD" || gpu.vendor === "Intel" ? "Vulkan candidate" : "CPU fallback"}</p>
                </div>
              </div>
            ))}
            {!loadingHardware && (hardware?.gpus.length ?? 0) === 0 && (
              <p className="py-4 text-center text-[11px] text-muted-foreground">No GPU adapters detected.</p>
            )}
          </div>
        )}
        <div className="mb-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-foreground/80">
                Detection source: sysinfo + platform GPU probe
              </p>
              <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground/70">
                CPU, RAM, OS, and disks are queried from the OS. GPU/VRAM is best-effort and may be missing on restricted drivers or virtual adapters.
              </p>
              {hardwareError && <p className="mt-1 text-[10px] text-destructive">{hardwareError}</p>}
            </div>
            <WorkbenchButton variant="outline" size="sm" className="h-7 shrink-0 text-[11px]" onClick={() => void loadHardware()} disabled={loadingHardware}>
              <WorkbenchIcon name={loadingHardware ? "lucide:loader-2" : "lucide:refresh-cw"} size={12} className={loadingHardware ? "animate-spin" : ""} />
              Refresh
            </WorkbenchButton>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Performance" icon="lucide:gauge" description="Resource allocation and performance tuning">
        <SettingsRow
          label="Low Resource Mode"
          description="Reduce resource usage on constrained hardware"
          control={
            <WorkbenchSwitch
              checked={settings["system.low-resource-mode"] === "true"}
              onCheckedChange={v => onUpdate("system.low-resource-mode", String(v))}
            />
          }
          icon="lucide:thermometer"
        />

        <SettingsRow
          label="Hardware Acceleration"
          description="Use GPU for accelerated inference"
          control={
            <WorkbenchSwitch
              checked={settings["system.gpu-offloading"] !== "false"}
              onCheckedChange={v => onUpdate("system.gpu-offloading", String(v))}
              disabled={!hardware?.has_cuda && !primaryGpu}
            />
          }
          icon="lucide:zap"
        />
      </SettingsSection>

        <SettingsSection title="Data & Backup" icon="lucide:archive" description="Export portable data without exposing secrets">
          <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
            <p className="text-[12px] font-medium text-foreground">Portable Zen backup</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Chats, messages, and non-secret settings are saved to a verified .zenbackup file. API keys, databases, logs, runtimes, and workspace paths are excluded.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <WorkbenchButton
                variant="outline"
                size="sm"
                disabled={backupBusy}
                onClick={async () => {
                  try {
                    const destination = await save({ title: "Export Zen backup", defaultPath: "zen-backup.zenbackup", filters: [{ name: "Zen backup", extensions: ["zenbackup"] }] });
                    if (!destination) return;
                    setBackupBusy(true);
                    const result = await backupApi.exportBackup(destination, { includeMedia: false, includeIndexes: false });
                    toast.success(`Zen backup exported (${Math.round(result.bytes / 1024)} KB).`);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Backup export failed");
                  } finally { setBackupBusy(false); }
                }}
              >{backupBusy ? "Exporting…" : "Export backup"}</WorkbenchButton>
              <WorkbenchButton
                variant="ghost"
                size="sm"
                disabled={backupBusy}
                onClick={async () => {
                  try {
                    const selected = await open({ title: "Inspect Zen backup", multiple: false, filters: [{ name: "Zen backup", extensions: ["zenbackup"] }] });
                    const source = Array.isArray(selected) ? selected[0] : selected;
                    if (!source || Array.isArray(source)) return;
                    const result = await backupApi.inspectBackup(source);
                    setRestoreSource(source);
                    setRestoreInfo(result);
                    setRestoreDialogOpen(true);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Backup inspection failed");
                  }
                }}
              >Inspect backup</WorkbenchButton>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Maintenance" icon="lucide:activity" description="Automatic system upkeep">
        {cleanupStatus?.hasPreviousData && (
          <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-3 text-sm">
            <p className="font-medium text-foreground">Existing Zen data detected</p>
            <p className="mt-1 text-xs text-muted-foreground">Settings, API keys, chats, indexes, and downloaded runtimes can remain after uninstall. Cleanup is never automatic.</p>
            <div className="mt-3 flex flex-wrap gap-2">
            <WorkbenchButton
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={async () => {
                if (await systemApi.openExternalPrompt("reset")) await runCleanup("all");
              }}
            >
              Delete all Zen data
            </WorkbenchButton>
            <WorkbenchButton
              variant="ghost"
              size="sm"
              onClick={async () => {
                setConfirmMode("settings");
              }}
            >
              Reset settings and API keys
            </WorkbenchButton>
            </div>
            {cleanupMessage && <p className="mt-2 text-xs text-muted-foreground">{cleanupMessage}</p>}
          </div>
        )}
        <AlertDialog open={confirmMode !== null} onOpenChange={(open) => !open && !cleanupBusy && setConfirmMode(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmMode === "all" ? "Delete all Zen data?" : "Reset settings and API keys?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmMode === "all"
                  ? "This removes chats, databases, indexes, downloaded runtimes, models, media, and registered API keys. This cannot be undone."
                  : "This removes settings and registered API keys, while preserving chats, indexes, and downloaded runtimes."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {cleanupBusy && <Progress value={cleanupProgress} className="mt-2" />}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cleanupBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={cleanupBusy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async (event) => {
                  event.preventDefault();
                  if (!confirmMode) return;
                  setCleanupBusy(true);
                  setCleanupProgress(20);
                  try {
                    const result = confirmMode === "all"
                      ? await settingsApi.resetAllZenData()
                      : await settingsApi.resetSettingsAndSecrets();
                    setCleanupProgress(100);
                    setCleanupMessage(result.message);
                    toast.success(result.message);
                    if (confirmMode === "all") {
                      localStorage.clear();
                      toast.info("Restart Zen to finish removing databases and downloaded data.");
                      await systemApi.relaunchApp();
                    }
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Cleanup failed");
                    setCleanupMessage("Cleanup failed. Close active work and retry.");
                  } finally {
                    setCleanupBusy(false);
                    setConfirmMode(null);
                  }
                }}
              >
                {cleanupBusy ? "Working…" : confirmMode === "all" ? "Delete all data" : "Reset settings"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={restoreDialogOpen} onOpenChange={(open) => !backupBusy && setRestoreDialogOpen(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
              <AlertDialogDescription>This adds imported chats and messages while preserving existing data. API keys and workspace paths are not imported. You can restart Zen after restore if desired.</AlertDialogDescription>
            </AlertDialogHeader>
            {restoreInfo && <div className="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-3 text-[11px] text-muted-foreground"><p className="font-medium text-foreground">{restoreSource?.split(/[\\/]/).pop()}</p><p>Created: {new Date(restoreInfo.createdAt).toLocaleString()}</p><p>Zen {restoreInfo.appVersion} · Format v{restoreInfo.formatVersion} · {Math.round(restoreInfo.bytes / 1024)} KB</p><p>{restoreInfo.chatCount} chats · {restoreInfo.messageCount} messages · {restoreInfo.categories.join(" · ")}</p><p className="text-success">Secrets and workspace paths are excluded.</p></div>}
            {backupBusy && <Progress className="mt-2" />}
            {restoreError && <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{restoreError}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={backupBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={backupBusy || !restoreSource} onClick={async (event) => { event.preventDefault(); if (!restoreSource) return; setBackupBusy(true); setRestoreError(null); try { await backupApi.importBackup(restoreSource, "merge"); setRestoreDialogOpen(false); setRestartPrompt(true); toast.success("Zen backup restored as additional data."); } catch (error) { setRestoreError(error instanceof Error ? error.message : "Restore failed. No data was imported."); } finally { setBackupBusy(false); } }}>{backupBusy ? "Restoring..." : "Restore backup"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={restartPrompt} onOpenChange={setRestartPrompt}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Restore complete — restart Zen?</AlertDialogTitle><AlertDialogDescription>The backup was restored successfully. Restart Zen to refresh all application surfaces, or continue working now.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Not now</AlertDialogCancel><AlertDialogAction onClick={() => void systemApi.relaunchApp()}>Restart Zen</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
          <p className="text-[12px] font-medium text-foreground">Diagnostics</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Export sanitized app status for troubleshooting. API keys, chats, databases, logs, and file paths are excluded.</p>
          <WorkbenchButton
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={async () => {
              try {
                const destination = await save({
                  title: "Export Zen diagnostics",
                  defaultPath: "zen-diagnostics.json",
                  filters: [{ name: "Zen diagnostics", extensions: ["json"] }],
                });
                if (!destination) return;
                await systemApi.exportDiagnostics(destination);
                toast.success("Diagnostics exported without secrets or user data.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not export diagnostics");
              }
            }}
          >
            Export diagnostics
          </WorkbenchButton>
        </div>
        <SettingsRow
          label="Auto-Cleanup"
          description="Automatically remove temporary files and old logs"
          control={
            <WorkbenchSwitch
              checked={settings["system.auto-cleanup"] !== "false"}
              onCheckedChange={v => onUpdate("system.auto-cleanup", String(v))}
            />
          }
          icon="lucide:trash-2"
        />
      </SettingsSection>
    </div>
  );
}
