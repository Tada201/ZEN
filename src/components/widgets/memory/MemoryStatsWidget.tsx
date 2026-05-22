import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useChatStore } from '@/lib/stores/useChatStore';
import { 
  Database, RefreshCw, Trash2, Search, Brain, Calendar, Info, ShieldAlert, Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MemoryEntry {
  id: string;
  chat_id: string;
  message_id: string;
  vector: number[];
  text: string;
  role: string;
  timestamp: number;
  metadata: string;
}

interface SearchResult {
  entry: MemoryEntry;
  score: number;
}

interface MemoryStats {
  total_vectors: number;
}

export function MemoryStatsWidget() {
  const activeSessionId = useChatStore(s => s.activeSessionId);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [memories, setMemories] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch stats and active session memories
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch overall database stats
      const statsRes = await invoke<MemoryStats>('get_memory_stats');
      setStats(statsRes);

      // 2. Fetch memories for the current session (default empty search returning recent vectors)
      if (activeSessionId) {
        const memsRes = await invoke<SearchResult[]>('get_conversation_memories', {
          chatId: activeSessionId,
          query: searchQuery.trim() || null,
          limit: 20
        });
        setMemories(memsRes);
      } else {
        setMemories([]);
      }
    } catch (err: any) {
      console.error('[MemoryStatsWidget] Error loading memory data:', err);
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }, [activeSessionId, searchQuery]);

  // Load on mount and session change
  useEffect(() => {
    loadData();
  }, [activeSessionId]);

  // Handle manual refresh
  const handleRefresh = () => {
    loadData();
  };

  // Perform query on search query change (debounced or triggered)
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Clear all memories in active session
  const handleClearSession = async () => {
    if (!activeSessionId) return;
    if (!confirm('Are you sure you want to purge all vector memories for this active session? This cannot be undone.')) return;
    
    setActionLoading(true);
    try {
      await invoke('clear_conversation_memories', { chatId: activeSessionId });
      setMemories([]);
      // Reload stats
      const statsRes = await invoke<MemoryStats>('get_memory_stats');
      setStats(statsRes);
    } catch (err: any) {
      alert(`Purge failed: ${err}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Purge the entire database
  const handlePurgeAll = async () => {
    if (!confirm('WARNING: Are you sure you want to delete ALL indexed memories across ALL chats? This will completely reset your local vector memory.')) return;
    
    setActionLoading(true);
    try {
      await invoke('clear_conversation_memories', { chatId: null });
      setMemories([]);
      setStats({ total_vectors: 0 });
    } catch (err: any) {
      alert(`Purge failed: ${err}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Estimate storage size (assuming 768 dimensions, float32 is 4 bytes, plus metadata overhead)
  const estimatedStorageSize = useMemo(() => {
    if (!stats) return '0 KB';
    const bytesPerVector = 768 * 4; // Nomadic dimension is 768
    const totalBytes = stats.total_vectors * bytesPerVector * 1.5; // Include 50% metadata overhead
    if (totalBytes < 1024) return `${totalBytes.toFixed(0)} B`;
    if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)} KB`;
    return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [stats]);

  return (
    <div className="flex flex-col h-full bg-[#050506] font-sans overflow-hidden">
      {/* ── Dashboard Stats Header ── */}
      <div className="p-4 border-b border-white/[0.04] bg-[#09090c]/40 shrink-0">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#0b0c10] border border-white/[0.04] p-3 rounded-lg flex flex-col justify-between">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <Database size={10} className="text-primary" /> Memory Pool
            </span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xl font-bold font-mono text-foreground tracking-tight">
                {stats?.total_vectors ?? 0}
              </span>
              <span className="text-[9px] text-zinc-600 font-medium">vectors</span>
            </div>
          </div>

          <div className="bg-[#0b0c10] border border-white/[0.04] p-3 rounded-lg flex flex-col justify-between">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <Cpu size={10} className="text-[#00ff9f]" /> Vector Size
            </span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xl font-bold font-mono text-[#00ff9f] tracking-tight">
                {estimatedStorageSize}
              </span>
              <span className="text-[9px] text-zinc-600 font-medium">disk</span>
            </div>
          </div>
        </div>

        {/* Telemetry info */}
        <div className="bg-[#0b0c10] border border-white/[0.04] px-3 py-2 rounded-lg text-[10px] text-zinc-400 font-mono flex items-center justify-between mb-2">
          <span className="flex items-center gap-1"><Brain size={11} className="text-purple-400" /> Vector Space:</span>
          <span className="text-zinc-500 font-bold uppercase">768-D LanceDB</span>
        </div>

        {/* Actions panel */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading || actionLoading}
            className="flex-1 py-1.5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] rounded-md text-[10px] font-bold uppercase tracking-wider text-zinc-300 transition-colors flex items-center justify-center gap-1.5"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          
          <button
            onClick={handleClearSession}
            disabled={!activeSessionId || loading || actionLoading || memories.length === 0}
            className="flex-1 py-1.5 bg-red-950/10 hover:bg-red-950/20 border border-red-500/20 rounded-md text-[10px] font-bold uppercase tracking-wider text-red-400/80 hover:text-red-400 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none"
          >
            <Trash2 size={11} />
            Purge Turn
          </button>

          <button
            onClick={handlePurgeAll}
            disabled={loading || actionLoading || !stats?.total_vectors}
            className="p-1.5 bg-red-950/15 hover:bg-red-950/30 border border-red-500/30 rounded-md text-red-500 hover:text-red-400 transition-colors flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
            title="Reset Entire Vector Database"
          >
            <ShieldAlert size={12} />
          </button>
        </div>
      </div>

      {/* ── Search Bar ── */}
      <form onSubmit={handleSearch} className="px-4 py-2 border-b border-white/[0.04] bg-[#070709] flex gap-2 shrink-0">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recalled vector memories..."
            className="w-full pl-7 pr-3 py-1.5 bg-black/40 border border-white/[0.04] focus:border-primary/40 rounded-md text-[11px] text-foreground font-mono placeholder:text-zinc-600 focus:outline-none transition-all"
          />
        </div>
        <button
          type="submit"
          className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-md text-[10px] font-bold uppercase tracking-wider text-primary transition-colors font-mono shrink-0"
        >
          QUERY
        </button>
      </form>

      {/* ── Memories List/Console ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-black/25">
        {loading && memories.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 font-mono py-16">
            <RefreshCw size={24} className="animate-spin text-zinc-600 mb-3 opacity-40" />
            <span className="text-[9px] uppercase tracking-widest">Scanning local vector memory...</span>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-950/5 border border-red-950/10 rounded-lg flex flex-col items-center text-center font-mono py-12">
            <ShieldAlert size={28} className="text-red-500 mb-3 opacity-60 animate-pulse" />
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2">Local Connection Interrupted</span>
            <p className="text-[9px] text-zinc-500 max-w-[200px] leading-relaxed">
              {error}
            </p>
          </div>
        ) : memories.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-zinc-600 py-20 px-6 font-mono">
            <Brain size={32} className="text-zinc-800 mb-4 opacity-50" />
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Memory Repository Empty</h4>
            <p className="text-[9px] text-zinc-600 mt-2 max-w-[200px] leading-relaxed">
              Start chatting! When you complete turns, high-value conversation context is automatically embedded and stored in your local LanceDB store.
            </p>
          </div>
        ) : (
          <div className="space-y-3 pb-8">
            <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center justify-between font-mono">
              <span>Memory Log Registry</span>
              <span className="text-zinc-600">{memories.length} entries shown</span>
            </div>
            
            <AnimatePresence initial={false}>
              {memories.map(({ entry, score }) => {
                const isUser = entry.role === 'user';
                const formattedTime = new Date(entry.timestamp).toLocaleString();
                
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="p-3 bg-[#0a0a0d] border border-white/[0.04] rounded-lg hover:border-white/[0.08] transition-all relative overflow-hidden group shadow-sm"
                  >
                    {/* Header bar with role and cosine similarity score */}
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded font-mono ${
                        isUser 
                          ? 'bg-primary/10 text-primary border border-primary/10' 
                          : 'bg-purple-500/10 text-purple-400 border border-purple-500/10'
                      }`}>
                        {entry.role}
                      </span>
                      
                      {score > 0 && (
                        <div className="text-[8.5px] font-mono text-zinc-500 flex items-center gap-1 select-none">
                          <span>SIMILARITY:</span>
                          <span className="font-bold text-[#00ff9f]">{(1 - score).toFixed(3)}</span>
                        </div>
                      )}
                    </div>

                    {/* Verbatim message content */}
                    <div className="text-[11px] text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap break-all px-1 py-1">
                      {entry.text}
                    </div>

                    {/* Metadata footer */}
                    <div className="mt-3 border-t border-white/[0.03] pt-2.5 text-[8px] font-mono text-zinc-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="flex items-center gap-1"><Calendar size={9} /> {formattedTime}</span>
                      <span className="flex items-center gap-1 cursor-pointer hover:text-zinc-400" title={entry.message_id}>
                        <Info size={9} /> ID_{entry.id.substring(0, 8)}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
