import { motion } from 'framer-motion';
import { Edit2, Square, Circle, Minus, MousePointer2, Trash2 } from 'lucide-react';

export function TacticalDrawing() {
    return (
        <div className="flex flex-col gap-4">
            {/* Drawing Canvas Area */}
            <div className="relative aspect-square rounded-2xl bg-[#050505] border border-emerald-500/20 overflow-hidden cursor-crosshair">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
                
                {/* Mock Sketch */}
                <svg className="absolute inset-0 w-full h-full opacity-60">
                    <motion.path 
                        d="M 50 50 L 150 150 L 250 100" 
                        stroke="#10b981" 
                        strokeWidth="2" 
                        fill="none" 
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 2 }}
                    />
                    <motion.circle 
                        cx="250" cy="100" r="10" 
                        fill="#10b981" 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                    />
                </svg>

                <div className="absolute top-4 right-4 flex flex-col gap-2">
                    <div className="text-[8px] font-black text-emerald-500 uppercase tracking-widest bg-black/60 px-2 py-1 border border-emerald-500/20 rounded">
                        Workspace Active
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="grid grid-cols-6 gap-2 p-1 bg-black/40 border border-white/5 rounded-xl">
                {[
                    { icon: MousePointer2, label: 'Select' },
                    { icon: Edit2, label: 'Pen' },
                    { icon: Minus, label: 'Line' },
                    { icon: Square, label: 'Rect' },
                    { icon: Circle, label: 'Circle' },
                    { icon: Trash2, label: 'Clear', color: 'text-rose-500' },
                ].map((tool, i) => (
                    <button 
                        key={i}
                        className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-white/5 transition-all group"
                        title={tool.label}
                    >
                        <tool.icon size={14} className={tool.color || "text-slate-400 group-hover:text-emerald-400"} />
                        <span className="text-[7px] font-bold text-slate-600 uppercase tracking-tighter">{tool.label}</span>
                    </button>
                ))}
            </div>

            {/* Layer Info */}
            <div className="space-y-2 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Active Layers</div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-300">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>TACTICAL_OVERLAY_01</span>
                        </div>
                        <span className="opacity-40">VISIBLE</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-300 opacity-50">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                            <span>GRID_REFERENCE_MAP</span>
                        </div>
                        <span>LOCKED</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
