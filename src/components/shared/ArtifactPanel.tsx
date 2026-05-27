import React, { Suspense, useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { useChatStore } from '../../lib/stores/useChatStore';
import { useUIStore } from '../../lib/stores/useUIStore';
import { cn } from '@/lib/utils/style';
import { SandboxedIframe } from '@/atlas/components/SandboxedIframe';
import { MarkdownContent } from '@/atlas/components/chat/MarkdownContent';
import { X, PanelLeft, RotateCw, Copy, Check, Download, Maximize2, Minimize2, Search, Archive, ExternalLink } from 'lucide-react';

const MermaidDiagram = React.lazy(() => import('@/atlas/components/chat/MermaidDiagram').then(m => ({ default: m.MermaidDiagram })));

const ArtifactActionButton: React.FC<{ 
    icon: React.ReactNode; 
    onClick?: () => void; 
    loading?: boolean; 
    title: string;
    active?: boolean;
    variant?: 'default' | 'danger';
}> = ({ icon, onClick, loading, title, active, variant = 'default' }) => (
    <WorkbenchButton 
        onClick={onClick}
        className={cn(
            "w-9 h-9 flex items-center justify-center rounded-lg border transition-all",
            variant === 'danger' 
                ? "border-rose-500/20 bg-rose-500/5 hover:bg-rose-500 hover:border-rose-500 text-rose-500 hover:text-white"
                : active 
                    ? "bg-slate-800 border-white/20 text-white shadow-lg" 
                    : "border-white/[0.05] bg-slate-900/50 hover:bg-slate-800 hover:border-white/10 text-slate-400 hover:text-white",
            loading && "animate-spin cursor-not-allowed opacity-50"
        )}
        title={title}
    >
        {icon}
    </WorkbenchButton>
);

export function ArtifactPanel({ isEmbedded = false }: { isEmbedded?: boolean }) {
    const { 
      artifacts, 
      activeArtifactId, 
      setActiveArtifact, 
      globalArtifacts, 
      loadAllArtifacts 
    } = useChatStore();

    const { 
      artifactPanelMode, 
      setArtifactPanelMode, 
      artifactPanelOpen, 
      setArtifactPanelOpen,
      artifactPanelFullscreen,
      setArtifactPanelFullscreen
    } = useUIStore();

    const [isExplorerOpen, setIsExplorerOpen] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [viewMode, setViewMode] = useState<'session' | 'global'>('session');
    const [searchQuery, setSearchQuery] = useState('');

    const activeArtifact = useMemo(() => {
        const list = viewMode === 'session' ? artifacts : globalArtifacts;
        return activeArtifactId ? list.find(a => a.id === activeArtifactId) : list[0];
    }, [artifacts, globalArtifacts, activeArtifactId, viewMode]);

    const displayArtifacts = useMemo(() => {
        const base = viewMode === 'session' ? artifacts : globalArtifacts;
        if (!searchQuery) return base;
        const q = searchQuery.toLowerCase();
        return base.filter(a => 
            a.title.toLowerCase().includes(q) || 
            (a.language && a.language.toLowerCase().includes(q)) ||
            (a.type && a.type.toLowerCase().includes(q))
        );
    }, [artifacts, globalArtifacts, viewMode, searchQuery]);

    useEffect(() => {
        if (viewMode === 'global') {
            loadAllArtifacts();
        }
    }, [viewMode, loadAllArtifacts]);

    const handleCopy = () => {
        if (!activeArtifact) return;
        navigator.clipboard.writeText(activeArtifact.content);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const handleDownload = () => {
        if (!activeArtifact) return;
        const blob = new Blob([activeArtifact.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeArtifact.title.replace(/\s+/g, '_').toLowerCase()}.${activeArtifact.language || 'txt'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const renderPreview = () => {
        if (!activeArtifact) return null;

        if (activeArtifact.type === 'html' || activeArtifact.type === 'openui') {
            return (
                <div className="flex-1 w-full bg-[#020617] relative overflow-hidden flex flex-col">
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                         style={{ backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
                    
                    <div className="relative z-10 w-full h-full flex flex-col p-6">
                        <div className="flex-1 w-full rounded-2xl border border-white/[0.08] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden relative group">
                            <SandboxedIframe 
                                content={activeArtifact.content}
                                title="UI Preview"
                                className="w-full h-full"
                            />
                        </div>
                        <div className="mt-4 flex items-center justify-between px-2">
                             <div className="flex items-center gap-4 text-[9px] text-slate-500 font-black tracking-widest uppercase">
                                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" /> HOT_SYNC_V3</span>
                                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-700" /> SANDBOX_ISOLATED</span>
                            </div>
                            <WorkbenchButton 
                                onClick={() => {
                                    const blob = new Blob([activeArtifact.content], { type: 'text/html' });
                                    const url = URL.createObjectURL(blob);
                                    window.open(url, '_blank', 'noopener,noreferrer');
                                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                                }}
                                className="text-[9px] font-black text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-widest flex items-center gap-1.5"
                            >
                                <ExternalLink size={12} />
                                OPEN_EXTERNAL
                            </WorkbenchButton>
                        </div>
                    </div>
                </div>
            );
        }

        if (activeArtifact.language === 'mermaid') {
            return (
                <div className="flex-1 flex flex-col bg-[#020617] p-8 overflow-auto relative">
                    <div className="flex-1 flex items-center justify-center min-h-full relative z-10">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="w-full max-w-4xl bg-slate-900/40 p-12 rounded-3xl border border-white/[0.04] shadow-2xl backdrop-blur-sm"
                        >
                            <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">Loading diagram renderer...</div>}>
                                <MermaidDiagram code={activeArtifact.content} />
                            </Suspense>
                        </motion.div>
                    </div>
                </div>
            );
        }

        if (activeArtifact.type === 'markdown' || activeArtifact.language === 'markdown') {
            return (
              <div className="flex-1 p-10 overflow-auto bg-[#020617]">
                <div className="max-w-4xl mx-auto">
                  <MarkdownContent content={activeArtifact.content} />
                </div>
              </div>
            );
        }

        const contentLower = activeArtifact.content.trim().toLowerCase();
        const isSvg = activeArtifact.type === 'svg' || 
                      activeArtifact.language?.toLowerCase() === 'svg' ||
                      contentLower.startsWith('<svg') ||
                      (contentLower.startsWith('<?xml') && contentLower.includes('<svg'));

        if (isSvg) {
          return (
            <div className="flex-1 flex items-center justify-center p-8 bg-[#020617]">
              <SandboxedIframe 
                content={activeArtifact.content}
                className="max-w-full max-h-full"
              />
            </div>
          );
        }

        return (
            <div className="flex-1 w-full bg-[#020617] flex flex-col p-8 overflow-auto relative">
                <div className="max-w-5xl w-full mx-auto relative z-10">
                    <pre className="p-10 bg-black/40 border border-white/[0.05] rounded-3xl font-mono text-[13px] leading-relaxed text-slate-300 shadow-2xl backdrop-blur-md overflow-x-auto custom-scrollbar">
                        <code className={`language-${activeArtifact.language || 'text'}`}>
                            {activeArtifact.content}
                        </code>
                    </pre>
                </div>
            </div>
        );
    };

    if (!artifactPanelOpen && !isEmbedded) return null;

    return (
        <motion.div 
            initial={!isEmbedded ? { x: '100%' } : { opacity: 0 }}
            animate={!isEmbedded ? { x: 0 } : { opacity: 1 }}
            exit={!isEmbedded ? { x: '100%' } : { opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className={cn(
                "flex flex-col bg-[#020617] h-full",
                !isEmbedded 
                    ? "fixed top-0 right-0 border-l border-slate-800/60 z-[100] shadow-[0_0_50px_rgba(0,0,0,0.5)]" 
                    : "relative w-full overflow-hidden",
                !isEmbedded && (artifactPanelFullscreen ? "w-full left-0 border-l-0" : "w-[45vw] min-w-[500px]")
            )}
        >
            {/* Header */}
            <div className="h-14 border-b border-white/[0.06] flex items-center justify-between px-6 bg-slate-950/40 backdrop-blur-xl shrink-0 z-20">
                <div className="flex items-center gap-4">
                    <WorkbenchButton 
                        onClick={() => setIsExplorerOpen(!isExplorerOpen)}
                        className={cn(
                            "w-9 h-9 flex items-center justify-center rounded-lg border transition-all",
                            isExplorerOpen ? "bg-slate-800 border-white/20 text-white" : "border-white/[0.05] bg-slate-900/50 text-slate-400 hover:text-white"
                        )}
                    >
                        <PanelLeft size={16} />
                    </WorkbenchButton>

                    {!activeArtifact ? (
                        <h2 className="text-xs font-bold tracking-[0.1em] text-slate-400 uppercase">Explorer</h2>
                    ) : (
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "w-8 h-8 rounded-lg border flex items-center justify-center",
                                activeArtifact.type === 'code' ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : 
                                activeArtifact.type === 'html' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : 
                                "bg-amber-500/10 border-amber-500/30 text-amber-400"
                            )}>
                                <WorkbenchIcon 
                                    name={activeArtifact.type === 'code' ? "code-2" : 
                                          activeArtifact.type === 'html' ? "layout" : 
                                          "file-text"} 
                                    size={16} 
                                />
                            </div>
                            <div className="min-w-0">
                                <div className="text-xs font-bold tracking-tight text-slate-100 truncate max-w-[180px]">{activeArtifact.title}</div>
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                                    v{activeArtifact.version} • {activeArtifact.language || activeArtifact.type}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {activeArtifact && (
                        <div className="flex items-center gap-1.5 mr-2">
                            <ArtifactActionButton 
                                icon={<RotateCw size={16} />} 
                                onClick={() => {
                                  setIsRefreshing(true);
                                  setTimeout(() => setIsRefreshing(false), 800);
                                }} 
                                loading={isRefreshing}
                                title="Refresh"
                            />
                            <ArtifactActionButton 
                                icon={copySuccess ? <Check size={16} /> : <Copy size={16} />} 
                                onClick={handleCopy} 
                                active={copySuccess}
                                title="Copy"
                            />
                            <ArtifactActionButton 
                                icon={<Download size={16} />} 
                                onClick={handleDownload} 
                                title="Download"
                            />
                        </div>
                    )}
                    
                    {!isEmbedded && (
                        <>
                            <div className="w-px h-6 bg-white/10 mx-1" />
                            <ArtifactActionButton 
                                icon={artifactPanelFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />} 
                                onClick={() => setArtifactPanelFullscreen(!artifactPanelFullscreen)}
                                title="Fullscreen"
                            />
                            <WorkbenchButton 
                                onClick={() => setArtifactPanelOpen(false)}
                                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-rose-500/20 hover:text-rose-500 text-slate-500 transition-colors"
                            >
                                <X size={18} />
                            </WorkbenchButton>
                        </>
                    )}
                </div>
            </div>

            {/* Main Section */}
            <div className="flex-1 flex overflow-hidden">
                <AnimatePresence initial={false}>
                    {isExplorerOpen && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 280, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            className="border-r border-white/[0.06] bg-slate-950/20 flex flex-col overflow-hidden shrink-0"
                        >
                            <div className="p-4 border-b border-white/[0.04] space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                        Vault
                                    </h3>
                                    <div className="flex bg-slate-900/50 rounded-lg p-0.5 border border-white/5">
                                        <button 
                                            onClick={() => setViewMode('session')}
                                            className={cn(
                                                "px-2 py-1 text-[9px] font-bold rounded-md transition-all",
                                                viewMode === 'session' ? "bg-slate-800 text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-300"
                                            )}
                                        >
                                            LOCAL
                                        </button>
                                        <button 
                                            onClick={() => setViewMode('global')}
                                            className={cn(
                                                "px-2 py-1 text-[9px] font-bold rounded-md transition-all",
                                                viewMode === 'global' ? "bg-slate-800 text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-300"
                                            )}
                                        >
                                            GLOBAL
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="relative group">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors">
                                        <Search size={12} />
                                    </div>
                                    <input 
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search artifacts..."
                                        className="w-full bg-slate-900/40 border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/30 focus:bg-slate-900 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                {displayArtifacts.map((art) => (
                                    <div key={art.id} className="relative group">
                                        <WorkbenchButton
                                            onClick={() => setActiveArtifact(art.id ?? null)}
                                            className={cn(
                                                "w-full text-left p-3 pr-10 rounded-xl border transition-all flex gap-3 items-start",
                                                activeArtifact?.id === art.id 
                                                    ? "bg-blue-500/10 border-blue-500/20 text-white" 
                                                    : "border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                                                activeArtifact?.id === art.id 
                                                    ? "bg-blue-500/20 border-blue-500/30 text-blue-400" 
                                                    : "bg-slate-900 border-white/[0.05] text-slate-500"
                                            )}>
                                                <WorkbenchIcon 
                                                    name={art.type === 'code' ? "code-2" : 
                                                          art.type === 'html' ? "layout" : 
                                                          "file-text"} 
                                                    size={14} 
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] font-bold truncate">{art.title}</div>
                                                <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                                                    {art.updatedAt ? new Date(art.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                </div>
                                            </div>
                                        </WorkbenchButton>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col relative bg-[#020617]">
                    {!activeArtifact ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#020617]">
                             <AnimatePresence>
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex flex-col items-center"
                                >
                                    <Archive size={48} className="text-slate-800 mb-6" />
                                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">
                                        {artifacts.length === 0 ? "No Artifacts Detected" : "Select Item"}
                                    </h3>
                                    {artifacts.length === 0 && (
                                        <p className="text-xs text-slate-600 max-w-[200px] leading-relaxed">
                                            Generated code, diagrams, and UI layouts will appear here during the session.
                                        </p>
                                    )}
                                </motion.div>
                             </AnimatePresence>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col overflow-hidden">
                             <div className="flex bg-black/30 border-b border-white/[0.04] p-1 shrink-0">
                                <WorkbenchButton 
                                    onClick={() => setArtifactPanelMode('preview')}
                                    className={cn(
                                        "flex-1 py-1.5 text-[10px] font-black rounded-md transition-all tracking-wider",
                                        artifactPanelMode === 'preview' ? "bg-slate-800 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                                    )}
                                >PREVIEW</WorkbenchButton>
                                <WorkbenchButton 
                                    onClick={() => setArtifactPanelMode('code')}
                                    className={cn(
                                        "flex-1 py-1.5 text-[10px] font-black rounded-md transition-all tracking-wider",
                                        artifactPanelMode === 'code' ? "bg-slate-800 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                                    )}
                                >SOURCE</WorkbenchButton>
                            </div>
                            
                            <div className="flex-1 overflow-hidden">
                                <AnimatePresence mode="wait">
                                    <motion.div 
                                        key={`${activeArtifact.id}-${artifactPanelMode}`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="h-full"
                                    >
                                        {artifactPanelMode === 'preview' ? renderPreview() : (
                                            <div className="h-full bg-slate-950 p-6 flex flex-col">
                                                <div className="flex-1 bg-black/40 border border-slate-800 rounded-2xl overflow-hidden relative group">
                                                    <pre className="absolute inset-0 p-8 overflow-auto font-mono text-[13px] text-slate-300 custom-scrollbar">
                                                        <code>{activeArtifact.content}</code>
                                                    </pre>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
