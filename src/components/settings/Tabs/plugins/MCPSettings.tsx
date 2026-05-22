import { memo } from 'react';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { UnderConstructionBanner } from '@/components/settings/ui/UnderConstructionBanner';

export const MCPSettings = memo((_props: { embedded?: boolean }) => {
    return (
        <SettingsCard
            title="MCP Server Integration"
            subtitle="Cognitive Extensibility"
            description="Extend cognitive capabilities with Model Context Protocol (MCP) servers."
        >
            <div className="space-y-6">
                <UnderConstructionBanner
                    featureName="Model Context Protocol (MCP)"
                    description="Configure, inspect, and connect external MCP servers providing custom tool definitions, dynamic resources, and prompt templates to the Agentic Core."
                />
                <div className="py-12 px-8 flex flex-col items-center gap-10 border border-white/5 border-dashed rounded-2xl bg-zinc-950/20">
                    <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center border border-white/5">
                        <WorkbenchIcon name="codicon:plug" size={36} className="text-brand-purple" />
                    </div>

                <div className="flex flex-col items-center gap-3 text-center">
                    <h3 className="text-[18px] font-bold text-zinc-100 uppercase tracking-tight">
                        Network Topology: <span className="text-brand-purple">Offline</span>
                    </h3>
                    <p className="text-sm text-zinc-400 leading-relaxed max-w-md">
                        Connect Model Context Protocol servers to extend the workbench with external cognitive capabilities.
                    </p>
                </div>

                <div className="flex gap-3">
                    <WorkbenchButton variant="primary">
                        <WorkbenchIcon name="codicon:plug" size={14} />
                        Connect MCP Server
                    </WorkbenchButton>
                    <WorkbenchButton variant="secondary">
                        Configure Manually
                    </WorkbenchButton>
                </div>

                <div className="grid grid-cols-3 gap-4 w-full max-w-2xl mt-4">
                    <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-900/50 border border-white/5">
                        <WorkbenchIcon name="codicon:globe" size={20} className="text-zinc-400" />
                        <span className="text-[11px] text-zinc-400">Filesystem</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-900/50 border border-white/5">
                        <WorkbenchIcon name="codicon:terminal" size={20} className="text-zinc-400" />
                        <span className="text-[11px] text-zinc-400">Terminal</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-900/50 border border-white/5 opacity-40">
                        <WorkbenchIcon name="codicon:zap" size={20} className="text-zinc-500" />
                        <span className="text-[11px] text-zinc-500">Custom</span>
                    </div>
                </div>
            </div>
            </div>
        </SettingsCard>
    );
});