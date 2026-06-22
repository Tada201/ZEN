# Adoption Notes

This file records patterns worth adapting from reference applications. It is
not a source-copy checklist. Every adopted pattern must fit Zen's existing
security, typed IPC, service ownership, and feature-maturity rules.

## Terax AI: Terminal Architecture

**Reviewed:** 2026-06-21  
**Reference:** `EXAMPLE_NO_EDITS/terax-ai-main`

### What Terax Does Well

- Separates the user's interactive PTY from AI command execution. AI commands
  do not write into, block, or compete with the user's shell prompt.
- Provides distinct AI execution modes:
  - foreground command execution for short tasks
  - a per-chat logical shell session that preserves working directory
  - background-process spawning with list, log-tail, and kill operations
- Requires approval for shell mutation. A command suggestion can be inserted
  into the active terminal only after the user clicks it; it is never executed
  automatically.
- Exposes a redacted, capped terminal-output context to the AI. A private
  terminal mode prevents its buffer from being read by the AI.
- Uses xterm with raw byte channels, output coalescing, bounded buffering, and
  process cleanup. Hidden terminal tabs remain alive without needlessly using
  a renderer slot.
- Handles Windows PTY lifecycle carefully with ConPTY serialization and
  process-tree cleanup.

### Zen Current-State Findings

- `src/components/Zen/XTermPanel.tsx` is a terminal-themed React log view,
  not an xterm terminal. It keeps output as `string[]` state and renders a
  regular HTML input.
- The terminal panel includes simulated telemetry that does not help users run
  commands and should not survive a terminal rebuild.
- `src-tauri/src/agent/tools/terminal_tools.rs` executes a temporary command
  with no persistent shell state. It should not share the user-facing terminal
  lifecycle or output stream.
- `src-tauri/src/services/terminal.rs` accepts a renderer-supplied
  `user_approved` flag. Backend permission state must be authoritative; the
  renderer cannot be approval evidence.

### Patterns To Adopt

1. **Separate execution domains**
   - Interactive user PTY: visible, long-lived, user-controlled.
   - Agent shell session: separate process path, structured tool result,
     per-chat working-directory state.
   - Background process manager: separate handles, bounded logs, explicit
     list and kill actions.

2. **Replace the terminal renderer**
   - Use xterm.js with a raw byte IPC channel for PTY output.
   - Preserve terminal tabs/sessions when hidden without rendering every
     session continuously.
   - Add output caps and backpressure handling before supporting many tabs.

3. **Make terminal access intentional**
   - Add `suggest_terminal_command` that inserts a command only after user
     confirmation.
   - Add `get_terminal_output` with redaction, a line cap, and privacy mode.
   - Keep AI command results in tool cards by default; do not inject them into
     the user's live shell.

4. **Enforce security in the backend**
   - Route all terminal and agent-shell work through `SecurityService`.
   - Replace frontend approval flags with a backend-issued, scoped approval
     decision.
   - Validate workspace scope, command limits, timeouts, output limits, and
     audit events on every execution path.

5. **Harden lifecycle behavior**
   - Kill the complete process tree on terminal/session shutdown, especially
     on Windows.
   - Add session cleanup for closed tabs and application exit.
   - Cover spawn, write, resize, kill, timeout, output truncation, background
     process, and approval denial with tests.

### Recommended Implementation Order

1. Fix backend-owned approval for the current interactive terminal and agent
   command paths.
2. Split the agent command system into foreground, persistent-CWD session, and
   background-process services.
3. Rebuild the terminal panel around xterm.js and byte-streamed PTY output.
4. Add terminal context, privacy, command suggestion, and background-process
   UX.
5. Add Windows process-tree handling and lifecycle/backpressure test coverage.

### Deliberate Non-Goals

- Do not copy Terax's full terminal-first workspace or tab model into Zen.
- Do not automatically execute AI-generated commands in the user's shell.
- Do not duplicate Zen's tool registry, typed API wrappers, or security
  services while implementing these improvements.

### Reference Files

