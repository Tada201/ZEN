// Compatibility export for dev-server HMR clients that still request the
// pre-rename module path. Keep the implementation in ChatTimelineScrubber so
// there is one scrubber component and one interaction contract.
export { ChatTimelineScrubber as ChatScrubber } from "./ChatTimelineScrubber";
