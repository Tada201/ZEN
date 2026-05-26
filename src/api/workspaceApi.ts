import { callCommand } from "./tauriClient";

export interface FolderEntry {
  name: string;
  path: string;
}

export interface BrowseFolderResult {
  current?: string;
  parent?: string | null;
  directories?: FolderEntry[];
  entries?: Array<{ name: string; type: string; path: string }>;
}

export const workspaceApi = {
  browseFolder: (path?: string | null) =>
    callCommand<BrowseFolderResult>("browseFolder", { path: path ?? null }),
};
