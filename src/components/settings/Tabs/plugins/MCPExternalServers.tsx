import { memo } from 'react';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { Badge } from '@/components/ui/badge';

interface Props {
  configText: string;
  onChange: (text: string) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export const MCPExternalServers = memo(({ configText, onChange, onSave, saving }: Props) => {
  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <div className="border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
            <WorkbenchIcon name="lucide:settings" size={14} className="text-primary" />
            External MCP Servers (.mcp.json)
          </h3>
          <Badge
            variant="outline"
            className="text-[8px] h-4 font-mono text-muted-foreground border-border bg-muted/30"
          >
            Config Only
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Define external MCP servers under <code className="bg-muted/50 px-1 py-0.5 rounded text-[10px]">mcpServers</code>.
          Saved to <code className="bg-muted/50 px-1 py-0.5 rounded text-[10px]">.mcp.json</code> in your workspace root.
        </p>
      </div>

      <div className="space-y-3">
        <textarea
          value={configText}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'{\n  "mcpServers": {}\n}'}
          className="w-full min-h-[180px] p-3 rounded-xl border border-border bg-card/60 text-[11px] font-mono text-foreground focus:outline-none focus:border-brand-purple/50 resize-none transition-colors"
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-[9.5px] text-muted-foreground leading-relaxed">
            External servers defined here will be auto-connected on server start, with their tool
            catalog merged into the ZEN tool registry.
          </p>
          <WorkbenchButton
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={saving}
            className="h-7 text-[10px] px-3 font-semibold uppercase tracking-wider shrink-0"
          >
            <WorkbenchIcon name="lucide:save" size={12} className="mr-1" />
            {saving ? 'Saving...' : 'Save Config'}
          </WorkbenchButton>
        </div>
      </div>
    </div>
  );
});
