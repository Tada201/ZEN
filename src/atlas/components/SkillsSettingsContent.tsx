import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { cn } from "@/lib/utils";
import { mapBackendToolMeta, toolsApi } from "@/api";

interface CapabilityMeta {
  id: string;
  name: string;
  icon: string;
  riskLevel: "Low" | "Medium" | "High" | "Critical";
  description: string;
  category: string;
}

const RISK_BADGE: Record<CapabilityMeta["riskLevel"], string> = {
  Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  High: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Critical: "bg-red-500/10 text-red-400 border-red-500/20",
};

const CATEGORY_ORDER = ["Search", "Knowledge", "Workspace", "System", "Agentic", "Output", "Memory", "Other"];

export function SkillsSettingsContent({
  settings,
  onUpdate,
}: {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [tools, setTools] = useState<CapabilityMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    toolsApi.listToolMetadata()
      .then((backendTools) => {
        if (cancelled) return;
        setTools(
          backendTools
            .filter((tool) => tool.name.trim().length > 0)
            .map((tool): CapabilityMeta => ({
              ...mapBackendToolMeta(tool),
              category: categorizeTool(tool.id),
            }))
            .sort((a, b) => {
              const catDelta = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
              return catDelta || a.name.localeCompare(b.name);
            }),
        );
      })
      .catch((error) => {
        console.error("[Capabilities] Failed to fetch tool metadata:", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredTools = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return tools;
    return tools.filter((tool) =>
      [tool.id, tool.name, tool.description, tool.category, tool.riskLevel]
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [search, tools]);

  const categories = CATEGORY_ORDER
    .map((category) => ({
      category,
      tools: filteredTools.filter((tool) => tool.category === category),
    }))
    .filter((group) => group.tools.length > 0);

  const toggleTool = (toolId: string, enabled: boolean) => {
    onUpdate(`tools.permission.${toolId}.default`, enabled ? "allow" : "deny");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h3 className="text-lg font-bold tracking-tight">Capabilities</h3>
          <p className="text-[12px] text-muted-foreground">
            Live tool registry and execution permissions used by the agent.
          </p>
        </div>
        {loading && (
          <span className="text-[10px] font-semibold text-muted-foreground animate-pulse">
            Loading registry...
          </span>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
        <Input
          placeholder="Search tools..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-8 h-8 text-[13px] bg-muted/20 border-border/40 focus:bg-background"
        />
      </div>

      <ScrollArea className="h-[300px] -mx-1 px-1">
        <div className="space-y-6 pb-2">
          {categories.map(({ category, tools: categoryTools }) => (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-1.5 px-1.5">
                <div className="h-1 w-1 rounded-full bg-primary/40" />
                <span className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground/50">
                  {category}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {categoryTools.map((tool) => {
                  const permission = settings[`tools.permission.${tool.id}.default`] || "inherit";
                  const isDenied = permission === "deny";
                  const isEnabled = !isDenied;
                  const stateLabel = permission === "inherit" ? "Global" : permission;

                  return (
                    <div
                      key={tool.id}
                      className={cn(
                        "flex items-center justify-between gap-3 p-2 rounded-xl border transition-all",
                        isEnabled
                          ? "bg-primary/[0.02] border-primary/20"
                          : "bg-muted/5 border-border/40 opacity-60",
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center border shrink-0",
                            isEnabled
                              ? "bg-primary/5 border-primary/20 text-primary"
                              : "bg-muted/40 border-border/60 text-muted-foreground/40",
                          )}
                        >
                          <WorkbenchIcon name={tool.icon} className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <Label className="text-[13px] font-bold truncate">{tool.name}</Label>
                            <Badge
                              variant="outline"
                              className={cn("h-4 px-1.5 text-[9px] font-semibold border", RISK_BADGE[tool.riskLevel])}
                            >
                              {tool.riskLevel}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground/50 capitalize">{stateLabel}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground/70 line-clamp-1">
                            {tool.description}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => toggleTool(tool.id, checked)}
                        className="scale-75 shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {!loading && filteredTools.length === 0 && (
            <p className="text-[11px] text-muted-foreground py-4 text-center">
              No matching tools in the backend registry.
            </p>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 flex gap-2">
        <WorkbenchIcon name="lucide:info" className="h-3 w-3 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-tight">
          This list comes from <code className="text-[10px]">list_tool_metadata</code>. Disabling a capability writes the same
          <code className="text-[10px]"> tools.permission.*</code> setting used by tool execution.
        </p>
      </div>
    </div>
  );
}

function categorizeTool(id: string): string {
  if (id.includes("search") || id.includes("fetch") || id.includes("geocode") || id.includes("weather")) return "Search";
  if (id.includes("document") || id.includes("vector") || id.includes("grep")) return "Knowledge";
  if (id.includes("file") || id.includes("directory") || id.includes("command") || id === "terminal") return "Workspace";
  if (id.includes("system") || id.includes("metrics")) return "System";
  if (id.includes("agent") || id.includes("delegate") || id.includes("todo")) return "Agentic";
  if (id.includes("draw") || id.includes("map") || id.includes("graph")) return "Output";
  if (id.includes("memory")) return "Memory";
  return "Other";
}
