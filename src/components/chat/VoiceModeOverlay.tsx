import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, X, Volume2, VolumeX } from 'lucide-react';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { cn } from '@/lib/utils/style';

export function VoiceModeOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [isListening, setIsListening] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(0);

    // Mock volume animation
    useEffect(() => {
        if (!isOpen || !isListening) {
            setVolume(0);
            return;
        }

        const interval = setInterval(() => {
            setVolume(Math.random() * 100);
        }, 100);

        return () => clearInterval(interval);
    }, [isOpen, isListening]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl"
                >
                    <div className="absolute top-8 right-8 flex gap-4">
                        <WorkbenchButton
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsMuted(!isMuted)}
                            className="text-white/40 hover:text-white"
                        >
                            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                        </WorkbenchButton>
                        <WorkbenchButton
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            className="text-white/40 hover:text-red-500"
                        >
                            <X size={24} />
                        </WorkbenchButton>
                    </div>

                    <div className="flex flex-col items-center gap-12">
                        {/* Futuristic Orb / Oscilloscope */}
                        <div className="relative flex items-center justify-center w-64 h-64">
                            {/* Static Rings */}
                            <div className="absolute inset-0 border border-primary/20 rounded-full" />
                            <div className="absolute inset-4 border border-primary/10 rounded-full" />
                            <div className="absolute inset-8 border border-primary/5 rounded-full" />

                            {/* Pulse Rings */}
                            <motion.div
                                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.1, 0.3] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="absolute inset-0 border-2 border-primary/30 rounded-full"
                            />

                            {/* The Orb */}
                            <motion.div
                                animate={{ 
                                    scale: isListening ? [1, 1.1 + (volume / 200), 1] : 1,
                                    boxShadow: isListening 
                                        ? `0 0 ${20 + volume}px rgba(0, 230, 230, 0.4)`
                                        : '0 0 20px rgba(0, 230, 230, 0.1)'
                                }}
                                className={cn(
                                    "relative w-32 h-32 rounded-full flex items-center justify-center transition-colors duration-500",
                                    isListening ? "bg-primary/20 border-2 border-primary" : "bg-white/5 border-2 border-white/10"
                                )}
                            >
                                <Mic size={48} className={cn("transition-colors", isListening ? "text-primary" : "text-white/20")} />
                                
                                {/* Orbiting Particles */}
                                {isListening && [0, 72, 144, 216, 288].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 3 + i, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-[-20px] pointer-events-none"
                                    >
                                        <div className="w-2 h-2 bg-primary rounded-full blur-[1px]" style={{ transform: `translateX(80px)` }} />
                                    </motion.div>
                                ))}
                            </motion.div>
                        </div>

                        <div className="text-center space-y-4">
                            <motion.h2 
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="text-2xl font-black tracking-[0.2em] text-white uppercase"
                            >
                                {isListening ? "Listening..." : "Paused"}
                            </motion.h2>
                            <p className="text-white/40 font-mono text-sm tracking-widest max-w-md">
                                {isListening 
                                    ? "ZEN is processing your voice telemetry in real-time."
                                    : "Voice input suspended. Click the orb to resume."}
                            </p>
                        </div>

                        <div className="flex gap-6">
                            <WorkbenchButton
                                onClick={() => setIsListening(!isListening)}
                                className={cn(
                                    "px-8 py-3 rounded-full font-bold tracking-widest transition-all",
                                    isListening ? "bg-red-500/20 text-red-500 border border-red-500/50" : "bg-primary/20 text-primary border border-primary/50"
                                )}
                            >
                                {isListening ? "STOP LISTENING" : "START LISTENING"}
                            </WorkbenchButton>
                        </div>
                    </div>

                    {/* Background Grid */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,230,230,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,230,230,0.02)_1px,transparent_1px)] bg-[size:50px_50px] pointer-events-none" />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
