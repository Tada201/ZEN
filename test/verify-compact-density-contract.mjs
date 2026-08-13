import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const css = read("src/styles/index.css");
const assistant = read("src/atlas/components/chat/AssistantMessage.tsx");
const markdown = read("src/atlas/components/chat/MarkdownContent.tsx");
const messageList = read("src/atlas/components/chat/MessageList.tsx");
const footer = read("src/atlas/components/ChatInputFooter.tsx");
const textarea = read("src/atlas/components/ChatInputTextAreaBlock.tsx");
const code = read("src/atlas/components/chat/CodeBlock.tsx");
const chart = read("src/atlas/components/chat/ChartBlock.tsx");
const tree = read("src/atlas/components/chat/FileTree.tsx");
const research = read("src/atlas/components/chat/DeepResearchRunMessage.tsx");

const assertions = [
  ["central compact rhythm tokens", /--zen-space-detail:\s*0\.25rem[\s\S]*--zen-space-control:\s*0\.5rem[\s\S]*--zen-control-size:\s*1\.875rem/, css],
  ["composer editor row uses compact token padding", /\.composer-editor-row[\s\S]*padding:\s*var\(--zen-space-control\)/, css],
  ["message list opts into compact density", /chat-density-compact relative flex min-h-0 flex-1/, messageList],
  ["assistant rows use compact horizontal and vertical padding", /group flex w-full flex-col px-3[\s\S]*bg-transparent py-0\.5[\s\S]*bg-transparent py-1/, assistant],
  ["assistant execution rows use one-step gaps", /space-y-1[\s\S]*flex flex-col gap-1/, assistant],
  ["markdown blocks use compact section rhythm", /return \(\s*<div className="space-y-3">/, markdown],
  ["markdown headings no longer use oversized vertical margins", /h1: \(\{ children \}\) => <h1 className="mb-3 mt-5/, markdown],
  ["code blocks use compact shell and padding", /relative my-2[\s\S]*rounded-lg[\s\S]*overflow-x-auto p-3/, code],
  ["charts use compact shell and reduced height", /my-3 p-3[\s\S]*h-\[240px\]/, chart],
  ["file trees use compact shell spacing", /my-3 rounded-lg[\s\S]*px-3 py-1\.5[\s\S]*p-2 font-mono/, tree],
  ["deep research avoids the previous oversized card rhythm", /px-3 transition-all[\s\S]*py-1[\s\S]*py-2[\s\S]*h-\[240px\][\s\S]*p-3/, research],
  ["composer footer uses compact toolbar padding", /border-t border-border px-2 py-1|: "px-2 py-1\.5"/, footer],
  ["textarea keeps a safe compact minimum", /text-\[14px\][\s\S]*min-h-\[34px\]/, textarea],
];

for (const [label, pattern, source] of assertions) {
  if (!pattern.test(source)) throw new Error(`Compact density contract failed: ${label}`);
}

console.log(`Compact density contract passed (${assertions.length} checks).`);
