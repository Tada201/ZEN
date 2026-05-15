import * as Dialog from '@radix-ui/react-dialog';
import { useUIStore } from '../../lib/stores/useUIStore';
import { useSettingsStore } from '../../lib/stores/useSettingsStore';
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/style';
import { X, Settings, Cpu, Globe, Zap, Palette, Shield, Activity, Info } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'general', label: 'General', icon: <Settings size={14} /> },
  { id: 'providers', label: 'Providers', icon: <Globe size={14} /> },
  { id: 'models', label: 'Models', icon: <Cpu size={14} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
  { id: 'security', label: 'Security', icon: <Shield size={14} /> },
  { id: 'advanced', label: 'Advanced', icon: <Activity size={14} /> },
  { id: 'about', label: 'About', icon: <Info size={14} /> },
];

export function SettingsModal() {
  const { settingsOpen, setSettingsOpen, activeSettingsTab, setActiveSettingsTab } = useUIStore();
  
  return (
    <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/80 z-[100] backdrop-blur-sm animate-in fade-in duration-300" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[65vw] h-[70vh] max-w-[1000px] bg-slate-950 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[101]"
        >
          <Dialog.Title className="sr-only">Settings</Dialog.Title>
          
          <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-slate-900/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20">
                <Settings size={18} />
              </div>
              <span className="text-sm font-bold tracking-tight text-foreground uppercase tracking-widest">Workbench Settings</span>
            </div>
            
            <Dialog.Close asChild>
              <button className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 rounded-full transition-all">
                <X size={18} />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar */}
            <aside className="w-56 border-r border-white/10 bg-slate-950/50 flex flex-col p-4 gap-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSettingsTab(item.id)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all",
                    activeSettingsTab === item.id 
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" 
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </aside>

            {/* Content Area */}
            <main className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#020617]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSettingsTab}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="max-w-2xl"
                >
                  {activeSettingsTab === 'general' && <GeneralSettings />}
                  {activeSettingsTab === 'providers' && <ProviderSettings />}
                  {activeSettingsTab === 'models' && <ModelSettings />}
                  {activeSettingsTab === 'appearance' && <AppearanceSettings />}
                  {activeSettingsTab === 'about' && <AboutSection />}
                  {!['general', 'providers', 'models', 'appearance', 'about'].includes(activeSettingsTab) && (
                    <div className="flex flex-col items-center justify-center h-full py-20 text-slate-500 italic opacity-50">
                      <Zap size={48} className="mb-4" />
                      Section under initialization...
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>

          <footer className="h-12 border-t border-white/10 flex items-center justify-between px-6 bg-slate-950 shrink-0">
            <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Zen OS v2.0.4-stable</span>
            <div className="flex gap-3">
              <WorkbenchButton size="xs" variant="ghost">Discard</WorkbenchButton>
              <WorkbenchButton size="xs" variant="primary">Save Changes</WorkbenchButton>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function GeneralSettings() {
  const { animationsEnabled, setAnimationsEnabled, lowResourceMode, setLowResourceMode } = useSettingsStore();
  
  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest flex items-center gap-2">
          <Activity size={14} className="text-blue-400" /> System Performance
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div>
              <div className="text-xs font-bold text-slate-300">Interface Animations</div>
              <div className="text-[10px] text-slate-500 mt-1">Enable smooth transitions and micro-interactions.</div>
            </div>
            <input 
              type="checkbox" 
              checked={animationsEnabled} 
              onChange={(e) => setAnimationsEnabled(e.target.checked)}
              className="accent-blue-500"
            />
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div>
              <div className="text-xs font-bold text-slate-300">Low Resource Mode</div>
              <div className="text-[10px] text-slate-500 mt-1">Reduces background processing and blur effects.</div>
            </div>
            <input 
              type="checkbox" 
              checked={lowResourceMode} 
              onChange={(e) => setLowResourceMode(e.target.checked)}
              className="accent-blue-500"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function ProviderSettings() {
  const providers = [
    { id: 'ollama', name: 'Ollama', status: 'connected', type: 'Local' },
    { id: 'openai', name: 'OpenAI', status: 'not_configured', type: 'Cloud' },
    { id: 'anthropic', name: 'Anthropic', status: 'not_configured', type: 'Cloud' },
    { id: 'google', name: 'Google Gemini', status: 'not_configured', type: 'Cloud' },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest flex items-center gap-2">
          <Globe size={14} className="text-blue-400" /> AI Providers
        </h3>
        <div className="grid grid-cols-1 gap-3">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-slate-900 border border-white/10 flex items-center justify-center text-xs font-bold">
                  {p.name[0]}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-300">{p.name}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{p.type} • {p.status === 'connected' ? 'Active' : 'Setup Required'}</div>
                </div>
              </div>
              <WorkbenchButton size="xs" variant={p.status === 'connected' ? 'outline' : 'blue'}>
                {p.status === 'connected' ? 'Configure' : 'Setup'}
              </WorkbenchButton>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AppearanceSettings() {
  const { theme, setTheme, density, setDensity } = useUIStore();
  
  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest flex items-center gap-2">
          <Palette size={14} className="text-blue-400" /> Visual Engine
        </h3>
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Color Theme</label>
            <div className="flex gap-3">
              {['dark', 'light', 'tactical'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t as any)}
                  className={cn(
                    "flex-1 p-3 rounded-xl border transition-all text-[11px] font-bold capitalize",
                    theme === t ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/10"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Interface Density</label>
            <div className="flex gap-3">
              {['normal', 'compact'].map((d) => (
                <button
                  key={d}
                  onClick={() => setDensity(d as any)}
                  className={cn(
                    "flex-1 p-3 rounded-xl border transition-all text-[11px] font-bold capitalize",
                    density === d ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/10"
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="flex flex-col items-center text-center space-y-6 py-10">
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-600 p-0.5 shadow-2xl">
        <div className="w-full h-full rounded-[22px] bg-slate-950 flex items-center justify-center">
          <Zap size={48} className="text-blue-500" />
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-black tracking-tighter text-white">Project Zen</h2>
        <p className="text-xs text-slate-500 font-mono mt-1">Enterprise Agentic Workspace v2.0.4</p>
      </div>
      <div className="max-w-xs text-xs text-slate-400 leading-relaxed">
        Zen is a high-performance, modular workbench designed for deep intelligence analysis and agentic orchestration.
      </div>
      <div className="flex gap-4">
        <WorkbenchButton size="xs" variant="outline">Website</WorkbenchButton>
        <WorkbenchButton size="xs" variant="outline">Github</WorkbenchButton>
        <WorkbenchButton size="xs" variant="outline">Docs</WorkbenchButton>
      </div>
    </div>
  );
}

function ModelSettings() {
  const models = [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', type: 'Chat' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', type: 'Chat' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google', type: 'Chat' },
    { id: 'llama-3-70b', name: 'Llama 3 70B', provider: 'Ollama', type: 'Local' },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-bold text-slate-200 mb-4 uppercase tracking-widest flex items-center gap-2">
          <Cpu size={14} className="text-blue-400" /> Active Models
        </h3>
        <div className="grid grid-cols-1 gap-3">
          {models.map((m) => (
            <div key={m.id} className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
              <div>
                <div className="text-xs font-bold text-slate-300">{m.name}</div>
                <div className="text-[10px] text-slate-500 mt-1">{m.provider} • {m.type}</div>
              </div>
              <div className="flex gap-2">
                <WorkbenchButton size="xs" variant="ghost">Stats</WorkbenchButton>
                <WorkbenchButton size="xs" variant="outline">Route</WorkbenchButton>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