- `EXAMPLE_NO_EDITS/terax-ai-main/src/modules/ai/tools/shell.ts`
- `EXAMPLE_NO_EDITS/terax-ai-main/src/modules/ai/tools/terminal.ts`
- `EXAMPLE_NO_EDITS/terax-ai-main/src/modules/ai/lib/useAiLiveBridge.ts`
- `EXAMPLE_NO_EDITS/terax-ai-main/src/modules/terminal/TerminalStack.tsx`
- `EXAMPLE_NO_EDITS/terax-ai-main/src/modules/terminal/lib/pty-bridge.ts`
- `EXAMPLE_NO_EDITS/terax-ai-main/src-tauri/src/modules/pty/session.rs`
- `EXAMPLE_NO_EDITS/terax-ai-main/src-tauri/src/modules/shell/mod.rs`

## Codex: Sandbox & Safety Architecture

**Reviewed:** 2026-06-21  
**Reference:** `EXAMPLE_NO_EDITS/codex-main`

### What Codex Does Well

- **Unified Sandboxing Abstraction** (`codex-rs/sandboxing/src/manager.rs`): Provides a platform-agnostic interface that delegates execution to specialized sandbox backends depending on the host OS.
- **Platform-Specific Isolation**:
  - **Linux** (`codex-rs/sandboxing/src/bwrap.rs` & `landlock.rs`): Uses Bubblewrap namespaces and Landlock LSM to isolate the file system and restrict process capabilities.
  - **macOS** (`codex-rs/sandboxing/src/seatbelt.rs`): Employs native Seatbelt profiles (`.sbpl`) to enforce access controls.
  - **Windows** (`codex-rs/windows-sandbox-rs`): Restricts process privileges using Windows tokens, custom ACLs (`acl.rs`), process thread attributes, and network isolation via Windows Filtering Platform (WFP).
- **Hardened Command & Patch Approvals** (`codex-rs/mcp-server/src/exec_approval.rs`): Decouples request analysis from user validation, using secure backend token authentication for operations.

### Zen Current-State Findings

- Zen currently executes shell tasks and file system operations using Tauri command routes directly on the host machine without sandboxing.
- If Zen runs untrusted commands, there is no kernel-level file system or network isolation, leaving the host system vulnerable.

### Patterns To Adopt

1. **Host-Level Sandboxing Policies**
   - Implement a platform-specific sandbox executor in `src-tauri` using native mechanisms (e.g. bubblewrap on Linux, App Sandbox/Seatbelt on macOS, and restricted tokens/ACLs on Windows).
2. **Dynamic Tool Execution Safeguards**
   - Implement runtime permission check rules in `src-tauri/src/agent` that match the structured file permission approvals of Codex's tool runner.

### Deliberate Non-Goals

- Do not port Codex's Bazel build configuration (`MODULE.bazel`, `BUILD.bazel`) as Zen is packaged using Tauri's standard Cargo workflow.
- Do not replicate the cloud telemetry/auth features (`app-server-protocol`) as Zen is designed to run locally.

### Reference Files

- `EXAMPLE_NO_EDITS/codex-main/codex-rs/sandboxing/src/manager.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/sandboxing/src/bwrap.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/sandboxing/src/seatbelt.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/windows-sandbox-rs/src/lib.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/mcp-server/src/exec_approval.rs`

## Codex: Modular Skills & MCP Integration

**Reviewed:** 2026-06-21  
**Reference:** `EXAMPLE_NO_EDITS/codex-main`

### What Codex Does Well

- **Embedded Skills Manifest & Cache Control** (`codex-rs/skills/src/lib.rs`): Embeds system skills directly in the binary using `include_dir::include_dir!` and unpacks them to the cache directory (`CODEX_HOME/skills/.system`) at runtime. It maintains a fingerprint marker to skip re-installing unless the binary contents change.
- **Dynamic MCP Client Connection Manager** (`codex-rs/codex-mcp/src/connection_manager.rs`): Handles parallel client connections, JSON-RPC messaging, and dynamic config reloading of third-party MCP servers.
- **Unified Tool Catalog** (`codex-rs/codex-mcp/src/catalog.rs`): Merges local tools with dynamic tools exposed by external MCP servers, providing unified indexing.

