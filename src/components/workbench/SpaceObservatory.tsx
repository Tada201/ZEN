import { motion } from 'framer-motion';
import { Globe, Star, Zap, Activity } from 'lucide-react';

export function SpaceObservatory() {
    return (
        <div className="space-y-6">
            {/* Cinematic Space View Mock */}
            <div className="relative aspect-video rounded-2xl bg-black overflow-hidden border border-white/5 group">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#1e1b4b_0%,_transparent_70%)] opacity-40" />
                
                {/* Stars */}
                {Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-0.5 h-0.5 bg-white rounded-full"
                        style={{ 
                            left: `${Math.random() * 100}%`, 
                            top: `${Math.random() * 100}%` 
                        }}
                        animate={{ 
                            opacity: [0.2, 1, 0.2],
                            scale: [1, 1.5, 1]
                        }}
                        transition={{ 
                            duration: 2 + Math.random() * 3, 
                            repeat: Infinity,
                            delay: Math.random() * 5
                        }}
                    />
                ))}

                {/* Central Glow / Earth */}
                <motion.div 
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                >
                    <div className="w-32 h-32 rounded-full bg-blue-500/10 border border-blue-500/20 blur-xl" />
                    <Globe className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-400/40" size={48} />
                </motion.div>

                {/* Grid Overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px]" />

                <div className="absolute top-4 left-4 flex flex-col gap-1">
                    <div className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Tracking Active</div>
                    <div className="text-[10px] font-mono text-white/60">RA: 14h 29m 42s | DEC: -62° 40' 46"</div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
                {[
                    { label: 'Identified Stars', value: '14,204', icon: Star, color: 'text-amber-400' },
                    { label: 'Active Satellites', value: '412', icon: Zap, color: 'text-blue-400' },
                    { label: 'Exoplanets', value: '8', icon: Globe, color: 'text-emerald-400' },
                    { label: 'Signal Strength', value: '98%', icon: Activity, color: 'text-indigo-400' },
                ].map((stat, i) => (
                    <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[8px] font-black text-slate-500 uppercase tracking-widest">
                            <stat.icon size={10} className={stat.color} />
                            {stat.label}
                        </div>
                        <div className="text-xs font-mono font-bold text-white">{stat.value}</div>
                    </div>
                ))}
            </div>

            {/* Ephemeris Log */}
            <div className="space-y-2 pt-4 border-t border-white/5">
                <div className="text-[9px] font-mono text-slate-600 mb-2 uppercase tracking-widest">Ephemeris Event Stream</div>
                <div className="space-y-1">
                    {[
                        "ISS Transiting Meridian Alpha-7",
                        "New Deep Sky Object detected in Sector 4",
                        "Solar flare warning: Class X-1.2",
                        "Synchronization with Palomar successful"
                    ].map((log, i) => (
                        <div key={i} className="flex items-center gap-2 text-[8px] font-mono text-slate-500">
                            <span className="text-blue-500">[{new Date().toLocaleTimeString()}]</span>
                            <span>{log.toUpperCase()}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
