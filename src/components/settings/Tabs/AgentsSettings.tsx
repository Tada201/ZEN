import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Users, Cpu, Clock, GitBranch,
  Network, Database, Wrench
} from "lucide-react";

interface AgentsSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

const REGISTERED_AGENTS = [
  { id: "buffy", name: "Buffy", model: "deepseek-v4", description: "Primary orchestrator agent", tools: 14 },
  { id: "codex", name: "Codex", model: "gpt-4o", description: "Code generation specialist", tools: 8 },
  { id: "voyager", name: "Voyager", model: "claude-3.5", description: "Research and analysis agent", tools: 6 },
];

export function AgentsSettings({ settings, onUpdate }: AgentsSettingsProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Agents</h3>
        <p className="text-[13px] text-muted-foreground">Configure sub-agents, delegation, and orchestration settings.</p>
      </div>

      <SettingsSection title="Orchestrator" icon={Cpu} description="Agent dispatch and execution control">
        <SettingsRow
          label="Orchestration Mode"
          description="How agents are dispatched for tasks"
          control={
            <Select value={settings["agents.orchestration-mode"] || "automatic"} onValueChange={v => onUpdate("agents.orchestration-mode", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="automatic">Automatic</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="round-robin">Round Robin</SelectItem>
                <SelectItem value="priority">Priority Queue</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={GitBranch}
        />

        <SettingsRow
          label="Max Concurrent Agents"
          description="Maximum number of agents running simultaneously"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <Slider
                value={[parseInt(settings["agents.max-concurrent"] || "3")]}
                onValueChange={([v]) => onUpdate("agents.max-concurrent", String(v))}
                min={1}
                max={10}
                step={1}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-4 text-right">
                {settings["agents.max-concurrent"] || "3"}
              </span>
            </div>
          }
          icon={Users}
        />

        <SettingsRow
          label="Agent Timeout"
          description="Maximum execution time per agent task"
          control={
            <Select value={settings["agents.timeout"] || "120"} onValueChange={v => onUpdate("agents.timeout", v)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="120">2 minutes</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
                <SelectItem value="600">10 minutes</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={Clock}
        />
      </SettingsSection>

      <SettingsSection title="Agent Registry" icon={Bot} description="Registered agents and their status">
        <div className="px-3 py-2 space-y-1">
          {REGISTERED_AGENTS.map(agent => (
            <div
              key={agent.id}
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">{agent.name}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-mono bg-white/[0.03] border-white/[0.06] text-muted-foreground">
                    {agent.model}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground/60 truncate">{agent.description} · {agent.tools} tools</p>
              </div>
              <Switch
                checked={settings[`agents.enabled.${agent.id}`] !== "false"}
                onCheckedChange={v => onUpdate(`agents.enabled.${agent.id}`, String(v))}
              />
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Agent Settings" icon={Wrench} description="Defaults for new agents">
        <SettingsRow
          label="Default Model"
          description="Default model for newly created agents"
          control={
            <Select value={settings["agents.default-model"] || "gpt-4o"} onValueChange={v => onUpdate("agents.default-model", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                <SelectItem value="claude-3.5">Claude 3.5 Sonnet</SelectItem>
                <SelectItem value="deepseek-v4">DeepSeek V4</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={Cpu}
        />

        <SettingsRow
          label="Memory Retention"
          description="New agents retain context between tasks by default"
          control={
            <Switch
              checked={settings["agents.memory-retention"] !== "false"}
              onCheckedChange={v => onUpdate("agents.memory-retention", String(v))}
            />
          }
          icon={Database}
        />

        <SettingsRow
          label="Tool Access"
          description="New agents can use file system and terminal tools by default"
          control={
            <Switch
              checked={settings["agents.tool-access"] !== "false"}
              onCheckedChange={v => onUpdate("agents.tool-access", String(v))}
            />
          }
          icon={Network}
        />
      </SettingsSection>
    </div>
  );
}
