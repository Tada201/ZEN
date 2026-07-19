import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const frontendRules = readFileSync(
  new URL("../docs/architecture/frontend-rules.md", import.meta.url),
  "utf8",
);
const architectureRules = readFileSync(
  new URL("../RULES.md", import.meta.url),
  "utf8",
);
const designGuide = readFileSync(
  new URL("../frontende-design.md", import.meta.url),
  "utf8",
);

assert(frontendRules.includes("## Chat Timeline Rules"), "frontend rules should define the chat timeline contract");
assert(frontendRules.includes("summary-first"), "chat timeline rules should require summary-first execution UI");
assert(frontendRules.includes("Do not display raw internal JSON"), "chat timeline rules should ban raw internal JSON in normal chat");
assert(frontendRules.includes("Subagent rows should show delegation status"), "chat timeline rules should define subagent display behavior");
assert(frontendRules.includes("Completed successful tool calls must disappear from the main chat timeline"), "chat timeline rules should hide successful completed tool cards after completion/reload");
assert(frontendRules.includes("Parallel or multi-tool execution should collapse into one grouped execution"), "chat timeline rules should require grouped execution rows");
assert(frontendRules.includes("Any verifier for chat execution UI must assert the user-facing contract"), "chat timeline rules should keep verifier scope user-facing");

assert(architectureRules.includes("### Chat Timeline Rendering"), "RULES.md should point frontend workers at the chat timeline rendering contract");
assert(architectureRules.includes("The chat timeline must not become a raw execution log"), "RULES.md should ban raw execution-log chat UI");
assert(architectureRules.includes("Hide successful completed tool cards from the main timeline"), "RULES.md should hide successful completed tool cards after completion/reload");
assert(architectureRules.includes("Subagent output belongs in a delegation summary"), "RULES.md should constrain subagent output routing");

assert(designGuide.includes("## Zen chat execution UI"), "design guide should include Zen chat execution UI guidance");
assert(designGuide.includes("Zen's chat is a workbench conversation, not a terminal transcript"), "design guide should define the chat UI design posture");
assert(designGuide.includes("Hide implementation material by default"), "design guide should require hiding raw implementation material");

console.log("chat UI rule docs ok");
