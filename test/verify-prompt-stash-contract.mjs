// Prompt stash contract.
//
// The stash must:
//   1. Live in a Zustand store persisted to localStorage (schema-validated,
//      v1 → v2 migration, budgeted image payloads) so a draft survives reloads
//      and is restorable in any thread.
//   2. Persist text + images as data URLs (not `File`, which is not
//      JSON-serializable), capped by STASH_IMAGE_BUDGET_BYTES.
//   3. Be wired into the composer: save the current draft (text + selected
//      files) and restore it (fill the composer + re-add files) via
//      PremiumChatInput → ChatInputFooter.

import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const store = read("src/lib/stores/usePromptStashStore.ts");
const composer = read("src/atlas/components/PremiumChatInput.tsx");
const footer = read("src/atlas/components/ChatInputFooter.tsx");

// 1. Zustand + persist middleware with schema-validated storage.
assert(store.includes('from "zustand"'), "prompt stash must be a Zustand store");
assert(store.includes('from "zustand/middleware"'), "prompt stash must use zustand persist middleware");
assert(store.includes('name: "zen-prompt-stash"'), "prompt stash must persist under a dedicated storage key");
assert(store.includes("migrate:"), "prompt stash must define a storage migration");
assert(store.includes("version: 2"), "prompt stash must pin the persisted format version");

// 2. Image budget + data-URL persistence.
assert(store.includes("STASH_IMAGE_BUDGET_BYTES"), "prompt stash must define an image size budget");
assert(store.includes("trimImagesToBudget"), "prompt stash must trim over-budget images instead of dropping everything");
assert(store.includes("readAsDataURL"), "prompt stash must convert files to data URLs for persistence");
assert(!store.includes("stash: files"), "prompt stash must not persist raw File objects");

// 3. Composer wiring: save (text + selectedFiles) and restore (text + files).
assert(composer.includes("usePromptStashStore"), "PremiumChatInput must consume the prompt stash store");
assert(composer.includes("stashDraft(message, selectedFiles)"), "stashing must capture the current draft text and attached files");
assert(composer.includes("restoreDraft()"), "restoring must read the stashed draft");
assert(composer.includes("addFiles(restored.images)"), "restoring must re-attach the stashed image files");
assert(footer.includes("onStash") && footer.includes("onRestore"), "ChatInputFooter must expose stash save/restore actions");
assert(footer.includes("hasStash"), "ChatInputFooter must switch between save and restore based on stash presence");
assert(footer.includes("aria-label=") && footer.includes("title="), "stash controls must be accessible icon buttons");

console.log("prompt stash contract ok");
