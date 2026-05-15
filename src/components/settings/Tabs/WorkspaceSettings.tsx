import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  FolderOpen, Shield, Lock,
  FileText, GitBranch, GitMerge, HardDrive,
  Globe
} from "lucide-react";

interface WorkspaceSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function WorkspaceSettings({ settings, onUpdate }: WorkspaceSettingsProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Workspace</h3>
        <p className="text-[13px] text-muted-foreground">Configure directories, security sandboxing, and Git integration.</p>
      </div>

      <SettingsSection title="Directories" icon={FolderOpen} description="Workspace and data paths">
        <div className="px-3 py-2 space-y-3">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground/80">Workspace Root</label>
            <div className="flex gap-1.5">
              <Input
                value={settings["workspace.root"] || ""}
                onChange={e => onUpdate("workspace.root", e.target.value)}
                placeholder="D:/Projects/MyWorkspace"
                className="flex-1 h-8 text-xs bg-background/50"
              />
              <Button variant="outline" size="sm" className="h-8 text-xs border-white/[0.06]">
                <FolderOpen className="h-3.5 w-3.5 mr-1" />
                Browse
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              File tools (read, list, bash) are scoped to this directory.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground/80">Data Directory</label>
            <div className="flex gap-1.5">
              <Input
                value={settings["workspace.data-dir"] || ""}
                onChange={e => onUpdate("workspace.data-dir", e.target.value)}
                placeholder="~/.zen"
                className="flex-1 h-8 text-xs bg-background/50"
              />
              <Button variant="outline" size="sm" className="h-8 text-xs border-white/[0.06]">
                <FolderOpen className="h-3.5 w-3.5 mr-1" />
                Browse
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              Application data, vector stores, and cached models.
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Security Architecture" icon={Shield} description="Sandboxing and file access controls">
        <SettingsRow
          label="Sandbox Mode"
          description="Restrict file access to workspace root only"
          control={
            <Switch
              checked={settings["workspace.sandbox"] !== "false"}
              onCheckedChange={v => onUpdate("workspace.sandbox", String(v))}
            />
          }
          icon={Lock}
        />

        <SettingsRow
          label="Confirm File Writes"
          description="Require approval before creating or modifying files"
          control={
            <Switch
              checked={settings["workspace.confirm-writes"] === "true"}
              onCheckedChange={v => onUpdate("workspace.confirm-writes", String(v))}
            />
          }
          icon={FileText}
        />

        <SettingsRow
          label="Allow External Paths"
          description="Permit access to files outside workspace root"
          control={
            <Switch
              checked={settings["workspace.allow-external-paths"] === "true"}
              onCheckedChange={v => onUpdate("workspace.allow-external-paths", String(v))}
            />
          }
          icon={Globe}
        />

        <SettingsRow
          label="Maximum File Size"
          description="Largest file the AI can read (MB)"
          control={
            <Select value={settings["workspace.max-file-size"] || "10"} onValueChange={v => onUpdate("workspace.max-file-size", v)}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 MB</SelectItem>
                <SelectItem value="5">5 MB</SelectItem>
                <SelectItem value="10">10 MB</SelectItem>
                <SelectItem value="25">25 MB</SelectItem>
                <SelectItem value="50">50 MB</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={HardDrive}
        />
      </SettingsSection>

      <SettingsSection title="Git Integration" icon={GitBranch} description="Version control preferences">
        <SettingsRow
          label="Auto-Stage"
          description="Automatically stage files on edit"
          control={
            <Switch
              checked={settings["workspace.auto-stage"] !== "false"}
              onCheckedChange={v => onUpdate("workspace.auto-stage", String(v))}
            />
          }
          icon={GitMerge}
        />

        <SettingsRow
          label="Commit Confirmation"
          description="Require confirmation before creating commits"
          control={
            <Switch
              checked={settings["workspace.commit-confirmation"] !== "false"}
              onCheckedChange={v => onUpdate("workspace.commit-confirmation", String(v))}
            />
          }
          icon={GitBranch}
        />
      </SettingsSection>
    </div>
  );
}
