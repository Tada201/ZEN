import { describe, it, expect } from "vitest";
import {
  estimateStashImageBytes,
  migrateStash,
  trimImagesToBudget,
  type PromptStash,
} from "../usePromptStashStore";

const v2Stash: PromptStash = {
  version: 2,
  text: "Refactor the deploy script",
  images: [
    { id: "a", name: "a.png", type: "image/png", dataUrl: "data:image/png;base64,AAAA" },
  ],
  stashedAt: 1234,
};

describe("usePromptStashStore", () => {
  describe("migrateStash", () => {
    it("normalizes v1 payloads into v2 by adding stable image ids", () => {
      const migrated = migrateStash({
        stash: {
          text: "old draft",
          images: [{ name: "shot.png", type: "image/png", dataUrl: "data:image/png;base64,BBBB" }],
          stashedAt: 99,
        },
      });
      expect(migrated).not.toBeNull();
      const stash = migrated!.stash;
      expect(stash).not.toBeNull();
      expect(stash!.version).toBe(2);
      expect(stash!.images[0].id).toBe("stashed-image-0");
      expect(stash!.images[0].name).toBe("shot.png");
    });

    it("passes v2 payloads through unchanged", () => {
      const migrated = migrateStash({ stash: v2Stash });
      expect(migrated?.stash).toEqual(v2Stash);
    });

    it("returns null for corrupt payloads", () => {
      expect(migrateStash(null)).toEqual({ stash: null });
      expect(migrateStash({ stash: { text: 42 } })).toEqual({ stash: null });
      expect(migrateStash({ stash: { text: "", images: "nope" } })).toEqual({ stash: null });
    });
  });

  describe("trimImagesToBudget", () => {
    it("keeps images that fit under the budget in order", () => {
      const kept = trimImagesToBudget(
        [
          { id: "1", name: "1", type: "image/png", dataUrl: "x".repeat(100) },
          { id: "2", name: "2", type: "image/png", dataUrl: "x".repeat(100) },
        ],
        150,
      );
      expect(kept.map((image) => image.id)).toEqual(["1"]);
    });

    it("drops an oversized first image instead of evicting everything after it", () => {
      const kept = trimImagesToBudget(
        [
          { id: "big", name: "big", type: "image/png", dataUrl: "x".repeat(500) },
          { id: "small", name: "small", type: "image/png", dataUrl: "x".repeat(50) },
        ],
        100,
      );
      expect(kept.map((image) => image.id)).toEqual(["small"]);
    });
  });

  describe("estimateStashImageBytes", () => {
    it("sums data URL lengths", () => {
      expect(estimateStashImageBytes(v2Stash)).toBe(
        "data:image/png;base64,AAAA".length,
      );
      expect(estimateStashImageBytes(null)).toBe(0);
    });
  });
});
