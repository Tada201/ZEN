import { describe, it, expect } from "vitest";
import { buildToolOutputPreview } from "../toolOutputPreview";

describe("buildToolOutputPreview — directory + document normalization", () => {
  it("normalizes a list_directory `entries` payload into results", () => {
    const preview = buildToolOutputPreview(
      JSON.stringify({
        path: "/ws",
        entries: [
          { name: "src", type: "dir" },
          { name: "readme.md", type: "file", size: 1234 },
        ],
        truncated: false,
      }),
    );

    expect(preview.results.length).toBe(2);
    expect(preview.results[0].title).toBe("src");
    expect(preview.results[0].summary).toContain("dir");
    expect(preview.results[1].title).toBe("readme.md");
    expect(preview.results[1].summary).toContain("file");
  });

  it("normalizes a list_documents `documents` payload into results", () => {
    const preview = buildToolOutputPreview(
      JSON.stringify({
        documents: [{ file_name: "notes.pdf", status: "ready" }],
      }),
    );

    expect(preview.results.length).toBe(1);
    expect(preview.results[0].title).toBe("notes.pdf");
    expect(preview.results[0].summary).toBe("ready");
  });
});
