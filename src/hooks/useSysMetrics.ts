import { useEffect, useState } from 'react';

interface SysMetrics {
    cpu_load: number;
    mem_used: number;
    mem_total: number;
    net_up: number;
    net_down: number;
}

export function useSysMetrics(intervalMs = 2000) {
    const [metrics, setMetrics] = useState<SysMetrics>({
        cpu_load: 0, mem_used: 0, mem_total: 0, net_up: 0, net_down: 0
    });

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                const data = await invoke<SysMetrics>('get_system_metrics', {});
                setMetrics(data);
            } catch (err) {
                console.error("Failed to fetch system metrics:", err);
                // Fallback: simulate data for demo
                setMetrics(prev => ({
                    ...prev,
                    cpu_load: Math.random() * 30 + 10,
                    mem_used: 8000 + Math.random() * 2000,
                    mem_total: 32000,
                }));
            }
        };
        fetchMetrics();
        const timer = setInterval(fetchMetrics, intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);

    return metrics;
}