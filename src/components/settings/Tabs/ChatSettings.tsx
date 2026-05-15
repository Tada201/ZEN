import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

import {
  MessageSquare, Bot, Sparkles, Zap, Cpu,
  Brain, Lightbulb, Gauge, Wrench
} from "lucide-react";

interface ChatSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function ChatSettings({ settings, onUpdate }: ChatSettingsProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Chat</h3>
        <p className="text-[13px] text-muted-foreground">Configure conversation behavior and AI response settings.</p>
      </div>

      <SettingsSection title="Persona" icon={Bot} description="AI response personality and instructions">
        <SettingsRow
          label="Response Style"
          description="Default communication tone"
          control={
            <Select value={settings["chat.response-style"] || "neutral"} onValueChange={v => onUpdate("chat.response-style", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="concise">Concise</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={MessageSquare}
        />

        <div className="px-3 py-2 space-y-2">
          <label className="text-[13px] font-medium text-foreground/80">System Instructions</label>
          <Textarea
            value={settings["chat.system-instructions"] || ""}
            onChange={e => onUpdate("chat.system-instructions", e.target.value)}
            placeholder="Custom instructions for the AI assistant..."
            className="min-h-[80px] text-xs bg-background/50"
          />
          <p className="text-[10px] text-muted-foreground/60">
            These instructions are prepended to every conversation.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Generation" icon={Sparkles} description="Response generation parameters">
        <SettingsRow
          label="Temperature"
          description="Controls randomness: lower is more precise, higher is more creative"
          control={
            <div className="flex items-center gap-2 w-[160px]">
              <span className="text-[10px] text-muted-foreground">Precise</span>
              <Slider
                value={[parseFloat(settings["chat.temperature"] || "0.7")]}
                onValueChange={([v]) => onUpdate("chat.temperature", v.toFixed(1))}
                min={0}
                max={2}
                step={0.1}
                className="flex-1"
              />
              <span className="text-[10px] text-muted-foreground">Creative</span>
              <span className="text-[11px] font-mono text-muted-foreground w-6 text-right">
                {settings["chat.temperature"] || "0.7"}
              </span>
            </div>
          }
          icon={Gauge}
        />

        <SettingsRow
          label="Max Output Tokens"
          description="Maximum length of generated responses"
          control={
            <Select value={settings["chat.max-tokens"] || "4096"} onValueChange={v => onUpdate("chat.max-tokens", v)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1024">1,024</SelectItem>
                <SelectItem value="2048">2,048</SelectItem>
                <SelectItem value="4096">4,096</SelectItem>
                <SelectItem value="8192">8,192</SelectItem>
                <SelectItem value="16384">16,384</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={Zap}
        />

        <SettingsRow
          label="Streaming Speed"
          description="How tokens appear in the UI"
          control={
            <Select value={settings["chat.streaming-speed"] || "instant"} onValueChange={v => onUpdate("chat.streaming-speed", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instant">Instant</SelectItem>
                <SelectItem value="typewriter">Typewriter</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={Cpu}
        />

        <SettingsRow
          label="External Tools"
          description="Allow AI to use file system and terminal tools"
          control={
            <Switch
              checked={settings["chat.external-tools"] !== "false"}
              onCheckedChange={v => onUpdate("chat.external-tools", String(v))}
            />
          }
          icon={Wrench}
        />
      </SettingsSection>

      <SettingsSection title="Streaming & Reasoning" icon={Brain} description="Advanced response behavior">
        <SettingsRow
          label="Response Streaming"
          description="Stream responses token-by-token as they're generated"
          control={
            <Switch
              checked={settings["chat.streaming"] !== "false"}
              onCheckedChange={v => onUpdate("chat.streaming", String(v))}
            />
          }
          icon={Zap}
        />

        <SettingsRow
          label="Chain-of-Thought"
          description="Show the AI's step-by-step reasoning process"
          control={
            <Switch
              checked={settings["chat.chain-of-thought"] === "true"}
              onCheckedChange={v => onUpdate("chat.chain-of-thought", String(v))}
            />
          }
          icon={Brain}
        />

        {settings["chat.chain-of-thought"] === "true" && (
          <>
            <SettingsRow
              label="Reasoning Budget"
              description="Max tokens allocated for reasoning"
              control={
                <div className="flex items-center gap-2 w-[140px]">
                  <Slider
                    value={[parseInt(settings["chat.reasoning-budget"] || "1024")]}
                    onValueChange={([v]) => onUpdate("chat.reasoning-budget", String(v))}
                    min={256}
                    max={8192}
                    step={256}
                    className="flex-1"
                  />
                  <span className="text-[11px] font-mono text-muted-foreground w-12 text-right">
                    {settings["chat.reasoning-budget"] || "1024"}
                  </span>
                </div>
              }
              icon={Lightbulb}
            />

            <SettingsRow
              label="Reasoning Effort"
              description="Depth of reasoning analysis"
              control={
                <Select value={settings["chat.reasoning-effort"] || "medium"} onValueChange={v => onUpdate("chat.reasoning-effort", v)}>
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              }
              icon={Brain}
            />
          </>
        )}

        <SettingsRow
          label="Prompt Caching"
          description="Cache repeated prompt prefixes for faster responses"
          control={
            <Switch
              checked={settings["chat.prompt-caching"] !== "false"}
              onCheckedChange={v => onUpdate("chat.prompt-caching", String(v))}
            />
          }
          icon={Cpu}
        />

        <SettingsRow
          label="Hardware Acceleration"
          description="Use GPU for model inference when available"
          control={
            <Switch
              checked={settings["chat.hardware-accel"] !== "false"}
              onCheckedChange={v => onUpdate("chat.hardware-accel", String(v))}
            />
          }
          icon={Zap}
        />
      </SettingsSection>
    </div>
  );
}
