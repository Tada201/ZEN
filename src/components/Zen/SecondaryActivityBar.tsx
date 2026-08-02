import { useUIStore } from '../../lib/stores/useUIStore';
import { useChatStore } from '../../lib/stores/useChatStore';
import { countPendingApprovals } from '@/atlas/components/chat/right-panel/approvalCenterModel';
import { getVisibleWorkbenchViews } from '@/lib/features/workbenchRegistry';
import { WorkbenchTabButton } from './WorkbenchTabButton';

/**
 * Secondary Activity Bar for right-side utility panels.
 * Symmetrical to the primary Activity Bar.
 */
export function SecondaryActivityBar() {
  const {
    activeRightTab,
    setActiveRightTab,
    rightPanelOpen,
    setRightPanelOpen,
  } = useUIStore();

  const pendingApprovalCount = useChatStore((state) => countPendingApprovals(state.sessionMessages));
  const navItems = getVisibleWorkbenchViews();

  const handleTabClick = (id: (typeof navItems)[number]["id"]) => {
    if (activeRightTab === id && rightPanelOpen) {
      setRightPanelOpen(false);
      return;
    }

    setActiveRightTab(id);
    if (!rightPanelOpen) setRightPanelOpen(true);
  };

  return (
    <div className="flex flex-col items-center gap-4 h-full">
      {/* Top Icons */}
      <div className="flex flex-col gap-4 mt-2">
        {navItems.map((view) => (
          <WorkbenchTabButton
            key={view.id}
            view={view}
            selected={activeRightTab === view.id && rightPanelOpen}
            badge={view.id === "approvals" ? pendingApprovalCount : 0}
            onClick={() => handleTabClick(view.id)}
          />
        ))}
      </div>

      {/* Bottom Spacer/Icons if needed */}
      <div className="mt-auto flex flex-col gap-4 mb-2">
        {/* Placeholder for future right-bottom icons */}
      </div>
    </div>
  );
}
