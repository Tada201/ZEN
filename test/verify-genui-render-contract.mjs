import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const promptSource = readFileSync(
  new URL("../src/atlas/components/genui/prompt.ts", import.meta.url),
  "utf8",
);
const rendererSource = readFileSync(
  new URL("../src/atlas/components/OpenUIRenderer.tsx", import.meta.url),
  "utf8",
);
const backendSource = readFileSync(
  new URL("../src-tauri/src/commands/chat/send.rs", import.meta.url),
  "utf8",
);
const apiSource = readFileSync(
  new URL("../src/api/chatApi.ts", import.meta.url),
  "utf8",
);

assert(
  promptSource.includes("Output OpenUI Lang only") &&
    promptSource.includes("not JSX") &&
    promptSource.includes("openui language tag") &&
    promptSource.includes("Define a single render entry named root"),
  "GenUI prompt should tell the model to emit fenced OpenUI Lang with a root assignment, not JSX",
);

assert(
  backendSource.includes("extra_instructions: generative_ui_addendum.clone()") &&
    backendSource.includes("generative_ui_addendum"),
  "orchestrator requests should inherit the per-turn GenUI contract",
);

assert(
  apiSource.includes("generativeUi,") &&
    !apiSource.includes("generative_ui: generativeUi"),
  "GenUI must cross the Tauri IPC boundary using its camelCase command argument",
);

assert(
  promptSource.includes("Generated UI is display-only") &&
    promptSource.includes("Do not request backend tools") &&
    promptSource.includes("network calls") &&
    promptSource.includes("file access") &&
    promptSource.includes("event handlers"),
  "GenUI prompt should explicitly forbid tool/backend-like behavior from generated UI",
);

assert(
  rendererSource.includes("toolProvider?: RendererProps") &&
    rendererSource.includes("toolProvider={toolProvider}") &&
    !rendererSource.includes("createDefaultToolProvider"),
  "OpenUI renderer should not create a backend tool bridge for model-generated UI by default",
);

console.log("genui render contract verifier passed");