### Zen Current-State Findings

- Zen loads tools locally, and its skills system is currently managed through manual folder copying/placements.
- Setting up new MCP tools requires hardcoding or manually registering them in `.mcp.json`.

### Patterns To Adopt

1. **Embedded & Cached Skills Management**
   - Package Zen's core system agent skills (like plan, checklist, implement templates) as embedded resources using `include_dir` in Cargo, and write them out automatically to the user's settings cache directory if they mismatch a cryptographic fingerprint.
2. **Robust Multi-MCP Client Connection Manager**
   - Adopt a robust JSON-RPC connection manager in Zen's backend to coordinate connections to local/remote MCP processes with health checks and crash recovery.

### Deliberate Non-Goals

- Do not use Codex's specific credential store integrations (`keyring-store`) for MCP auth headers, since Zen stores keys in standard secure Tauri storage.

### Reference Files

- `EXAMPLE_NO_EDITS/codex-main/codex-rs/skills/src/lib.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/codex-mcp/src/connection_manager.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/codex-mcp/src/catalog.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/codex-mcp/src/tools.rs`

## Codex: Image & Attachment Processing

**Reviewed:** 2026-06-21  
**Reference:** `EXAMPLE_NO_EDITS/codex-main`

### What Codex Does Well

- **Token-Optimized Patch Resizing** (`codex-rs/utils/image/src/lib.rs`): Resizes input images to match the patch grid constraints of LLM vision APIs (e.g. 32x32 pixel patches), avoiding high costs and token waste while ensuring optimal input resolution.
- **Metadata and Profile Preservation**: Selectively keeps important orientation metadata (EXIF) and color profile metadata (ICC) while scrubbing unnecessary headers, guaranteeing accurate color rendering.
- **Safe Base64 Data URL Parsing**: Robustly validates, extracts, and decodes incoming inline base64 image data URLs, rejecting oversized inputs before decoding to prevent memory exhaustion (DoS).
- **In-Memory LRU Image Cache**: Uses a thread-safe static LRU cache (`BlockingLruCache` up to 64MB) to store pre-processed image bytes, avoiding redundant decompression and resizing overhead.

### Zen Current-State Findings

- Zen loads user image attachments directly into memory and passes them to the LLM backend without local resizing or budget calculations, which can lead to high token costs or API rejection for very large files.
- There is no local cache for optimized attachment processing.

### Patterns To Adopt

1. **Local Vision-Budget Image Resizer**
   - Implement a utility in `src-tauri` using the `image` crate that automatically scales down images to visual patch grids (e.g., max 2048px or custom patch budget size) before sending them to the LLM backend.
2. **Exif/ICC Profile Preservation**
   - Adopt selective EXIF/ICC metadata extraction when re-encoding prompt images to preserve image rotation/color without carrying format-specific garbage.

### Deliberate Non-Goals

- Do not use Codex's benchmark layouts (`utils/image/benches`) as Zen's client-side upload latency is mostly bounded by network transport rather than microsecond image scaling performance.

### Reference Files

- `EXAMPLE_NO_EDITS/codex-main/codex-rs/utils/image/src/lib.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/utils/image/src/error.rs`

## Comparison: Terminal & Shell Architecture (Terax vs. Codex vs. Zen)

**Reviewed:** 2026-06-21  

### Feature Comparison Matrix

| Feature | Terax AI (`terax-ai-main`) | Codex (`codex-cli`) | Zen (Current App) |
| :--- | :--- | :--- | :--- |
| **Primary Interface** | Web UI (xterm.js + Tauri IPC) | Native Console TUI / CLI | Custom HTML log list (mock PTY) |
| **PTY Management** | High-level PTY bridge via Tauri plugin | Low-level Rust PTY (`winapi`/`libc` bindings) | None (executes one-off shell processes) |
| **Windows Support** | ConPTY bindings with tab isolation | Full Win32 Pseudo-Console (`psuedocon.rs`) | Basic shell execution |
| **Process Tree Cleanup**| Cleans up PTY processes on close | Advanced process groups (`process_group.rs`) | Lacks automatic process tree cleanup |
| **Execution Isolation**| User-prompt redirection / permission gate | Native host sandboxing (Seatbelt, bwrap, landlock) | Executes directly on host |
| **State Preservation** | Persistent CWD across agent messages | Shell command runner context | No persistent shell state |

