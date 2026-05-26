import { invoke, type InvokeArgs } from "@tauri-apps/api/core";

export function callCommand<Response>(
  command: string,
  args?: InvokeArgs,
): Promise<Response> {
  return invoke<Response>(command, args);
}
