import { callCommand } from "./tauriClient";

/**
 * Frontend wrapper for the Rust wallpaper commands.
 *
 * The wallpaper file is owned by the backend: `set_wallpaper_from_path`
 * copies the user-picked file into `$APPDATA/media/wallpapers/` (isolated
 * from `generated_images/`), evicts any prior wallpaper, and persists the
 * in-scope path to `ui.background-image`. The webview never receives a raw
 * external path, so the asset protocol scope can stay tight.
 */
export const mediaApi = {
  /** Copy the user-picked file into the app's wallpapers folder. Returns the new in-scope absolute path. */
  setWallpaperFromPath: (sourcePath: string): Promise<string> =>
    callCommand<string>("set_wallpaper_from_path", { sourcePath }),

  /** Delete the active wallpaper file and clear the setting. Returns true if a file was removed. */
  clearWallpaper: (): Promise<boolean> => callCommand<boolean>("clear_wallpaper"),

  /** Returns the absolute path of the active wallpaper, or null if unset. */
  getCurrentWallpaper: (): Promise<string | null> =>
    callCommand<string | null>("get_current_wallpaper"),
};
