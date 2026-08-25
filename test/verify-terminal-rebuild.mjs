import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const service = read('src-tauri/src/services/terminal.rs');
const command = read('src-tauri/src/commands/terminal.rs');
const api = read('src/api/terminalApi.ts');
const panel = read('src/components/Zen/XTermPanel.tsx');
const session = read('src/components/Zen/XTermSessionView.tsx');
const processManager = read('src-tauri/crates/zen-media/src/process_manager.rs');
const terminalManager = read('src-tauri/src/terminal/mod.rs');
const agentTerminalTool = read('src-tauri/src/agent/tools/terminal_tools.rs');
const registryTerminalTool = read('src-tauri/src/tools/terminal_tools.rs');

assert(!service.includes('user_approved'), 'Terminal service must not trust a renderer-provided approval boolean.');
assert(command.includes('terminal_request_approval'), 'Terminal approval command is missing.');
assert(command.includes('terminal_read_output'), 'Terminal output recovery command is missing.');
assert(api.includes('requestApproval'), 'Typed terminal approval API is missing.');
assert(api.includes('readOutput'), 'Typed terminal initial-output API is missing.');
assert(service.includes('INTERACTIVE_APPROVAL_TTL'), 'Terminal approvals must expire.');
assert(service.includes('remove(&approval_id)'), 'Terminal approvals must be single-use.');
assert(session.includes("@xterm/xterm"), 'Terminal renderer must use xterm.');
assert(session.includes('requestAnimationFrame(flushOutput)'), 'Terminal output must be buffered before rendering.');
assert(session.includes('terminalApi.readOutput(chatId, sessionId)'), 'Initial PTY output must be recovered after listener setup.');
assert(session.includes('replaySequence = initialOutput.sequence'), 'Initial terminal output must establish a replay boundary.');
assert(session.includes("listen<TerminalOutputEvent>('terminal:output'"), 'Terminal output must use the shared typed event.');
assert(service.includes('"terminal:output"'), 'Backend must emit the shared terminal output event.');
assert(service.includes('pub sequence: u64'), 'Terminal output events must be sequenced.');
assert(!panel.includes('simulatedMetrics'), 'Terminal UI must not retain simulated telemetry.');
assert(panel.includes('let spawnedPtyId') && panel.includes('terminalApi.kill(chatId, id)'), 'Unmounted terminal panels must clean up the PTY created by their own effect run.');
assert(!panel.includes('AppDialog'), 'Opening a terminal must not require a frontend consent dialog.');
assert(panel.includes('terminalApi.requestApproval(chatId)'), 'Terminal open must request a session-scoped backend approval token.');
assert(processManager.includes('"/T"'), 'Windows cleanup must terminate process trees.');
assert(service.includes('shell_cwd(&resolved_cwd)'), 'Terminal sessions must normalize workspace paths for the shell prompt.');
assert(service.includes('strip_prefix("\\\\\\\\?\\\\")'), 'Terminal sessions must remove Windows extended path prefixes.');
assert(terminalManager.includes('floor_char_boundary'), 'Terminal output buffer trimming must not slice mid-UTF-8 character.');
assert(session.includes('setTimeout(initialize, 100)'), 'xterm must initialize after the right-panel layout settles.');
assert(session.includes('resizeTimer = setTimeout'), 'Terminal resize IPC must be debounced during panel width transitions.');
assert(session.includes('width <= 0 || height <= 0'), 'Terminal fit must skip zero-size boxes during panel open/close animation.');
assert(session.includes('fit.fit()') && session.includes('catch'), 'Terminal fit must tolerate mid-transition unmeasurable containers.');
assert(session.includes("host.addEventListener('mousedown', focusTerminal)"), 'Clicking the terminal must focus xterm input.');
assert(session.includes('"Cascadia Mono"'), 'Terminal must use a normal Windows monospace font.');
assert(!agentTerminalTool.includes('terminal:ai-output'), 'Agent tool output must not be injected into the user terminal.');
assert(!registryTerminalTool.includes('terminal:ai-output'), 'Registry tool output must not be injected into the user terminal.');

console.log('Terminal rebuild wiring verified.');
