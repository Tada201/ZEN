import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { mapBackendToolMeta, toolsApi, type ToolMeta } from "@/api";
import { cn } from "@/lib/utils";

interface ToolsSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

type SafetyMode = "plan_mode" | "ask" | "auto_edit" | "yolo";

const MODES: Array<{
  id: SafetyMode;
  title: string;
  description: string;
  detail: string;
  icon: string;
  tone: string;
}> = [
  {
    id: "plan_mode",
    title: "Plan mode",
    description: "Plan before editing. Disallows file modifications and terminal commands.",
    detail: "Read-only access, safest mode for analyzing code.",
    icon: "lucide:file-text",
    tone: "text-muted-foreground",
  },
  {
    id: "ask",
    title: "Ask before changes",
    description: "Confirm file changes and commands before execution.",
    detail: "Ask before file edits or terminal writes.",
    icon: "lucide:hand",
    tone: "text-primary",
  },
  {
    id: "auto_edit",
    title: "Edit automatically",
    description: "Edit files when low/medium risk. Ask before high-impact changes (file writes and terminal commands).",
    detail: "Edit run automatically; writes and shell prompt.",
    icon: "lucide:shield-check",
    tone: "text-success",
  },
  {
    id: "yolo",
    title: "Full access",
    description: "Run permitted tools and scripts without confirmation.",
    detail: "Run with fewer confirmations. Use in trusted env.",
    icon: "lucide:shield-alert",
    tone: "text-warning",
  },
];

const RISK_STYLE: Record<string, string> = {
  Low: "border-emerald-500/20 bg-success/10 text-success",
  Medium: "border-warning/20 bg-warning/10 text-warning",
  High: "border-orange-500/20 bg-orange-500/10 text-orange-400",
  Critical: "border-destructive/20 bg-destructive/10 text-destructive",
};

const STATUS_STYLE: Record<string, string> = {
  ready: "border-emerald-500/15 bg-success/10 text-success",
  external: "border-sky-500/15 bg-sky-500/10 text-sky-300",
  requires_config: "border-warning/15 bg-warning/10 text-warning",
  partial: "border-orange-500/15 bg-orange-500/10 text-orange-300",
  frontend_missing: "border-destructive/15 bg-destructive/10 text-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  external: "External",
  requires_config: "Needs setup",
  partial: "Partial",
  frontend_missing: "UI missing",
};

const OVERRIDE_OPTIONS = [
  { value: "inherit", label: "Use safety mode" },
  { value: "confirm", label: "Always ask" },
  { value: "allow", label: "Always allow" },
  { value: "deny", label: "Block" },
];

function currentMode(settings: Record<string, string>): SafetyMode {
  return (settings["tools.permission-mode"] as SafetyMode) || "ask";
}

function applyMode(mode: SafetyMode, onUpdate: ToolsSettingsProps["onUpdate"]) {
  onUpdate("tools.permission-mode", mode);
  if (mode === "yolo") {
    onUpdate("tools.yolo-mode", "true");
    onUpdate("tools.auto-approve-low-risk", "true");
    onUpdate("tools.global-default", "always_allow");
  } else if (mode === "auto_edit") {
    onUpdate("tools.yolo-mode", "false");
    onUpdate("tools.auto-approve-low-risk", "true");
    onUpdate("tools.global-default", "confirm");
  } else if (mode === "plan_mode") {
    onUpdate("tools.yolo-mode", "false");
    onUpdate("tools.auto-approve-low-risk", "true");
    onUpdate("tools.global-default", "confirm");
  } else {
    // "ask"
    onUpdate("tools.yolo-mode", "false");
    onUpdate("tools.auto-approve-low-risk", "false");
    onUpdate("tools.global-default", "confirm");
  }
}

function requiresAutonomousConfirmation(nextMode: SafetyMode | "autonomous") {
  return nextMode === "autonomous" || nextMode === "yolo";
}

function categoryFor(tool: ToolMeta): string {
  const value = `${tool.id} ${tool.name}`.toLowerCase();
  if (/file|directory|workspace|path|glob|grep/.test(value)) return "Files";
  if (/web|search|fetch|url|crawl/.test(value)) return "Web";
  if (/terminal|command|shell|process/.test(value)) return "System";
  if (/agent|delegate|spawn|handoff|task|todo/.test(value)) return "Agents";
  if (/board|draw|graph|map|chart|camera/.test(value)) return "Visuals";
  if (/memory|vector|document|rag/.test(value)) return "Knowledge";
  return "Other";
}

