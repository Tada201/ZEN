import { useState } from 'react';
import { Database, Search, Plus, Filter, FileText, HardDrive, Share2, MoreVertical, Shield } from 'lucide-react';
import { cn } from '@/lib/utils/style';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

interface Document {
    id: string;
    name: string;
    type: string;
    size: string;
    status: 'indexed' | 'processing' | 'error';
    updatedAt: string;
}

export function IntelligenceVault() {
    const [searchQuery, setSearchQuery] = useState('');
    const [docs, setDocs] = useState<Document[]>([
        { id: '1', name: 'Strategic_Analysis_2024.pdf', type: 'PDF', size: '2.4 MB', status: 'indexed', updatedAt: '2 hours ago' },
        { id: '2', name: 'Field_Report_Alpha.docx', type: 'DOCX', size: '1.1 MB', status: 'indexed', updatedAt: '5 hours ago' },
        { id: '3', name: 'Satellite_Imagery_Metadata.json', type: 'JSON', size: '842 KB', status: 'processing', updatedAt: 'Just now' },
        { id: '4', name: 'Asset_Registry_v4.xlsx', type: 'XLSX', size: '4.2 MB', status: 'indexed', updatedAt: '1 day ago' },
    ]);

    const handleIngest = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Intelligence Documents', extensions: ['pdf', 'docx', 'txt', 'json', 'xlsx'] }]
            });

            if (selected) {
                const path = Array.isArray(selected) ? selected[0] : selected;
                await invoke('ingest_document', { path });
                
                // Add to list optimistically
                const fileName = path.split(/[\\/]/).pop() || 'Unknown';
                setDocs(prev => [{
                    id: Date.now().toString(),
                    name: fileName,
                    type: fileName.split('.').pop()?.toUpperCase() || 'DATA',
                    size: 'PENDING',
                    status: 'processing',
                    updatedAt: 'Just now'
                }, ...prev]);
            }
        } catch (err) {
            console.error("Ingestion failed:", err);
        }
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
            {/* Header */}
            <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-slate-900/40 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20">
                        <Database size={18} />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold tracking-tight text-white uppercase tracking-widest">Intelligence Vault</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-slate-500 uppercase">Secure Repository • 4.2 GB Used</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search intelligence..."
                            className="bg-black/40 border border-white/5 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-64"
                        />
                    </div>
                    
                    <WorkbenchButton size="sm" className="gap-2" onClick={handleIngest}>
                        <Plus size={14} />
                        INGEST DATA
                    </WorkbenchButton>
                </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Categories Sidebar */}
                <aside className="w-64 border-r border-white/5 p-4 flex flex-col gap-1">
                    {[
                        { icon: Database, label: 'All Collections', count: 124 },
                        { icon: FileText, label: 'Recent Analysis', count: 12 },
                        { icon: Share2, label: 'Shared Assets', count: 4 },
                        { icon: Shield, label: 'Encrypted Vault', count: 8 },
                        { icon: HardDrive, label: 'Local Cache', count: 15 },
                    ].map((item, i) => (
                        <button 
                            key={i}
                            className={cn(
                                "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all",
                                i === 0 ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <item.icon size={14} />
                                {item.label}
                            </div>
                            <span className="text-[10px] font-mono opacity-40">{item.count}</span>
                        </button>
                    ))}

                    <div className="mt-auto p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                        <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">RAG Engine Status</div>
                        <div className="flex items-center justify-between text-[9px] text-slate-500 mb-2">
                            <span>Index Health</span>
                            <span className="text-emerald-500">OPTIMAL</span>
                        </div>
                        <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full w-[94%] bg-blue-500" />
                        </div>
                    </div>
                </aside>

                {/* File List */}
                <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Repository Contents</h3>
                        <WorkbenchButton variant="ghost" size="xs" className="gap-2">
                            <Filter size={12} />
                            FILTER
                        </WorkbenchButton>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        {docs.map((doc) => (
                            <div 
                                key={doc.id}
                                className="group flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center">
                                        <FileText size={20} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-slate-200">{doc.name}</div>
                                        <div className="text-[10px] text-slate-500 mt-1 uppercase font-mono">
                                            {doc.type} • {doc.size} • Updated {doc.updatedAt}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full",
                                            doc.status === 'indexed' ? "bg-emerald-500" : "bg-blue-500 animate-pulse"
                                        )} />
                                        <span className="text-[10px] font-mono text-slate-500 uppercase">{doc.status}</span>
                                    </div>
                                    <button className="p-1 text-slate-600 hover:text-white transition-colors">
                                        <MoreVertical size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
            </div>
        </div>
    );
}
