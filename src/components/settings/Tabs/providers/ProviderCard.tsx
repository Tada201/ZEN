import { useState } from "react";
import { ApiKeyInput } from "./ApiKeyInput";
import { ConnectionTestButton, type ConnectionStatus } from "./ConnectionTestButton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface KnownProvider {
  id: string;
  name: string;
  icon: React.ReactNode;
  docsUrl?: string;
  /** True if this provider uses an API key */
  usesKey?: boolean;
  /** True if this provider uses a base URL (local) */
  usesUrl?: boolean;
  /** Default placeholder for the API key input */
  keyPlaceholder?: string;
  /** Default placeholder for the base URL input */
  urlPlaceholder?: string;
}

interface ProviderCardProps {
  provider: KnownProvider;
  apiKey?: string;
  baseUrl?: string;
  enabled?: boolean;
  connectionStatus?: ConnectionStatus;
  onApiKeyChange?: (value: string) => void;
  onBaseUrlChange?: (value: string) => void;
  onToggle?: (enabled: boolean) => void;
  onTestConnection?: () => void;
  /** Display compact version (no API key field shown inline) */
  compact?: boolean;
}

export function ProviderCard({
  provider,
  apiKey = "",
  baseUrl = "",
  enabled = true,
  connectionStatus = { state: "idle" },
  onApiKeyChange,
  onBaseUrlChange,
  onToggle,
  onTestConnection,
  compact = false,
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasKey = apiKey.length > 0;
  const hasUrl = baseUrl.length > 0;
  const isConfigured = provider.usesKey ? hasKey : provider.usesUrl ? hasUrl : true;

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors duration-150",
        enabled
          ? "border-border bg-muted/30"
          : "border-border/[0.03] bg-muted/20 opacity-60",
        expanded && "ring-1 ring-primary/20"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center shrink-0">
            {provider.icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground truncate">
                {provider.name}
              </span>
              {isConfigured && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[8px] font-bold uppercase tracking-wider
                    border-emerald-500/20 text-success bg-success/5"
                >
                  Active
                </Badge>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground/70 font-mono">{provider.id}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!compact && !expanded && onTestConnection && (
            <ConnectionTestButton
              status={connectionStatus}
              onTest={onTestConnection}
              disabled={!isConfigured}
            />
          )}
          {onToggle && (
            <Switch
              checked={enabled}
              onCheckedChange={onToggle}
              className="scale-75"
            />
          )}
          {!compact && (provider.usesKey || provider.usesUrl) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="h-6 px-1.5 text-[10px] text-muted-foreground/70 hover:text-foreground
                hover:bg-muted rounded transition-colors"
            >
              {expanded ? "Hide" : "Edit"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded: API Key / URL fields */}
      {expanded && !compact && (
        <div className="px-3 pb-3 pt-0 space-y-2.5 border-t border-border">
          {provider.usesKey && (
            <div className="pt-2.5 space-y-1.5">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                API Key
              </Label>
              <ApiKeyInput
                value={apiKey}
                onChange={(v) => onApiKeyChange?.(v)}
                placeholder={provider.keyPlaceholder || "sk-..."}
                disabled={!enabled}
              />
            </div>
          )}
          {provider.usesUrl && (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Base URL
              </Label>
              <Input
                type="text"
                value={baseUrl}
                onChange={(e) => onBaseUrlChange?.(e.target.value)}
                placeholder={provider.urlPlaceholder || "http://localhost:11434"}
                disabled={!enabled}
                className="h-8 text-[12px] bg-muted/40 border-border font-mono
                  focus:border-primary/40 focus:ring-1 focus:ring-primary/20
                  placeholder:text-foreground/80"
              />
            </div>
          )}
          {onTestConnection && (
            <div className="flex justify-end pt-1">
              <ConnectionTestButton
                status={connectionStatus}
                onTest={onTestConnection}
                disabled={!enabled || !isConfigured}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { KnownProvider };