### What Terax Does Better Than Codex (For Zen's Context)
- **Tauri Integration**: Terax utilizes a high-level TS/JS PTY bridge that matches Zen's Tauri-based React frontend model.
- **Visual Terminal Rendering**: Incorporates xterm.js tabs directly inside a web view layout, which is highly compatible with Zen's multi-pane chat view.

### What Codex Does Better Than Terax
- **Process Group Tracking**: Handles orphan process prevention on Windows/Linux by registering child shells under custom OS-level process groups (`process_group.rs`).
- **Low-Level Native Control**: Manages raw terminal input/output pipes and pseudoconsoles directly inside Rust, enabling clean stream interception.

### Recommendations for Zen's Terminal Rebuild
1. **Frontend Layer**: Adopt Terax's **xterm.js PTY bridge pattern** for rendering high-fidelity interactive terminal tabs.
2. **Backend Lifecycle Layer**: Adopt Codex's **process group model** (`process_group.rs`) to ensure that spawned compilers, linters, or runners do not leak active process handles on cancellation.
3. **Execution Domain**: Merge Terax's permission gateways with Codex's sandboxing architecture to shield the host filesystem.

### Reference Files
- `EXAMPLE_NO_EDITS/terax-ai-main/src-tauri/src/modules/pty/session.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/utils/pty/src/pty.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/utils/pty/src/process_group.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/utils/pty/src/win/psuedocon.rs`

## Codex: Language Settings & UI Localization

**Reviewed:** 2026-06-21  

### What Codex Does Well

- **Dynamic App UI Localization**: Codex's desktop app shell/settings page integrates a comprehensive UI language selector.
- **Multilingual Support**: Supports diverse locales (including Japanese, Korean, Chinese, Thai, Tamil, Telugu, Kannada, Gujarati, and Malayalam) to accommodate global users.
- **Auto-Detection Fallback**: Integrates an "Auto detect" fallback option to synchronize the app's interface language with the host system or browser language locale.

### Zen Current-State Findings

- Zen's settings UI currently hardcodes all labels, descriptions, and placeholders in English.
- Although Zen's speech-to-text (Whisper/Moonshine) and text-to-speech (Piper) sub-systems support multiple target language models, the app wrapper lacks a unified internationalization (`i18n`) setup for translating the main interface and settings panels.

### Patterns To Adopt

1. **Integrated UI translation layer (`i18n`)**
   - Add a lightweight React localization library (e.g. `react-i18next` or a custom JSON key-dictionary hook) to translate Zen's sidebar categories, option descriptions, and tooltips.
