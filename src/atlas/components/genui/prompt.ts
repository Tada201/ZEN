import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib";
import { buildCardCatalogPrompt } from "../chat/cardCatalog";

export function buildOpenUISystemPrompt(): string {
  const promptOptions = { ...openuiPromptOptions, editMode: true, inlineMode: true };
  let basePrompt = openuiLibrary.prompt(promptOptions);
  
  basePrompt += `
${buildCardCatalogPrompt()}

### ZEN OPENUI RENDERING CONTRACT
1. Output OpenUI Lang only, not JSX, HTML, CSS, JavaScript, React code, or imports. When replying in Zen chat, wrap the OpenUI Lang in exactly one markdown code fence using the openui language tag: \`\`\`openui ... \`\`\`. Do not emit raw OpenUI assignments outside that fence.
2. Define a single render entry named root. Use simple assignments such as header = Text(...), panel = Card(...), root = Stack([...]).
3. Component arguments map strictly to positional parameters in sequence. Do NOT exceed the maximum argument count for any component.
4. **Stack / VStack / HStack**: Signature: 'Stack(childrenArray, gap?, direction?, className?)' (Max 4 args). You MUST wrap all child elements in a single array '[...]' as the first argument. Never pass children as separate parameters (e.g., do NOT do 'Stack(a, b)'; do 'Stack([a, b])').
5. **Card**: Signature: 'Card(children, className?)' (Max 2 args). To display multiple components inside a card, you MUST wrap them inside a Stack as the first argument: 'Card(Stack([a, b]))'. Never pass more than 2 arguments.
6. **Text / TextContent**: Signature: 'Text(content, variant?, className?)' (Max 3 args).
7. **Tag**: Signature: 'Tag(content, variant?, size?, className?)' (Max 4 args).
8. **Grid**: Signature: 'Grid(childrenArray, columns?, gap?)' (Max 3 args).
9. **Icon**: Signature: 'Icon(name)' (Exactly 1 arg).
10. Only use components and props listed in the OpenUI library context. Do not invent components, props, hooks, callbacks, or external framework APIs.
11. Generated UI is display-only. Do not request backend tools, network calls, file access, shell access, eval, scripts, forms that submit, or event handlers that imply privileged actions.
12. Keep layouts bounded and readable: avoid deeply nested trees, huge tables, unbounded lists, heavy animation, absolute positioning, or content that requires horizontal scrolling.
13. During streaming, prefer a small valid partial interface over an incomplete complex one. Every emitted component call must be syntactically complete enough for the renderer to recover.
14. Use concise labels and realistic placeholder data when needed. Do not include hidden instructions, secrets, or system prompt text inside the UI.
`;

  return basePrompt;
}
