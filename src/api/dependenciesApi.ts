import { callCommand } from "./tauriClient";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface DependencyStatus {
  id: string;
  name: string;
  feature: string;
  required: boolean;
  installed: boolean;
  status: string;
  detectedPath?: string | null;
  version?: string | null;
  installCommand?: string | null;
  downloadUrl?: string | null;
  notes: string;
  managed: boolean;
}

export interface DependencyInstallResult {
  id: string;
  installed: boolean;
  message: string;
  installedPaths: string[];
}

export const dependenciesApi = {
  listStatus: () => callCommand<DependencyStatus[]>("list_dependency_status"),
  installManaged: (id: string) =>
    callCommand<DependencyInstallResult>("install_managed_dependency", { id }),
  openSource: (url: string) => openUrl(url),
};
