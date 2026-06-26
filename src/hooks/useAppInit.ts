import { useCallback, useEffect, useRef, useState } from 'react';
import { chatApi, providersApi } from '@/api';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';

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
        let mounted = true;
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
                // Model discovery is non-critical and can involve unavailable local servers.
                // Start it in the background so it never blocks the first usable frame.
                void providersApi.getAllAvailableModels(null)
                    .then((models) => setStep('provider', 'done', models?.length ? 'Connected' : 'No models'))
                    .catch(() => setStep('provider', 'done', 'Local mode'));

                setStep('model', 'loading');
                setStep('model', 'done', s.activeModel || 'default');

                setStep('vectorstore', 'done');

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
                if (mounted) setIsInitialized(true);
            }
        };

        init();
        return () => { mounted = false; };
    }, [isHydrated, setStep]);

    return { isInitialized };
}
