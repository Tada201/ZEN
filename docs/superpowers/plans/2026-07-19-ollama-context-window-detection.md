# Ollama Context-Window Detection (no hardcoded values)

## Goal

Make the Ollama provider report each model's **real** context window instead of
`max_context_length: None`, so the context-usage gauge divides against the true
model budget. Detect it at runtime from Ollama itself — never bake per-model
constants into the binary.

## Why (evidence from reference projects)

Studied six reference apps in `EXAMPLE_NO_EDITS/`. The universal, non-hardcoded
shape is **detect → cache → clamp user override to detected max → fixed
fallback**:

- **AnythingLLM** (the model to copy): lists Ollama models, then POSTs
  `/api/show` per model and reads whichever `model_info` key **ends with**
  `.context_length` (arch-agnostic: `llama.context_length`,
  `qwen2.context_length`, …). Falls back to a fixed default, allows an env
  override clamped to the detected max.
  (`anything-llm-master/server/utils/AiProviders/ollama/index.js:91-115`)
- **Atomic-Chat**: reads the same `{arch}.context_length` key straight from GGUF
  file metadata.
  (`Atomic-Chat-main/.../tauri-plugin-llamacpp/src/gguf/utils.rs:139`)
- **Codex**: bundled+remote `models.json` catalog, user override clamped to
  `max_context_window`.
- **9router / ZEN OpenAI-compat / LMStudio / Anthropic**: pass through the
  provider-reported `context_length` from `/models` (ZEN already does this at
  `openai_compat/models.rs:280`).
- **Tauri-chatbot**: the anti-pattern — never calls `/api/show`, so Ollama
  windows silently degrade to a static 4096. This is exactly ZEN's current
  Ollama gap.

Conclusion: the only real gap in ZEN is Ollama. `/api/tags` (what ZEN calls)
doesn't report context length; `/api/show` does.

## What already works (no change needed)

The plumbing from provider → gauge is already in place:
`list_models()` → `ModelInfo.max_context_length` → frontend
`availableModels[].contextWindow` → `modelContextWindow`
(`useSendMessage.ts:72`) → backend context breakdown. Filling in
`max_context_length` for Ollama is the whole fix; **no frontend changes**.

## Backend changes (`src-tauri/src/llm/ollama.rs` only)

1. **Add `/api/show` response types** (minimal):
   ```rust
   #[derive(Serialize)]
   struct OllamaShowRequest { model: String }

   #[derive(Deserialize)]
   struct OllamaShowResponse {
       #[serde(default)]
       model_info: std::collections::HashMap<String, serde_json::Value>,
       #[serde(default)]
       capabilities: Vec<String>,
   }
   ```

2. **Add a helper** `async fn fetch_context_length(&self, model: &str) -> Option<u64>`:
   - POST `{base_url}/api/show` with `{ "model": model }` (same
     `localhost`→`127.0.0.1` fallback the existing `list_models` uses).
   - Arch-agnostic read: find the first `model_info` key that
     `ends_with(".context_length")`, parse its value as `u64`, keep only
     `> 0`.
   - Return `None` on any failure (network, missing key, non-numeric) — never
     guess.

3. **Wire it into `list_models`** (replaces line 189 `max_context_length: None`):
   - After parsing `/api/tags`, resolve each model's window concurrently
     (`futures::future::join_all` over `fetch_context_length`) so N models don't
     serialize into N round-trips. `futures` is already a dependency.
   - Skip embedding-only models (if `capabilities` contains `"embedding"`) —
     they have no useful chat window; leave `None`.
   - Set `max_context_length` to the detected value or `None`.

4. **Fallback stays as-is**: when detection yields `None`, downstream already
   falls back to Zen's compaction cap (`MiddlewareBudgets::from_context_window`
   handles `None` → unbounded, and the gauge falls back to the cap). No fixed
   4096 constant introduced in code.

### Optional (only if you want it) — user override
AnythingLLM/Codex both let the user override, clamped to the detected max. ZEN
already has `voiceDisplayAgentContextTokens`-style numeric settings. If desired,
add an `ollamaContextTokenLimit` setting (0 = auto) read in the runner and
`min(user, detected)`. **Not included by default** — flagging as a follow-up so
this change stays scoped to detection.

## Verification

- `cargo build` (compile the new types/helper).
- `cargo build --tests` if the test binary compiles in this env; add a unit test
  for the arch-agnostic `.context_length` key extraction against a sample
  `/api/show` JSON body (pure function, no network).
- Manual (if an Ollama instance is reachable): confirm `list_models` now returns
  a non-null window for a known model and the gauge reflects it.

## Out of scope

- Hardcoding any per-model or per-family window in code (explicitly rejected).
- Remote LiteLLM-style metadata DB (AnythingLLM's second strategy) — hosted
  providers already report `context_length` via `/models` in ZEN, so this isn't
  needed now.
- Setting `num_ctx` on chat requests (separate concern from reporting the
  window).
