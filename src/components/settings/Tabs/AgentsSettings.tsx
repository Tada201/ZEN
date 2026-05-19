import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { Badge } from "@/components/ui/badge";
import { WorkbenchSwitch } from "../ui/WorkbenchSwitch";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchSlider } from "../ui/WorkbenchSlider";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

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

      <SettingsSection title="Orchestrator" icon="lucide:cpu" description="Agent dispatch and execution control">
        <SettingsRow
          label="Orchestration Mode"
          description="How agents are dispatched for tasks"
          control={
            <WorkbenchSelect
              value={settings["agents.orchestration-mode"] || "automatic"}
              onValueChange={v => onUpdate("agents.orchestration-mode", v)}
              width={140}
              options={[
                { value: "automatic", label: "Automatic" },
                { value: "manual", label: "Manual" },
                { value: "round-robin", label: "Round Robin" },
                { value: "priority", label: "Priority Queue" }
              ]}
            />
          }
          icon="lucide:git-branch"
        />

        <SettingsRow
          label="Max Concurrent Agents"
          description="Maximum number of agents running simultaneously"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <WorkbenchSlider
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
          icon="lucide:users"
        />

        <SettingsRow
          label="Agent Timeout"
          description="Maximum execution time per agent task"
          control={
            <WorkbenchSelect
              value={settings["agents.timeout"] || "120"}
              onValueChange={v => onUpdate("agents.timeout", v)}
              width={120}
              options={[
                { value: "30", label: "30 seconds" },
                { value: "60", label: "1 minute" },
                { value: "120", label: "2 minutes" },
                { value: "300", label: "5 minutes" },
                { value: "600", label: "10 minutes" }
              ]}
            />
          }
          icon="lucide:clock"
        />
      </SettingsSection>

      <SettingsSection title="Agent Registry" icon="lucide:bot" description="Registered agents and their status">
        <div className="px-3 py-2 space-y-1">
          {REGISTERED_AGENTS.map(agent => (
            <div
              key={agent.id}
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                <WorkbenchIcon name="lucide:bot" size={14} className="text-primary" />
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
              <WorkbenchSwitch
                checked={settings[`agents.enabled.${agent.id}`] !== "false"}
                onCheckedChange={v => onUpdate(`agents.enabled.${agent.id}`, String(v))}
              />
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Agent Settings" icon="lucide:wrench" description="Defaults for new agents">
        <SettingsRow
          label="Default Model"
          description="Default model for newly created agents"
          control={
            <WorkbenchSelect
              value={settings["agents.default-model"] || "gpt-4o"}
              onValueChange={v => onUpdate("agents.default-model", v)}
              width={140}
              options={[
                { value: "gpt-4o", label: "GPT-4o" },
                { value: "claude-3.5", label: "Claude 3.5 Sonnet" },
                { value: "deepseek-v4", label: "DeepSeek V4" }
              ]}
            />
          }
          icon="lucide:cpu"
        />

        <SettingsRow
          label="Memory Retention"
          description="New agents retain context between tasks by default"
          control={
            <WorkbenchSwitch
              checked={settings["agents.memory-retention"] !== "false"}
              onCheckedChange={v => onUpdate("agents.memory-retention", String(v))}
            />
          }
          icon="lucide:database"
        />

        <SettingsRow
          label="Tool Access"
          description="New agents can use file system and terminal tools by default"
          control={
            <WorkbenchSwitch
              checked={settings["agents.tool-access"] !== "false"}
              onCheckedChange={v => onUpdate("agents.tool-access", String(v))}
            />
          }
          icon="lucide:network"
        />
      </SettingsSection>
    </div>
  );
}
