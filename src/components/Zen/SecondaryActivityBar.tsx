import { useTransition } from 'react';
import { 
  Activity
} from 'lucide-react';
import { useUIStore } from '../../lib/stores/useUIStore';
import { cn } from '../../lib/utils/style';
import { getVisibleRightPanelFeatures, type RightPanelTabId } from '@/lib/features/frontendFeatures';

/**
 * Secondary Activity Bar for right-side utility panels.
 * Symmetrical to the primary Activity Bar.
 */
export function SecondaryActivityBar() {
  const [isPending, startTransition] = useTransition();
  const { 
    activeRightTab, 
    setActiveRightTab, 
    rightPanelOpen, 
    setRightPanelOpen 
  } = useUIStore();

  const navItems = getVisibleRightPanelFeatures().map((feature) => ({
    id: feature.rightPanelTabId ?? 'metrics',
    icon: feature.icon ?? Activity,
    label: feature.label,
  }));

  const handleTabClick = (id: RightPanelTabId) => {
    if (activeRightTab === id && rightPanelOpen) {
      startTransition(() => {
        setRightPanelOpen(false);
      });
    } else {
      startTransition(() => {
        setActiveRightTab(id);
        if (!rightPanelOpen) setRightPanelOpen(true);
      });
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 h-full">
      {/* Top Icons */}
      <div className="flex flex-col gap-4 mt-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleTabClick(item.id)}
            className={cn(
              "relative group p-2 rounded-xl transition-all duration-200",
              (activeRightTab === item.id && rightPanelOpen)
                ? "bg-primary/10 text-primary shadow-sm" 
                : "text-muted-foreground/40 hover:text-foreground hover:bg-muted",
              isPending && activeRightTab === item.id && "animate-pulse opacity-60"
            )}
            title={item.label}
            aria-label={item.label}
          >
            <item.icon size={20} strokeWidth={(activeRightTab === item.id && rightPanelOpen) ? 2.5 : 2} />
            
            {/* Active Rail Indicator (Right Side) */}
            {(activeRightTab === item.id && rightPanelOpen) && (
              <div className="absolute -right-[5px] top-1.5 bottom-1.5 w-1 rounded-l-full bg-primary animate-in fade-in slide-in-from-right-1" />
            )}
          </button>
        ))}
      </div>

      {/* Bottom Spacer/Icons if needed */}
      <div className="mt-auto flex flex-col gap-4 mb-2">
        {/* Placeholder for future right-bottom icons */}
      </div>
    </div>
  );
}
