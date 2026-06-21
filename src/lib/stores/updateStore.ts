import { create } from 'zustand';
import { settingsApi } from '@/api';

export interface UpdateState {
    currentVersion: string;
    latestVersion: string | null;
    releaseNotes: string | null;
    updateAvailable: boolean;
    isChecking: boolean;
    isDownloading: boolean;
    downloadProgress: number;
    autoCheckEnabled: boolean;
    checkBeta: boolean;
    lastCheck: number | null;
    error: string | null;
    availableUpdate: null;

    init: (settings?: Record<string, string>) => Promise<void>;
    checkForUpdates: (notifyUpToDate?: boolean) => Promise<void>;
    downloadAndInstallUpdate: () => Promise<void>;
    setUpdateConfig: (config: Partial<Pick<UpdateState, 'autoCheckEnabled' | 'checkBeta'>>) => Promise<void>;
    dismissUpdate: () => void;
}

const UPDATES_DISABLED_MESSAGE = 'Updates are disabled for this build.';

export const useUpdateStore = create<UpdateState>((set, get) => ({
    currentVersion: '',
    latestVersion: null,
    releaseNotes: null,
    updateAvailable: false,
    isChecking: false,
    isDownloading: false,
    downloadProgress: 0,
    autoCheckEnabled: true,
    checkBeta: false,
    lastCheck: null,
    error: null,
    availableUpdate: null,

    init: async (settings?: Record<string, string>) => {
        try {
            const { getVersion } = await import('@tauri-apps/api/app');
            set({ currentVersion: await getVersion() });
        } catch {
            set({ currentVersion: '0.0.0' });
        }

        if (settings?.auto_check_updates !== undefined) {
            set({ autoCheckEnabled: settings.auto_check_updates === 'true' });
        }
        if (settings?.check_beta_updates !== undefined) {
            set({ checkBeta: settings.check_beta_updates === 'true' });
        }
    },

    checkForUpdates: async (_notifyUpToDate = true) => {
        if (get().isChecking) return;

        // A try/catch cannot make a missing dynamic import optional: Vite resolves
        // it during transformation. Do not import the intentionally disabled
        // updater plugin until the signed release pipeline is enabled.
        set({ isChecking: false, error: UPDATES_DISABLED_MESSAGE });
    },

    downloadAndInstallUpdate: async () => {
        set({
            isDownloading: false,
            downloadProgress: 0,
            error: UPDATES_DISABLED_MESSAGE,
        });
    },

    setUpdateConfig: async (config) => {
        set(config);

        try {
            if (config.autoCheckEnabled !== undefined) {
                await settingsApi.setSetting('auto_check_updates', String(config.autoCheckEnabled));
            }
            if (config.checkBeta !== undefined) {
                await settingsApi.setSetting('check_beta_updates', String(config.checkBeta));
            }
        } catch {
            // Keep the in-memory preference when the backend is unavailable.
        }
    },

    dismissUpdate: () => {
        set({
            updateAvailable: false,
            availableUpdate: null,
            latestVersion: null,
            releaseNotes: null,
        });
    },
}));
