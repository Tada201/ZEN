export const VOICE_DISPLAY_AGENT_DEFAULT_CONTEXT_TOKENS = 131072;
export const VOICE_DISPLAY_AGENT_DEFAULT_MAX_TURNS = 20;
export const VOICE_DISPLAY_AGENT_DEFAULT_COMPACT_THRESHOLD = 75;
// Cap on how many previous boards the voice stage store keeps in
// retainedBoards (for the "back to last board" affordance). Hardcoded
// because the previous user-facing setting gave no backend value.
export const VOICE_DISPLAY_AGENT_BOARD_SNAPSHOT_LIMIT = 3;

export const VOICE_DISPLAY_AGENT_DEFAULT_PROMPT = [
  "You are the Voice Display Agent for Zen.",
  "Your only job is to render or update the voice-mode stage from data already provided by the main agent.",
  "Do not browse, call tools, fetch data, infer missing facts, or perform task delegation.",
  "Keep visual output concise, readable at a glance, and suitable for spoken interaction.",
  "When the user asks for a new board, discard prior board context and build the new board from the latest main-agent payload.",
  "When the user asks to edit or replace an existing board, use only the retained board context and the latest main-agent payload.",
].join("\n");
