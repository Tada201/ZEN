// Re-export everything from ZenContext to maintain backward compatibility
// after the refactoring renamed ZenContext -> atlasContext
export {
  ZenProvider,
  useZen,
  useZenTheme,
  useUIState,
  useInspector,
} from "./ZenContext";
export type { ZenState, ViewMode } from "./ZenContext";
