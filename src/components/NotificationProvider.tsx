import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { cn } from '@/lib/utils';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    duration?: number;
}

interface NotificationContextType {
    showNotification: (props: Omit<Notification, 'id'>) => void;
    hideNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const TYPE_META: Record<NotificationType, { icon: string; color: string }> = {
    success: { icon: 'codicon:pass-filled', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' },
    error: { icon: 'codicon:error', color: 'text-rose-400 border-rose-500/20 bg-rose-500/10' },
    info: { icon: 'codicon:info', color: 'text-sky-400 border-sky-500/20 bg-sky-500/10' },
    warning: { icon: 'codicon:warning', color: 'text-amber-400 border-amber-500/20 bg-amber-500/10' },
};

export function NotificationProvider({ children }: { children: ReactNode }) {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const hideNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const showNotification = useCallback(({ type, title, message, duration = 5000 }: Omit<Notification, 'id'>) => {
        const id = Math.random().toString(36).slice(2, 9);
        setNotifications(prev => [...prev, { id, type, title, message, duration }]);
        if (duration > 0) window.setTimeout(() => hideNotification(id), duration);
    }, [hideNotification]);

    return (
        <NotificationContext.Provider value={{ showNotification, hideNotification }}>
            {children}
            <div className="fixed right-5 top-5 z-[200] flex w-[360px] max-w-[calc(100vw-2.5rem)] flex-col gap-3">
                <AnimatePresence initial={false}>
                    {notifications.map(n => {
                        const meta = TYPE_META[n.type];
                        return (
                            <motion.div
                                key={n.id}
                                initial={{ opacity: 0, x: 24, scale: 0.98 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: 24, scale: 0.98 }}
                                className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl"
                            >
                                <div className="flex items-start gap-3">
                                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border', meta.color)}>
                                        <WorkbenchIcon name={meta.icon} size={16} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[12px] font-black uppercase tracking-wider text-white">{n.title}</div>
                                        <div className="mt-1 text-[11px] leading-relaxed text-slate-400">{n.message}</div>
                                    </div>
                                    <WorkbenchButton variant="ghost" size="icon" className="h-7 w-7" onClick={() => hideNotification(n.id)}>
                                        <WorkbenchIcon name="codicon:close" size={13} />
                                    </WorkbenchButton>
                                </div>
                                {n.duration && n.duration > 0 && (
                                    <motion.div
                                        className="absolute bottom-0 left-0 h-0.5 bg-brand-purple"
                                        initial={{ width: '100%' }}
                                        animate={{ width: '0%' }}
                                        transition={{ duration: n.duration / 1000, ease: 'linear' }}
                                    />
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </NotificationContext.Provider>
    );
}

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
    return context;
};
