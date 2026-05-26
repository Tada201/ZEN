import { invoke, type InvokeArgs } from "@tauri-apps/api/core";

export type IpcErrorCode =
  | "IPC_COMMAND_ERROR"
  | "IPC_TRANSPORT_ERROR"
  | "IPC_UNKNOWN_ERROR";

export interface IpcErrorPayload {
  code: IpcErrorCode;
  command: string;
  message: string;
  raw: unknown;
}

export class IpcCommandError extends Error implements IpcErrorPayload {
  readonly code: IpcErrorCode;
  readonly command: string;
  readonly raw: unknown;

  constructor(payload: IpcErrorPayload) {
    super(payload.message);
    this.name = "IpcCommandError";
    this.code = payload.code;
    this.command = payload.command;
    this.raw = payload.raw;
  }
}

export function isIpcCommandError(error: unknown): error is IpcCommandError {
  return error instanceof IpcCommandError;
}

export function getIpcErrorMessage(error: unknown, fallback = "Command failed"): string {
  if (isIpcCommandError(error)) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" && message ? message : fallback;
  }
  return fallback;
}

function normalizeIpcError(command: string, raw: unknown): IpcCommandError {
  if (isIpcCommandError(raw)) return raw;

  if (typeof raw === "string") {
    return new IpcCommandError({
      code: "IPC_COMMAND_ERROR",
      command,
      message: raw,
      raw,
    });
  }

  if (raw instanceof Error) {
    return new IpcCommandError({
      code: "IPC_TRANSPORT_ERROR",
      command,
      message: raw.message || "Tauri IPC transport failed",
      raw,
    });
  }

  if (raw && typeof raw === "object" && "message" in raw) {
    const message = (raw as { message?: unknown }).message;
    return new IpcCommandError({
      code: "IPC_COMMAND_ERROR",
      command,
      message: typeof message === "string" && message ? message : "Command failed",
      raw,
    });
  }

  return new IpcCommandError({
    code: "IPC_UNKNOWN_ERROR",
    command,
    message: "Command failed",
    raw,
  });
}

export async function callCommand<Response>(
  command: string,
  args?: InvokeArgs,
): Promise<Response> {
  try {
    return await invoke<Response>(command, args);
  } catch (error) {
    throw normalizeIpcError(command, error);
  }
}
