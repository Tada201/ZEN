import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Cpu, Zap, Activity, Users, Settings2, Play, Square } from 'lucide-react';
import { cn } from '@/lib/utils/style';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';

interface AgentNode {
    id: string;
    name: string;
    role: 'leader' | 'worker' | 'scout';
    status: 'idle' | 'busy' | 'offline';
    load: number;
    x: number;
    y: number;
}

export function SwarmOrchestrator({ isEmbedded = false }: { isEmbedded?: boolean }) {
    const [isActive, setIsActive] = useState(false);
    const [topology, setTopology] = useState<'mesh' | 'star' | 'ring'>('star');
    
    const agents: AgentNode[] = useMemo(() => [
        { id: '1', name: 'NEXUS-LEAD', role: 'leader', status: 'idle', load: 12, x: 400, y: 300 },
        { id: '2', name: 'WORKER-01', role: 'worker', status: 'busy', load: 85, x: 200, y: 150 },
        { id: '3', name: 'WORKER-02', role: 'worker', status: 'idle', load: 5, x: 600, y: 150 },
        { id: '4', name: 'SCOUT-A', role: 'scout', status: 'busy', load: 45, x: 200, y: 450 },
        { id: '5', name: 'SCOUT-B', role: 'scout', status: 'offline', load: 0, x: 600, y: 450 },
    ], []);

    return (
        <div className={cn("flex-1 flex flex-col overflow-hidden bg-slate-950 relative", isEmbedded && "bg-transparent")}>
            {/* Header */}
            {!isEmbedded && (
                <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-slate-900/40 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        <Cpu size={18} />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold tracking-tight text-white uppercase tracking-widest">Swarm Orchestrator</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isActive ? "bg-emerald-500" : "bg-slate-600")} />
                            <span className="text-[10px] font-mono text-slate-500 uppercase">{isActive ? 'System Active' : 'System Standby'}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-black/40 rounded-lg p-1 border border-white/5">
                        {(['star', 'mesh', 'ring'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTopology(t)}
                                className={cn(
                                    "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                                    topology === t ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                                )}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                    
                    <div className="h-6 w-px bg-white/10" />

                    <WorkbenchButton 
                        variant={isActive ? "outline" : "primary"}
                        size="sm"
                        onClick={() => setIsActive(!isActive)}
                        className="gap-2"
                    >
                        {isActive ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        {isActive ? "SHUTDOWN" : "INITIALIZE"}
                    </WorkbenchButton>
                </div>
            </header>
            )}

            {/* Main Canvas Area */}
            <div className={cn("flex-1 relative overflow-hidden flex items-center justify-center", isEmbedded && "min-h-[300px]")}>
                {/* SVG Connections Overlay */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <defs>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    </defs>
                    
                    {isActive && agents.map((agent, i) => {
                        if (agent.role === 'leader') return null;
                        const leader = agents.find(a => a.role === 'leader')!;
                        return (
                            <motion.line
                                key={agent.id}
                                x1={leader.x}
                                y1={leader.y}
                                x2={agent.x}
                                y2={agent.y}
                                stroke="rgba(16, 185, 129, 0.2)"
                                strokeWidth="1"
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 1 }}
                                transition={{ duration: 1, delay: i * 0.2 }}
                            />
                        );
                    })}
                </svg>

                {/* Nodes */}
                <div className="relative w-full h-full">
                    {agents.map((agent) => (
                        <motion.div
                            key={agent.id}
                            className="absolute cursor-pointer group"
                            style={{ left: agent.x, top: agent.y, transform: 'translate(-50%, -50%)' }}
                            whileHover={{ scale: 1.1 }}
                        >
                            <div className={cn(
                                "relative w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 border-2",
                                agent.status === 'busy' ? "bg-blue-500/10 border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.2)]" :
                                agent.status === 'offline' ? "bg-slate-900 border-slate-800 grayscale" :
                                "bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                            )}>
                                {agent.role === 'leader' ? <Activity size={24} className="text-white" /> : <Users size={20} className="text-white/60" />}
                                
                            </div>
                            
                            <div className="mt-4 text-center">
                                <div className="text-[10px] font-black text-white uppercase tracking-widest">{agent.name}</div>
                                <div className="text-[8px] font-mono text-slate-500 mt-0.5">{agent.role.toUpperCase()} • {agent.load}% LOAD</div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Grid Background */}
                {!isEmbedded && <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]" />}
            </div>

            {/* Metrics Sidebar */}
            {!isEmbedded && (
                <aside className="absolute right-0 top-14 bottom-0 w-80 bg-slate-900/60 backdrop-blur-xl border-l border-white/5 p-6 overflow-y-auto z-10">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Real-time Metrics</h3>
                
                <div className="space-y-6">
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Swarm Sync</span>
                            <span className="text-[10px] font-mono text-emerald-400">99.8%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: '99.8%' }}
                                className="h-full bg-emerald-500"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-slate-500">
                            <span>Active Processes</span>
                            <Zap size={10} />
                        </div>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-black/40 border border-white/5">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                <div className="flex-1">
                                    <div className="text-[9px] font-bold text-slate-300">GEO-INT ANALYTICS #{i}</div>
                                    <div className="text-[8px] font-mono text-slate-600 mt-0.5">PID: {4000 + i} • LOAD: {20 + i*15}%</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-auto pt-8">
                    <WorkbenchButton variant="ghost" size="xs" className="w-full justify-start gap-2 text-slate-500">
                        <Settings2 size={12} />
                        ADVANCED CONFIGURATION
                    </WorkbenchButton>
                </div>
            </aside>
            )}
        </div>
    );
}
