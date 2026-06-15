import { useState, useEffect } from "react";
import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSwitch } from "../ui/WorkbenchSwitch";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchTextArea } from "../ui/WorkbenchTextArea";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { Badge } from "@/components/ui/badge";
import { mapBackendToolMeta, toolsApi, type ToolMeta } from "@/api";

interface ToolsSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

// ── Canonical tool shape from the backend ─────────────────────────

const RISK_COLORS: Record<string, string> = {
  Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  High: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Critical: "bg-red-500/10 text-red-400 border-red-500/20",
};

const PERMISSION_OPTIONS = [
  { value: "inherit", label: "Inherit", description: "Use global default" },
  { value: "allow", label: "Allow", description: "Override to always allow" },
  { value: "deny", label: "Deny", description: "Override to always deny" },
  { value: "confirm", label: "Confirm", description: "Override to always confirm" },
];

function ToolPermissionCard({
  tool,
  settings,
  onUpdate,
  expanded,
  onToggle,
}: {
  tool: ToolMeta;
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const prefix = `tools.permission.${tool.id}`;
  const permissionDefault = settings[`${prefix}.default`] || "inherit";
  const allowPatterns = settings[`${prefix}.allow-patterns`] || "";
  const denyPatterns = settings[`${prefix}.deny-patterns`] || "";
  const confirmPatterns = settings[`${prefix}.confirm-patterns`] || "";
  const isOverridden = permissionDefault !== "inherit";

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden transition-all duration-200">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left cursor-pointer"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${tool.name} settings`}
        >
          <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
            isOverridden ? "bg-primary/10" : "bg-white/[0.03]"
          }`}>
            <WorkbenchIcon name={tool.icon} className={`h-3.5 w-3.5 ${isOverridden ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-foreground">{tool.name}</span>
              <Badge
                variant="outline"
                className={`h-4 px-1.5 text-[9px] font-semibold border ${RISK_COLORS[tool.riskLevel]}`}
              >
                {tool.riskLevel}
              </Badge>
              {isOverridden && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[9px] font-semibold bg-blue-500/10 text-blue-400 border-blue-500/20"
                >
                  Override
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/60 truncate">{tool.description}</p>
          </div>
        </button>
        <div className="shrink-0 flex items-center gap-2">
          <div
            onClick={(e) => e.stopPropagation()}
          >
            <WorkbenchSelect
              value={permissionDefault}
              onValueChange={(v) => onUpdate(`${prefix}.default`, v)}
              options={PERMISSION_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
              width={100}
            />
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="p-0.5 hover:bg-white/[0.06] rounded transition-colors cursor-pointer"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${tool.name} patterns`}
          >
            <WorkbenchIcon
              name={expanded ? "lucide:chevron-down" : "lucide:chevron-right"}
              className="h-3.5 w-3.5 text-muted-foreground"
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.06] px-3 py-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <WorkbenchIcon name="lucide:eye" className="h-3 w-3 text-emerald-400" />
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Allow Patterns</span>
              </div>
              <WorkbenchTextArea
                value={allowPatterns}
                onChangeText={(v) => onUpdate(`${prefix}.allow-patterns`, v)}
                placeholder=".*\.txt$&#10;^/tmp/"
                className="min-h-[52px] text-[10px] font-mono bg-background/50 resize-none"
              />
              <p className="text-xs text-muted-foreground">Regex patterns that are automatically allowed</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <WorkbenchIcon name="lucide:shield-off" className="h-3 w-3 text-red-400" />
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Deny Patterns</span>
              </div>
              <WorkbenchTextArea
                value={denyPatterns}
                onChangeText={(v) => onUpdate(`${prefix}.deny-patterns`, v)}
                placeholder="\.env$&#10;secret"
                className="min-h-[52px] text-[10px] font-mono bg-background/50 resize-none"
              />
              <p className="text-xs text-muted-foreground">Regex patterns that are automatically denied</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <WorkbenchIcon name="lucide:shield-alert" className="h-3 w-3 text-amber-400" />
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Confirm Patterns</span>
              </div>
              <WorkbenchTextArea
                value={confirmPatterns}
                onChangeText={(v) => onUpdate(`${prefix}.confirm-patterns`, v)}
                placeholder="rm .*&#10;write:.*"
                className="min-h-[52px] text-[10px] font-mono bg-background/50 resize-none"
              />
              <p className="text-xs text-muted-foreground">Regex patterns that require confirmation</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ToolsSettings({ settings, onUpdate }: ToolsSettingsProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [showAllTools, setShowAllTools] = useState(false);
  const [tools, setTools] = useState<ToolMeta[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setFetching(true);
    toolsApi.listToolMetadata()
      .then((backendList) => {
        if (cancelled) return;
        const mapped: ToolMeta[] = backendList
          .filter((t) => t.name !== "")
          .map(mapBackendToolMeta);
        setTools(mapped);
      })
      .catch((err) => {
        console.error("[ToolsSettings] Failed to fetch tool metadata:", err);
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleToolExpanded = (toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const yoloMode = settings["tools.yolo-mode"] === "true";
  const autoApproveLowRisk = settings["tools.auto-approve-low-risk"] === "true";
  const globalDefault = settings["tools.global-default"] || "confirm";
  const visibleTools = showAllTools ? tools : tools.slice(0, 3);
  const hiddenCount = Math.max(0, tools.length - 3);
  const confirmYoloEnable = () =>
    window.confirm(
      "Enable YOLO mode? This auto-approves tool calls except hardcoded security blocks. Use only in a trusted workspace."
    );

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Tools & Permissions</h3>
        <p className="text-[13px] text-muted-foreground">
          Configure tool execution permissions, safety modes, and per-tool access controls.
        </p>
      </div>

      {/* ── Global Tool Policy ── */}
      <SettingsSection title="Global Tool Policy" icon="lucide:shield" description="Default permission rules for all tool calls">
        <SettingsRow
          label="Global Default"
          description="Fallback permission when no tool-specific rule matches"
          control={
            <WorkbenchSelect
              value={globalDefault}
              onValueChange={(v) => onUpdate("tools.global-default", v)}
              options={[
                { value: "confirm", label: "Always Confirm" },
                { value: "always_allow", label: "Always Allow" },
                { value: "always_deny", label: "Always Deny" },
              ]}
              width={140}
            />
          }
          icon="lucide:shield-check"
        />

        {/* YOLO Mode with warning */}
        <div className="relative">
          <SettingsRow
            label="YOLO Mode"
            description="Bypass all confirmations — automatically approve every tool call (except hardcoded security rules)"
            control={
              <WorkbenchSwitch
                checked={yoloMode}
                onCheckedChange={(v) => {
                  if (v && !confirmYoloEnable()) return;
                  onUpdate("tools.yolo-mode", String(v));
                }}
              />
            }
            icon="lucide:rocket"
          />
          {yoloMode && (
            <div className="mx-3 mb-2 flex items-start gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/15">
              <WorkbenchIcon name="lucide:alert-triangle" className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-red-400">Security Warning</p>
                <p className="text-[10px] text-red-300/60">
                  YOLO mode auto-approves all tool calls. Only enable in isolated or trusted environments. Hardcoded security rules (e.g., <code className="text-[9px] font-mono bg-red-500/10 px-1 rounded">rm -rf /</code>) remain blocked regardless.
                </p>
              </div>
            </div>
          )}
        </div>

        <SettingsRow
          label="Auto-Approve Low Risk"
          description="Automatically allow read-only and safe operations without confirmation"
          control={
            <WorkbenchSwitch
              checked={autoApproveLowRisk}
              onCheckedChange={(v) => onUpdate("tools.auto-approve-low-risk", String(v))}
            />
          }
          icon="lucide:shield"
        />
      </SettingsSection>

      {/* ── Per-Tool Permissions ── */}
      <SettingsSection title="Per-Tool Permissions" icon="lucide:shield-alert" description="Override global policy for individual tools">
        <div className="px-3 py-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-zinc-500">
              Configure tool-specific defaults and regex-based allow/deny/confirm patterns.
            </p>
            {fetching && (
              <span className="text-[10px] text-zinc-500 animate-pulse">
                Loading tool registry...
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            {visibleTools.map((tool) => (
              <ToolPermissionCard
                key={tool.id}
                tool={tool}
                settings={settings}
                onUpdate={onUpdate}
                expanded={expandedTools.has(tool.id)}
                onToggle={() => toggleToolExpanded(tool.id)}
              />
            ))}
            {!fetching && tools.length === 0 && (
              <p className="text-[11px] text-zinc-500 py-4 text-center">
                No tool metadata available. The backend registry may not be initialized yet.
              </p>
            )}
          </div>

          {!fetching && hiddenCount > 0 && (
            <div className="mt-2">
              <WorkbenchButton
                variant="ghost"
                size="sm"
                onClick={() => setShowAllTools(!showAllTools)}
                className="w-full h-7 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/[0.03] border border-dashed border-white/[0.06]"
              >
                {showAllTools ? (
                  <>Show fewer tools</>
                ) : (
                  <>Show all {tools.length} tools ({hiddenCount} more)</>
                )}
              </WorkbenchButton>
            </div>
          )}

          <div className="mt-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <strong className="text-zinc-500">Pattern precedence:</strong> Within each tool, deny patterns take priority over confirm patterns, which take priority over allow patterns. The tool-specific default (if set) only applies when no pattern matches. Otherwise the global default is used.
            </p>
          </div>
        </div>
      </SettingsSection>


      {/* ── Quick Presets ── */}
      <SettingsSection title="Quick Presets" icon="lucide:zap" description="Apply pre-configured permission profiles">
        <div className="px-3 py-2 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                onUpdate("tools.global-default", "always_deny");
                onUpdate("tools.yolo-mode", "false");
                onUpdate("tools.auto-approve-low-risk", "false");
              }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-white/[0.06] hover:bg-white/[0.03] transition-colors cursor-pointer"
            >
              <WorkbenchIcon name="lucide:lock" size={20} className="text-red-400" />
              <span className="text-[11px] font-bold text-foreground">Locked Down</span>
              <span className="text-xs text-center leading-relaxed text-muted-foreground">All tools require confirmation. Maximum safety.</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onUpdate("tools.global-default", "confirm");
                onUpdate("tools.yolo-mode", "false");
                onUpdate("tools.auto-approve-low-risk", "true");
              }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-white/[0.06] border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.06] transition-colors cursor-pointer"
            >
              <WorkbenchIcon name="lucide:shield-check" size={20} className="text-amber-400" />
              <span className="text-[11px] font-bold text-foreground">Balanced</span>
              <span className="text-xs text-center leading-relaxed text-muted-foreground">Confirm by default and approve low-risk tools automatically.</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!confirmYoloEnable()) return;
                onUpdate("tools.global-default", "always_allow");
                onUpdate("tools.yolo-mode", "true");
                onUpdate("tools.auto-approve-low-risk", "true");
              }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-white/[0.06] hover:bg-white/[0.03] transition-colors cursor-pointer"
            >
              <WorkbenchIcon name="lucide:rocket" size={20} className="text-emerald-400" />
              <span className="text-[11px] font-bold text-foreground">Full Auto</span>
              <span className="text-xs text-center leading-relaxed text-muted-foreground">All tools are automatically approved. Use with care.</span>
            </button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
