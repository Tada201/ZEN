import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/security/browserPreviewUrl.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  fileName: "browserPreviewUrl.ts",
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { isSafeBrowserPreviewUrl, normalizeBrowserPreviewUrl } = await import(moduleUrl);

assert(isSafeBrowserPreviewUrl("about:blank"));
assert(isSafeBrowserPreviewUrl("https://example.com/app"));
assert(isSafeBrowserPreviewUrl("http://example.com/app"));
assert(!isSafeBrowserPreviewUrl("javascript:alert(1)"));
assert(!isSafeBrowserPreviewUrl("file:///etc/passwd"));
assert(!isSafeBrowserPreviewUrl("https://user:pass@example.com"));
assert(!isSafeBrowserPreviewUrl("http://localhost:3000"));
assert(!isSafeBrowserPreviewUrl("http://127.0.0.1:3000"));
assert(!isSafeBrowserPreviewUrl("http://192.168.1.5"));
assert(!isSafeBrowserPreviewUrl("http://[::1]/"));
assert.equal(normalizeBrowserPreviewUrl("example.com"), "https://example.com");
assert.equal(normalizeBrowserPreviewUrl("localhost:3000"), null);

// Loopback opt-in: only the address bar passes allowLoopback. Loopback dev
// servers become previewable, but LAN and link-local hosts stay blocked so an
// opted-in address bar can't reach the rest of the private network.
assert(isSafeBrowserPreviewUrl("http://localhost:3000", { allowLoopback: true }));
assert(isSafeBrowserPreviewUrl("http://127.0.0.1:5173", { allowLoopback: true }));
assert(isSafeBrowserPreviewUrl("http://[::1]/", { allowLoopback: true }));
assert(isSafeBrowserPreviewUrl("http://app.localhost:3000", { allowLoopback: true }));
assert(!isSafeBrowserPreviewUrl("http://192.168.1.5", { allowLoopback: true }));
assert(!isSafeBrowserPreviewUrl("http://10.0.0.5", { allowLoopback: true }));
assert(!isSafeBrowserPreviewUrl("http://169.254.1.1", { allowLoopback: true }));
assert(!isSafeBrowserPreviewUrl("http://foo.local", { allowLoopback: true }));
assert.equal(normalizeBrowserPreviewUrl("localhost:3000", { allowLoopback: true }), "https://localhost:3000");

const component = readFileSync(
  new URL("../src/atlas/components/workspace/BrowserPreview.tsx", import.meta.url),
  "utf8",
);
const tauriConfig = readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8");
assert(tauriConfig.includes("frame-src 'self' http: https:;"));
assert(component.includes("normalizeBrowserPreviewUrl(initialUrl)"));
assert(component.includes("normalizeBrowserPreviewUrl(newUrl, ADDRESS_BAR_OPTS)"));
// initialUrl (agent/chat-supplied) must NOT opt into loopback.
assert(!component.includes("normalizeBrowserPreviewUrl(initialUrl, ADDRESS_BAR_OPTS)"));
assert(component.includes('sandbox="allow-forms allow-scripts"'));
assert(!component.includes("allow-same-origin"));
assert(!component.includes("allow-popups"));

console.log("browser preview policy verified");
