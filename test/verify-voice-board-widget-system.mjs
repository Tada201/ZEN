import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [types, registry, media, stage, listener, tool, agent] = await Promise.all([
  read("src/atlas/components/voice/board/types.ts"),
  read("src/atlas/components/voice/board/registry.ts"),
  read("src/atlas/components/voice/board/BoardMediaWidgets.tsx"),
  read("src/atlas/components/voice/VoiceStage.tsx"),
  read("src/atlas/components/voice/useBoardEventListener.ts"),
  read("src-tauri/src/agent/tools/manage_board.rs"),
  read("src-tauri/resources/agents/voice_display.json"),
]);

assert.match(types, /version: 1/);
assert.match(types, /"map"[\s\S]*"video"[\s\S]*"camera"[\s\S]*"gen-ui"[\s\S]*"premium-card"[\s\S]*"html"/);
assert.match(registry, /widgetWidthClass/);
assert.match(media, /getUserMedia\(\{ video: true, audio: false \}\)/);
assert.match(media, /sandbox="allow-scripts allow-same-origin allow-presentation"/);
assert.match(stage, /OpenUIRenderer content=\{block\.content\}/);
assert.match(stage, /lazy\(\(\) => import\("@\/atlas\/components\/OpenUIRenderer"\)/);
assert.doesNotMatch(stage, /toolProvider=/);
assert.match(stage, /PremiumCard type=\{block\.cardType\}/);
assert.match(listener, /map_placeholder[\s\S]*"map"/);
assert.match(tool, /PremiumCard/);
assert.match(tool, /"gen_ui", "premium_card", "html"/);
assert.match(tool, /object\.insert\("version"\.to_string\(\), json!\(1\)\)/);
assert.match(agent, /scriptless sandbox/);

const tauriConfig = await read("src-tauri/tauri.conf.json");
assert.match(tauriConfig, /frame-src 'self' https:\/\/www\.youtube-nocookie\.com/);

console.log("Voice board widget system verification passed.");