export function ToolsSettings({ settings, onUpdate }: ToolsSettingsProps) {
  const [tools, setTools] = useState<ToolMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const mode = currentMode(settings);

  useEffect(() => {
    let cancelled = false;
    toolsApi.listToolMetadata()
      .then((items) => {
        if (!cancelled) {
          setTools(items.filter((item) => item.name).map(mapBackendToolMeta));
        }
      })
      .catch((error: unknown) => console.error("[ToolsSettings] Failed to load tools", error))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredTools = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tools
      .filter((tool) => !needle || `${tool.name} ${tool.description} ${categoryFor(tool)}`.toLowerCase().includes(needle))
      .sort((a, b) => categoryFor(a).localeCompare(categoryFor(b)) || a.name.localeCompare(b.name));
  }, [query, tools]);

  const chooseMode = (nextMode: SafetyMode) => {
    if (requiresAutonomousConfirmation(nextMode) && !window.confirm(
      "Enable Full Access (YOLO Mode)? All permitted tools will execute automatically without confirmation. Hard security blocks still apply."
    )) return;
    applyMode(nextMode, onUpdate);
  };

  return (
    <div className="space-y-7">
      <header className="space-y-1">
        <h3 className="text-lg font-semibold text-foreground">Tool access</h3>
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Choose how much confirmation Zen needs. Workspace boundaries, blocked commands, and critical security checks always remain active.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="tool-safety-heading">
        <div>
          <h4 id="tool-safety-heading" className="text-sm font-semibold text-foreground">Safety mode</h4>
          <p className="text-xs text-muted-foreground">One setting controls normal tool behavior.</p>
        </div>
        <div className="grid gap-2 lg:grid-cols-3">
          {MODES.map((item) => {
            const selected = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseMode(item.id)}
                aria-pressed={selected}
                className={cn(
                  "min-h-32 rounded-lg border p-4 text-left transition-colors",
                  selected ? "border-primary/50 bg-primary/[0.07]" : "border-border bg-card/30 hover:bg-muted/40",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <WorkbenchIcon name={item.icon} className={cn("h-5 w-5", item.tone)} />
                  <span className={cn("h-4 w-4 rounded-full border", selected && "border-4 border-primary")} />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{item.detail}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card/20">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
          aria-expanded={advancedOpen}
        >
          <WorkbenchIcon name="lucide:wrench" className="h-4 w-4 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">Available tools</span>
            <span className="block text-xs text-muted-foreground">
              {loading ? "Reading the tool registry..." : `${tools.length} capabilities detected. Defaults are managed automatically.`}
            </span>
          </span>
          <WorkbenchIcon name={advancedOpen ? "lucide:chevron-up" : "lucide:chevron-down"} className="h-4 w-4 text-muted-foreground" />
        </button>

        {advancedOpen && (
          <div className="border-t border-border p-4">
            <div className="relative mb-3">
              <WorkbenchIcon name="lucide:search" className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tools"
                className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs text-foreground outline-none focus:border-primary/50"
              />
            </div>
            <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
              {filteredTools.map((tool) => {
                const permissionKey = `tools.permission.${tool.id}.default`;
                const override = settings[permissionKey] || "inherit";
                const statusLabel = STATUS_LABEL[tool.status] || tool.status;
                return (
                  <div key={tool.id} className="flex items-center gap-3 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-muted/25">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <WorkbenchIcon name={tool.icon} className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium text-foreground">{tool.name}</span>
                        <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", RISK_STYLE[tool.riskLevel])}>{tool.riskLevel}</Badge>
                        <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", STATUS_STYLE[tool.status] || "border-border text-muted-foreground")}>{statusLabel}</Badge>
                        <span className="text-[10px] text-muted-foreground">{categoryFor(tool)}</span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">{tool.description}</p>
                      {tool.statusDetail && tool.status !== "ready" && (
                        <p className="truncate text-[10px] text-muted-foreground">{tool.statusDetail}</p>
                      )}
                    </div>
                    {tool.userConfigurable ? (
                      <WorkbenchSelect
                        value={override}
                        onValueChange={(value) => onUpdate(permissionKey, value)}
                        options={OVERRIDE_OPTIONS}
                        width={132}
                      />
                    ) : (
                      <span className="w-[132px] text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                        System
                      </span>
                    )}
                  </div>
                );
              })}
              {!loading && filteredTools.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">No matching tools.</p>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Per-tool overrides are optional. Critical operations and workspace violations cannot be approved from this page.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
