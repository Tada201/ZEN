import { callCommand } from "./tauriClient";

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
}

export const dependenciesApi = {
  listStatus: () => callCommand<DependencyStatus[]>("list_dependency_status"),
};
