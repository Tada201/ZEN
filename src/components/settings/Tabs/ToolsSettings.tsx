import { useState } from "react";
import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldOff,
  Zap, Gauge, Clock, Terminal,
  FileText, Globe, Search, Cpu,
  AlertTriangle, ChevronDown, ChevronRight,
  FilePen, Eye, Lock, Unlock,
  Rocket, Download,
  Pen, Map, Cloud, Bot, Radar, Route, MapPin,
  Database, Activity, UserPlus, UserCheck, FileSearch
} from "lucide-react";

interface ToolsSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

// ── Known tools with metadata ────────────────────────────────────

interface ToolMeta {
  id: string;
  name: string;
  icon: typeof Terminal;
  riskLevel: "Low" | "Medium" | "High" | "Critical";
  description: string;
}

const KNOWN_TOOLS: ToolMeta[] = [
  // ── Terminal & Execution ──
  { id: "terminal", name: "Terminal", icon: Terminal, riskLevel: "Critical", description: "Execute shell commands and scripts" },
  { id: "run_command", name: "Run Command", icon: Terminal, riskLevel: "Critical", description: "Execute a single shell command with timeout" },

  // ── File Operations ──
  { id: "file_write", name: "File Write", icon: FilePen, riskLevel: "High", description: "Create, edit, and overwrite files" },
  { id: "file_read", name: "File Read", icon: FileText, riskLevel: "Medium", description: "Read file contents from disk" },
  { id: "edit_file", name: "Edit File", icon: FilePen, riskLevel: "High", description: "Precise patch-based file edits via old/new text" },
  { id: "list_documents", name: "List Documents", icon: FileText, riskLevel: "Low", description: "List ingested documents in the knowledge base" },
  { id: "read_document_content", name: "Read Document", icon: FileText, riskLevel: "Medium", description: "Read raw text content of ingested documents" },
  { id: "grep_documents", name: "Grep Documents", icon: FileSearch, riskLevel: "Low", description: "Text-based search across all ingested documents" },

  // ── Web & Search ──
  { id: "web_fetch", name: "Web Fetch", icon: Globe, riskLevel: "High", description: "Make HTTP requests to external URLs" },
  { id: "web_search", name: "Web Search", icon: Search, riskLevel: "Medium", description: "Search the web via DuckDuckGo" },
  { id: "search", name: "Search", icon: Search, riskLevel: "Medium", description: "Search local files and codebase" },
  { id: "vector_search", name: "Vector Search", icon: Search, riskLevel: "Low", description: "Semantic search over ingested documents" },

  // ── OSINT & Geospatial ──
  { id: "get_weather", name: "Weather", icon: Cloud, riskLevel: "Low", description: "Get current weather at a coordinate" },
  { id: "get_earthquakes", name: "Earthquakes", icon: Activity, riskLevel: "Low", description: "Fetch recent USGS earthquake data" },
  { id: "get_military_aircraft", name: "Aircraft Radar", icon: Radar, riskLevel: "Low", description: "Track military aircraft via ADS-B data" },
  { id: "activate_3d_globe", name: "3D Globe", icon: Globe, riskLevel: "Medium", description: "Activate Cesium 3D globe at coordinates" },
  { id: "activate_2d_operational_map", name: "2D Operational Map", icon: Map, riskLevel: "Low", description: "Activate 2D operational wireframe map" },
  { id: "calculate_route", name: "Routing", icon: Route, riskLevel: "Low", description: "Calculate driving route between two points" },
  { id: "geocode_search", name: "Geocode Search", icon: MapPin, riskLevel: "Low", description: "Convert place names to coordinates" },
  { id: "reverse_geocode", name: "Reverse Geocode", icon: MapPin, riskLevel: "Low", description: "Convert coordinates to place names" },
  { id: "create_geofence", name: "Geofence", icon: MapPin, riskLevel: "Medium", description: "Create circular or polygonal geofence zones" },

  // ── Agent & Orchestration ──
  { id: "spawn_agent", name: "Spawn Agent", icon: Bot, riskLevel: "Medium", description: "Spawn sub-agent for parallel task execution" },
  { id: "delegate_to_agent", name: "Delegate to Agent", icon: UserPlus, riskLevel: "Medium", description: "Transfer conversation to another specialist agent" },
  { id: "handoff_to_agent", name: "Handoff", icon: UserCheck, riskLevel: "Low", description: "Hand off conversation to another agent" },
  { id: "write_to_memory", name: "Write Memory", icon: Database, riskLevel: "Low", description: "Write findings to session vector memory" },
  { id: "search_session_memory", name: "Search Memory", icon: Search, riskLevel: "Low", description: "Search session-scoped vector memory" },
  { id: "graph_session", name: "Graph Session", icon: Database, riskLevel: "Low", description: "Manage graph database sessions" },

  // ── Drawing & Visualization ──
  { id: "draw", name: "Drawing Canvas", icon: Pen, riskLevel: "Low", description: "Draw shapes and diagrams on a canvas" },

  // ── System ──
  { id: "system_metrics", name: "System Metrics", icon: Cpu, riskLevel: "Low", description: "Read CPU, memory, and system stats" },
];

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
  const Icon = tool.icon;
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
          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${tool.name} settings`}
        >
          <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
            isOverridden ? "bg-primary/10" : "bg-white/[0.03]"
          }`}>
            <Icon className={`h-3.5 w-3.5 ${isOverridden ? "text-primary" : "text-muted-foreground"}`} />
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
            <Select
              value={permissionDefault}
              onValueChange={(v) => onUpdate(`${prefix}.default`, v)}
            >
              <SelectTrigger className="w-[100px] h-7 text-[10px] bg-background/50 border-white/[0.06]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERMISSION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="p-0.5 hover:bg-white/[0.06] rounded transition-colors"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${tool.name} patterns`}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.06] px-3 py-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Eye className="h-3 w-3 text-emerald-400" />
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Allow Patterns</span>
              </div>
              <Textarea
                value={allowPatterns}
                onChange={(e) => onUpdate(`${prefix}.allow-patterns`, e.target.value)}
                placeholder=".*\.txt$&#10;^/tmp/"
                className="min-h-[52px] text-[10px] font-mono bg-background/50 resize-none"
              />
              <p className="text-[8px] text-zinc-600">Regex patterns that auto-allow</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <ShieldOff className="h-3 w-3 text-red-400" />
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Deny Patterns</span>
              </div>
              <Textarea
                value={denyPatterns}
                onChange={(e) => onUpdate(`${prefix}.deny-patterns`, e.target.value)}
                placeholder="\.env$&#10;secret"
                className="min-h-[52px] text-[10px] font-mono bg-background/50 resize-none"
              />
              <p className="text-[8px] text-zinc-600">Regex patterns that auto-deny</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="h-3 w-3 text-amber-400" />
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Confirm Patterns</span>
              </div>
              <Textarea
                value={confirmPatterns}
                onChange={(e) => onUpdate(`${prefix}.confirm-patterns`, e.target.value)}
                placeholder="rm .*&#10;write:.*"
                className="min-h-[52px] text-[10px] font-mono bg-background/50 resize-none"
              />
              <p className="text-[8px] text-zinc-600">Regex patterns requiring confirmation</p>
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
  const toolTimeout = parseInt(settings["tools.timeout-seconds"] || "30");
  const sandboxEnabled = settings["tools.sandbox-enabled"] !== "false";
  const visibleTools = showAllTools ? KNOWN_TOOLS : KNOWN_TOOLS.slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Tools & Permissions</h3>
        <p className="text-[13px] text-muted-foreground">
          Configure tool execution permissions, safety modes, and per-tool access controls.
        </p>
      </div>

      {/* ── Global Tool Policy ── */}
      <SettingsSection title="Global Tool Policy" icon={Shield} description="Default permission rules for all tool calls">
        <SettingsRow
          label="Global Default"
          description="Fallback permission when no tool-specific rule matches"
          control={
            <Select value={globalDefault} onValueChange={(v) => onUpdate("tools.global-default", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirm">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                    <span>Always Confirm</span>
                  </div>
                </SelectItem>
                <SelectItem value="always_allow">
                  <div className="flex items-center gap-2">
                    <Unlock className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Always Allow</span>
                  </div>
                </SelectItem>
                <SelectItem value="always_deny">
                  <div className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-red-400" />
                    <span>Always Deny</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          }
          icon={ShieldCheck}
        />

        {/* YOLO Mode with warning */}
        <div className="relative">
          <SettingsRow
            label="YOLO Mode"
            description="Bypass all confirmations — automatically approve every tool call (except hardcoded security rules)"
            control={
              <Switch
                checked={yoloMode}
                onCheckedChange={(v) => onUpdate("tools.yolo-mode", String(v))}
              />
            }
            icon={Rocket}
          />
          {yoloMode && (
            <div className="mx-3 mb-2 flex items-start gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/15">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
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
            <Switch
              checked={autoApproveLowRisk}
              onCheckedChange={(v) => onUpdate("tools.auto-approve-low-risk", String(v))}
            />
          }
          icon={Shield}
        />
      </SettingsSection>

      {/* ── Per-Tool Permissions ── */}
      <SettingsSection title="Per-Tool Permissions" icon={ShieldAlert} description="Override global policy for individual tools">
        <div className="px-3 py-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-zinc-500">
              Configure tool-specific defaults and regex-based allow/deny/confirm patterns.
            </p>
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
          </div>

          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllTools(!showAllTools)}
              className="w-full h-7 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/[0.03] border border-dashed border-white/[0.06]"
            >
              {showAllTools ? (
                <>Show fewer tools</>
              ) : (
                <>Show all {KNOWN_TOOLS.length} tools ({KNOWN_TOOLS.length - 3} more)</>
              )}
            </Button>
          </div>

          <div className="mt-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <p className="text-[9px] text-zinc-600 leading-relaxed">
              <strong className="text-zinc-500">Pattern precedence:</strong> Within each tool, deny patterns take priority over confirm patterns, which take priority over allow patterns. The tool-specific default (if set) only applies when no pattern matches. Otherwise the global default is used.
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* ── Execution Safety ── */}
      <SettingsSection title="Execution Safety" icon={Gauge} description="Constraints and limits for tool execution">
        <SettingsRow
          label="Sandbox Mode"
          description="Isolate tool execution in a restricted environment"
          control={
            <Switch
              checked={sandboxEnabled}
              onCheckedChange={(v) => onUpdate("tools.sandbox-enabled", String(v))}
            />
          }
          icon={Lock}
        />

        <SettingsRow
          label="Tool Timeout"
          description="Maximum execution time per tool call"
          control={
            <div className="flex items-center gap-2 w-[160px]">
              <Slider
                value={[toolTimeout]}
                onValueChange={([v]) => onUpdate("tools.timeout-seconds", String(v))}
                min={5}
                max={300}
                step={5}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-9 text-right">
                {toolTimeout}s
              </span>
            </div>
          }
          icon={Clock}
        />

        <SettingsRow
          label="Tool Logging"
          description="Log all tool calls and their results for auditing"
          control={
            <Switch
              checked={settings["tools.logging-enabled"] !== "false"}
              onCheckedChange={(v) => onUpdate("tools.logging-enabled", String(v))}
            />
          }
          icon={Download}
        />
      </SettingsSection>

      {/* ── Quick Presets ── */}
      <SettingsSection title="Quick Presets" icon={Zap} description="Apply pre-configured permission profiles">
        <div className="px-3 py-2 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                onUpdate("tools.global-default", "always_deny");
                onUpdate("tools.yolo-mode", "false");
                onUpdate("tools.auto-approve-low-risk", "false");
                onUpdate("tools.sandbox-enabled", "true");
              }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-white/[0.06] hover:bg-white/[0.03] transition-colors"
            >
              <Lock className="h-5 w-5 text-red-400" />
              <span className="text-[11px] font-bold text-foreground">Locked Down</span>
              <span className="text-[9px] text-zinc-500 text-center leading-relaxed">All tools require confirmation. Maximum safety.</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onUpdate("tools.global-default", "confirm");
                onUpdate("tools.yolo-mode", "false");
                onUpdate("tools.auto-approve-low-risk", "true");
                onUpdate("tools.sandbox-enabled", "true");
              }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-white/[0.06] border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.06] transition-colors"
            >
              <ShieldCheck className="h-5 w-5 text-amber-400" />
              <span className="text-[11px] font-bold text-foreground">Balanced</span>
              <span className="text-[9px] text-zinc-500 text-center leading-relaxed">Confirm by default, auto-approve low risk.</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onUpdate("tools.global-default", "always_allow");
                onUpdate("tools.yolo-mode", "true");
                onUpdate("tools.auto-approve-low-risk", "true");
                onUpdate("tools.sandbox-enabled", "false");
              }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-white/[0.06] hover:bg-white/[0.03] transition-colors"
            >
              <Rocket className="h-5 w-5 text-emerald-400" />
              <span className="text-[11px] font-bold text-foreground">Full Auto</span>
              <span className="text-[9px] text-zinc-500 text-center leading-relaxed">All tools auto-approved. Maximum speed, use with care.</span>
            </button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
