import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSwitch } from "../ui/WorkbenchSwitch";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchInput } from "../ui/WorkbenchInput";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

interface TerminalSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function TerminalSettings({ settings, onUpdate }: TerminalSettingsProps) {
  // TODO(config-wireup): these values persist through settings, but terminal_spawn still
  // uses the backend default shell/explicit cwd and does not consume shell, scrollback,
  // confirmation, auto-execute, or shell-integration settings yet.
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Terminal</h3>
        <p className="text-[13px] text-muted-foreground">Configure shell environment, execution safety, and integrations.</p>
      </div>

      <SettingsSection title="Shell Configuration" icon="lucide:terminal" description="Default shell and environment settings">
        <SettingsRow
          label="Default Shell"
          description="Command shell to use for executions"
          control={
            <WorkbenchSelect
              value={settings["terminal.shell"] || "powershell"}
              onValueChange={v => onUpdate("terminal.shell", v)}
              options={[
                { value: "powershell", label: "PowerShell" },
                { value: "cmd", label: "CMD" },
                { value: "bash", label: "Bash (WSL)" },
                { value: "wsl", label: "WSL" },
              ]}
              width={140}
            />
          }
          icon="lucide:terminal"
        />

        <SettingsRow
          label="Working Directory"
          description="Default directory for new terminal sessions"
          control={
            <div className="flex items-center gap-1.5 w-[200px]">
              <WorkbenchIcon name="lucide:folder-open" className="text-muted-foreground shrink-0" size={14} />
              <WorkbenchInput
                value={settings["terminal.working-dir"] || ""}
                onChange={e => onUpdate("terminal.working-dir", e.target.value)}
                placeholder="Workspace root..."
                className="h-8 text-xs bg-background/50"
              />
            </div>
          }
          icon="lucide:folder-open"
        />

        <SettingsRow
          label="Scrollback Buffer"
          description="Number of lines to retain in terminal history"
          control={
            <WorkbenchSelect
              value={settings["terminal.scrollback"] || "5000"}
              onValueChange={v => onUpdate("terminal.scrollback", v)}
              options={[
                { value: "1000", label: "1,000" },
                { value: "5000", label: "5,000" },
                { value: "10000", label: "10,000" },
                { value: "50000", label: "50,000" },
              ]}
              width={120}
            />
          }
          icon="lucide:file-text"
        />
      </SettingsSection>

      <SettingsSection title="Execution Safety" icon="lucide:shield" description="Security and safety controls">
        <div className="px-3 py-2">
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10 mb-3">
            <WorkbenchIcon name="lucide:alert-triangle" className="text-amber-400 shrink-0 mt-0.5" size={16} />
            <p className="text-[11px] text-amber-300/80">
              Terminal commands have full system access. Configure safety measures to prevent accidental destructive operations.
            </p>
          </div>
        </div>

        <SettingsRow
          label="Confirm Commands"
          description="Require confirmation before executing destructive commands"
          control={
            <WorkbenchSwitch
              checked={settings["terminal.confirm-commands"] !== "false"}
              onCheckedChange={v => onUpdate("terminal.confirm-commands", String(v))}
            />
          }
          icon="lucide:shield"
        />

        <SettingsRow
          label="Auto-Execute"
          description="Automatically execute commands without confirmation"
          control={
            <WorkbenchSwitch
              checked={settings["terminal.auto-execute"] === "true"}
              onCheckedChange={v => onUpdate("terminal.auto-execute", String(v))}
            />
          }
          icon="lucide:zap"
        />

        <SettingsRow
          label="Command Timeout"
          description="Maximum execution time before timeout"
          control={
            <WorkbenchSelect
              value={settings["terminal.timeout"] || "30"}
              onValueChange={v => onUpdate("terminal.timeout", v)}
              options={[
                { value: "10", label: "10 seconds" },
                { value: "30", label: "30 seconds" },
                { value: "60", label: "1 minute" },
                { value: "300", label: "5 minutes" },
                { value: "600", label: "10 minutes" },
              ]}
              width={120}
            />
          }
          icon="lucide:clock"
        />
      </SettingsSection>

      <SettingsSection title="Integration" icon="lucide:git-branch" description="External tool and environment integration">
        <SettingsRow
          label="Shell Integration"
          description="Enable enhanced shell features and rich output"
          control={
            <WorkbenchSwitch
              checked={settings["terminal.shell-integration"] !== "false"}
              onCheckedChange={v => onUpdate("terminal.shell-integration", String(v))}
            />
          }
          icon="lucide:link-2"
        />

        <SettingsRow
          label="Custom Environment Variables"
          description="Pass custom env vars to terminal sessions"
          control={
            <WorkbenchSwitch
              checked={settings["terminal.env-vars"] === "true"}
              onCheckedChange={v => onUpdate("terminal.env-vars", String(v))}
            />
          }
          icon="lucide:git-branch"
        />
      </SettingsSection>
    </div>
  );
}
