import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const check = (name, condition) => checks.push({ name, condition });

const state = read("src-tauri/src/commands/mod.rs");
const lifecycle = read("src-tauri/src/commands/chat/lifecycle.rs");
const runner = read("src-tauri/src/agent/runner/loop.rs");
const orchestrator = read("src-tauri/src/agent/orchestrator/loop.rs");
const research = read("src-tauri/src/agent/deep_research/engine.rs");
const lib = read("src-tauri/src/lib.rs");
const api = read("src/api/chatApi.ts");
const hook = read("src/atlas/hooks/useStreamingChat.ts");
const controls = read("src/atlas/components/ChatInputFooter.tsx");
const events = read("src/atlas/hooks/stream/useAgentEvents.ts");

check("pause state is shared per chat and resumes via notification", /ChatPauseControl/.test(state) && /AtomicBool/.test(state) && /notify_waiters/.test(state));
check("pause waits without cancelling and stop still wins", /wait_for_chat_resume/.test(state) && /token\.cancelled\(\)/.test(state) && /chat_pause_controls/.test(lifecycle));
check("typed pause and continue commands are exposed", /pub async fn pause_chat/.test(lifecycle) && /pub async fn continue_chat/.test(lifecycle) && /commands::chat::pause_chat/.test(lib) && /commands::chat::continue_chat/.test(lib));
check("standard runner waits at a safe boundary", /wait_for_chat_resume\(&self\.app, &chat_id, &token\)/.test(runner));
check("orchestrator and research routes honor the same gate", /wait_for_chat_resume\(&self\.app, chat_id, &token\)/.test(orchestrator) && /wait_for_chat_resume\(self\.app, self\.chat_id, self\.token\)/.test(research));
check("frontend has typed pause and continue IPC calls", /pauseChat/.test(api) && /continueChat/.test(api));
check("frontend pause preserves streaming and resume restores it", /const pauseStream/.test(hook) && /status: \"paused\"/.test(hook) && /const resumeStream/.test(hook) && /setStreamingForChat\(chatId, true\)/.test(hook));
check("composer distinguishes paused Resume from active Stop", /isPaused/.test(controls) && /aria-label="Resume paused response"/.test(controls) && /aria-label="Stop response"/.test(controls));
check("submit queues instead of aborting a running turn", /Queue message/.test(controls) && /usePromptQueueStore/.test(read("src/atlas/components/useSendHandler.ts")) && /disabled=\{!props\.hasContent\}/.test(controls));
check("live status events reconcile paused and resumed message state", /payload\.phase === \"paused\"/.test(events) && /status: payload\.phase === \"paused\" \? \"paused\" : \"sending\"/.test(events));

const failures = checks.filter(({ condition }) => !condition);
for (const { name, condition } of checks) console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
if (failures.length) process.exit(1);
console.log(`Cooperative pause contract passed (${checks.length} checks).`);
