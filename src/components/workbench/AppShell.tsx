import React from 'react';
import { useTheme } from '../../lib/hooks/useTheme';
import { useUIStore } from '../../lib/stores/useUIStore';
import { cn } from '../../lib/utils/style';

interface AppShellProps {
  activityBar: React.ReactNode;
  sidebar: React.ReactNode;
  mainArea: React.ReactNode;
  rightPanel: React.ReactNode;
  statusBar: React.ReactNode;
}

/**
 * Zen Workbench Shell
 * Layout: Activity Bar (Left) | Sidebar (Resizable) | Main Area (Flex) | Status Bar (Bottom)
 */
export function AppShell({ activityBar, sidebar, mainArea, rightPanel, statusBar }: AppShellProps) {
  useTheme(); // Initialize theme logic
  
  const { sidebarOpen, sidebarWidth } = useUIStore();

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-950 overflow-hidden selection:bg-violet-500/30 selection:text-white">
      {/* Main Workbench Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Activity Bar (Fixed 48px) */}
        <div className="z-30 w-12 border-r border-slate-800 bg-slate-900 flex flex-col items-center py-4 shrink-0">
          {activityBar}
        </div>

        {/* Primary Sidebar (256px to match SessionSidebar) */}
        {sidebarOpen && sidebar && (
          <div
            className="z-20 h-full border-r border-slate-800 bg-slate-900/50 backdrop-blur-md overflow-hidden flex flex-col shrink-0 transition-all duration-300 ease-in-out"
            style={{ width: 256 }}
          >
            {sidebar}
          </div>
        )}

        {/* Main Content Area */}
        <main className="relative flex flex-col flex-1 min-w-0 bg-slate-950 overflow-hidden z-10">
          {mainArea}
        </main>

        {/* Right Modular Panel */}
        {rightPanel}
      </div>

      {/* Bottom Status Bar */}
      <div className="z-40 h-6 border-t border-slate-800 bg-slate-900 flex items-center px-3 text-[11px] shrink-0">
        {statusBar}
      </div>
    </div>
  );
}
