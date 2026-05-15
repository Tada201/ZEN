import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Cpu, HardDrive, Monitor, Wifi, Gauge,
  Server, Zap, Thermometer, Trash2, Download,
  Activity
} from "lucide-react";

interface SystemSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function SystemSettings({ settings, onUpdate }: SystemSettingsProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">System</h3>
        <p className="text-[13px] text-muted-foreground">Hardware resources, performance tuning, and maintenance.</p>
      </div>

      <SettingsSection title="Hardware Resources" icon={Server} description="Detected system capabilities">
        <div className="grid grid-cols-2 gap-2 px-3 py-2">
          {[
            { label: "CPU", value: "8 Cores", icon: Cpu },
            { label: "Memory", value: "32 GB", icon: HardDrive },
            { label: "GPU", value: "8 GB VRAM", icon: Monitor },
            { label: "Platform", value: "Windows", icon: Wifi },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground">{item.label}</p>
                  <p className="text-[13px] font-bold text-foreground">{item.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Performance" icon={Gauge} description="Resource allocation and performance tuning">
        <SettingsRow
          label="Low Resource Mode"
          description="Reduce resource usage on constrained hardware"
          control={
            <Switch
              checked={settings["system.low-resource-mode"] === "true"}
              onCheckedChange={v => onUpdate("system.low-resource-mode", String(v))}
            />
          }
          icon={Thermometer}
        />

        <SettingsRow
          label="Max CPU Threads"
          description="Maximum threads for processing tasks"
          control={
            <Select value={settings["system.max-cpu-threads"] || "8"} onValueChange={v => onUpdate("system.max-cpu-threads", v)}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 4, 8, 16].map(n => (
                  <SelectItem key={n} value={String(n)}>{n} Threads</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          icon={Activity}
        />

        <SettingsRow
          label="GPU Offloading"
          description="Use GPU for accelerated inference"
          control={
            <Switch
              checked={settings["system.gpu-offloading"] !== "false"}
              onCheckedChange={v => onUpdate("system.gpu-offloading", String(v))}
            />
          }
          icon={Zap}
        />

        <SettingsRow
          label="Max Memory Usage"
          description="Maximum RAM allocated to the application"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <Slider
                value={[parseInt(settings["system.max-memory"] || "8")]}
                onValueChange={([v]) => onUpdate("system.max-memory", String(v))}
                min={2}
                max={32}
                step={2}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">
                {settings["system.max-memory"] || "8"}GB
              </span>
            </div>
          }
          icon={Server}
        />
      </SettingsSection>

      <SettingsSection title="Maintenance" icon={Activity} description="System upkeep and diagnostics">
        <SettingsRow
          label="Auto-Cleanup"
          description="Automatically remove temporary files and old logs"
          control={
            <Switch
              checked={settings["system.auto-cleanup"] !== "false"}
              onCheckedChange={v => onUpdate("system.auto-cleanup", String(v))}
            />
          }
          icon={Trash2}
        />

        <div className="px-3 py-2 space-y-2">
          <Button variant="outline" className="w-full justify-start gap-3 text-[13px] h-9 border-white/[0.06] hover:bg-white/[0.03] text-foreground">
            <Download className="h-4 w-4 text-muted-foreground" />
            Export Database
          </Button>
          <Button variant="outline" className="w-full justify-start gap-3 text-[13px] h-9 border-white/[0.06] hover:bg-red-500/5 text-red-400 hover:text-red-300">
            <Trash2 className="h-4 w-4" />
            Reset Factory Settings
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
