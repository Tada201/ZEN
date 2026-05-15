/**
 * Design system constants for the Zen Workbench.
 * These values match the CSS variables defined in src/styles/index.css
 */

export const ACTIVITY_BAR_WIDTH = 48;
export const SIDEBAR_COLLAPSED_WIDTH = 48;
export const SIDEBAR_EXPANDED_WIDTH = 260;

export const DESIGN_TOKENS = {
  activityBarWidth: `${ACTIVITY_BAR_WIDTH}px`,
  sidebarCollapsedWidth: `${SIDEBAR_COLLAPSED_WIDTH}px`,
  sidebarExpandedWidth: `${SIDEBAR_EXPANDED_WIDTH}px`,
} as const;
