import { create } from 'zustand';
import { settingsApi } from '@/api';

export interface UpdateState {
    currentVersion: string;
    latestVersion: string | null;
    releaseNotes: string | null;
    updateAvailable: boolean;
    isChecking: boolean;
    isDownloading: boolean;
    downloadProgress: number; // 0 to 100
    autoCheckEnabled: boolean;
    checkBeta: boolean;
    lastCheck: number | null;
    error: string | null;
    availableUpdate: any | null; // Update type from @tauri-apps/plugin-updater

    init: (settings?: Record<string, string>) => Promise<void>;
    checkForUpdates: (notifyUpToDate?: boolean) => Promise<void>;
    downloadAndInstallUpdate: () => Promise<void>;
    setUpdateConfig: (config: Partial<Pick<UpdateState, 'autoCheckEnabled' | 'checkBeta'>>) => Promise<void>;
    dismissUpdate: () => void;
}

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
            const currentVersion = await getVersion();
            set({ currentVersion });
        } catch {
            set({ currentVersion: '0.0.0' });
        }

        // Use provided settings or check localStorage
        if (settings) {
            if (settings['auto_check_updates'] !== undefined) {
                set({ autoCheckEnabled: settings['auto_check_updates'] === 'true' });
            }
            if (settings['check_beta_updates'] !== undefined) {
                set({ checkBeta: settings['check_beta_updates'] === 'true' });
            }
        }
    },

    checkForUpdates: async (_notifyUpToDate = true) => {
        const { isChecking } = get();
        if (isChecking) return;

        set({ isChecking: true, error: null });

        try {
            // Dynamic import with fallback for non-Tauri environments
            let check: any;
            try {
                // @ts-ignore
                const module = await import('@tauri-apps/plugin-updater');
                check = module.check;
            } catch {
                // Plugin not installed - skip update check
                set({ isChecking: false, error: null });
                return;
            }

            const update = await check();
            set({
                isChecking: false,
                lastCheck: Date.now(),
                availableUpdate: update,
                latestVersion: update?.version ?? null,
                updateAvailable: !!update,
            });

            if (update) {
                // Backend get_release_notes not yet implemented — rely on update.body
                set({ releaseNotes: update.body ?? null });
            }
        } catch (error) {
            set({
                isChecking: false,
                error: error instanceof Error ? error.message : 'Update check failed',
            });
        }
    },

    downloadAndInstallUpdate: async () => {
        const { availableUpdate, isDownloading } = get();
        if (!availableUpdate || isDownloading) return;

        set({ isDownloading: true, downloadProgress: 0 });

        try {
            const update = availableUpdate;

            // Handle case where updater plugin is not installed
            if (typeof (update as any).downloadAndInstall !== 'function') {
                set({ isDownloading: false, error: 'Updater plugin not installed' });
                return;
            }

            // Download with progress
            await (update as any).downloadAndInstall((event: { event: string; data: { contentLength?: number; chunk: Uint8Array } }) => {
                if (event.event === 'Progress') {
                    const total = event.data.contentLength ?? 0;
                    const downloaded = event.data.chunk.length;
                    if (total > 0) {
                        set({ downloadProgress: Math.round((downloaded / total) * 100) });
                    }
                }
            });

            set({ isDownloading: false, downloadProgress: 100 });
        } catch (error) {
            set({
                isDownloading: false,
                error: error instanceof Error ? error.message : 'Download failed',
            });
        }
    },

    setUpdateConfig: async (config) => {
        set(config);

        // Persist to settings
        try {
            if (config.autoCheckEnabled !== undefined) {
                await settingsApi.setSetting('auto_check_updates', String(config.autoCheckEnabled));
            }
            if (config.checkBeta !== undefined) {
                await settingsApi.setSetting('check_beta_updates', String(config.checkBeta));
            }
        } catch {
            // Backend not available, just keep in memory
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
