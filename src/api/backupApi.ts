import { callCommand } from "./tauriClient";

export interface BackupOptions {
  includeMedia: boolean;
  includeIndexes: boolean;
}

export interface BackupInspection {
  formatVersion: number;
  appVersion: string;
  createdAt: string;
  categories: string[];
  bytes: number;
  secretsExcluded: boolean;
  workspaceRootsExcluded: boolean;
  chatCount: number;
  messageCount: number;
}

export interface BackupSummary {
  chatCount: number;
  messageCount: number;
  settingCount: number;
  secretsExcluded: boolean;
}

export const backupApi = {
  getSummary: () => callCommand<BackupSummary>("get_backup_summary"),
  exportBackup: (destination: string, options: BackupOptions) =>
    callCommand<BackupInspection>("export_zen_backup", { destination, options }),
  inspectBackup: (source: string) =>
    callCommand<BackupInspection>("inspect_zen_backup", { source }),
  importBackup: (source: string, mode: "merge" | "replace", confirmation?: string) =>
    callCommand<BackupInspection>("import_zen_backup", { source, mode, confirmation }),
};
