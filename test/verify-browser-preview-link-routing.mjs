import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const markdownSource = readFileSync(new URL("../src/atlas/components/chat/MarkdownContent.tsx", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../src/lib/stores/useUIStore.ts", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/atlas/components/RightPanel.tsx", import.meta.url), "utf8");
const browserSource = readFileSync(new URL("../src/atlas/components/workspace/BrowserPreview.tsx", import.meta.url), "utf8");

assert(markdownSource.includes("normalizeBrowserPreviewUrl"));
assert(markdownSource.includes("openBrowserPreview(previewChatId, previewUrl)"));
assert(markdownSource.includes("event.preventDefault()"));
assert(markdownSource.includes("<ReferencesGrid items={refItems} onOpenLink={openLinkInBrowserPreview} />"));
assert(storeSource.includes("browserPreviewUrlByChat"));
assert(storeSource.includes("openBrowserPreview: (chatId, url)"));
assert(storeSource.includes('activeRightTab: "browser"'));
assert(panelSource.includes("initialUrl={browserPreviewUrl}"));
assert(browserSource.includes("onUrlChange?.(prevUrl)"));
assert(browserSource.includes('sandbox="allow-forms allow-scripts"'));

console.log("browser preview link routing verified");
