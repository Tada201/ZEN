import { callCommand } from "./tauriClient";

export interface TerminalApprovalGrant {
  approvalId: string;
  expiresAt: string;
}

export interface TerminalOutputSnapshot {
  sequence: number;
  data: string;
}

export const terminalApi = {
  requestApproval: (chatId: string, cwd?: string | null) =>
    callCommand<TerminalApprovalGrant>("terminal_request_approval", { chatId, cwd: cwd ?? null }),
  spawn: (chatId: string, cols: number, rows: number, approvalId: string, cwd?: string | null) =>
    callCommand<string>("terminal_spawn", { chatId, cols, rows, cwd: cwd ?? null, approvalId }),
  kill: (chatId: string, id: string) => callCommand<void>("terminal_kill", { chatId, id }),
  resize: (chatId: string, id: string, cols: number, rows: number) =>
    callCommand<void>("terminal_resize", { chatId, id, cols, rows }),
  readOutput: (chatId: string, id: string) => callCommand<TerminalOutputSnapshot>("terminal_read_output", { chatId, id }),
  write: (chatId: string, id: string, data: string) =>
    callCommand<void>("terminal_write", { chatId, id, data }),
};
