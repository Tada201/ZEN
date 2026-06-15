import { SettingsSection } from "../SettingsSection";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

interface TerminalSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function TerminalSettings(_props: TerminalSettingsProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Terminal</h3>
        <p className="text-[13px] text-muted-foreground">Runtime behavior and execution safety for terminal tools.</p>
      </div>
      <SettingsSection title="Runtime configuration" icon="lucide:terminal" description="Terminal sessions currently use the active workspace and backend tool policy.">
        <div className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/20 p-4">
          <WorkbenchIcon name="lucide:info" size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Configuration is managed by the runtime</p>
            <p className="text-xs leading-relaxed text-muted-foreground">Shell selection, command timeout, confirmation, and environment controls will appear here once the terminal backend consumes them. Tool permissions remain available under Advanced → Tools.</p>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
