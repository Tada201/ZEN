import { callCommand } from "./tauriClient";

export const SECRET_PRESENT_VALUE = "__ZEN_SECRET_PRESENT__";

export function isSecretPresentValue(value: unknown): value is typeof SECRET_PRESENT_VALUE {
  return value === SECRET_PRESENT_VALUE;
}

export const settingsApi = {
  getAllSettings: () => callCommand<Record<string, string>>("get_all_settings"),
  setSetting: (key: string, value: string) =>
    callCommand<void>("set_setting", { key, value }),
  deleteSecret: (key: string) =>
    callCommand<void>("delete_secret", { key }),
  setSettings: (settings: Record<string, string>) =>
    callCommand<void>("set_settings", { settings }),
};
