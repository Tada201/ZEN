import { useEffect, useMemo, useState } from "react";
import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSwitch } from "../ui/WorkbenchSwitch";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { systemApi, type HardwareInfo } from "@/api";

interface SystemSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function SystemSettings({ settings, onUpdate }: SystemSettingsProps) {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [loadingHardware, setLoadingHardware] = useState(false);

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
  }, []);

  const primaryGpu = hardware?.gpus?.[0];
  const totalDiskGb = useMemo(() => {
    const bytes = hardware?.disks?.reduce((total, disk) => total + (disk.total_space || 0), 0) || 0;
    return bytes > 0 ? bytes / 1024 / 1024 / 1024 : 0;
  }, [hardware?.disks]);


  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">System</h3>
        <p className="text-[13px] text-muted-foreground">Hardware resources, performance tuning, and maintenance.</p>
      </div>

      <SettingsSection title="Hardware Resources" icon="lucide:server" description="Detected system capabilities">
        <div className="grid grid-cols-2 gap-2 px-3 py-2">
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
              <div key={item.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <WorkbenchIcon name={item.icon} size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground">{item.label}</p>
                  <p className="truncate text-[13px] font-bold text-foreground">{item.value}</p>
                  {item.detail && <p className="truncate text-[10px] text-muted-foreground/70">{item.detail}</p>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mx-3 mb-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
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
        <div className="mx-3 mb-2 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-amber-200/90">
          <WorkbenchIcon name="lucide:alert-triangle" size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-[11px] font-medium leading-none">Settings Under Construction</p>
            <p className="text-[10px] text-amber-200/60 leading-normal">
              Not working — TODO: wire the app properly
            </p>
          </div>
        </div>

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

      <SettingsSection title="Maintenance" icon="lucide:activity" description="System upkeep and diagnostics">
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

        <div className="px-3 py-2 space-y-2">
          <WorkbenchButton variant="outline" className="w-full justify-start gap-3 h-9 text-[13px]">
            <WorkbenchIcon name="lucide:download" size={16} className="text-muted-foreground" />
            Export Database
          </WorkbenchButton>
          <WorkbenchButton variant="outline" className="w-full justify-start gap-3 h-9 text-[13px] hover:bg-red-500/5 text-red-400 hover:text-red-300">
            <WorkbenchIcon name="lucide:trash-2" size={16} />
            Reset Factory Settings
          </WorkbenchButton>
        </div>
      </SettingsSection>
    </div>
  );
}
