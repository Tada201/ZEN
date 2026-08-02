import type { ComponentType } from "react";
import {
  getDefaultRightPanelTab,
  getVisibleRightPanelFeatures,
  type FrontendFeature,
  type RightPanelTabId,
} from "./frontendFeatures";

/**
 * Metadata/visibility registry for right-workbench views. Panel renderer
 * ownership remains in RightPanel so lazy-loaded feature modules stay at the
 * UI boundary; all labels, icons, maturity, and visibility come from this
 * registry.
 */
export interface WorkbenchView {
  id: RightPanelTabId;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  feature: FrontendFeature;
}

export function getVisibleWorkbenchViews(): WorkbenchView[] {
  return getVisibleRightPanelFeatures().flatMap((feature) => {
    if (!feature.rightPanelTabId) return [];
    return [{
      id: feature.rightPanelTabId,
      label: feature.label,
      description: feature.description,
      icon: feature.icon,
      feature,
    }];
  });
}

export function getWorkbenchView(id: string): WorkbenchView | undefined {
  return getVisibleWorkbenchViews().find((view) => view.id === id);
}

export function getDefaultWorkbenchView(): WorkbenchView {
  const views = getVisibleWorkbenchViews();
  const defaultId = getDefaultRightPanelTab();
  const defaultView = views.find((view) => view.id === defaultId) ?? views[0];
  if (!defaultView) {
    throw new Error("Workbench registry has no visible right-panel views");
  }
  return defaultView;
}

export function isWorkbenchViewVisible(id: string): id is RightPanelTabId {
  return Boolean(getWorkbenchView(id));
}
