import { callCommand } from "./tauriClient";

export interface BackendWorkbenchTab {
  id: string;
  chatId: string;
  viewId: string;
  label: string;
  position: number;
  stateJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const workbenchApi = {
  listTabs: (chatId: string) =>
    callCommand<BackendWorkbenchTab[]>("list_workbench_tabs", { chatId }),
  upsertTab: (tab: BackendWorkbenchTab) =>
    callCommand<void>("upsert_workbench_tab", { tab }),
  deleteTab: (chatId: string, tabId: string) =>
    callCommand<void>("delete_workbench_tab", { chatId, tabId }),
};
