import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Terminal, TerminalSquare, Shield, Clock, Zap,
  FolderOpen, Link2, GitBranch, AlertTriangle,
  FileText
} from "lucide-react";

interface TerminalSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function TerminalSettings({ settings, onUpdate }: TerminalSettingsProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Terminal</h3>
        <p className="text-[13px] text-muted-foreground">Configure shell environment, execution safety, and integrations.</p>
      </div>

      <SettingsSection title="Shell Configuration" icon={Terminal} description="Default shell and environment settings">
        <SettingsRow
          label="Default Shell"
          description="Command shell to use for executions"
          control={
            <Select value={settings["terminal.shell"] || "powershell"} onValueChange={v => onUpdate("terminal.shell", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="powershell">PowerShell</SelectItem>
                <SelectItem value="cmd">CMD</SelectItem>
                <SelectItem value="bash">Bash (WSL)</SelectItem>
                <SelectItem value="wsl">WSL</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={TerminalSquare}
        />

        <SettingsRow
          label="Working Directory"
          description="Default directory for new terminal sessions"
          control={
            <div className="flex items-center gap-1.5 w-[200px]">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                value={settings["terminal.working-dir"] || ""}
                onChange={e => onUpdate("terminal.working-dir", e.target.value)}
                placeholder="Workspace root..."
                className="h-8 text-xs bg-background/50"
              />
            </div>
          }
          icon={FolderOpen}
        />

        <SettingsRow
          label="Scrollback Buffer"
          description="Number of lines to retain in terminal history"
          control={
            <Select value={settings["terminal.scrollback"] || "5000"} onValueChange={v => onUpdate("terminal.scrollback", v)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1000">1,000</SelectItem>
                <SelectItem value="5000">5,000</SelectItem>
                <SelectItem value="10000">10,000</SelectItem>
                <SelectItem value="50000">50,000</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={FileText}
        />
      </SettingsSection>

      <SettingsSection title="Execution Safety" icon={Shield} description="Security and safety controls">
        <div className="px-3 py-2">
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-300/80">
              Terminal commands have full system access. Configure safety measures to prevent accidental destructive operations.
            </p>
          </div>
        </div>

        <SettingsRow
          label="Confirm Commands"
          description="Require confirmation before executing destructive commands"
          control={
            <Switch
              checked={settings["terminal.confirm-commands"] !== "false"}
              onCheckedChange={v => onUpdate("terminal.confirm-commands", String(v))}
            />
          }
          icon={Shield}
        />

        <SettingsRow
          label="Auto-Execute"
          description="Automatically execute commands without confirmation"
          control={
            <Switch
              checked={settings["terminal.auto-execute"] === "true"}
              onCheckedChange={v => onUpdate("terminal.auto-execute", String(v))}
            />
          }
          icon={Zap}
        />

        <SettingsRow
          label="Command Timeout"
          description="Maximum execution time before timeout"
          control={
            <Select value={settings["terminal.timeout"] || "30"} onValueChange={v => onUpdate("terminal.timeout", v)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
                <SelectItem value="600">10 minutes</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={Clock}
        />
      </SettingsSection>

      <SettingsSection title="Integration" icon={GitBranch} description="External tool and environment integration">
        <SettingsRow
          label="Shell Integration"
          description="Enable enhanced shell features and rich output"
          control={
            <Switch
              checked={settings["terminal.shell-integration"] !== "false"}
              onCheckedChange={v => onUpdate("terminal.shell-integration", String(v))}
            />
          }
          icon={Link2}
        />

        <SettingsRow
          label="Custom Environment Variables"
          description="Pass custom env vars to terminal sessions"
          control={
            <Switch
              checked={settings["terminal.env-vars"] === "true"}
              onCheckedChange={v => onUpdate("terminal.env-vars", String(v))}
            />
          }
          icon={GitBranch}
        />
      </SettingsSection>
    </div>
  );
}
