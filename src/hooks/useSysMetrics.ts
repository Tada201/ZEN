import { useEffect, useState } from 'react';

interface SysMetrics {
    cpu: number;
    memory: number;
    memoryTotal: number;
    disk: number;
    networkRx: number;
    networkTx: number;
    uptime: number;
}

export function useSysMetrics(intervalMs = 2000) {
    const [metrics, setMetrics] = useState<SysMetrics>({
        cpu: 0, memory: 0, memoryTotal: 0, disk: 0, networkRx: 0, networkTx: 0, uptime: 0
    });

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                const data = await invoke<SysMetrics>('sys_metrics', {});
                setMetrics(data);
            } catch {
                // Fallback: simulate CPU/memory for demo
                setMetrics(prev => ({
                    ...prev,
                    cpu: Math.random() * 100,
                    memory: Math.random() * 100,
                    memoryTotal: 32768,
                    uptime: Date.now() / 1000,
                }));
            }
        };
        fetchMetrics();
        const timer = setInterval(fetchMetrics, intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);

    return metrics;
}