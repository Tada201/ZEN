import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSwitch } from "../ui/WorkbenchSwitch";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchInput } from "../ui/WorkbenchInput";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

interface WorkspaceSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function WorkspaceSettings({ settings, onUpdate }: WorkspaceSettingsProps) {
  // TODO(config-wireup): workspace.root persists, but the Rust AppState.workspace_folder
  // is only initialized at startup. Add a backend command to validate and update the
  // live workspace root before claiming file tools immediately follow this setting.
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Workspace</h3>
        <p className="text-[13px] text-muted-foreground">Configure directories, security sandboxing, and Git integration.</p>
      </div>

      <SettingsSection title="Directories" icon="lucide:folder-open" description="Workspace and data paths">
        <div className="px-3 py-2 space-y-3">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground/80">Workspace Root</label>
            <div className="flex gap-1.5">
              <WorkbenchInput
                value={settings["workspace.root"] || ""}
                onChange={e => onUpdate("workspace.root", e.target.value)}
                placeholder="D:/Projects/MyWorkspace"
                className="flex-1 h-8 text-xs bg-background/50"
              />
              <WorkbenchButton variant="outline" size="sm" className="h-8">
                <WorkbenchIcon name="lucide:folder-open" size={14} className="mr-1" />
                Browse
              </WorkbenchButton>
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              File tools (read, list, bash) are scoped to this directory.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground/80">Data Directory</label>
            <div className="flex gap-1.5">
              <WorkbenchInput
                value={settings["workspace.data-dir"] || ""}
                onChange={e => onUpdate("workspace.data-dir", e.target.value)}
                placeholder="~/.zen"
                className="flex-1 h-8 text-xs bg-background/50"
              />
              <WorkbenchButton variant="outline" size="sm" className="h-8">
                <WorkbenchIcon name="lucide:folder-open" size={14} className="mr-1" />
                Browse
              </WorkbenchButton>
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              Application data, vector stores, and cached models.
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Security Architecture" icon="lucide:shield" description="Sandboxing and file access controls">
        <SettingsRow
          label="Sandbox Mode"
          description="Restrict file access to workspace root only"
          control={
            <WorkbenchSwitch
              checked={settings["workspace.sandbox"] !== "false"}
              onCheckedChange={v => onUpdate("workspace.sandbox", String(v))}
            />
          }
          icon="lucide:lock"
        />

        <SettingsRow
          label="Confirm File Writes"
          description="Require approval before creating or modifying files"
          control={
            <WorkbenchSwitch
              checked={settings["workspace.confirm-writes"] === "true"}
              onCheckedChange={v => onUpdate("workspace.confirm-writes", String(v))}
            />
          }
          icon="lucide:file-text"
        />

        <SettingsRow
          label="Allow External Paths"
          description="Permit access to files outside workspace root"
          control={
            <WorkbenchSwitch
              checked={settings["workspace.allow-external-paths"] === "true"}
              onCheckedChange={v => onUpdate("workspace.allow-external-paths", String(v))}
            />
          }
          icon="lucide:globe"
        />

        <SettingsRow
          label="Maximum File Size"
          description="Largest file the AI can read (MB)"
          control={
            <WorkbenchSelect
              value={settings["workspace.max-file-size"] || "10"}
              onValueChange={v => onUpdate("workspace.max-file-size", v)}
              options={[
                { value: "1", label: "1 MB" },
                { value: "5", label: "5 MB" },
                { value: "10", label: "10 MB" },
                { value: "25", label: "25 MB" },
                { value: "50", label: "50 MB" },
              ]}
              width={100}
            />
          }
          icon="lucide:hard-drive"
        />
      </SettingsSection>

      <SettingsSection title="Git Integration" icon="lucide:git-branch" description="Version control preferences">
        <SettingsRow
          label="Auto-Stage"
          description="Automatically stage files on edit"
          control={
            <WorkbenchSwitch
              checked={settings["workspace.auto-stage"] !== "false"}
              onCheckedChange={v => onUpdate("workspace.auto-stage", String(v))}
            />
          }
          icon="lucide:git-merge"
        />

        <SettingsRow
          label="Commit Confirmation"
          description="Require confirmation before creating commits"
          control={
            <WorkbenchSwitch
              checked={settings["workspace.commit-confirmation"] !== "false"}
              onCheckedChange={v => onUpdate("workspace.commit-confirmation", String(v))}
            />
          }
          icon="lucide:git-branch"
        />
      </SettingsSection>
    </div>
  );
}
