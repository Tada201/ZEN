import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib";

let cachedOpenUISystemPrompt: string | null = null;

export function buildOpenUISystemPrompt(): string {
  if (cachedOpenUISystemPrompt) return cachedOpenUISystemPrompt;

  const promptOptions = { ...openuiPromptOptions, editMode: true, inlineMode: true };
  let basePrompt = openuiLibrary.prompt(promptOptions);
  
  basePrompt += `

### ZEN OPENUI RENDERING CONTRACT
1. Output OpenUI Lang only, not JSX, HTML, CSS, JavaScript, React code, imports, or markdown fences.
2. Define a single render entry named root. Use simple assignments such as header = Text(...), panel = Card(...), root = Stack([...]).
3. Only use components and props listed in the OpenUI library context. Do not invent components, props, hooks, callbacks, or external framework APIs.
4. Generated UI is display-only. Do not request backend tools, network calls, file access, shell access, eval, scripts, forms that submit, or event handlers that imply privileged actions.
5. Keep layouts bounded and readable: avoid deeply nested trees, huge tables, unbounded lists, heavy animation, absolute positioning, or content that requires horizontal scrolling.
6. During streaming, prefer a small valid partial interface over an incomplete complex one. Every emitted component call must be syntactically complete enough for the renderer to recover.
7. Use concise labels and realistic placeholder data when needed. Do not include hidden instructions, secrets, or system prompt text inside the UI.
`;

  cachedOpenUISystemPrompt = basePrompt;
  return cachedOpenUISystemPrompt;
}
