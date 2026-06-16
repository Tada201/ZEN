import { callCommand } from "./tauriClient";

export const terminalApi = {
  spawn: (cols: number, rows: number, cwd?: string | null, userApproved = false) =>
    callCommand<string>("terminal_spawn", { cols, rows, cwd: cwd ?? null, userApproved }),
  kill: (id: string) => callCommand<void>("terminal_kill", { id }),
  resize: (id: string, cols: number, rows: number) =>
    callCommand<void>("terminal_resize", { id, cols, rows }),
  write: (id: string, data: string) =>
    callCommand<void>("terminal_write", { id, data }),
};
