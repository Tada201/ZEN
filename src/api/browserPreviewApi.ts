import { callCommand } from "./tauriClient";
import { listen } from "@tauri-apps/api/event";

export interface PreviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ConsoleEntry {
  level: string;
  text: string;
  ts: number;
}

export const BROWSER_CONSOLE_EVENT = "browser:preview:console";

/** Typed wrappers over the embedded WebView2 preview commands. */
export const browserPreviewApi = {
  attach: (bounds: PreviewBounds, url: string, allowLoopback = false) =>
    callCommand<string>("browser_preview_attach", { bounds, url, allowLoopback }),
  setBounds: (bounds: PreviewBounds) =>
    callCommand<void>("browser_preview_set_bounds", { bounds }),
  navigate: (url: string, allowLoopback = false) =>
    callCommand<string>("browser_preview_navigate", { url, allowLoopback }),
  reload: () => callCommand<void>("browser_preview_reload"),
  hide: () => callCommand<void>("browser_preview_hide"),
  detach: () => callCommand<void>("browser_preview_detach"),
  consoleTail: (limit = 200) =>
    callCommand<ConsoleEntry[]>("browser_preview_console_tail", { limit }),
  /** Subscribe to live console/error entries from the preview page. */
  onConsole: (handler: (entry: ConsoleEntry) => void) =>
    listen<ConsoleEntry>(BROWSER_CONSOLE_EVENT, (e) => handler(e.payload)),
};

