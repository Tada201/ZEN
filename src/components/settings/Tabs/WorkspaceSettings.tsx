import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { FolderBrowser } from "@/atlas/components/FolderBrowser";

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

      <SettingsSection title="Directories" icon="lucide:folder-open" description="Workspace and data paths">
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground">Workspace Root</label>
            <FolderBrowser
              value={settings["workspace.root"] || ""}
              onChange={(path) => onUpdate("workspace.root", path)}
            />
            <p className="text-xs text-muted-foreground">
              File tools apply this workspace root after settings are saved.
            </p>
          </div>

        </div>
      </SettingsSection>

      <SettingsSection title="Security Architecture" icon="lucide:shield" description="Sandboxing and file access controls">
        <div className="rounded-lg border border-border bg-card px-3 py-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <WorkbenchIcon name="lucide:lock" size={14} />
            Workspace sandbox enforced
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            File tools can read and write only inside the active workspace root. External paths are blocked by the backend.
          </p>
        </div>

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
        <div className="rounded-lg border border-border bg-card px-3 py-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <WorkbenchIcon name="lucide:git-branch" size={14} />
            Git automation is not enabled
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            File tools return diffs, but they do not stage or commit changes automatically.
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}
