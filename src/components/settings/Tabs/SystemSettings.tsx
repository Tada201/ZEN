import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSwitch } from "../ui/WorkbenchSwitch";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchSlider } from "../ui/WorkbenchSlider";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

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

      <SettingsSection title="Hardware Resources" icon="lucide:server" description="Detected system capabilities">
        <div className="grid grid-cols-2 gap-2 px-3 py-2">
          {[
            { label: "CPU", value: "8 Cores", icon: "lucide:cpu" },
            { label: "Memory", value: "32 GB", icon: "lucide:hard-drive" },
            { label: "GPU", value: "8 GB VRAM", icon: "lucide:monitor" },
            { label: "Platform", value: "Windows", icon: "lucide:wifi" },
          ].map(item => {
            return (
              <div key={item.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <WorkbenchIcon name={item.icon} size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground">{item.label}</p>
                  <p className="text-[13px] font-bold text-foreground">{item.value}</p>
                </div>
              </div>
            );
          })}
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
          label="Max CPU Threads"
          description="Maximum threads for processing tasks"
          control={
            <WorkbenchSelect
              value={settings["system.max-cpu-threads"] || "8"}
              onValueChange={v => onUpdate("system.max-cpu-threads", v)}
              options={[2, 4, 8, 16].map(n => ({ value: String(n), label: `${n} Threads` }))}
              width={100}
            />
          }
          icon="lucide:activity"
        />

        <SettingsRow
          label="GPU Offloading"
          description="Use GPU for accelerated inference"
          control={
            <WorkbenchSwitch
              checked={settings["system.gpu-offloading"] !== "false"}
              onCheckedChange={v => onUpdate("system.gpu-offloading", String(v))}
            />
          }
          icon="lucide:zap"
        />

        <SettingsRow
          label="Max Memory Usage"
          description="Maximum RAM allocated to the application"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <WorkbenchSlider
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
          icon="lucide:server"
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
