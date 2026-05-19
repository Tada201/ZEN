import { useState } from "react";
import { 
  Wrench, Globe, FileText, FolderTree, 
  Terminal, Database, Code2,
  Users, Bot, Search, Info, ImageIcon
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const TOOL_METADATA: Record<string, { label: string; icon: any; description: string; category: string; config?: Array<{ key: string; label: string; type: "password" | "text" | "select" | "toggle"; options?: string[]; placeholder?: string; description?: string }> }> = {
  web_search: { 
    label: "Web Search", 
    icon: Globe, 
    description: "Search the internet for real-time information.", 
    category: "Search",
    config: [
      { key: "brave_api_key", label: "Brave API Key", type: "password", placeholder: "Enter Brave key..." },
      { key: "tavily_api_key", label: "Tavily API Key", type: "password", placeholder: "Enter Tavily key..." },
      { key: "exa_api_key", label: "Exa API Key", type: "password", placeholder: "Enter Exa key..." },
      { key: "fallback_enabled", label: "Auto-Fallback", type: "toggle", description: "Try other services if primary fails" }
    ]
  },
  web_fetch: { label: "Web Fetch", icon: Globe, description: "Retrieve content from specific URLs.", category: "Search" },
  read_file: { label: "Read File", icon: FileText, description: "Access and read local file contents.", category: "System" },
  read_files: { label: "Batch Read", icon: FileText, description: "Read multiple files in a single operation.", category: "System" },
  list_directory: { label: "List Directory", icon: FolderTree, description: "Browse local file system structures.", category: "System" },
  get_tree: { label: "Get Tree", icon: FolderTree, description: "Fetch a recursive visualization of the workspace.", category: "System" },
  search_files: { label: "Search Files", icon: Search, description: "Find files by name pattern recursively.", category: "System" },
  grep_search: { label: "Grep Search", icon: Search, description: "Search for text content within files.", category: "System" },
  bash_exec: { label: "Bash Exec", icon: Terminal, description: "Run shell commands in the terminal.", category: "System" },
  memory_write: { label: "Memory Write", icon: Database, description: "Persist long-term facts and context.", category: "Memory" },
  memory_read: { label: "Memory Read", icon: Database, description: "Retrieve previously stored memories.", category: "Memory" },
  memory_list: { label: "Memory List", icon: Database, description: "View all stored memory entries.", category: "Memory" },
  create_artifact: { label: "Artifacts", icon: Code2, description: "Generate structured UI/Code panels.", category: "Output" },
  spawn_task: { label: "Spawn Task", icon: Bot, description: "Delegate sub-tasks to specialized sub-agents.", category: "Agentic" },
  human_handoff: { label: "Human Handoff", icon: Users, description: "Request manual intervention for decisions.", category: "Safety" },
  image_gen: { label: "Image Gen", icon: ImageIcon, description: "Generate high-fidelity images using AI.", category: "Output" },
};

export function SkillsSettingsContent({ 
  settings, 
  onUpdate 
}: { 
  settings: any; 
  onUpdate: (newSettings: any) => void 
}) {
  const [search, setSearch] = useState("");
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  
  const enabledTools = settings?.agentConfiguration?.enabledTools || Object.keys(TOOL_METADATA);
  const toolConfigs = settings?.agentConfiguration?.toolConfigs || {};
  
  const toggleTool = (toolId: string) => {
    const next = enabledTools.includes(toolId)
      ? enabledTools.filter((t: string) => t !== toolId)
      : [...enabledTools, toolId];
    
    onUpdate({
      ...settings,
      agentConfiguration: {
        ...settings.agentConfiguration,
        enabledTools: next
      }
    });
  };

  const updateToolConfig = (toolId: string, key: string, value: string) => {
    onUpdate({
      ...settings,
      agentConfiguration: {
        ...settings.agentConfiguration,
        toolConfigs: {
          ...toolConfigs,
          [toolId]: {
            ...toolConfigs[toolId],
            [key]: value
          }
        }
      }
    });
  };

  const filteredTools = Object.entries(TOOL_METADATA).filter(([, meta]) => 
    meta.label.toLowerCase().includes(search.toLowerCase()) || 
    meta.description.toLowerCase().includes(search.toLowerCase()) ||
    meta.category.toLowerCase().includes(search.toLowerCase())
  );

  const categories = Array.from(new Set(Object.values(TOOL_METADATA).map(m => m.category)));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h3 className="text-lg font-bold tracking-tight">Capabilities</h3>
          <p className="text-[12px] text-muted-foreground">Manage agent skills and reasoning tools.</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
        <Input 
          placeholder="Search skills..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 text-[13px] bg-muted/20 border-border/40 focus:bg-background"
        />
      </div>

      <ScrollArea className="h-[300px] -mx-1 px-1">
        <div className="space-y-6 pb-2">
          {categories.map(cat => {
            const catTools = filteredTools.filter(([_, m]) => m.category === cat);
            if (catTools.length === 0) return null;
            
            return (
              <div key={cat} className="space-y-2">
                <div className="flex items-center gap-1.5 px-1.5">
                   <div className="h-1 w-1 rounded-full bg-primary/40" />
                   <span className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground/50">{cat}</span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {catTools.map(([id, meta]) => {
                    const Icon = meta.icon;
                    const isEnabled = enabledTools.includes(id);
                    const hasConfig = !!meta.config;
                    const isExpanded = expandedTool === id;

                    return (
                      <div 
                        key={id}
                        className={cn(
                          "flex flex-col p-2 rounded-xl border transition-all",
                          isEnabled 
                            ? "bg-primary/[0.02] border-primary/20" 
                            : "bg-muted/5 border-border/40 opacity-60"
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-8 w-8 rounded-lg flex items-center justify-center border",
                              isEnabled ? "bg-primary/5 border-primary/20 text-primary" : "bg-muted/40 border-border/60 text-muted-foreground/40"
                            )}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="space-y-0">
                              <Label className="text-[13px] font-bold">{meta.label}</Label>
                              <p className="text-[11px] text-muted-foreground/70 line-clamp-1">{meta.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasConfig && isEnabled && (
                              <button 
                                onClick={() => setExpandedTool(isExpanded ? null : id)}
                                className={cn(
                                  "p-1 rounded-md transition-colors",
                                  isExpanded ? "text-primary bg-primary/10" : "text-muted-foreground/60 hover:text-primary"
                                )}
                              >
                                <Wrench className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <Switch 
                              checked={isEnabled}
                              onCheckedChange={() => toggleTool(id)}
                              className="scale-75"
                            />
                          </div>
                        </div>

                        {isEnabled && isExpanded && meta.config && (
                          <div className="mt-2 pt-2 space-y-3 border-t border-primary/10">
                            <div className="grid grid-cols-1 gap-3 px-1">
                              {meta.config.map(field => (
                                <div key={field.key} className="space-y-1.5">
                                  <Label className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground/60">{field.label}</Label>
                                  
                                  {field.type === "toggle" ? (
                                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-muted/20 border border-border/20">
                                      <span className="text-[10px] font-medium">{field.description || "Enable option"}</span>
                                      <Switch 
                                        checked={toolConfigs[id]?.[field.key] === true || toolConfigs[id]?.[field.key] === "true"}
                                        onCheckedChange={checked => updateToolConfig(id, field.key, checked as any)}
                                        className="scale-50"
                                      />
                                    </div>
                                  ) : (
                                    <Input 
                                      type={field.type}
                                      placeholder={field.placeholder}
                                      value={toolConfigs[id]?.[field.key] || ""}
                                      onChange={e => updateToolConfig(id, field.key, e.target.value)}
                                      className="h-7 text-[11px] bg-background border-border/40"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      
      <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 flex gap-2">
        <Info className="h-3 w-3 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-tight">
          Tools enable high-level reasoning. Disabling <strong>Memory</strong> or <strong>Artifacts</strong> may limit agent performance.
        </p>
      </div>
    </div>
  );
}