2. **Dynamic Language Switcher in General Settings**
   - Add a `language` property to Zen's `useSettingsStore` schema.
   - Build a dropdown selector in the General Settings tab allowing users to override the active language or choose "Auto detect" (defaulting to the browser's `navigator.language` locale value).

### Deliberate Non-Goals

- Do not localize system-level error messages or lower-level trace diagnostics (e.g. compile output, cargo errors) as these are targeted at technical developer debugging.

## Codex: Event Hooks System

**Reviewed:** 2026-06-21  
**Reference:** `EXAMPLE_NO_EDITS/codex-main/codex-rs/hooks`

### What Codex Does Well

- **Granular Lifecycle Event Triggers** (`hooks/src/lib.rs`): Dispatches execution events at critical lifecycle moments:
  - `PreToolUse` and `PostToolUse`
  - `PermissionRequest` (enabling automated policy gates for tool approvals)
  - `PreCompact` and `PostCompact` (for managing RAG/chat history compaction)
  - `SessionStart` / `Stop`
  - `UserPromptSubmit`
  - `SubagentStart` / `SubagentStop`
- **Hook Discovery and Runner** (`hooks/src/engine/command_runner.rs`): Discovers hook configurations (e.g. in `.codex/hooks.json`) and executes scripts/commands.
- **Outcome Interception**: Parses the stdout of hook scripts to alter agent state. For example, a `PreToolUse` hook can cancel the tool, modify its parameters on the fly, or inject mock results.

### Zen Current-State Findings

- Zen has hooks settings UI screens, but lack a unified, structured event dispatching system in the backend (`src-tauri`) that allows scripts or plugins to inspect and intercept agent actions (like pre/post tool use or permission requests) dynamically.

### Patterns To Adopt

1. **Structured Backend Hook Registry**
   - Implement an event registry and runner in `src-tauri` using a JSON-RPC format or stdout pipe parsing.
2. **Lifecycle Middleware Interceptors**
   - Intercept tool calls in `src-tauri/src/agent` by running configured scripts on `PreToolUse`, feeding the JSON parameters to stdin, and parsing the JSON result on stdout to allow the script to change the arguments or cancel the call.

### Deliberate Non-Goals

- Do not support complex remote network hooks (webhook endpoints) initially; keep hook execution local-first, launching subprocesses configured in the workspace directory.

## Codex: Keyboard Shortcuts & Keymap Resolution

**Reviewed:** 2026-06-21  
**Reference:** `EXAMPLE_NO_EDITS/codex-main/codex-rs/tui/src/keymap.rs`

### What Codex Does Well

- **Ambiguity and Conflict Validation** (`tui/src/keymap.rs`): Enforces keybinding uniqueness at startup. If a user tries to bind a shortcut that conflicts with another action on the active input path, the app rejects the config and provides detailed diagnostic reports.
- **Hierarchical Precedence**: Evaluates key actions using a clear tree model: Context-local binding (`tui.keymap.<context>`) -> Global fallback (`tui.keymap.global`) -> Built-in defaults.
- **Vim Modal Mappings**: Bundles full Vim mode support (normal, operator-pending, and text-objects) allowing rich text navigation inside multiline inputs.
- **Terminal Input Normalization**: Normalizes modifier behaviors (like shift-up/down) across different terminal engines to ensure key events function identically.

### Zen Current-State Findings

- Zen handles keyboard shortcuts in the React frontend via basic window-level event listeners.
- There is no central configuration file or validation layer that prevents overlapping keybinds or resolves priority.

### Patterns To Adopt

1. **Centralized Keymap Schema & Precedence**
   - Implement a typed shortcut schema in `src/lib/stores/settings/schema.ts` following a context-based hierarchy (e.g. `composer`, `app`, `editor`).
2. **Ambiguity and Conflict Gating**
   - Validate custom keybind configs on save to alert the user if they attempt to bind the same keystroke to multiple active settings.

### Deliberate Non-Goals

- Do not implement Vim terminal normal/operator mode bindings immediately, as Zen's chat area focuses on normal textareas rather than deep terminal text-object manipulations.

## Codex: Personalization & Memory Architecture

**Reviewed:** 2026-06-21  
**Reference:** `EXAMPLE_NO_EDITS/codex-main/codex-rs/memories`

### What Codex Does Well

- **Customizable Personality Profiles** (`core/templates/personalities/`): Supports distinct user-selectable personalities (such as `pragmatic` or `friendly`) that structure the agent's core values, response brevity, technical tone, and validation style.
- **Double-Phase Memory Pipeline**:
  - **Phase 1 (Extraction)** (`memories/write/src/phase1.rs`): Runs a low-resource extraction agent on session transcripts to identify user habits, preferences, environment details, and facts.
  - **Phase 2 (Consolidation)** (`memories/write/src/phase2.rs`): Merges new findings into a central `raw_memories.md` file while incorporating directory/workspace changes (`phase2_workspace_diff.md`) to keep references synchronized.
- **Memory Extensions**: Supports folder-based plugins (`memory_extensions_root`) where developers configure extension instructions to influence how the consolidation agent incorporates external context.

### Zen Current-State Findings

- Zen utilizes basic system prompts and RAG contexts but lacks profile-based personality selectors or a background consolidation pipeline that extracts habits and environment details directly from chat sessions.

### Patterns To Adopt

1. **Structured Personality Templates**
   - Implement selectable personality profiles in Zen's Intelligence settings (e.g. `pragmatic`, `creative`, `casual`) that inject distinct tone guides into the system prompt builder.
2. **Background Memory Consolidation**
   - Implement a post-chat session processor in `src-tauri` that compiles conversation history to extract key developer parameters (such as preferred shell aliases, tools, or folders) and saves them to a local profile configuration.

## Comparison: Hardware Detection & GPU Acceleration

**Reviewed:** 2026-06-21  
**Reference:** `EXAMPLE_NO_EDITS/Tauri-chatbot/src-tauri/src/services/hardware.rs`, `EXAMPLE_NO_EDITS/Atomic-Chat-main/src-tauri/plugins/tauri-plugin-hardware`

### Feature Comparison Matrix

| Feature | Tauri-chatbot (Terax AI) | Atomic-Chat (Jan App) | Zen (Current App) |
| :--- | :--- | :--- | :--- |
| **Primary Method (Windows)** | `nvidia-smi` query with fallback to `wmic` | Native `NVML` (`nvml_wrapper`) and Vulkan APIs | PowerShell `Get-CimInstance Win32_VideoController` |
| **Primary Method (Linux)** | `nvidia-smi` CSV output | Native `NVML` (`nvml_wrapper`) and Vulkan APIs | `nvidia-smi` CSV output |
| **macOS Support** | Hardcoded "Apple Silicon" label, no VRAM | Unifies with Vulkan / system hardware | Basic OS version & properties |
| **Caching & Invalidation** | Computes dynamically per-call | Caches system/GPU info; Linux-specific wake/resume invalidate | Computes dynamically per-call |
| **Model Fit Recommendation** | Frontend VRAM-to-Model size mappings | Dynamic memory profiling for model configurations | None |

### What Reference Apps Do Well

1. **Bypassing OS VRAM Constraints**:
   - `Tauri-chatbot` prioritizes `nvidia-smi` calls before falling back to `wmic` on Windows. Legacy APIs like `wmic` (and sometimes WMI-based `Get-CimInstance`) cap reported VRAM size at 4GB. Direct CLI query bypasses this limit.
2. **Low-Level Native Diagnostics (NVML & Vulkan)**:
   - `Atomic-Chat` directly integrates the `nvml_wrapper` crate to inspect Nvidia GPUs at the driver level. This provides precise hardware details (compute capability major/minor, actual hardware UUID, current real-time VRAM allocation) instead of depending on CLI parsing or string matching.
   - It also coordinates Vulkan device listings to match Vulkan GPU IDs back to Nvidia UUIDs.
3. **Resilience to System Suspend/Resume**:
   - On Linux, sleep/wake states reset GPU drivers. `Atomic-Chat` caches the hardware details but exposes an invalidation handler (`invalidate_nvml`) that clears the cache when the system resumes, preventing stale "No GPU detected" reports.
4. **VRAM-to-Model recommendation tiers**:
   - `Tauri-chatbot` includes a helper method `recommended_model_size` to assist settings pages in recommending local model sizes (e.g. 1B-2B for CPU, 3B-4B for 4GB+ VRAM, 7B-8B for 8GB+ VRAM, and 14B-32B+ for 16GB+ VRAM).

### Zen Current-State Findings

- Zen utilizes PowerShell on Windows via `Get-CimInstance`. While cleaner than `wmic`, this still relies on WMI tables which may not accurately report discrete VRAM capacities under specific setups (like hybrid laptops or nested VM hypervisors).
- Zen's GPU detection operates synchronously on demand, missing a caching layer.
- Zen lacks a VRAM-to-model capacity mapping engine to warn or guide users when downloading large models.

### Patterns To Adopt

1. **Dual-Tier Windows GPU Detection**:
   - Query `nvidia-smi` directly on Windows first to get accurate Nvidia VRAM details, falling back to the PowerShell `Get-CimInstance` workflow for AMD, Intel, and default graphics controllers.
2. **Hardware Specs Caching & Invalidation**:
   - Cache hardware information on initialization rather than executing shell processes on every info request.
   - Implement basic cache invalidation triggers on system state transitions (or supply a manual "Refresh" button in UI).
3. **VRAM-to-Model Fit UI Indicator**:
   - Implement `recommended_model_size()` rules inside `HardwareService` to match active VRAM bounds (e.g. 4GB, 8GB, 16GB) to model parameter sizes, helping users download compatible local models.

### Reference Files

- `EXAMPLE_NO_EDITS/Tauri-chatbot/src-tauri/src/services/hardware.rs`
- `EXAMPLE_NO_EDITS/Atomic-Chat-main/src-tauri/plugins/tauri-plugin-hardware/src/commands.rs`
- `EXAMPLE_NO_EDITS/Atomic-Chat-main/src-tauri/plugins/tauri-plugin-hardware/src/vendor/nvidia.rs`

## Codex: Customization System (Themes, Colors, & Fonts)

**Reviewed:** 2026-06-21  
**Reference:** `EXAMPLE_NO_EDITS/codex-main/codex-rs/tui/src/theme_picker.rs`, `EXAMPLE_NO_EDITS/codex-main/codex-rs/tui/src/terminal_palette.rs`, `EXAMPLE_NO_EDITS/codex-main/codex-rs/tui/styles.md`

### Feature Comparison Matrix

| Customization Area | Codex (TUI CLI App) | Zen (Tauri Desktop App) |
| :--- | :--- | :--- |
| **Interface Styling** | Terminal-native rendering (Ratatui style buffers, ANSI 16/256/TrueColor checks) | Web technologies (React, TailwindCSS, CSS variables) |
| **Theme System** | `.tmTheme` syntax highlighting selectors with live previews | CSS theme sheets mapped to store states |
| **Font Configuration** | Inherited from the host terminal emulator settings | Configured via Google Fonts (Inter, Outfit, Fira Code) in stylesheets |
| **Keyboard Bindings** | Custom keybind mapping configurations in `tui_keymap` | Static React window event listeners |
| **Animations / Shimmer** | Optional ASCII animations toggle | CSS-based micro-animations and transitions |

### What Codex Does Well

1. **Robust Live Theme Previews**:
   - Codex's `/theme` picker (`theme_picker.rs`) scans a local folder (`{CODEX_HOME}/themes/`) for standard `.tmTheme` files, dynamically swapping the active parser style on cursor move to provide instant visual updates.
   - It maintains an cancel-restore snapshot state, reverting style updates to their original layout if the user exits without saving.
2. **Terminal Palette Adaptation**:
   - Rather than assuming TrueColor capability, Codex queries terminal features to decide between TrueColor, ANSI 256, and ANSI 16 limits (`terminal_palette.rs`).
   - It computes perceptual distance metrics to map RGB colors to the closest available index in systems restricted to 256 colors.
3. **Flexible Component layout configurations**:
   - Users can choose which widgets and labels populate the TUI status bar or title screen dynamically (`tui_status_line = [...]`, `tui_terminal_title = [...]`).

### Zen Current-State Findings

- Zen's styling is locked to a single preset, lacking runtime customization screens for theme variations (e.g. glassmorphism vs brutalism).
- Zen's font configurations are hardcoded inside CSS stylesheets, preventing users from adjusting layout font sizes or using custom monospace fonts for code panels.

### Patterns To Adopt

1. **User Theme & Font Settings Configs**:
   - Expose theme selection and font family/size attributes inside Zen's general settings menu, mapping choices to CSS properties (e.g., `--body-font`, `--code-font`, `--base-font-size`).
2. **Dynamic Live Theme Swapping**:
   - Mirror the "cancel-restore" preview pattern: let users preview themes and settings visually as they hover or select options, applying updates only after explicit save confirmation.

### Reference Files

- `EXAMPLE_NO_EDITS/codex-main/codex-rs/tui/src/theme_picker.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/tui/src/terminal_palette.rs`
- `EXAMPLE_NO_EDITS/codex-main/codex-rs/tui/styles.md`

## Comparison: Voice Mode & Realtime Audio Systems

**Reviewed:** 2026-06-21  
**Reference:** `EXAMPLE_NO_EDITS/codex-main/codex-rs/core/src/realtime_conversation.rs`, `EXAMPLE_NO_EDITS/odysseus-main/services/tts/tts_service.py`, `EXAMPLE_NO_EDITS/odysseus-main/static/js/voiceRecorder.js`

### Feature Comparison Matrix

| Capability | Codex (Realtime Session) | Odysseus (Multi-Provider) | Zen (Current App) |
| :--- | :--- | :--- | :--- |
| **STT Engine** | Streaming PCM via WebSockets / WebRTC sidebands | Web Speech API (Browser) / local server Whisper / OpenAI API | Local `whisper-server` (ggml bin) via HTTP Multipart |
| **TTS Engine** | WebRTC audio output streams | Web Speech API / Kokoro-82M on GPU / OpenAI API | Local Piper ONNX synthesis |
| **VAD / Silence Detection** | Protocol-level / API managed | Client browser events fallback | Local Rust `webrtc_vad` processor |
| **Audio Caching** | None (Realtime interactive stream) | SHA256 file cache for synthesized outputs | None |
| **Hybrid Browser Fallback** | N/A (Console-based TUI) | Native browser Web Speech API fallback | None (Strictly local-first or fails) |

### What Reference Apps Do Well

1. **Caching Synthesized Outputs (Odysseus)**:
   - Odysseus maintains a local directory-based audio cache (`data/tts_cache`) keyed by `sha256(provider + model + voice + speed + text)`. If the exact text has already been synthesized, it skips calling the TTS engine, reducing disk read latency and avoiding GPU inference costs.
2. **Hybrid Client-Side Browser Fallback (Odysseus)**:
   - If local STT/TTS servers are offline or models are downloading, Odysseus falls back to the browser's native Web Speech API (`SpeechRecognition` and `SpeechSynthesis`). This provides a seamless, zero-cost fallback voice experience.
3. **Advanced Streaming Channels & Handoffs (Codex)**:
   - Codex manages full-duplex conversations using async channel queues (`RealtimeAudioFrame` & `ConversationTextParams`).
   - It supports structured handoff states (`RealtimeOutbound::HandoffUpdate`), enabling background agents to push live audio notifications or updates directly into the active user-facing audio stream.

### Zen Current-State Findings

- Zen runs a background `whisper-server` process and sends whole WAV files for inference. While this is effective, it causes latency spikes on long voice inputs compared to real-time chunk streaming.
- Zen lacks any audio caching system, meaning repeated TTS replies (e.g. system warnings or common greetings) undergo identical Piper ONNX synthesis cycles.
- There is no browser-based fallback option. If models are missing or the Whisper process fails to bind, the voice feature shuts down entirely.

### Patterns To Adopt

1. **TTS Audio Cache Layer**:
   - Implement an audio cache service inside Zen's backend or frontend to store synthesized `.wav` clips generated by Piper. Key the cache using a hash of the voice configuration and the target message text.
2. **Web Speech API Fallback Handler**:
   - Build a hybrid STT/TTS connector in the frontend: if local Whisper or Piper services are disabled or fail to load, automatically fall back to browser-native voice synthesis and recognition.
3. **Audio Stream Chunking**:
   - Transition from uploading massive consolidated audio blobs to streaming smaller, real-time PCM audio chunks to decrease Whisper transcription latency.

### Reference Files

- `EXAMPLE_NO_EDITS/codex-main/codex-rs/core/src/realtime_conversation.rs`
- `EXAMPLE_NO_EDITS/odysseus-main/services/tts/tts_service.py`
- `EXAMPLE_NO_EDITS/odysseus-main/static/js/voiceRecorder.js`
