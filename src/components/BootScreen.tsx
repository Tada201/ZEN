import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Terminal } from 'lucide-react';

const BOOT_LOGS = [
  "[ 0.000000] NEXUS CORE v3.0 initializing...",
  "[ 0.012451] Probing system hardware...",
  "[ 0.045621] CPU: 128-core Quantum Synthesis Engine detected",
  "[ 0.089123] RAM: 2TB Super-Conductive Memory mapped",
  "[ 0.124512] GPU: Neural Processing Unit [OK]",
  "[ 0.189231] Mounting file system [LOCKED]",
  "[ 0.245123] Establishing secure link to satellite network...",
  "[ 0.312451] Satellite link active: Palantir-7 (OSINT-GEO)",
  "[ 0.389231] Initializing Agentic Reasoning Engine...",
  "[ 0.456123] Loading provider configurations...",
  "[ 0.512451] OpenAI API connection [VERIFIED]",
  "[ 0.589123] Anthropic API connection [VERIFIED]",
  "[ 0.645123] Local Ollama instance [DETECTED]",
  "[ 0.712451] Loading 3D Tactical Layers...",
  "[ 0.789123] Cesium Engine initialized.",
  "[ 0.845123] Security protocol NX-01 engaged.",
  "[ 0.912451] SYSTEM READY. WELCOME BACK, OPERATIVE.",
];

export function BootScreen({ onComplete }: { onComplete: () => void }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [phase, setPhase] = useState<'logs' | 'identity'>('logs');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let currentLine = 0;
    const interval = setInterval(() => {
      if (currentLine < BOOT_LOGS.length) {
        setLogs((prev) => [...prev, BOOT_LOGS[currentLine]]);
        currentLine++;
      } else {
        clearInterval(interval);
        setTimeout(() => setPhase('identity'), 500);
      }
    }, 50);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black font-mono text-xs overflow-hidden">
      <AnimatePresence mode="wait">
        {phase === 'logs' ? (
          <motion.div
            key="logs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-2xl h-[400px] p-6 border border-primary/20 bg-slate-950/50 backdrop-blur-md rounded-lg flex flex-col"
          >
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-primary/10 text-primary">
              <Terminal size={14} />
              <span className="font-bold tracking-widest uppercase">System Initialization</span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-2">
              {logs.map((log, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={log?.includes('[OK]') || log?.includes('[VERIFIED]') ? "text-emerald-400" : "text-primary/60"}
                >
                  {log}
                </motion.div>
              ))}
              <motion.div
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="w-2 h-4 bg-primary/40"
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="identity"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-8"
          >
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border-2 border-dashed border-primary/20 rounded-full"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[-20px] border border-dashed border-primary/10 rounded-full"
              />
              <div className="relative flex items-center justify-center w-32 h-32 bg-primary/5 rounded-full border border-primary/20 shadow-[0_0_50px_rgba(0,255,255,0.1)]">
                <Bot size={64} className="text-primary animate-pulse" />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h1 className="text-4xl font-black tracking-[0.3em] text-primary drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]">ZEN</h1>
              <p className="text-[10px] text-primary/40 uppercase tracking-[0.5em]">Agentic OSINT Workbench</p>
            </div>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              onClick={onComplete}
              className="px-8 py-3 bg-primary/10 border border-primary/40 rounded-full text-primary font-bold tracking-widest hover:bg-primary/20 transition-all active:scale-95"
            >
              INITIALIZE INTERFACE
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
