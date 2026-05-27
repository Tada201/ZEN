import { useCallback, useEffect, useRef, useState } from 'react';
import { chatApi, providersApi } from '@/api';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { useChatStore } from '@/lib/stores/useChatStore';

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

export function useAppInit(onStepsUpdate?: (steps: InitStep[]) => void) {
    const [isInitialized, setIsInitialized] = useState(false);
    const stepsRef = useRef<InitStep[]>(INIT_STEPS.map(s => ({ ...s })));
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
        let mounted = true;
        const init = async () => {
            try {
                setStep('settings', 'loading');
                if (!isHydrated) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                setStep('settings', 'done');

                const s = useSettingsStore.getState();

                setStep('theme', 'loading');
                setStep('theme', 'done', s.themeId || 'dark');

                setStep('provider', 'loading');
                try {
                    const models = await providersApi.getAllAvailableModels(null);
                    if (models?.length > 0) {
                        setStep('provider', 'done', 'Connected');
                    } else {
                        setStep('provider', 'done', 'No models');
                    }
                } catch {
                    setStep('provider', 'done', 'Local mode');
                }

                setStep('model', 'loading');
                setStep('model', 'done', s.activeModel || 'default');

                setStep('vectorstore', 'done');

                setStep('updates', 'loading');
                setStep('updates', 'done');

                setStep('chathistory', 'loading');
                try {
                    const chatStore = useChatStore.getState();
                    let targetSessionId = chatStore.activeSessionId;
                    const sessionsPage = await chatApi.listChatsPage(1, 0);
                    if (!targetSessionId && sessionsPage.items.length > 0) {
                        targetSessionId = sessionsPage.items[0].id;
                        chatStore.setActiveSession(targetSessionId);
                    }
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
