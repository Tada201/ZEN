import { MessageSquare, Globe, Database, Settings, ShieldAlert, Cpu, Terminal } from 'lucide-react';
import { useUIStore } from '../../lib/stores/useUIStore';
import { cn } from '../../lib/utils/style';

/**
 * High-fidelity Activity Bar for module switching.
 */
export function ActivityBar() {
  const { activeTab, setActiveTab, toggleSidebar, sidebarOpen, toggleSettings } = useUIStore();

  const navItems = [
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'map', icon: Globe, label: 'Tactical Map' },
    { id: 'swarm', icon: Cpu, label: 'Swarm Orchestrator' },
    { id: 'storage', icon: Database, label: 'Intelligence Vault' },
    { id: 'terminal', icon: Terminal, label: 'Nexus Shell' },
  ];

  return (
    <div className="flex flex-col items-center gap-4 h-full">
      {/* Top Icons */}
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            setActiveTab(item.id);
            if (!sidebarOpen) toggleSidebar();
          }}
          className={cn(
            "relative group p-2 rounded-xl transition-all duration-200",
            activeTab === item.id 
              ? "bg-primary/10 text-primary shadow-sm" 
              : "text-muted-foreground/60 hover:text-foreground hover:bg-muted"
          )}
          title={item.label}
        >
          <item.icon size={22} />
          {/* Active Rail Indicator */}
          {activeTab === item.id && (
            <div className="absolute -left-[5px] top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary animate-in fade-in slide-in-from-left-1" />
          )}
        </button>
      ))}

      {/* Bottom Icons */}
      <div className="mt-auto flex flex-col gap-4 mb-2">
        <button className="p-2 text-muted-foreground/40 hover:text-red-500 transition-colors" title="Security Protocols">
          <ShieldAlert size={20} />
        </button>
        <button 
          className="p-2 text-muted-foreground/40 hover:text-primary transition-colors" 
          title="System Settings"
          onClick={toggleSettings}
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  );
}
