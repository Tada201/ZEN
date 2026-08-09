import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, FolderLock, Network, Server, ShieldCheck, Terminal } from "lucide-react";
import { mcpApi, type McpServerEntry, type McpServerStatusEvent } from "@/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import {
  getSafetyModeDefinition,
  isSafetyMode,
  type SafetyMode,
} from "@/lib/constants/permissionModes";

interface SecurityBoundarySummaryProps {
  onOpenSettings?: () => void;
  /** Effective session workspace; omitted means use the global settings workspace. */
  workspaceRoot?: string | null;
}

type BoundaryTone = "neutral" | "success" | "warning" | "danger";

const toneClasses: Record<BoundaryTone, string> = {
  neutral: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

function terminalSummary(confirmCommands: boolean, autoExecute: boolean) {
  if (autoExecute) return { label: "Configured: auto-execute", tone: "warning" as const };
  if (confirmCommands) return { label: "Configured: approval", tone: "success" as const };
  return { label: "Configured: policy controlled", tone: "neutral" as const };
}

function modeWriteSummary(mode: SafetyMode, allowExternalPaths: boolean) {
  if (mode === "plan_mode") return { label: "Configured: read-only", tone: "success" as const };
  if (allowExternalPaths) return { label: "Configured: external paths", tone: "warning" as const };
  if (mode === "ask") return { label: "Configured: approval", tone: "success" as const };
  return { label: "Configured: workspace only", tone: "neutral" as const };
}

export function SecurityBoundarySummary({ onOpenSettings, workspaceRoot }: SecurityBoundarySummaryProps) {
  const configuredWorkspacePath = useSettingsStore((state) => state.workspacePath);
  const capturedWorkspacePath = workspaceRoot?.trim() || null;
  const workspacePath = capturedWorkspacePath || configuredWorkspacePath || null;
  const workspaceStatus = capturedWorkspacePath
    ? "Locked for this chat"
    : workspacePath
      ? "Default workspace"
      : "Workspace not configured";
  const workspaceAllowExternalPaths = useSettingsStore((state) => state.workspaceAllowExternalPaths);
  const terminalConfirmCommands = useSettingsStore((state) => state.terminalConfirmCommands);
  const terminalAutoExecute = useSettingsStore((state) => state.terminalAutoExecute);
  const storedMode = useSettingsStore((state) => state.toolPermissionMode);
  const mode: SafetyMode = isSafetyMode(storedMode) ? storedMode : "ask";
  const modeInfo = useMemo(() => getSafetyModeDefinition(mode), [mode]);
  const writes = useMemo(
    () => modeWriteSummary(mode, workspaceAllowExternalPaths),
    [mode, workspaceAllowExternalPaths],
  );
  const terminal = useMemo(
    () => terminalSummary(terminalConfirmCommands, terminalAutoExecute),
    [terminalConfirmCommands, terminalAutoExecute],
  );

  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, McpServerStatusEvent>>({});
  const [mcpLoading, setMcpLoading] = useState(true);
  const [mcpError, setMcpError] = useState(false);

  useEffect(() => {
    let active = true;
    setMcpLoading(true);
    void mcpApi.listServers()
      .then((next) => {
        if (!active) return;
        setServers(next);
        setStatusMap((current) => {
          const names = new Set(next.map((server) => server.name));
          return Object.fromEntries(
            Object.entries(current).filter(([name]) => names.has(name)),
          );
        });
        setMcpError(false);
      })
      .catch(() => {
        if (active) setMcpError(true);
      })
      .finally(() => {
        if (active) setMcpLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void mcpApi.subscribeServerStatus((event) => {
      if (!cancelled) {
        setStatusMap((current) => ({ ...current, [event.name]: event }));
      }
    }).then((cleanup) => {
      if (cancelled) cleanup();
      else unlisten = cleanup;
    }).catch(() => {
      // MCP is optional. The configured-server count remains useful without events.
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const serverNames = useMemo(() => new Set(servers.map((server) => server.name)), [servers]);
  const statuses = useMemo(
    () => Object.values(statusMap).filter((event) => serverNames.has(event.name)),
    [serverNames, statusMap],
  );
  const connectedCount = statuses.filter((event) => event.status === "connected").length;
  const failedCount = statuses.filter((event) => event.status === "failed").length;
  const statusKnown = statuses.length > 0;
  const allStatusesKnown = statuses.length === servers.length;
  const mcpSummary = mcpLoading
    ? "Checking…"
    : mcpError
      ? "Unavailable"
      : servers.length === 0
        ? "None configured"
        : failedCount > 0
          ? `${failedCount} issue${failedCount === 1 ? "" : "s"} (${statuses.length}/${servers.length} checked)`
          : allStatusesKnown
            ? `${connectedCount}/${servers.length} connected`
            : statusKnown
              ? `${connectedCount} connected (${statuses.length}/${servers.length} checked)`
              : `${servers.length} configured (awaiting events)`;
  const mcpTone: BoundaryTone = mcpError || failedCount > 0
    ? "danger"
    : connectedCount > 0
      ? "success"
      : "neutral";
  const fileWriteDetail = `${modeInfo.label}. ${workspaceAllowExternalPaths
    ? "External paths are requested by the frontend settings."
    : "The frontend settings request workspace-only paths."} Backend policy is authoritative.`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Open security boundary summary"
          aria-haspopup="dialog"
          className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
          <span className="hidden text-[11px] font-semibold sm:inline">Boundary</span>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-[min(22rem,calc(100vw-2rem))] border-border bg-card p-0"
      >
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Security boundary</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Backend policy controls privileged actions. This is application-level access, not OS sandboxing.
              </p>
            </div>
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          </div>
        </div>

        <dl className="divide-y divide-border">
          <BoundaryRow
            icon={<FolderLock className="h-3.5 w-3.5" aria-hidden="true" />}
            label="Workspace"
            value={workspaceStatus}
            detail={workspacePath || "No default workspace is configured."}
            tone={workspacePath ? "success" : "warning"}
          />
          <BoundaryRow
            icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
            label="File writes"
            value={writes.label}
            detail={fileWriteDetail}
            tone={writes.tone}
          />
          <BoundaryRow
            icon={<Terminal className="h-3.5 w-3.5" aria-hidden="true" />}
            label="Terminal"
            value={terminal.label}
            detail="Frontend-configured policy only; backend policy is authoritative and terminal execution requires backend approval tokens where applicable."
            tone={terminal.tone}
          />
          <BoundaryRow
            icon={<Network className="h-3.5 w-3.5" aria-hidden="true" />}
            label="Network"
            value="Not reported"
            detail="This surface has no authoritative network-capability snapshot. Network-capable tools and provider requests remain governed by backend services."
            tone="neutral"
          />
          <BoundaryRow
            icon={<Server className="h-3.5 w-3.5" aria-hidden="true" />}
            label="MCP"
            value={mcpSummary}
            detail={mcpError ? "MCP status is unavailable in this environment." : "Configured MCP servers are listed; status updates arrive from backend events. Unchecked servers remain unverified."}
            tone={mcpTone}
          />
        </dl>

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <CircleHelp className="h-3 w-3" aria-hidden="true" />
            Hard security blocks remain active.
          </span>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open settings
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BoundaryRow({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: BoundaryTone;
}) {
  const StatusIcon = tone === "danger" ? AlertTriangle : tone === "warning" ? AlertTriangle : CheckCircle2;
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-2.5 px-4 py-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold text-foreground">{label}</dt>
        <dd className="mt-0.5 truncate text-[10px] text-muted-foreground" title={detail}>{detail}</dd>
      </div>
      <span className={`flex items-center gap-1 text-right text-[10px] font-semibold ${toneClasses[tone]}`}>
        <StatusIcon className="h-3 w-3" aria-hidden="true" />
        {value}
      </span>
    </div>
  );
}
