import { memo, useState, useEffect } from 'react';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { Badge } from '@/components/ui/badge';
import { mcpApi, type McpStatus, type McpTool } from '@/api';

export const MCPSettings = memo((_props: { embedded?: boolean }) => {
    const [status, setStatus] = useState<McpStatus | null>(null);
    const [tools, setTools] = useState<McpTool[]>([]);
    const [configText, setConfigText] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [syncing, setSyncing] = useState<boolean>(false);
    const [savingConfig, setSavingConfig] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const fetchMcpState = async () => {
        try {
            const statusData = await mcpApi.getStatus();
            setStatus(statusData);

            const toolsData = await mcpApi.listTools();
            setTools(toolsData);

            const configData = await mcpApi.getConfig();
            setConfigText(JSON.stringify(configData, null, 2));

            setError(null);
        } catch (e: any) {
            console.error('[MCPSettings] Failed to load MCP backend state:', e);
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMcpState();
    }, []);

    const toggleServer = async () => {
        if (!status) return;
        setSyncing(true);
        try {
            if (status.state === 'running') {
                await mcpApi.stopServer();
            } else {
                await mcpApi.startServer();
            }
            await fetchMcpState();
        } catch (e: any) {
            setError(String(e));
        } finally {
            setSyncing(false);
        }
    };

    const saveConfig = async () => {
        setSavingConfig(true);
        try {
            const parsed = JSON.parse(configText);
            await mcpApi.saveConfig(parsed);
            await fetchMcpState();
            alert('External MCP Configuration saved successfully!');
        } catch (e: any) {
            alert(`Failed to save configuration: ${e.message || e}`);
        } finally {
            setSavingConfig(false);
        }
    };

    const copyText = async (text: string, onCopied?: () => void) => {
        try {
            await navigator.clipboard.writeText(text);
            onCopied?.();
        } catch (e: any) {
            setError(`Failed to copy MCP value: ${e.message || e}`);
        }
    };

    if (loading) {
        return (
            <SettingsCard
                title="Model Context Protocol (MCP)"
                subtitle="Cognitive Extensibility"
                description="Manage built-in MCP server tools and external server connections."
            >
                <div className="py-12 flex items-center justify-center">
                    <span className="text-zinc-500 animate-pulse text-[13px]">
                        Loading Model Context Protocol settings...
                    </span>
                </div>
            </SettingsCard>
        );
    }

    const isRunning = status?.state === 'running';
    const mcpEndpoint = status ? `http://${status.http_bind_host}:${status.http_port}/mcp` : "";

    return (
        <SettingsCard
            title="Model Context Protocol (MCP)"
            subtitle="Cognitive Extensibility"
            description="Expose local capabilities or connect to external MCP servers to extend the environment."
        >
            <div className="space-y-8">
                {error && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/5 border border-red-500/15">
                        <WorkbenchIcon name="lucide:alert-circle" className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-[11px] font-bold text-red-400">MCP Integration Error</p>
                            <p className="text-[10px] text-red-300/60 leading-relaxed font-mono">{error}</p>
                        </div>
                    </div>
                )}

                {/* ── Section 1: Built-in ZEN Tools Server ── */}
                <div className="space-y-4">
                    <div className="border-b border-white/5 pb-2">
                        <h3 className="text-[13px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                            <WorkbenchIcon name="lucide:server" size={14} className="text-primary" />
                            ZEN Tools Server (Local MCP Server)
                        </h3>
                        <p className="text-[11px] text-zinc-500 mt-1">
                            Expose ZEN's built-in tools (such as file edits, web searches, and command execution) to external clients (e.g., Claude Desktop, Cursor, or other MCP clients) using standard transport layers.
                        </p>
                    </div>

                    <div className="py-6 px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 border border-white/5 rounded-2xl bg-zinc-950/20">
                        <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all duration-300 ${
                                isRunning 
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                                    : "bg-zinc-900 border-white/5 text-zinc-500"
                            }`}>
                                <WorkbenchIcon name="codicon:plug" size={24} className={isRunning ? "animate-pulse" : ""} />
                            </div>
                            <div>
                                <h3 className="text-[14px] font-bold text-zinc-100 uppercase tracking-tight flex items-center gap-2">
                                    Local Server Status: 
                                    <span className={isRunning ? "text-emerald-400" : "text-zinc-500"}>
                                        {isRunning ? "Online" : "Offline"}
                                    </span>
                                </h3>
                                <p className="text-[11px] text-zinc-400 mt-0.5">
                                    {isRunning 
                                        ? `Exposing tools over JSON-RPC 2.0 at ${status.http_bind_host}:${status.http_port}.` 
                                        : "Start the local server to allow other apps to connect to Zen's tools."}
                                </p>
                            </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                            <WorkbenchButton 
                                variant={isRunning ? "secondary" : "primary"}
                                onClick={toggleServer}
                                disabled={syncing}
                                className="min-w-[120px]"
                            >
                                {syncing ? (
                                    <span className="animate-spin text-xs">&#8987;</span>
                                ) : (
                                    <>
                                        <WorkbenchIcon name={isRunning ? "lucide:stop-circle" : "lucide:play-circle"} size={14} className="mr-1.5" />
                                        {isRunning ? "Stop Server" : "Start Server"}
                                    </>
                                )}
                            </WorkbenchButton>
                        </div>
                    </div>

                    {isRunning && (
                        <div className="space-y-4 pl-2">
                            <div className="rounded-xl border border-white/[0.06] bg-zinc-950/30 p-3 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    <div>
                                        <h4 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                                            <WorkbenchIcon name="lucide:key-round" size={13} className="text-zinc-400" />
                                            HTTP Client Access
                                        </h4>
                                        <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
                                            External clients must send the token in the <code className="bg-white/5 px-1 py-0.5 rounded text-[9px]">x-zen-mcp-token</code> header.
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="h-5 text-[8px] font-mono border-emerald-500/20 text-emerald-300 bg-emerald-500/5 shrink-0">
                                        Auth Required
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
                                    <code className="min-w-0 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 text-[10px] text-zinc-300 font-mono truncate">
                                        {mcpEndpoint}
                                    </code>
                                    <WorkbenchButton
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => copyText(mcpEndpoint)}
                                        className="h-8 text-[10px] px-3"
                                    >
                                        <WorkbenchIcon name="lucide:copy" size={12} className="mr-1" />
                                        Copy URL
                                    </WorkbenchButton>
                                </div>

                                <div className="rounded-lg border border-amber-500/10 bg-amber-500/[0.03] px-2.5 py-2">
                                    <p className="text-[10px] text-amber-200/80 leading-relaxed">
                                        The MCP bearer token is intentionally not exposed to the renderer. This prevents generated UI, browser extensions, or XSS from copying a token that can call local tools.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between border-b border-white/5 pb-1">
                                <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <WorkbenchIcon name="lucide:cpu" size={13} className="text-zinc-400" />
                                    Active Exposed Tools ({tools.length})
                                </h4>
                                <span className="text-[10px] text-zinc-500">Available over JSON-RPC</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[180px] overflow-y-auto pr-1">
                                {tools.map((tool) => (
                                    <div key={tool.name} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] flex flex-col gap-1 hover:border-white/10 transition-colors">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-mono text-zinc-200 truncate">{tool.name}</span>
                                            {tool.risk_level && (
                                                <Badge variant="outline" className="text-[8px] h-4 font-mono">
                                                    {tool.risk_level}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-2">
                                            {tool.description || "No tool description provided."}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Section 2: External Client Integrations (.mcp.json) ── */}
                <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="border-b border-white/5 pb-2">
                        <div className="flex items-center gap-2">
                            <h3 className="text-[13px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                                <WorkbenchIcon name="lucide:settings" size={14} className="text-primary" />
                                External MCP Configuration Editor (.mcp.json)
                            </h3>
                            <Badge variant="outline" className="text-[8px] h-4 font-mono text-zinc-500 border-white/10 bg-white/[0.02]">
                                Config Only
                            </Badge>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-1">
                            View and edit the <code className="bg-white/5 px-1 py-0.5 rounded text-[10px]">.mcp.json</code> file in your workspace. Note: This section functions as a configuration manager; the active client runtime for launching and connecting to these external servers from within ZEN is currently in development.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <textarea
                            value={configText}
                            onChange={(e) => setConfigText(e.target.value)}
                            placeholder={`{\n  "mcpServers": {}\n}`}
                            className="w-full min-h-[180px] p-3 rounded-xl border border-white/[0.08] bg-zinc-950/40 text-[11px] font-mono text-zinc-300 focus:outline-none focus:border-brand-purple/50 resize-none transition-colors"
                        />
                        <div className="flex items-center justify-between gap-4">
                            <p className="text-[9.5px] text-zinc-500 leading-relaxed">
                                Define external MCP servers under the <code className="bg-white/5 px-1 py-0.5 rounded text-[8.5px]">mcpServers</code> block. Changes are saved directly to <code className="bg-white/5 px-1 py-0.5 rounded text-[8.5px]">.mcp.json</code> in your workspace root, ready to be utilized once full client-side tool integration is completed.
                            </p>
                            <WorkbenchButton 
                                variant="primary" 
                                size="sm" 
                                onClick={saveConfig}
                                disabled={savingConfig}
                                className="h-7 text-[10px] px-3 font-semibold uppercase tracking-wider shrink-0"
                            >
                                <WorkbenchIcon name="lucide:save" size={12} className="mr-1" />
                                {savingConfig ? "Saving..." : "Save Config"}
                            </WorkbenchButton>
                        </div>
                    </div>
                </div>
            </div>
        </SettingsCard>
    );
});
