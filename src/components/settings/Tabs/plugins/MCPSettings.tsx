import { memo, useState, useEffect } from 'react';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { mcpApi } from '@/api';
import { MCPExternalServers } from './MCPExternalServers';

export const MCPSettings = memo((_props: { embedded?: boolean }) => {
  const [configText, setConfigText] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMcpConfig = async () => {
    try {
      const configData = await mcpApi.getConfig();
      setConfigText(JSON.stringify(configData, null, 2));
      setError(null);
    } catch (e: any) {
      console.error('[MCPSettings] Failed to load MCP config:', e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMcpConfig();
  }, []);

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const parsed = JSON.parse(configText);
      await mcpApi.saveConfig(parsed);
      await fetchMcpConfig();
    } catch (e: any) {
      alert(`Failed to save configuration: ${e.message || e}`);
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) {
    return (
      <SettingsCard
        title="Model Context Protocol (MCP)"
        subtitle="Cognitive Extensibility"
        description="Manage external MCP server connections."
      >
        <div className="py-12 flex items-center justify-center">
          <span className="text-muted-foreground animate-pulse text-[13px]">
            Loading MCP configuration...
          </span>
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title="Model Context Protocol (MCP)"
      subtitle="Cognitive Extensibility"
      description="Connect to external MCP servers to extend agent capabilities."
    >
      <div className="space-y-8">
        {error && (
          <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/15">
            <p className="text-[11px] text-destructive/80 font-mono">{error}</p>
          </div>
        )}

        <MCPExternalServers
          configText={configText}
          onChange={setConfigText}
          onSave={saveConfig}
          saving={savingConfig}
        />
      </div>
    </SettingsCard>
  );
});
