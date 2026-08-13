import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

interface SettingsOverviewProps {
  workspace: string;
  theme: string;
  motion: string;
  preferences: string;
}

export function SettingsOverview({ workspace, theme, motion, preferences }: SettingsOverviewProps) {
  const items = [
    { label: "Workspace", value: workspace, icon: "lucide:folder-open" },
    { label: "Theme", value: theme, icon: "lucide:palette" },
    { label: "Motion", value: motion, icon: "lucide:play" },
    { label: "Preferences", value: preferences, icon: "lucide:check-circle-2" },
  ];

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border/70 border-y border-border/70 lg:grid-cols-4 lg:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 px-3 py-3 first:pl-0 lg:px-4">
          <div className="mb-2 flex h-6 w-6 items-center justify-center text-primary">
            <WorkbenchIcon name={item.icon} size={14} />
          </div>
          <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground" title={item.value}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}
