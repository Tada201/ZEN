import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { z } from "zod";

/**
 * Prompt Stash — save the current composer draft (text + images) and restore
 * it later in any thread.
 *
 * Design notes (ported from the t3code `promptStashStore` pattern and adapted
 * to Zen's store conventions):
 *   - Zustand + `persist`/localStorage, like `useChatStore`/`useGTSMStore`.
 *   - Zod-schema-validated persisted shape with an explicit v1 → v2 migration
 *     so old stashes keep working across format changes.
 *   - Images are stored as data URLs (the same representation `fileToAttachment`
 *     produces), NOT `File` objects — `File` is not JSON-serializable. The
 *     total image budget is capped (`STASH_IMAGE_BUDGET_BYTES`, matching the
 *     t3code 2.7MB cap) so an over-large draft cannot blow the localStorage
 *     quota and lose the entire stash.
 *   - Restore is destructive by design: applying a stash consumes it. This
 *     mirrors the "stash → restore once" mental model and avoids accidental
 *     double-application when the user edits the restored draft.
 */

export const STASH_IMAGE_BUDGET_BYTES = 2_700_000;

// ─── Persisted shape (schema-validated) ─────────────────────────────────────

export const StashedImageSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  dataUrl: z.string(),
});

export type StashedImage = z.infer<typeof StashedImageSchema>;

export const PromptStashSchema = z.object({
  /** Format version, bumped on breaking shape changes (see `migrateStash`). */
  version: z.number().int().default(2),
  text: z.string(),
  images: z.array(StashedImageSchema),
  stashedAt: z.number(),
});

export type PromptStash = z.infer<typeof PromptStashSchema>;

/**
 * v1 → v2 migration. v1 stored images as `{ name, type, dataUrl }` without a
 * stable `id`; v2 adds `id` so the composer can key image chips consistently.
 * Older v1 payloads (or hand-corrupted shapes) are normalized here instead of
 * failing hydration, per the schema-validated persistence convention.
 */
/**
 * v1 → v2 migration. v1 stored images as `{ name, type, dataUrl }` without a
 * stable `id`; v2 adds `id` so the composer can key image chips consistently.
 * Older v1 payloads (or hand-corrupted shapes) are normalized here instead of
 * failing hydration, per the schema-validated persistence convention.
 *
 * The store persists the full shape as `{ stash }` (see `partialize`), so
 * this migration receives that wrapper and returns the same wrapper — this is
 * the shape zustand's `persist` middleware expects from `migrate`.
 */
export function migrateStash(persisted: unknown): { stash: PromptStash | null } | null {
  const raw =
    persisted && typeof persisted === "object" && "stash" in (persisted as Record<string, unknown>)
      ? (persisted as Record<string, unknown>).stash
      : persisted;
  return { stash: normalizeStash(raw) };
}

function normalizeStash(raw: unknown): PromptStash | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const isV1 = record.version !== 2 && Array.isArray(record.images);
  if (isV1) {
    const v1Images = (record.images as Array<Record<string, unknown>>).map(
      (image, index) => ({
        id: typeof image.id === "string" ? image.id : `stashed-image-${index}`,
        name: typeof image.name === "string" ? image.name : `image-${index}`,
        type: typeof image.type === "string" ? image.type : "image/png",
        dataUrl: typeof image.dataUrl === "string" ? image.dataUrl : "",
      }),
    );
    const candidate = {
      version: 2,
      text: typeof record.text === "string" ? record.text : "",
      images: v1Images.filter((image) => image.dataUrl.length > 0),
      stashedAt: typeof record.stashedAt === "number" ? record.stashedAt : Date.now(),
    };
    const parsed = PromptStashSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }

  const parsed = PromptStashSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

/** Total persisted bytes of a stash's images (data URLs dominate the quota). */
export function estimateStashImageBytes(stash: PromptStash | null): number {
  if (!stash) return 0;
  return stash.images.reduce((total, image) => total + image.dataUrl.length, 0);
}

/**
 * Keep as many images as fit under the budget, dropping the rest in order.
 * Used at stash time so one oversized attachment cannot evict every other
 * image (or blow the localStorage quota and lose the whole stash).
 */
export function trimImagesToBudget(
  images: StashedImage[],
  budget = STASH_IMAGE_BUDGET_BYTES,
): StashedImage[] {
  let used = 0;
  const kept: StashedImage[] = [];
  for (const image of images) {
    const next = used + image.dataUrl.length;
    if (next > budget) continue;
    used = next;
    kept.push(image);
  }
  return kept;
}

// ─── File ⇄ data URL helpers (browser-only, thin wrappers) ──────────────────

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error(`Failed to read file: ${file.name}`));
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToFile(dataUrl: string, name: string, type: string): File {
  const [meta, payload] = dataUrl.split(",");
  const mime = meta?.match(/data:([^;]+)/)?.[1] || type || "application/octet-stream";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

// ─── Store ──────────────────────────────────────────────────────────────────

interface PromptStashState {
  stash: PromptStash | null;

  /** Save the current draft. Returns how many images were stashed/skipped. */
  stashDraft: (
    text: string,
    files: File[],
  ) => Promise<{ stashed: number; skipped: number }>;
  /** Restore the stash (destructive — consuming it). Null when empty. */
  restoreDraft: () => { text: string; images: File[] } | null;
  clearStash: () => void;
}

export const usePromptStashStore = create<PromptStashState>()(
  persist(
    (set, get) => ({
      stash: null,

      stashDraft: async (text, files) => {
        const dataUrls = await Promise.all(
          files.map(async (file) => {
            try {
              return { file, dataUrl: await fileToDataUrl(file) };
            } catch {
              return null;
            }
          }),
        );
        const readable = dataUrls.filter(
          (entry): entry is { file: File; dataUrl: string } => entry !== null,
        );
        const images = trimImagesToBudget(
          readable.map((entry, index) => ({
            id: `stashed-image-${Date.now()}-${index}`,
            name: entry.file.name,
            type: entry.file.type,
            dataUrl: entry.dataUrl,
          })),
        );
        const skipped = readable.length - images.length;
        set({
          stash: {
            version: 2,
            text,
            images,
            stashedAt: Date.now(),
          },
        });
        return { stashed: images.length, skipped };
      },

      restoreDraft: () => {
        const { stash } = get();
        if (!stash) return null;
        const images = stash.images.map((image) =>
          dataUrlToFile(image.dataUrl, image.name, image.type),
        );
        set({ stash: null });
        return { text: stash.text, images };
      },

      clearStash: () => set({ stash: null }),
    }),
    {
      name: "zen-prompt-stash",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persisted) => migrateStash(persisted) ?? { stash: null },
      // Re-validate on every hydration (not just version bumps): zustand only
      // runs `migrate` when the stored version differs, so a corrupted v2
      // payload would otherwise slip through the default shallow merge.
      merge: (persisted, current) => {
        const record =
          persisted && typeof persisted === "object"
            ? (persisted as Record<string, unknown>)
            : {};
        return {
          ...current,
          stash: normalizeStash(record.stash) ?? null,
        };
      },
      partialize: (state) => ({ stash: state.stash }),
    },
  ),
);
