import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const mapper = readFileSync(join(root, 'src/lib/stores/settingsMapper.ts'), 'utf8');
const background = readFileSync(join(root, 'src/components/workbench/WorkspaceBackground.tsx'), 'utf8');

assert.match(mapper, /backgroundImageUrl:\s*"ui\.background-image"/, 'backgroundImageUrl must persist to ui.background-image');
assert.match(mapper, /backgroundOpacity:\s*"ui\.background-opacity"/, 'backgroundOpacity must persist to ui.background-opacity');
assert.match(mapper, /backgroundBlur:\s*"ui\.background-blur"/, 'backgroundBlur must persist to ui.background-blur');
assert.match(mapper, /backgroundFit:\s*"ui\.background-fit"/, 'backgroundFit must persist to ui.background-fit');
assert.match(mapper, /backgroundMediaType:\s*"ui\.background-media-type"/, 'backgroundMediaType must persist to ui.background-media-type');
assert.match(background, /backgroundImage:\s*`url\("\$\{cssUrl\}"\)`/, 'wallpaper CSS url must be quoted/escaped');
assert.match(background, /backgroundFit/, 'WorkspaceBackground must read wallpaper display mode');
assert.match(background, /backgroundSize/, 'WorkspaceBackground must set CSS backgroundSize');
assert.match(background, /backgroundRepeat/, 'WorkspaceBackground must set CSS backgroundRepeat');
assert.match(background, /<video/, 'WorkspaceBackground must render video backgrounds');
assert.match(background, /isVideoBackground/, 'WorkspaceBackground must detect video backgrounds');
assert.match(background, /objectFit/, 'video background must use objectFit fitting logic');
assert.match(background, /mp4|webm|mov|m4v|ogv/, 'video background must restrict common video formats');

console.log('background image settings contract ok');
