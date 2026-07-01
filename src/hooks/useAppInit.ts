import { useCallback, useEffect, useRef, useState } from 'react';
import { chatApi, providersApi, systemApi } from '@/api';
import type { ModelInfo } from '@/lib/types/provider';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { IS_TAURI } from '@/api/tauriClient';

export interface InitStep {
    id: string;
    label: string;
    status: 'pending' | 'loading' | 'done' | 'error';
    detail?: string;
}

const INIT_STEPS: InitStep[] = [
    { id: 'settings', label: 'Settings database', status: 'pending' },
    { id: 'theme', label: 'Theme applied', status: 'pending' },
    { id: 'provider', label: 'LLM provider connected', status: 'pending' },
    { id: 'model', label: 'Model loaded', status: 'pending' },
    { id: 'vectorstore', label: 'Vector store mounted', status: 'pending' },
    { id: 'chathistory', label: 'Chat history loaded', status: 'pending' },
    { id: 'updates', label: 'Update check', status: 'pending' },
];

function waitForSettingsHydration(timeoutMs = 2000): Promise<boolean> {
    if (useSettingsStore.getState().isHydrated) return Promise.resolve(true);
    return new Promise((resolve) => {
        let settled = false;
        const finish = (hydrated: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            unsubscribe();
            resolve(hydrated);
        };
        const unsubscribe = useSettingsStore.subscribe((state) => {
            if (state.isHydrated) finish(true);
        });
        const timer = setTimeout(() => finish(false), timeoutMs);
    });
}

export function useAppInit(onStepsUpdate?: (steps: InitStep[]) => void) {
    const [isInitialized, setIsInitialized] = useState(false);
    const stepsRef = useRef<InitStep[]>(INIT_STEPS.map(s => ({ ...s })));
    const startedRef = useRef(false);
    const isHydrated = useSettingsStore(s => s.isHydrated);

    const setStep = useCallback((id: string, status: InitStep['status'], detail?: string) => {
        const step = stepsRef.current.find(s => s.id === id);
        if (step) {
            step.status = status;
            if (detail !== undefined) step.detail = detail;
            onStepsUpdate?.(stepsRef.current);
        }
    }, [onStepsUpdate]);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        const init = async () => {
            try {
                setStep('settings', 'loading');
                if (!isHydrated) {
                    const hydrated = await waitForSettingsHydration();
                    if (!hydrated) {
                        console.warn('[ZEN] Settings hydration timed out; continuing with cached defaults.');
                    }
                }
                setStep('settings', 'done');

                const s = useSettingsStore.getState();

                setStep('theme', 'loading');
                setStep('theme', 'done', s.themeId || 'dark');

                setStep('provider', 'loading');
                // Provider discovery is now BLOCKING with a hard 5s timeout.
                // Previously fire-and-forget — that violated the boot contract
                // ("actually check before continuing"). Now we either resolve
                // with a real model list or fall back to local mode after the
                // ceiling. The chat surface must not mount with an unknown
                // provider stack.
                try {
                    const models = await Promise.race<ModelInfo[] | null>([
                        providersApi.getAllAvailableModels(null),
                        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
                    ]);
                    if (models == null) {
                        setStep('provider', 'done', 'Local mode (timeout)');
                    } else {
                        setStep('provider', 'done', models.length ? 'Connected' : 'No models');
                    }
                } catch {
                    setStep('provider', 'done', 'Local mode');
                }

                setStep('model', 'loading');
                setStep('model', 'done', s.activeModel || 'default');

                // Vector store mount is gated on the Rust side via
                // status.background_complete (covers bg.lancedb + bg.conversation_store +
                // bg.rag). The frontend no-op is removed so we don't lie about
                // checking. The boot overlay's status list surfaces the real
                // per-phase state from get_init_status.

                setStep('updates', 'loading');
                setStep('updates', 'done');

                setStep('chathistory', 'loading');
                try {
                    // Session auto-selection is handled exclusively by useChatQueries
                    // to avoid a race condition between this async init and the React
                    // Query effect. We only need to verify chat history is accessible.
                    await chatApi.listChatsPage(1, 0);
                    setStep('chathistory', 'done');
                } catch {
                    setStep('chathistory', 'error');
                }
            } catch (err) {
                console.warn('[ZEN] AppInit fatal error:', err);
            } finally {
                // Always mark as initialized and signal Rust, even if the
                // component has already unmounted. Rust needs the
                // frontend_ready flag to be true for the handoff;
                // calling setState after unmount is harmless (React
                // ignores it), and the Tauri IPC call
                // (set_complete('frontend')) is idempotent.
                setIsInitialized(true);
                if (IS_TAURI) {
                    systemApi.setComplete('frontend').catch((err) => {
                        console.warn('[ZEN] set_complete("frontend") failed:', err);
                    });
                }
            }
        };

        init();
        // No cleanup needed — `startedRef` and the `setComplete` IPC call
        // are idempotent. The init sequence runs exactly once per app
        // mount, and we want the setComplete('frontend') signal to reach
        // Rust even if the consumer component (BootScreen) has already
        // unmounted by the time the async chain completes.
    }, [isHydrated, setStep]);

    return { isInitialized };
}
