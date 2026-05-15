import { motion } from 'framer-motion';
import { Cpu, Zap, Activity, Globe, HardDrive } from 'lucide-react';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Metrics {
    cpu_load: number;
    mem_used: number;
    mem_total: number;
    net_up: number;
    net_down: number;
}

export function SystemMonitor() {
    const [metrics, setMetrics] = useState<Metrics>({
        cpu_load: 0,
        mem_used: 0,
        mem_total: 0,
        net_up: 0,
        net_down: 0
    });

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const data = await invoke<Metrics>('get_system_metrics');
                setMetrics(data);
            } catch (err) {
                console.error("Failed to fetch metrics:", err);
            }
        };

        const interval = setInterval(fetchMetrics, 2000);
        fetchMetrics();
        return () => clearInterval(interval);
    }, []);

    const memPercent = metrics.mem_total > 0 ? (metrics.mem_used / metrics.mem_total) * 100 : 0;

    return (
        <div className="space-y-6">
            {/* CPU Metric */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                        <Cpu size={12} className="text-blue-400" />
                        <span>Core Processing Unit</span>
                    </div>
                    <span className="text-blue-400">{metrics.cpu_load.toFixed(1)}%</span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${metrics.cpu_load}%` }}
                        className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                    />
                </div>
                <div className="grid grid-cols-4 gap-1">
                    {[24, 45, 12, 8, 33, 10, 5, 60].map((v, i) => (
                        <div key={i} className="h-6 bg-white/[0.02] border border-white/5 rounded flex items-end p-0.5">
                            <motion.div 
                                animate={{ height: `${v}%` }}
                                className="w-full bg-blue-500/20 border-t border-blue-500/40"
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Memory Metric */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                        <Activity size={12} className="text-emerald-400" />
                        <span>Neural Memory Allocation</span>
                    </div>
                    <span className="text-emerald-400">{(metrics.mem_used / 1024 / 1024 / 1024).toFixed(1)} GB</span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${memPercent}%` }}
                        className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    />
                </div>
            </div>

            {/* Network Metric */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                        <Globe size={12} className="text-indigo-400" />
                        <span>Satellite Data Stream</span>
                    </div>
                    <span className="text-indigo-400">12.4 Mbps</span>
                </div>
                <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex items-center justify-between font-mono text-[9px]">
                    <div className="flex flex-col gap-1">
                        <span className="text-slate-500">PACKETS_IN: <span className="text-slate-300">1.2M</span></span>
                        <span className="text-slate-500">PACKETS_OUT: <span className="text-slate-300">0.4M</span></span>
                    </div>
                    <div className="text-right">
                        <div className="text-indigo-400 font-bold uppercase">Syncing...</div>
                        <div className="text-[8px] text-slate-600 mt-1">PAL-07 SECURE</div>
                    </div>
                </div>
            </div>

            {/* Disk Metric */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                        <HardDrive size={12} className="text-amber-400" />
                        <span>Local Intelligence Cache</span>
                    </div>
                    <span className="text-amber-400">62% Full</span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '62%' }}
                        className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                    />
                </div>
            </div>

            {/* Real-time Oscilloscope Mock - Optimized */}
            <div className="pt-4 mt-6 border-t border-white/5">
                <div className="text-[9px] font-mono text-slate-600 mb-2 uppercase tracking-widest">Quantum State Analytics</div>
                <div className="h-20 w-full bg-black/20 rounded-xl border border-white/5 relative overflow-hidden">
                    <svg className="w-full h-full opacity-20">
                        <path
                            d="M 0 40 Q 50 10 100 40 T 200 40 T 300 40 T 400 40"
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="1"
                        />
                        <path
                            d="M 0 40 Q 50 70 100 40 T 200 40 T 300 40 T 400 40"
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="1"
                        />
                    </svg>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/80" />
                </div>
            </div>
        </div>
    );
}
