import { callCommand } from "./tauriClient";

export interface TerminalApprovalGrant {
  approvalId: string;
  expiresAt: string;
}

export const terminalApi = {
  requestApproval: (cwd?: string | null) =>
    callCommand<TerminalApprovalGrant>("terminal_request_approval", { cwd: cwd ?? null }),
  spawn: (cols: number, rows: number, approvalId: string, cwd?: string | null) =>
    callCommand<string>("terminal_spawn", { cols, rows, cwd: cwd ?? null, approvalId }),
  kill: (id: string) => callCommand<void>("terminal_kill", { id }),
  resize: (id: string, cols: number, rows: number) =>
    callCommand<void>("terminal_resize", { id, cols, rows }),
  readOutput: (id: string) => callCommand<string>("terminal_read_output", { id }),
  write: (id: string, data: string) =>
    callCommand<void>("terminal_write", { id, data }),
};
